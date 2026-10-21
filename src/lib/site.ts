/**
 * Plattformens publika adress (den egna domänen, t.ex. https://coavira.se).
 *
 * Sätts med NEXT_PUBLIC_SITE_URL i Vercel (Production). Utan den används
 * Vercels produktionsadress. Används för kanonisk adress, sociala
 * förhandsvisningar (Open Graph), sitemap/robots och omdirigeringen från
 * *.vercel.app till den egna domänen (proxy.ts).
 *
 * Inloggningslänkar (Supabase) och Stripe-returer byggs från adressen
 * användaren faktiskt är på (window.location.origin / request-origin), så att
 * inloggningscookies och PKCE-nyckeln alltid hör till samma domän.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://ptapp2.vercel.app").trim().replace(/\/+$/, "")

/**
 * Värdnamnet som Vercel-adresserna (*.vercel.app) ska skickas vidare till, eller
 * null. Bara när den egna domänen satts uttryckligen (SITE_URL/NEXT_PUBLIC_SITE_URL).
 */
export const CANONICAL_HOST = process.env.NEXT_PUBLIC_CANONICAL_REDIRECT === "1" ? new URL(SITE_URL).host : null

/** Startsidan för inloggning/registrering (Apple, Google, e-post). */
export const START_PATH = "/kom-igang"

/** Coavira-appen (iOS/Android) lägger till "CoaviraApp" i user agent. */
export const isAppUserAgent = (ua: string | null | undefined) => /\bCoaviraApp\b/.test(ua ?? "")

/**
 * Ska förfrågan skickas vidare från en Vercel-adress (*.vercel.app) till den
 * egna domänen? Returnerar måladressen, eller null.
 *
 * Undantag – de fortsätter fungera på den gamla adressen:
 *  - /api/* (Stripe-webhooks och kalenderprenumerationer följer inte omdirigeringar),
 *  - /auth/* (e-postlänkar som skickats innan bytet: PKCE-nyckeln ligger på den gamla domänen),
 *  - /.well-known/*, appen (CoaviraApp) och allt som inte är GET/HEAD,
 *  - förhandsversioner (bara produktion omdirigeras).
 */
export function canonicalRedirect(req: { host: string; pathname: string; search: string; method: string; userAgent: string | null; vercelEnv?: string }): string | null {
  if (!CANONICAL_HOST || req.vercelEnv !== "production") return null
  if (req.host === CANONICAL_HOST || !req.host.endsWith(".vercel.app")) return null
  if (req.method !== "GET" && req.method !== "HEAD") return null
  if (/^\/(api|auth|\.well-known)(\/|$)/.test(req.pathname) || isAppUserAgent(req.userAgent)) return null
  return `${SITE_URL}${req.pathname}${req.search}`
}
