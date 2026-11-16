import { ENGAGED, type Activity, type EmailLog, type Lead } from "@/lib/crm/types"

/**
 * Regler för utskick (v47) – rena funktioner som både förhandsgranskningen och
 * servern använder, så att det som visas är exakt det som sedan händer.
 */

/** Skydd för domänryktet. Kan justeras med miljövariabler på servern (se queueConfig). */
export interface QueueConfig {
  /** Minsta tid mellan två mejl (sekunder). */
  minGapSeconds: number
  /** Slumpmässigt tillägg per mejl (sekunder), så att utskicken inte går som ett urverk. */
  jitterSeconds: number
  /** Högst så här många mejl per dygn. */
  dailyCap: number
  /** Utskick sker bara vardagar mellan dessa timmar, svensk tid. */
  windowStartHour: number
  windowEndHour: number
  /** Skicka även lördag och söndag (standard: nej). */
  weekends: boolean
}
export const DEFAULT_QUEUE: QueueConfig = { minGapSeconds: 90, jitterSeconds: 60, dailyCap: 40, windowStartHour: 8, windowEndHour: 17, weekends: false }

export type Blocker = "not_reviewed" | "no_email" | "unsubscribed" | "suppressed" | "bad_domain" | "legal_basis" | "company_form" | "closed" | "engaged" | "recently_emailed" | "already_queued"
export const BLOCKER_TEXT: Record<Blocker, string> = {
  not_reviewed: "Inte granskad – bekräfta bolagstypen i granskningskön först",
  no_email: "Saknar e-postadress",
  unsubscribed: "Har avregistrerat sig",
  suppressed: "Adressen är spärrad (avregistrerad eller studsad tidigare)",
  bad_domain: "E-postdomänen tar inte emot post",
  legal_basis: "Rättslig grund inte bedömd – ange bolagsform (AB eller enskild firma) eller samtycke",
  company_form: "Enskild firma kan inte mejlas med grunden Företagsadress – välj Icke-säljande förfrågan eller Samtycke",
  closed: "Leaden är avslutad (kund eller ej aktuell)",
  engaged: "Har redan svarat eller bokat samtal – fortsätt dialogen personligen",
  recently_emailed: "Fick ett mejl för mindre än 14 dagar sedan",
  already_queued: "Har redan ett mejl i kö eller under granskning",
}

/** Minst så här länge mellan två mejl till samma person. */
export const RECONTACT_DAYS = 14

/** Varför en lead inte får mejlas just nu (tom lista = går bra). */
export function blockersFor(lead: Lead, ctx: { suppressed: boolean; queued: boolean; now: Date }): Blocker[] {
  const out: Blocker[] = []
  // v55: varje lead granskas för hand innan den kan mejlas.
  if (lead.companyTypeManual === false) out.push("not_reviewed")
  if (!lead.email) out.push("no_email")
  if (lead.unsubscribedAt) out.push("unsubscribed")
  if (ctx.suppressed && !lead.unsubscribedAt) out.push("suppressed")
  if (lead.email && lead.emailVerified === false) out.push("bad_domain")
  if (lead.legalBasis === "unknown") out.push("legal_basis")
  // En enskild firma är en fysisk person – "Företagsadress" gäller inte (marknadsföringslagen 19 §).
  if (lead.companyForm === "enskild" && lead.legalBasis === "company") out.push("company_form")
  if (lead.status === "customer" || lead.status === "not_relevant") out.push("closed")
  else if (lead.status === "replied" || lead.status === "meeting") out.push("engaged")
  if (lead.lastEmailedAt && ctx.now.getTime() - new Date(lead.lastEmailedAt).getTime() < RECONTACT_DAYS * 86_400_000) out.push("recently_emailed")
  if (ctx.queued) out.push("already_queued")
  return out
}

/** Klockslag och veckodag i Sverige för en tidpunkt (oberoende av serverns tidszon). */
function stockholm(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  )
  return { weekday: parts.weekday as string, hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second), day: `${parts.year}-${parts.month}-${parts.day}` }
}

