import "server-only"

import { BRAND } from "@/lib/brand"
import { blockersFor, DEFAULT_QUEUE, followupStop, followupTime, stockholmDay, type QueueConfig } from "@/lib/crm/outreach"
import { emailHash, type CrmStore } from "@/lib/crm/store"
import { emailHtml, footerText, renderTemplate, senderName, variablesFor } from "@/lib/crm/templates"
import type { EmailLog, EmailTemplate, Lead, TemplateKind } from "@/lib/crm/types"
import { crmUrl, isCrmDeployment } from "@/lib/deployment"
import { APP_URL } from "@/lib/site"

/**
 * Utskickskön (v47). Mejlen går ut ETT I TAGET med paus emellan – aldrig i klump:
 *
 *   - Varje körning skickar högst ett mejl, och bara om det gått minst
 *     minGapSeconds sedan förra. Har kön stått still (ingen har haft panelen
 *     öppen) skickas alltså inte allt på en gång när den vaknar.
 *   - Högst dailyCap mejl per svenskt dygn, bara vardagar på kontorstid.
 *   - Varje mejl kontrolleras IGEN precis innan det skickas: har personen
 *     avregistrerat sig, hamnat på spärrlistan eller tappat sin rättsliga grund
 *     sedan det schemalades avbryts det.
 *   - Kön låser raden i databasen (crm_claim_due_emails, skip locked) och Resend
 *     får en Idempotency-Key – samma mejl kan inte gå ut två gånger.
 *
 * Miljövariabler (servern):
 *   RESEND_API_KEY          krävs för att något ska skickas
 *   CRM_FROM_EMAIL          krävs, t.ex. "Elin på Coavira <elin@mail.coavira.fit>"
 *                           (använd gärna en egen underdomän för utskick, så att
 *                           appens egna mejl inte påverkas om ryktet skulle ta skada)
 *   CRM_REPLY_TO            valfritt – dit svaren går
 *   CRM_MIN_GAP_SECONDS / CRM_DAILY_CAP   valfritt – standard 90 s och 40 per dygn
 *   CRM_WINDOW_START_HOUR / CRM_WINDOW_END_HOUR / CRM_SEND_WEEKENDS=1   valfritt – standard vardagar 8–17
 */
export function queueConfig(): QueueConfig {
  const num = (name: string, fallback: number, min: number, max: number) => {
    const n = Number(process.env[name])
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
  }
  const start = num("CRM_WINDOW_START_HOUR", DEFAULT_QUEUE.windowStartHour, 0, 23)
  return {
    ...DEFAULT_QUEUE,
    minGapSeconds: num("CRM_MIN_GAP_SECONDS", DEFAULT_QUEUE.minGapSeconds, 20, 3600),
    dailyCap: num("CRM_DAILY_CAP", DEFAULT_QUEUE.dailyCap, 1, 500),
    windowStartHour: start,
    windowEndHour: Math.max(start + 1, num("CRM_WINDOW_END_HOUR", DEFAULT_QUEUE.windowEndHour, 1, 24)),
    weekends: process.env.CRM_SEND_WEEKENDS === "1",
  }
}

export const senderConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim() && process.env.CRM_FROM_EMAIL?.trim())
/**
 * Adressen i mejlens länkar (avregistrering). I CRM-driftsättningen (v48) är det
 * CRM:ets egen adress – CRM_URL om den är satt, annars projektets Vercel-adress –
 * så att CRM:et inte är beroende av appen. Annars appens adress.
 */
export function publicBaseUrl(): string {
  if (isCrmDeployment()) {
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    return crmUrl() ?? (vercel ? `https://${vercel.replace(/^https?:\/\//, "")}` : APP_URL)
  }
  return APP_URL
}
export const unsubscribeUrl = (token: string) => `${publicBaseUrl()}/avregistrera/${token}`

export interface RunResult {
  sent: number
  cancelled: number
  /** Varför inget skickades (om inget skickades). */
  idle?: "not_configured" | "empty" | "gap" | "daily_cap"
  error?: string
}

