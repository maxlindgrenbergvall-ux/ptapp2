/**
 * Två adresser, ett bygge (samma Vercel-projekt):
 *
 *  - SITE_URL – landningssidan, den egna domänen (https://coavira.fit).
 *    NEXT_PUBLIC_SITE_URL i Vercel kan skriva över den. Används för kanonisk
 *    adress, Open Graph och sitemap/robots.
 *  - APP_URL – appen/webbportalen (https://ptapp2.vercel.app).
 *    NEXT_PUBLIC_APP_URL kan skriva över den (t.ex. https://app.coavira.fit).
 *    Mobilapparna laddar samma adress.
 *
 * proxy.ts delar upp trafiken efter värdnamn (hostRoute nedan). Alla andra
 * värdar (localhost, förhandsversioner på *.vercel.app) visar båda delarna.
 *
 * Inloggningslänkar (Supabase) och Stripe-returer byggs från adressen
 * användaren faktiskt är på (window.location.origin / request-origin), så att
 * inloggningscookies och PKCE-nyckeln alltid hör till samma domän.
 */
const clean = (url: string) => url.trim().replace(/\/+$/, "")

export const SITE_URL = clean(process.env.NEXT_PUBLIC_SITE_URL || "https://coavira.fit")
export const APP_URL = clean(process.env.NEXT_PUBLIC_APP_URL || "https://ptapp2.vercel.app")

const siteHost = new URL(SITE_URL).host
const bareSiteHost = siteHost.replace(/^www\./, "")
/** Landningsdomänen med och utan www (Vercel sköter www ↔ utan www). Tom om samma värd som appen. */
export const LANDING_HOSTS = siteHost === new URL(APP_URL).host ? [] : [bareSiteHost, `www.${bareSiteHost}`]
export const APP_HOST = new URL(APP_URL).host

/** Startsidan för inloggning/registrering (Apple, Google, e-post). */
export const START_PATH = "/kom-igang"

/** Coavira-appen (iOS/Android) lägger till "CoaviraApp" i user agent. */
export const isAppUserAgent = (ua: string | null | undefined) => /\bCoaviraApp\b/.test(ua ?? "")

/** Sidor som hör till landningsdomänen. Allt annat (inloggning, /klient, /pt …) är appen. */
const LANDING_PAGES = ["/", "/support", "/integritet", "/villkor"]
/**
 * Fungerar på båda domänerna utan omdirigering:
 *  - /api/* (Stripe-webhooks och kalenderprenumerationer följer inte omdirigeringar),
 *  - /.well-known/*, robots.txt, sitemap, manifest, ikoner och delningsbilder.
 */
const SHARED = /^\/(api\/|\.well-known\/|_next\/|robots\.txt$|sitemap\.xml$|manifest\.webmanifest$|(opengraph|twitter)-image|(apple-)?icon)/

export type HostRoute =
  /** Landningsdomänen, men en app-sida: skicka till samma sökväg i appen. */
  | { redirect: string }
  /** Appens domän: "/" är inloggningen, inte landningssidan. */
  | { start: true }
  | null

/**
 * Vad ska hända med förfrågan, givet värdnamnet?
 *  - coavira.fit (+ www): bara landningssidan. App-sidor (GET/HEAD) skickas
 *    till samma sökväg på APP_URL, även e-postlänkar med ?code / ?token_hash.
 *  - ptapp2.vercel.app: "/" → inloggningen (START_PATH). Inloggade skickas
 *    därifrån vidare till sin startsida av proxy.ts.
 *  - Appen (CoaviraApp) undantas på landningsdomänen, så att äldre byggen som
 *    laddar coavira.fit fortsätter fungera.
 */
export function hostRoute(req: { host: string; pathname: string; search: string; method: string; userAgent: string | null }): HostRoute {
  const host = req.host.toLowerCase()
  const app = isAppUserAgent(req.userAgent)
  if (LANDING_HOSTS.includes(host) && !app) {
    if (req.method !== "GET" && req.method !== "HEAD") return null
    if (SHARED.test(req.pathname)) return null
    const params = new URLSearchParams(req.search)
    const authLink = params.has("code") || (params.has("token_hash") && params.has("type"))
    if (LANDING_PAGES.includes(req.pathname) && !authLink) return null
    return { redirect: `${APP_URL}${req.pathname}${req.search}` }
  }
  if (req.pathname === "/" && (host === APP_HOST || app)) return { start: true }
  return null
}