/** Närmaste tidpunkt från `from` som ligger i utskicksfönstret (vardag, kontorstid, svensk tid). */
export function nextWindowStart(from: Date, cfg: QueueConfig): Date {
  let t = new Date(from)
  // Högst 10 dygn framåt (helger + röda dagar ryms med marginal); stegar i hela timmar.
  for (let i = 0; i < 24 * 10; i++) {
    const s = stockholm(t)
    const weekend = !cfg.weekends && (s.weekday === "Sat" || s.weekday === "Sun")
    if (!weekend && s.hour >= cfg.windowStartHour && s.hour < cfg.windowEndHour) return t
    // Hoppa till nästa hela timme och prova igen.
    t = new Date(t.getTime() + (60 - s.minute) * 60_000 - s.second * 1000)
  }
  return t
}

/**
 * Planerar utskick: ett mejl i taget med minst minGapSeconds emellan (plus slump),
 * bara i utskicksfönstret och högst dailyCap per svenskt dygn. `sentPerDay` är
 * det som redan skickats/köats (dag "ÅÅÅÅ-MM-DD" → antal) och `lastScheduled` det
 * senaste redan köade mejlet – nya mejl hamnar efter det.
 */
export function planSchedule(count: number, opts: { now: Date; cfg: QueueConfig; sentPerDay?: Record<string, number>; lastScheduled?: Date | null; random?: () => number }): Date[] {
  const { cfg } = opts
  const random = opts.random ?? Math.random
  const perDay = { ...(opts.sentPerDay ?? {}) }
  const out: Date[] = []
  let cursor = new Date(Math.max(opts.now.getTime(), opts.lastScheduled ? opts.lastScheduled.getTime() + cfg.minGapSeconds * 1000 : 0))
  for (let i = 0; i < count; i++) {
    cursor = nextWindowStart(cursor, cfg)
    // Dygnet fullt: gå till nästa dygns fönster.
    for (let guard = 0; guard < 60 && (perDay[stockholm(cursor).day] ?? 0) >= cfg.dailyCap; guard++) {
      const s = stockholm(cursor)
      cursor = nextWindowStart(new Date(cursor.getTime() + ((24 - s.hour) * 60 - s.minute) * 60_000), cfg)
    }
    const day = stockholm(cursor).day
    perDay[day] = (perDay[day] ?? 0) + 1
    out.push(new Date(cursor))
    cursor = new Date(cursor.getTime() + (cfg.minGapSeconds + Math.floor(random() * (cfg.jitterSeconds + 1))) * 1000)
  }
  return out
}

export const stockholmDay = (date: Date) => stockholm(date).day

// ------------------------------------------------- uppföljning (v53) ---
/** Aktiviteter som betyder att leaden har svarat – då pausas uppföljningen. */
const REPLY_KINDS = new Set(["dm_reply", "email_reply", "call_booked", "call_held", "converted"])

/**
 * Får uppföljningen gå ut nu? Den pausas (avbryts) så fort leaden har svarat,
 * bokat samtal, blivit kund, avregistrerat sig – eller om första mejlet
 * studsade eller anmäldes. null = går bra, annars skälet.
 */
export function followupStop(
  lead: Pick<Lead, "status" | "unsubscribedAt">,
  parent: Pick<EmailLog, "status" | "sentAt"> | undefined,
  activities: Pick<Activity, "kind" | "occurredAt">[]
): string | null {
  if (!parent || !parent.sentAt) return "Första mejlet gick aldrig iväg"
  if (parent.status === "bounced" || parent.status === "complained" || parent.status === "failed") return "Första mejlet nådde inte fram"
  if (lead.unsubscribedAt) return "Har avregistrerat sig"
  if (ENGAGED.includes(lead.status as never)) return "Pausad – leaden har svarat"
  if (lead.status === "not_relevant") return "Leaden är avslutad"
  if (activities.some((a) => REPLY_KINDS.has(a.kind) && a.occurredAt >= parent.sentAt!)) return "Pausad – leaden har svarat"
  return null
}

/** När uppföljningen ska gå: `days` dagar efter första mejlet, i nästa utskicksfönster. */
export function followupTime(sentAt: Date, days: number, cfg: QueueConfig): Date {
  return nextWindowStart(new Date(sentAt.getTime() + days * 86_400_000), cfg)
}
