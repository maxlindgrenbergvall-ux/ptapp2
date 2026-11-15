/**
 * "Nästa steg" (v53): för varje lead – vad som bör göras härnäst, hur
 * bråttom det är och varför. Rena regler i prioritetsordning, så att listan
 * "Att göra" alltid är förklarlig. Enhetstestad i e2e/crm-conversion.unit.ts.
 */
import { recommendedChannel } from "@/lib/crm/compliance"
import type { Activity, EmailLog, Lead } from "@/lib/crm/types"

export type ActionKind = "reminder" | "book_call" | "prep_call" | "log_call" | "convert" | "assess" | "dm" | "email" | "follow_up" | "none"

export interface NextAction {
  kind: ActionKind
  /** Kort imperativ: "Boka samtalet". */
  label: string
  /** Varför just nu. */
  reason: string
  /** 0–100; högre = viktigare. */
  priority: number
  /** Ska göras idag (eller är försenad). */
  due: boolean
  /** Het lead: hög poäng, nyss svarat eller öppnat flera gånger (om öppningar spåras). */
  hot: boolean
}

const DAY = 86_400_000
const days = (from: string, now: Date) => Math.floor((now.getTime() - new Date(from).getTime()) / DAY)
const time = (iso: string) => new Date(iso).toLocaleString("sv-SE", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })

export function nextAction(lead: Lead, ctx: { logs: EmailLog[]; activities: Activity[]; now: Date }): NextAction {
  const { now } = ctx
  const logs = ctx.logs.filter((l) => l.leadId === lead.id)
  const acts = ctx.activities.filter((a) => a.leadId === lead.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const opens = logs.reduce((n, l) => n + (l.openCount ?? 0), 0)
  const hot = lead.score >= 70 || opens >= 2 || lead.status === "replied"
  const boost = Math.round(lead.score / 10) + (hot ? 5 : 0)
  const none: NextAction = { kind: "none", label: "Inget just nu", reason: "", priority: 0, due: false, hot }

  if (lead.status === "customer" || lead.status === "not_relevant" || lead.unsubscribedAt) return none

  // 1. Egen påminnelse som har förfallit.
  if (lead.nextActionAt && new Date(lead.nextActionAt) <= now) {
    return { kind: "reminder", label: lead.nextActionNote || "Påminnelse", reason: `Påminnelse sedan ${days(lead.nextActionAt, now) || "idag"}${days(lead.nextActionAt, now) ? " dagar" : ""}`, priority: 95, due: true, hot }
  }

  // 2. Samtal: förbered, logga, konvertera.
  if (lead.status === "meeting" && lead.meetingAt) {
    const until = new Date(lead.meetingAt).getTime() - now.getTime()
    const held = acts.find((a) => (a.kind === "call_held" || a.kind === "no_show") && a.occurredAt >= lead.meetingAt!.slice(0, 10))
    if (held?.kind === "call_held") return { kind: "convert", label: "Skicka registreringslänken", reason: "Samtalet är genomfört – gör det enkelt att komma igång", priority: 88, due: true, hot: true }
    if (held?.kind === "no_show") return { kind: "book_call", label: "Boka en ny tid", reason: "Uteblev från samtalet", priority: 80, due: true, hot }
    if (until < 0) return { kind: "log_call", label: "Logga samtalet", reason: `Samtalet var ${time(lead.meetingAt)}`, priority: 90, due: true, hot: true }
    if (until <= DAY) return { kind: "prep_call", label: "Förbered samtalet", reason: `Samtal ${time(lead.meetingAt)}`, priority: 85, due: true, hot: true }
    return { kind: "prep_call", label: "Samtal bokat", reason: time(lead.meetingAt), priority: 30, due: false, hot }
  }
  if (lead.status === "meeting") return { kind: "book_call", label: "Sätt tid för samtalet", reason: "Status Samtal bokat men ingen tid angiven", priority: 82, due: true, hot }

  // 3. Svarat → boka samtalet direkt.
  if (lead.status === "replied") {
    const since = acts[0] ? days(acts[0].occurredAt, now) : 0
    return { kind: "book_call", label: "Boka samtalet", reason: since ? `Svarade för ${since} dagar sedan` : "Har svarat – boka medan intresset finns", priority: 92 + Math.min(5, since), due: true, hot: true }
  }

  const contacted = lead.lastContactedAt ?? lead.lastEmailedAt
  const queued = logs.some((l) => l.status === "queued" || l.status === "sending")

  // 4. Inte kontaktad.
  if (!contacted && !queued) {
    if (lead.companyForm === "unknown" && lead.legalBasis !== "consent") return { kind: "assess", label: "Bedöm bolagsform", reason: "AB eller enskild firma avgör vilket utskick som är tillåtet", priority: 40 + boost, due: false, hot }
    const channel = recommendedChannel(lead)
    if (channel === "instagram") return { kind: "dm", label: "Skicka DM (referensgrupp)", reason: lead.companyForm === "enskild" ? "Enskild firma – DM är den naturliga kanalen" : "Ingen e-postadress", priority: 50 + boost, due: true, hot }
    if (lead.email && lead.emailVerified !== false && lead.legalBasis !== "unknown") return { kind: "email", label: "Skicka första mejlet", reason: `Lead Score ${lead.score}`, priority: 45 + boost, due: true, hot }
    return { kind: "assess", label: "Komplettera kontaktuppgifter", reason: "Saknar verifierad e-post eller Instagram", priority: 20 + boost, due: false, hot }
  }

  // 5. Kontaktad utan svar: uppföljning sköts av kön, annars följ upp för hand i en annan kanal.
  if (queued) return { kind: "none", label: "Mejl i kön", reason: "Går ut automatiskt", priority: 5, due: false, hot }
  const quiet = contacted ? days(contacted, now) : 0
  const followups = logs.filter((l) => l.step === 2 && l.sentAt).length
  if (quiet >= 7) {
    if (lead.instagram && !acts.some((a) => a.kind === "dm_sent")) return { kind: "dm", label: "Följ upp med ett DM", reason: `Inget svar på ${quiet} dagar`, priority: 55 + boost, due: true, hot }
    if (followups === 0 && lead.companyForm !== "enskild" && lead.email) return { kind: "follow_up", label: "Skicka en uppföljning", reason: `Inget svar på ${quiet} dagar`, priority: 50 + boost, due: true, hot }
    if (quiet >= 21) return { kind: "follow_up", label: "Avsluta eller pausa", reason: `Inget svar på ${quiet} dagar – markera Ej aktuell eller sätt en påminnelse`, priority: 25, due: true, hot }
  }
  return { kind: "none", label: "Väntar på svar", reason: quiet ? `Kontaktad för ${quiet} dagar sedan` : "Kontaktad idag", priority: 10, due: false, hot }
}

/** "Att göra": leads med något att göra, viktigast först. */
export function todoList(leads: Lead[], ctx: { logs: EmailLog[]; activities: Activity[]; now: Date }) {
  return leads
    .map((lead) => ({ lead, action: nextAction(lead, ctx) }))
    .filter((x) => x.action.kind !== "none" && x.action.priority >= 30)
    .sort((a, b) => Number(b.action.due) - Number(a.action.due) || b.action.priority - a.action.priority || b.lead.score - a.lead.score)
}
