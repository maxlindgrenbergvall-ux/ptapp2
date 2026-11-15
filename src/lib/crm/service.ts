import "server-only"

import { hasMx } from "@/lib/crm/mx"
import { blockersFor, BLOCKER_TEXT, planSchedule, stockholmDay, type Blocker } from "@/lib/crm/outreach"
import { queueConfig } from "@/lib/crm/queue"
import { emailHash, type CrmStore } from "@/lib/crm/store"
import { templateBlock } from "@/lib/crm/compliance"
import { renderTemplate, senderName, templateFor, variablesFor } from "@/lib/crm/templates"
import type { Lead } from "@/lib/crm/types"

export interface PreviewItem {
  leadId: string
  name: string
  email: string | null
  templateId: string | null
  templateName: string | null
  /** v53: icke-säljande mall (referensgrupp)? */
  templateKind: "intro" | "research" | null
  /** Automatisk uppföljning efter så här många dagar utan svar (null = ingen). */
  followupDays: number | null
  subject: string
  body: string
  /** Skäl till att mejlet inte kan skickas (tom = går bra). */
  blockers: { code: Blocker | "template" | "sender"; text: string }[]
  scheduledAt: string | null
}

/** Platshållare som "[ditt namn]" måste bytas ut innan en mall får användas. */
const PLACEHOLDER = /\[[^\]\n]{2,40}\]/

/**
 * Förhandsgranskning = exakt det som schemaläggs. Samma funktion används när
 * utskicket sedan köas, så att inget kan skilja mellan det som visades och det
 * som skickas. Mallen väljs per lead efter segment om ingen mall anges.
 */
export async function buildOutreach(store: CrmStore, leadIds: string[], templateId: string | null, now = new Date()): Promise<PreviewItem[]> {
  const [all, templates, logs] = await Promise.all([store.listLeads(), store.listTemplates(), store.listLogs({ limit: 1000 })])
  const leads = leadIds.map((id) => all.find((l) => l.id === id)).filter((l): l is Lead => Boolean(l))
  const suppressed = await store.suppressedHashes(leads.filter((l) => l.email).map((l) => emailHash(l.email!)))
  const queuedFor = new Set(logs.filter((l) => l.status === "queued" || l.status === "sending").map((l) => l.leadId))
  const chosen = templateId ? templates.find((t) => t.id === templateId) : undefined

  const items = leads.map((lead): PreviewItem => {
    const template = chosen ?? templateFor(templates, lead)
    const sender = senderName(process.env)
    const vars = variablesFor(lead, sender)
    const subject = template ? renderTemplate(template.subject, vars) : { text: "", unknown: [] }
    const body = template ? renderTemplate(template.body, vars) : { text: "", unknown: [] }
    const blockers: PreviewItem["blockers"] = blockersFor(lead, { suppressed: Boolean(lead.email && suppressed.has(emailHash(lead.email))), queued: queuedFor.has(lead.id), now }).map((code) => ({ code, text: BLOCKER_TEXT[code] }))
    const unknown = [...subject.unknown, ...body.unknown]
    const block = template ? templateBlock(lead, template) : null
    if (!template) blockers.push({ code: "template", text: lead.companyForm === "enskild" ? "Ingen icke-säljande mall finns – skicka ett DM i stället" : "Ingen mall passar leaden" })
    else if (block) blockers.push({ code: "template", text: block.text })
    else if (/\{\{\s*avsändare\s*\}\}/i.test(`${template.subject}\n${template.body}`) && !sender) blockers.push({ code: "sender", text: "Avsändarnamn saknas – sätt CRM_SENDER_NAME (eller ett namn i CRM_FROM_EMAIL)" })
    else if (unknown.length) blockers.push({ code: "template", text: `Mallen har okända variabler: ${unknown.map((u) => `{{${u}}}`).join(", ")}` })
    else if (PLACEHOLDER.test(`${subject.text}\n${body.text}`)) blockers.push({ code: "template", text: `Mallen har en platshållare kvar: ${PLACEHOLDER.exec(`${subject.text}\n${body.text}`)![0]}` })
    return {
      leadId: lead.id,
      name: lead.name,
      email: lead.email,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      templateKind: template?.kind ?? null,
      // Enskild firma utan samtycke: aldrig någon automatisk uppföljning.
      followupDays: template && template.kind !== "research" ? template.followupDays : null,
      subject: subject.text,
      body: body.text,
      blockers,
      scheduledAt: null,
    }
  })

  // Tiderna: efter det som redan ligger i kön, och med hänsyn till det som redan skickats i dag.
  const sentPerDay: Record<string, number> = {}
  for (const l of logs) {
    const at = l.sentAt ?? (l.status === "queued" || l.status === "sending" ? l.scheduledAt : null)
    if (at) sentPerDay[stockholmDay(new Date(at))] = (sentPerDay[stockholmDay(new Date(at))] ?? 0) + 1
  }
  const lastQueued = logs.filter((l) => l.status === "queued" || l.status === "sending").reduce<Date | null>((t, l) => (!t || new Date(l.scheduledAt) > t ? new Date(l.scheduledAt) : t), null)
  const lastSent = logs.reduce<Date | null>((t, l) => (l.sentAt && (!t || new Date(l.sentAt) > t) ? new Date(l.sentAt) : t), null)
  const ok = items.filter((i) => !i.blockers.length)
  // Dygnstaket räknas på det som redan är köat; köade poster ska inte räknas två gånger som "skickade".
  const times = planSchedule(ok.length, { now, cfg: queueConfig(), sentPerDay, lastScheduled: lastQueued && lastSent ? (lastQueued > lastSent ? lastQueued : lastSent) : (lastQueued ?? lastSent) })
  ok.forEach((item, i) => (item.scheduledAt = times[i].toISOString()))
  return items
}

/** MX-kontroll för en adress som just angetts (null om ingen adress). */
export const verifyEmail = (email: string | null | undefined) => (email ? hasMx(email) : Promise.resolve(null))
