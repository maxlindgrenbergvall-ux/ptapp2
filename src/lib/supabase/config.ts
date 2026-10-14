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

/** Rollen sätts vid registrering (user_metadata) och speglas i profiles.role. */
export function roleFromMetadata(meta: unknown): UserRole {
  return (meta as { role?: string } | null)?.role === "trainer" ? "trainer" : "client"
}