async function sendViaResend(log: EmailLog, token: string, sourceUrl: string | null, kind: TemplateKind): Promise<{ id: string } | { error: string; retry: boolean }> {
  const base = (process.env.RESEND_API_BASE?.trim() || "https://api.resend.com").replace(/\/$/, "")
  const link = unsubscribeUrl(token)
  const footer = footerText({ unsubscribeUrl: link, sourceUrl, sender: `${BRAND.name}`, contactEmail: BRAND.contactEmail, kind })
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "coavira-server",
        // Samma nyckel för samma köpost: Resend skickar aldrig samma mejl två gånger.
        "Idempotency-Key": `crm-${log.id}`,
      },
      body: JSON.stringify({
        from: process.env.CRM_FROM_EMAIL!.trim(),
        to: [log.toEmail],
        reply_to: process.env.CRM_REPLY_TO?.trim() || undefined,
        subject: log.subject,
        text: `${log.body}\n\n${footer}`,
        html: emailHtml(log.body, footer),
        headers: {
          // Avregistrering med ett klick direkt i mejlklienten (RFC 8058).
          "List-Unsubscribe": `<${publicBaseUrl()}/api/crm/unsubscribe?token=${token}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [
          { name: "kind", value: "crm_outreach" },
          { name: "step", value: String(log.step ?? 1) },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
    if (res.ok && json.id) return { id: json.id }
    return { error: String(json.message ?? `Resend svarade ${res.status}`).slice(0, 300), retry: res.status === 429 || res.status >= 500 }
  } catch {
    return { error: "Resend svarade inte", retry: true }
  }
}

/** Kör kön ett steg: skickar högst ett mejl. Säker att anropa ofta och från flera håll samtidigt. */
export async function runQueue(store: CrmStore, now = new Date()): Promise<RunResult> {
  if (!senderConfigured()) return { sent: 0, cancelled: 0, idle: "not_configured" }
  const cfg = queueConfig()
  const recent = await store.listLogs({ limit: 500 })
  // Fastnade poster (servern dog mitt i ett utskick): tillbaka i kön efter en kvart.
  // Idempotency-Key gör att ett mejl som faktiskt hann gå iväg inte skickas igen.
  for (const stuck of recent.filter((l) => l.status === "sending" && now.getTime() - new Date(l.scheduledAt).getTime() > 900_000)) {
    await store.updateLog(stuck.id, { status: "queued" })
  }
  const sent = recent.filter((l) => l.sentAt)
  const lastSent = sent.reduce((t, l) => Math.max(t, new Date(l.sentAt!).getTime()), 0)
  if (lastSent && now.getTime() - lastSent < cfg.minGapSeconds * 1000) return { sent: 0, cancelled: 0, idle: "gap" }
  const today = stockholmDay(now)
  if (sent.filter((l) => stockholmDay(new Date(l.sentAt!)) === today).length >= cfg.dailyCap) return { sent: 0, cancelled: 0, idle: "daily_cap" }

  let cancelled = 0
  // Avbrutna poster (t.ex. avregistrerade) kostar ingen plats i takten – ta nästa, högst fem försök.
  for (let i = 0; i < 5; i++) {
    const [log] = await store.claimDue(1)
    if (!log) return { sent: 0, cancelled, idle: "empty" }
    const lead = await store.getLead(log.leadId)
    const suppressed = lead?.email ? (await store.suppressedHashes([emailHash(lead.email)])).size > 0 : false
    // "Nyss mejlad" gäller inte utskick som redan är planerade (t.ex. uppföljningen).
    const blockers = lead ? blockersFor(lead, { suppressed, queued: false, now }).filter((b) => b !== "recently_emailed") : (["no_email"] as const)
    // v53: uppföljningen pausas så fort leaden har svarat, bokat samtal eller första mejlet studsat.
    if (lead && log.step === 2) {
      const [parent] = (await store.listLogs({ leadId: lead.id, limit: 50 })).filter((l) => l.id === log.parentId)
      const stop = followupStop(lead, parent, await store.listActivities({ leadId: lead.id, limit: 50 }))
      if (stop) {
        await store.updateLog(log.id, { status: "cancelled", error: stop })
        cancelled++
        continue
      }
    }
    // Adressen kan ha ändrats sedan mejlet schemalades – då gäller inte längre det som förhandsgranskades.
    if (!lead || blockers.length || lead.email?.toLowerCase() !== log.toEmail.toLowerCase()) {
      await store.updateLog(log.id, { status: "cancelled", error: lead ? "Leaden uppfyller inte längre villkoren för utskick" : "Leaden finns inte längre" })
      cancelled++
      continue
    }
    const token = await store.unsubscribeToken(lead.id)
    if (!token) {
      await store.updateLog(log.id, { status: "failed", error: "Avregistreringslänk saknas" })
      continue
    }
    const template = log.templateId ? (await store.listTemplates()).find((t) => t.id === log.templateId) : undefined
    const result = await sendViaResend(log, token, lead.sourceUrl, template?.kind ?? "intro")
    if ("id" in result) {
      const at = new Date().toISOString()
      await store.updateLog(log.id, { status: "sent", sentAt: at, resendId: result.id, error: null })
      // Statusflödet går framåt: Ny/Kvalificerad → Kontaktad. Den som redan svarat flyttas inte bakåt.
      await store.updateLead(lead.id, { lastEmailedAt: at, lastContactedAt: at, ...(lead.status === "new" || lead.status === "qualified" ? { status: "emailed" as const } : {}) })
      if (log.step !== 2) await scheduleFollowup(store, { ...log, sentAt: at }, lead, template, cfg)
      return { sent: 1, cancelled }
    }
    if (result.retry) {
      // Tillfälligt fel: tillbaka i kön, nytt försök om tio minuter.
      await store.updateLog(log.id, { status: "queued", scheduledAt: new Date(now.getTime() + 600_000).toISOString(), error: result.error })
      return { sent: 0, cancelled, error: result.error }
    }
    await store.updateLog(log.id, { status: "failed", error: result.error })
    return { sent: 0, cancelled, error: result.error }
  }
  return { sent: 0, cancelled }
}

/**
 * Avregistrering: leaden raderas (det lovar mejlets sidfot) och adressens hash
 * hamnar på spärrlistan, så att den aldrig kan importeras och mejlas igen.
 */
export async function unsubscribe(store: CrmStore, token: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return false
  const lead = await store.getLeadByToken(token)
  if (!lead) return false
  if (lead.email) await store.suppress(lead.email, "unsubscribed")
  await store.cancelQueued({ leadId: lead.id })
  await store.deleteLead(lead.id)
  return true
}

/**
 * v53: planera mallens uppföljning när första mejlet har gått iväg – N dagar
 * senare, i nästa utskicksfönster. Den går genom samma kö (takt och dygnstak)
 * och kontrolleras igen precis innan den skickas (followupStop).
 * Aldrig till en enskild firma utan samtycke, och aldrig för en icke-säljande mall.
 */
export async function scheduleFollowup(store: CrmStore, sent: EmailLog, lead: Lead, template: EmailTemplate | undefined, cfg: QueueConfig) {
  if (!template?.followupDays || !template.followupBody || template.kind === "research") return null
  if (lead.legalBasis !== "consent" && (lead.companyForm === "enskild" || lead.legalBasis === "research")) return null
  const vars = variablesFor(lead, senderName(process.env))
  const subject = renderTemplate(template.followupSubject?.trim() || sent.subject, vars)
  const body = renderTemplate(template.followupBody, vars)
  // En uppföljning med okända variabler skickas inte – hellre ingen än en trasig.
  if (subject.unknown.length || body.unknown.length || !vars.avsändare && /\{\{\s*avsändare/i.test(template.followupBody)) return null
  const at = followupTime(new Date(sent.sentAt!), template.followupDays, cfg)
  const [log] = await store.createLogs([{ leadId: lead.id, templateId: template.id, toEmail: sent.toEmail, subject: subject.text, body: body.text, scheduledAt: at.toISOString(), step: 2, parentId: sent.id }])
  return log ?? null
}
