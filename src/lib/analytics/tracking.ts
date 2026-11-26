/**
 * Cookie-fri besöksstatistik (v82). Inget sparas i webbläsaren och ingen IP
 * sparas på servern: besökaren räknas med en hash av dagens datum, IP och
 * webbläsare (SHA-256). Hashen byts varje dygn, så samma person kan inte
 * följas mellan dagar.
 */
import { z } from "zod"

export const TRACK_EVENTS = ["pageview", "cta_signup", "cta_find_pt"] as const
export type TrackEvent = (typeof TRACK_EVENTS)[number]

const short = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined))

export const trackBody = z.object({
  event: z.enum(TRACK_EVENTS).default("pageview"),
  path: z.string().trim().max(300).regex(/^\//).default("/"),
  referrer: z.string().max(1000).optional(),
  utm_source: short(100),
  utm_medium: short(100),
  utm_campaign: short(100),
})
export type TrackBody = z.infer<typeof trackBody>

/** Dagens datum i svensk tid (YYYY-MM-DD) – samma dygn som i statistiken. */
export const stockholmDate = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })

export async function visitorHash(date: string, ip: string, userAgent: string, salt = ""): Promise<string> {
  const data = new TextEncoder().encode(`${date}|${ip}|${userAgent}|${salt}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Bara värdnamnet från referrer (utan www). Egen sajt och ogiltiga adresser → null. */
export function referrerHost(referrer: string | undefined, ownHost?: string | null): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "")
    if (!host) return null
    const own = ownHost?.toLowerCase().split(":")[0].replace(/^www\./, "")
    if (own && host === own) return null
    return host.slice(0, 200)
  } catch {
    return null
  }
}

/** Sökmotorer, länkförhandsvisningar och övervakning räknas inte. */
export const isBot = (userAgent: string) =>
  !userAgent || /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|lighthouse|headless|pingdom|uptime|curl|wget|python-requests|httpclient/i.test(userAgent)

/**
 * Vilken CTA ett klick gäller: data-track på länken eller knappen vinner,
 * annars avgör länken – registrering (/bli-pt, /kom-igang, /registrera) är
 * "Skapa konto", butiksbrickor och nedladdning är "Hitta PT" (klienter hittar
 * sin PT i appen).
 */
export function ctaFor(el: { track?: string | null; href?: string | null; store?: string | null }): TrackEvent | null {
  if (el.track === "cta_signup" || el.track === "cta_find_pt") return el.track
  if (el.store) return "cta_find_pt"
  const href = el.href ?? ""
  let path = href
  try {
    path = new URL(href, "https://x.invalid").pathname + new URL(href, "https://x.invalid").hash
  } catch {}
  if (/^\/(bli-pt|kom-igang|registrera)(\/|$|\?)/.test(path)) return "cta_signup"
  if (/hitta|#ladda-ned$/.test(path) || /apps\.apple\.com|play\.google\.com/.test(href)) return "cta_find_pt"
  return null
}
