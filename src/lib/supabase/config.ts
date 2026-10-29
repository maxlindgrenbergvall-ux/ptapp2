/**
 * Supabase är aktivt när URL + publik nyckel finns. Utan dem körs appen i
 * demoläge med mockdata i webbläsaren (bra för utveckling och visningar).
 *
 * Den publika nyckeln (publishable/anon) får finnas i webbläsaren – all
 * åtkomstkontroll sker med RLS i databasen. Service role-nyckeln får aldrig
 * hamna här.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

export const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY)

export type UserRole = "client" | "trainer"

export const HOME_FOR_ROLE: Record<UserRole, string> = { client: "/klient", trainer: "/pt" }

/** Välkomststeget där nya konton (e-post, Apple, Google) väljer kontotyp. */
export const ONBOARDING_PATH = "/valkommen"

/** Inloggningsrutan för PT:er (konton som Coavira skapat i förväg). */
export const PT_LOGIN_PATH = "/logga-in/pt"

interface RoleSource {
  app_metadata?: Record<string, unknown> | null
  user_metadata?: Record<string, unknown> | null
}

/**
 * Kontotypen för navigeringen (RLS läser profiles.role).
 *
 * PT-rollen godtas BARA från app_metadata, som sätts av databasen/admin och
 * inte kan ändras av användaren. user_metadata kan användaren skriva själv,
 * så därifrån godtas bara "client". null = kontotyp inte vald än.
 */
export function roleFromClaims(user: RoleSource | null | undefined): UserRole | null {
  const app = user?.app_metadata?.role
  if (app === "trainer" || app === "client") return app
  return user?.user_metadata?.role === "client" ? "client" : null
}

/** Obligatorisk PT-onboarding: färdig profil och utbetalningar via Stripe (v22). */
export const PT_ONBOARDING_PATH = "/pt/onboarding"

/**
 * Måste PT:n göra klart onboardingen? Bara när databasen uttryckligen satt
 * app_metadata.pt_ready = false (sync_pt_ready, v22). Saknas värdet är databasen
 * inte uppgraderad till v22 än (eller token utfärdades före uppgraderingen) –
 * då släpps PT:n in som förut i stället för att låsas ute. Användaren kan inte
 * ändra app_metadata.
 */
export function ptOnboardingRequired(user: Pick<RoleSource, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.pt_ready === false
}

/** Startsidan för en inloggad användare. */
export const homeFor = (role: UserRole | null) => (role ? HOME_FOR_ROLE[role] : ONBOARDING_PATH)
