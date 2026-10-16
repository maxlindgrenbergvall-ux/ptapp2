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

/**
 * Kontotypen väljs i välkomststeget och speglas i user_metadata (för navigering;
 * RLS läser profiles.role). null = kontot har inte valt kontotyp än.
 */
export function roleFromMetadata(meta: unknown): UserRole | null {
  const role = (meta as { role?: string } | null)?.role
  return role === "trainer" || role === "client" ? role : null
}

/** Startsidan för en inloggad användare. */
export const homeFor = (role: UserRole | null) => (role ? HOME_FOR_ROLE[role] : ONBOARDING_PATH)
