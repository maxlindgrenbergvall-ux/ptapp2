/**
 * Intro-flödet (v31): gemensamt steg 1 och rollbaserade steg efter det.
 *
 *   Klient: 1. Profil (förnamn, efternamn, profilbild) → 2. Mål och kostplan
 *   PT:     1. Profil (+ presentation och inriktning) → 2. Stripe Connect → 3. Villkor och avtal
 *
 * Databasen (my_onboarding_status) avgör vad som är klart; den här filen
 * avgör ordningen och vart användaren ska. proxy.ts använder samma regler för
 * navigeringen, utifrån flaggan app_metadata.onboarding_completed i JWT:n.
 */
import type { UserRole } from "@/lib/supabase/config"

export const CLIENT_ONBOARDING_PATH = "/klient/intro"
export const TRAINER_ONBOARDING_PATH = "/pt/onboarding"

export const ONBOARDING_PATH_FOR: Record<UserRole, string> = {
  client: CLIENT_ONBOARDING_PATH,
  trainer: TRAINER_ONBOARDING_PATH,
}

/** Sidor som går att öppna mitt i intro-flödet (avtalen, återställning, Stripe-retur). */
export const ALLOWED_DURING_ONBOARDING = ["/villkor", "/integritet", "/nytt-losenord", "/konto-raderat", "/app-retur", "/auth/", "/api/"]

export type LegalDocument = "terms" | "privacy" | "pt_agreement" | "gdpr_dpa"

export const LEGAL_DOCUMENTS: Record<LegalDocument, { title: string; accept: string; read: string; summary: string; href: string }> = {
  terms: {
    title: "Användarvillkor",
    accept: "Jag godkänner användarvillkoren",
    read: "Läs användarvillkoren",
    summary: "Hur Coavira fungerar, ditt ansvar som användare och hur konton kan stängas.",
    href: "/villkor",
  },
  privacy: {
    title: "Integritetspolicy",
    accept: "Jag har läst och godkänner integritetspolicyn",
    read: "Läs integritetspolicyn",
    summary: "Vilka personuppgifter vi behandlar, varför, hur länge och dina rättigheter.",
    href: "/integritet",
  },
  pt_agreement: {
    title: "PT-avtal",
    accept: "Jag godkänner PT-avtalet",
    read: "Läs PT-avtalet",
    summary: "Din roll som självständig PT, priser, serviceavgift, utbetalningar via Stripe, avbokning och kvalitet.",
    href: "/villkor/pt",
  },
  gdpr_dpa: {
    title: "GDPR och hälsodata",
    accept: "Jag åtar mig att följa GDPR och tystnadsplikten för klienternas hälsodata",
    read: "Läs GDPR-åtagandet",
    summary: "Tystnadsplikt, säker hantering av klienters hälsouppgifter och att du bara använder dem för coachningen.",
    href: "/villkor/pt#gdpr",
  },
}

/** Status från databasen (my_onboarding_status). Demoläget bygger samma objekt lokalt. */
export interface OnboardingStatus {
  role: UserRole | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  profile_done: boolean
  goals_done: boolean
  pt_profile_done: boolean | null
  payouts_done: boolean | null
  terms_version: string
  required_documents: LegalDocument[]
  accepted_documents: LegalDocument[]
  terms_done: boolean
  completed: boolean
}

export type ClientStep = "profile" | "goals"
export type TrainerStep = "profile" | "payouts" | "terms"
export type OnboardingStep = ClientStep | TrainerStep | "done"

export const CLIENT_STEPS: ClientStep[] = ["profile", "goals"]
export const TRAINER_STEPS: TrainerStep[] = ["profile", "payouts", "terms"]

export const STEP_LABEL: Record<ClientStep | TrainerStep, string> = {
  profile: "Din profil",
  goals: "Mål och kostplan",
  payouts: "Utbetalningar",
  terms: "Villkor och avtal",
}

/**
 * Rollbaserade routern: nästa steg som inte är klart.
 *   Klient → profil → mål
 *   PT     → profil (inkl. presentation) → Stripe Connect → villkor
 * "done" när allt är klart (finish_onboarding kan anropas / är anropad).
 */
export function nextOnboardingStep(s: Pick<OnboardingStatus, "role" | "profile_done" | "goals_done" | "pt_profile_done" | "payouts_done" | "terms_done">): OnboardingStep {
  if (!s.profile_done) return "profile"
  if (s.role === "trainer") {
    if (!s.pt_profile_done) return "profile"
    if (!s.payouts_done) return "payouts"
    if (!s.terms_done) return "terms"
    return "done"
  }
  if (!s.goals_done) return "goals"
  return "done"
}

/**
 * Måste användaren göra intro-flödet? Bara när databasen uttryckligen satt
 * app_metadata.onboarding_completed = false. Saknas värdet är databasen inte
 * uppgraderad till v31 (eller token utfärdades före) – då släpps användaren in
 * som förut i stället för att låsas ute. Användaren kan inte ändra app_metadata.
 */
export function onboardingRequired(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.app_metadata?.onboarding_completed === false
}

/** Får sidan öppnas medan intro-flödet pågår? */
export function allowedDuringOnboarding(role: UserRole, path: string): boolean {
  const own = ONBOARDING_PATH_FOR[role]
  if (path === own || path.startsWith(`${own}/`)) return true
  return ALLOWED_DURING_ONBOARDING.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)))
}

/** "Anna Maria Svensson" → { first: "Anna", last: "Maria Svensson" } (förifyllning av steg 1). */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") }
}

export const NAME_MAX = 60
/** Samma regel som databasen (save_profile_step): 1–60 tecken, inga < > eller styrtecken. */
export function nameError(value: string, label: "förnamn" | "efternamn"): string | null {
  const v = value.trim()
  if (!v) return `Ange ditt ${label}`
  if (v.length > NAME_MAX) return `Högst ${NAME_MAX} tecken`
  if (/[<>\u0000-\u001f\u007f]/.test(v)) return "Namnet innehåller otillåtna tecken"
  return null
}
