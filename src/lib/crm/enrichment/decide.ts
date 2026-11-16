/**
 * Berikningsmotorns beslut (v54) – rena funktioner, enhetstestade.
 *
 * Varje källa ger BEVIS (Evidence) med en vikt 0–100. Beslutet tar det
 * starkaste beviset per slutsats och följer en fast ordning:
 *
 *   1. Gymkedjans egen e-postdomän (t.ex. @sats.se)         → gym_anstalld (bolagets adress)
 *   2. Aktiebolag (org.nr 5…, verifierat eller med namnträff) → ab
 *      (v57: på en privat adress som gmail → ab men låst och Granska)
 *   3. Enskild firma (text, personnummer som "org.nr")        → enskild_firma
 *   4. Privatperson (uttryckligen ingen firma)                → privatperson
 *   5. Kopplad till en gymkedja (utan kedjans e-post)          → gym_anstalld
 *   6. Influencer/onlinecoach utan känd bolagsform             → influencer
 *   7. Inget säkert                                            → unknown
 *
 * Regelverket (marknadsföringslagen 19 §): bara när mottagaren är en juridisk
 * person – aktiebolaget eller kedjans adress – får säljande B2B-mejl gå ut.
 * Allt annat (enskild firma, privatperson, influencer utan AB, gym-PT på
 * privat adress, okänt) LÅSES till den icke-säljande referensgruppsmallen
 * eller Instagram-DM. Osäkert blir alltid det försiktiga valet.
 */
import type { CompanyForm, LegalBasis } from "@/lib/crm/types"

export const COMPANY_TYPES = ["unknown", "ab", "enskild_firma", "gym_anstalld", "influencer", "privatperson"] as const
export type CompanyType = (typeof COMPANY_TYPES)[number]
export const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  unknown: "Okänd",
  ab: "AB",
  enskild_firma: "Enskild firma",
  gym_anstalld: "Gym-PT",
  influencer: "Influencer",
  privatperson: "Privatperson",
}

export const ENRICHMENT_STATUSES = ["pending", "running", "done", "needs_review", "failed"] as const
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number]
export const ENRICHMENT_STATUS_LABEL: Record<EnrichmentStatus, string> = {
  pending: "Väntar",
  running: "Berikas …",
  done: "Klar",
  needs_review: "Granska",
  failed: "Misslyckades",
}

export type EvidenceSource = "lead" | "email" | "website" | "instagram" | "search" | "bolagsverket"
export const SOURCE_LABEL: Record<EvidenceSource, string> = {
  lead: "Leadens uppgifter",
  email: "E-postdomän",
  website: "Egen webbplats",
  instagram: "Instagram-bio",
  search: "Sökning (företagsregister)",
  bolagsverket: "Bolagsverket",
}

export interface Evidence {
  source: EvidenceSource
  /** Vad beviset talar för. */
  kind: "ab" | "enskild" | "private" | "gym_email" | "gym" | "influencer" | "inactive"
  /** 0–100. */
  weight: number
  /** Kort förklaring, t.ex. "Org.nr 559123-4567 på kontaktsidan". Aldrig ett personnummer. */
  detail: string
  url?: string
  /** Aktiebolagets nummer (aldrig ett personnummer). */
  orgNumber?: string
  /** Bolagsverket bekräftade numret (aktivt aktiebolag). */
  verified?: boolean
}

export interface Decision {
  type: CompanyType
  /** Juridisk form för regelverket (styr mallarna). */
  companyForm: CompanyForm
  /** Rättslig grund som ska gälla – null = låt den vara (t.ex. samtycke). */
  legalBasis: LegalBasis | null
  /** Får säljande B2B-mejl gå ut? */
  salesAllowed: boolean
  confidence: number
  status: EnrichmentStatus
  orgNumber: string | null
  verified: boolean
  /** Varför – en mening till gränssnittet. */
  summary: string
}

/** Gratis e-posttjänster: adressen tillhör en privatperson, inte ett bolag. */
export const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|icloud|me|mac|yahoo|msn|telia|spray|bredband|bahnhof|comhem|tele2|proton|protonmail|pm)\.[a-z.]+$/i
export const isPrivateEmail = (email: string | null | undefined) => Boolean(email && FREE_MAIL.test(email.split("@")[1]?.toLowerCase() ?? ""))

