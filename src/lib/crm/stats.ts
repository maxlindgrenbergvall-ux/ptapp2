/**
 * Konverteringsstatistik (v53): tratten (kontaktad → svar → samtal → PT),
 * svar per mall och per kanal. Rena funktioner – samma siffror i gränssnittet
 * och i testerna. Öppningsgrad visas bara om öppningar faktiskt spåras.
 */
import { ENGAGED, type Activity, type EmailLog, type EmailTemplate, type Lead, type ServerLeadPatch } from "@/lib/crm/types"

const rate = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null)
const reached = (l: Lead) => ENGAGED.includes(l.status) || Boolean(l.convertedAt)

export interface TemplateStats {
  templateId: string
  name: string
  sent: number
  delivered: number
  bounced: number
  opened: number | null
  replied: number
  meetings: number
  converted: number
  replyRate: number | null
  openRate: number | null
}

export interface CrmStats {
  funnel: { leads: number; contacted: number; replied: number; meetings: number; converted: number }
  rates: { reply: number | null; meeting: number | null; conversion: number | null }
  templates: TemplateStats[]
  dm: { sent: number; replied: number; replyRate: number | null }
  followups: { sent: number; cancelled: number }
  /** Spåras öppningar alls? (avstängt som standard) */
  opensTracked: boolean
}

export function crmStats(leads: Lead[], logs: EmailLog[], activities: Activity[], templates: Pick<EmailTemplate, "id" | "name">[]): CrmStats {
  const sentFirst = logs.filter((l) => l.step !== 2 && l.sentAt)
  const opensTracked = logs.some((l) => (l.openCount ?? 0) > 0)
  const byLead = new Map<string, Activity[]>()
  for (const a of activities) byLead.set(a.leadId, [...(byLead.get(a.leadId) ?? []), a])
  const meetingLead = (l: Lead) => l.status === "meeting" || l.status === "customer" || Boolean(l.meetingAt) || (byLead.get(l.id) ?? []).some((a) => a.kind === "call_booked")
  const contacted = leads.filter((l) => l.lastContactedAt || l.lastEmailedAt || sentFirst.some((s) => s.leadId === l.id) || (byLead.get(l.id) ?? []).some((a) => a.kind === "dm_sent"))
  const replied = contacted.filter(reached)
  const meetings = contacted.filter(meetingLead)
  const converted = leads.filter((l) => l.status === "customer" || l.convertedAt)

  // Varje lead räknas på mallen i det FÖRSTA mejlet den fick.
  const firstByLead = new Map<string, EmailLog>()
  for (const l of [...sentFirst].sort((a, b) => a.sentAt!.localeCompare(b.sentAt!))) if (!firstByLead.has(l.leadId)) firstByLead.set(l.leadId, l)
  const leadById = new Map(leads.map((l) => [l.id, l]))
  const per = new Map<string, TemplateStats>()
  for (const log of sentFirst) {
    const id = log.templateId ?? "none"
    const t = per.get(id) ?? { templateId: id, name: templates.find((x) => x.id === id)?.name ?? "Borttagen mall", sent: 0, delivered: 0, bounced: 0, opened: opensTracked ? 0 : null, replied: 0, meetings: 0, converted: 0, replyRate: null, openRate: null }
    t.sent++
    if (log.status === "delivered" || log.deliveredAt) t.delivered++
    if (log.status === "bounced") t.bounced++
    if (opensTracked && (log.openCount ?? 0) > 0) t.opened = (t.opened ?? 0) + 1
    const lead = leadById.get(log.leadId)
    if (lead && firstByLead.get(lead.id)?.id === log.id) {
      if (reached(lead)) t.replied++
      if (meetingLead(lead)) t.meetings++
      if (lead.status === "customer" || lead.convertedAt) t.converted++
    }
    per.set(id, t)
  }
  for (const t of per.values()) {
    const leadsWithThis = [...firstByLead.values()].filter((l) => (l.templateId ?? "none") === t.templateId).length
    t.replyRate = rate(t.replied, leadsWithThis)
    t.openRate = t.opened === null ? null : rate(t.opened, t.sent)
  }

  const dmSent = new Set(activities.filter((a) => a.kind === "dm_sent").map((a) => a.leadId))
  const dmReplied = new Set(activities.filter((a) => a.kind === "dm_reply" && dmSent.has(a.leadId)).map((a) => a.leadId))
  return {
    funnel: { leads: leads.length, contacted: contacted.length, replied: replied.length, meetings: meetings.length, converted: converted.length },
    rates: { reply: rate(replied.length, contacted.length), meeting: rate(meetings.length, contacted.length), conversion: rate(converted.length, contacted.length) },
    templates: [...per.values()].sort((a, b) => b.sent - a.sent),
    dm: { sent: dmSent.size, replied: dmReplied.size, replyRate: rate(dmReplied.size, dmSent.size) },
    followups: { sent: logs.filter((l) => l.step === 2 && l.sentAt).length, cancelled: logs.filter((l) => l.step === 2 && l.status === "cancelled").length },
    opensTracked,
  }
}

/**
 * Vad en manuellt loggad aktivitet gör med leaden (v53). Statusen går bara
 * framåt, och svar/bokningar pausar alla automatiska utskick.
 */
export function activityEffect(kind: Activity["kind"], lead: Pick<Lead, "status">, at: string, meetingAt?: string | null): { patch: ServerLeadPatch; cancelQueued: boolean } {
  const order = ["new", "qualified", "emailed", "replied", "meeting", "customer"]
  const forward = (to: Lead["status"]) => (lead.status === "not_relevant" || order.indexOf(lead.status) < order.indexOf(to) ? { status: to } : {})
  switch (kind) {
    case "dm_sent":
      return { patch: { ...forward("emailed"), lastContactedAt: at, preferredChannel: "instagram" as const }, cancelQueued: false }
    case "dm_reply":
    case "email_reply":
      return { patch: { ...forward("replied"), lastContactedAt: at }, cancelQueued: true }
    case "call_booked":
      return { patch: { ...forward("meeting"), lastContactedAt: at, meetingAt: meetingAt ?? null }, cancelQueued: true }
    case "call_held":
      return { patch: { ...forward("meeting"), lastContactedAt: at }, cancelQueued: true }
    case "no_show":
      return { patch: {}, cancelQueued: false }
    case "converted":
      return { patch: { status: "customer" as const, convertedAt: at, nextActionAt: null, nextActionNote: null }, cancelQueued: true }
  }
}
