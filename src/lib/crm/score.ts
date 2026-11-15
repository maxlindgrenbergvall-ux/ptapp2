import { GYM_CHAINS, type Lead, type ScorePart } from "@/lib/crm/types"

/**
 * Lead Score 1–100: hur komplett och relevant ett prospekt är för Coavira.
 * Poängen är en summa av tydliga delar (score_breakdown) som visas i sidopanelen,
 * så att man ser VARFÖR en lead ligger högt eller lågt – ingen svart låda.
 *
 *   Kontaktbarhet (max 45): e-post 20, MX-verifierad +15, telefon 10
 *   Närvaro       (max 30): Instagram 10, webbplats 10, känd källa 5,
 *                           räckvidd 5 (minst 2 000 följare på Instagram)
 *   Profil        (max 30): titel/roll som PT 10, ort 5, gym/företag 5,
 *                           specialisering 5, förnamn + efternamn 5
 *
 * Avdrag: e-postdomän som inte tar emot post (−20), gratisadress utan annan
 * närvaro (−5). Golvet är 1.
 */
const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|msn|telia|spray|bredband|comhem)\.[a-z.]+$/i
const TRAINER_TITLE = /\b(pt|personlig(?:a)?\s+tr[äa]nare|personal\s+trainer|coach|tr[äa]nare|kostr[åa]dgivare|instrukt[öo]r)\b/i

export type Scorable = Pick<Lead, "name" | "title" | "email" | "emailVerified" | "phone" | "instagram" | "websiteUrl" | "gym" | "city" | "specialties" | "sourceUrl"> & Partial<Pick<Lead, "instagramFollowers">>

export function scoreLead(lead: Scorable): { score: number; breakdown: ScorePart[] } {
  const parts: ScorePart[] = []
  const add = (label: string, points: number) => parts.push({ label, points })

  if (lead.email) {
    add("E-postadress", 20)
    if (lead.emailVerified === true) add("E-postdomänen tar emot post (MX)", 15)
    if (lead.emailVerified === false) add("E-postdomänen tar inte emot post", -20)
  }
  if (lead.phone) add("Telefonnummer", 10)

  if (lead.instagram) add("Instagram-profil", 10)
  if ((lead.instagramFollowers ?? 0) >= 2000) add("Räckvidd på Instagram", 5)
  if (lead.websiteUrl) add("Egen webbplats", 10)
  if (lead.sourceUrl) add("Känd källa", 5)

  if (lead.title && TRAINER_TITLE.test(lead.title)) add("Tydlig PT-roll", 10)
  if (lead.city) add("Ort", 5)
  if (lead.gym) add(GYM_CHAINS.some((g) => g.name === lead.gym) ? "Gymkedja" : "Gym / företag", 5)
  if (lead.specialties.length) add("Specialisering", 5)
  if (lead.name.trim().split(/\s+/).length >= 2) add("För- och efternamn", 5)

  if (lead.email && FREE_MAIL.test(lead.email) && !lead.instagram && !lead.websiteUrl) add("Gratisadress utan annan närvaro", -5)

  const sum = parts.reduce((s, p) => s + p.points, 0)
  return { score: Math.max(1, Math.min(100, sum)), breakdown: parts }
}

/** Poängnivå för färg och filter. */
export const scoreTier = (score: number): "high" | "mid" | "low" => (score >= 70 ? "high" : score >= 40 ? "mid" : "low")