/** Minsta vikt för att något ska räknas som säkert. */
export const SURE = 70

const best = (ev: Evidence[], kind: Evidence["kind"]) => ev.filter((e) => e.kind === kind).sort((a, b) => b.weight - a.weight)[0]

export function decide(evidence: Evidence[], current: { legalBasis: LegalBasis; email?: string | null }): Decision {
  const gymEmail = best(evidence, "gym_email")
  const ab = best(evidence, "ab")
  const inactive = best(evidence, "inactive")
  const enskild = best(evidence, "enskild")
  const priv = best(evidence, "private")
  const gym = best(evidence, "gym")
  const infl = best(evidence, "influencer")
  const keepConsent = current.legalBasis === "consent"
  const locked = (type: CompanyType, form: CompanyForm, confidence: number, summary: string, status: EnrichmentStatus = "done"): Decision => ({
    type,
    companyForm: form,
    legalBasis: keepConsent ? null : "research",
    salesAllowed: keepConsent,
    confidence,
    status,
    orgNumber: null,
    verified: false,
    summary,
  })

  if (gymEmail && gymEmail.weight >= SURE) {
    return { type: "gym_anstalld", companyForm: "ab", legalBasis: keepConsent ? null : "company", salesAllowed: true, confidence: gymEmail.weight, status: "done", orgNumber: null, verified: false, summary: `${gymEmail.detail} – gymkedjans (bolagets) adress, B2B-utskick tillåtet` }
  }
  // Ett avregistrerat/inaktivt bolag räknas inte.
  if (ab && ab.weight >= SURE && !(inactive && inactive.orgNumber === ab.orgNumber)) {
    // v57: personen har ett AB, men adressen vi har är privat (gmail …) – mottagaren är då
    // fortfarande en privatperson. Låst tills bolagets adress läggs in.
    if (isPrivateEmail(current.email)) {
      return {
        ...locked("ab", "ab", ab.weight, `${ab.detail}${ab.verified ? " (bekräftat hos Bolagsverket)" : ""} – men e-posten är privat: lägg in bolagets adress för B2B-utskick`, "needs_review"),
        orgNumber: ab.orgNumber ?? null,
        verified: Boolean(ab.verified),
      }
    }
    return {
      type: "ab",
      companyForm: "ab",
      legalBasis: keepConsent ? null : "company",
      salesAllowed: true,
      confidence: ab.weight,
      status: "done",
      orgNumber: ab.orgNumber ?? null,
      verified: Boolean(ab.verified),
      summary: `${ab.detail}${ab.verified ? " (bekräftat hos Bolagsverket)" : ""} – B2B-utskick tillåtet`,
    }
  }
  if (enskild && enskild.weight >= SURE) return locked("enskild_firma", "enskild", enskild.weight, `${enskild.detail} – låst till referensgrupp eller DM`)
  if (priv && priv.weight >= SURE) return locked("privatperson", "enskild", priv.weight, `${priv.detail} – låst till referensgrupp eller DM`)
  if (gym && gym.weight >= 50) return locked("gym_anstalld", "unknown", gym.weight, `${gym.detail}, men privat e-post – låst till referensgrupp eller DM tills ett AB hittas`)
  if (infl && infl.weight >= 50) return locked("influencer", "unknown", infl.weight, `${infl.detail}, ingen bolagsform hittad – låst till referensgrupp eller DM`)
  const hint = [ab, enskild].filter(Boolean).sort((a, b) => b!.weight - a!.weight)[0]
  return locked(
    "unknown",
    "unknown",
    hint?.weight ?? 0,
    hint ? `Osäkert: ${hint.detail} – låst till referensgrupp eller DM tills det är bekräftat` : "Ingen bolagsform hittades – låst till referensgrupp eller DM",
    "needs_review"
  )
}

/** Ändringar som gör att leaden ska berikas igen. */
export const ENRICH_FIELDS = ["name", "email", "websiteUrl", "instagram", "gym", "city", "segment", "orgNumber"] as const
