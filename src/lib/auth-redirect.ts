/**
 * Var e-postlänkar och Apple/Google ska skicka tillbaka användaren.
 *
 * Länken pekar alltid på samma domän som användaren registrerade sig på
 * (window.location.origin): PKCE-nyckeln ligger i en cookie på den domänen.
 * Supabase godtar bara adresser som finns under Authentication → URL
 * Configuration → Redirect URLs; annars används Site URL – det var därför
 * bekräftelselänkarna hamnade på Vercel-domänens startsida.
 */
export const DASHBOARD_PATH = "/dashboard"

export function authCallbackUrl(next: string = DASHBOARD_PATH) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`
}

/** Bara interna sökvägar, så att länkar inte kan användas för öppen omdirigering. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : DASHBOARD_PATH
}
