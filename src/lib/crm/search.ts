import "server-only"

import { GYM_CHAINS, type Segment } from "@/lib/crm/types"

/**
 * Sökning efter prospekts via ett OFFICIELLT sök-API (v47) – inte genom att
 * skrapa en sökmotors resultatsidor, vilket bryter mot deras villkor och ger
 * IP-blockering. Stöd finns för Brave Search API (web search).
 *
 *   BRAVE_SEARCH_API_KEY   krävs för att sökningen ska vara aktiv
 *   CRM_SEARCH_API_BASE    valfritt (tester), standard https://api.search.brave.com
 *
 * Sökningen ger bara KANDIDATER (titel, adress, utdrag). Inget sparas förrän en
 * administratör väljer en träff och granskar det parsern hittar på sidan.
 */
export const searchConfigured = () => Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim())

export interface SearchQuery {
  segment: Segment
  city?: string
  specialty?: string
  /** Gymkedja (för segmentet gymkedja). */
  gym?: string
}
export interface Candidate {
  title: string
  url: string
  host: string
  snippet: string
  /** Sidan ligger på ett socialt nätverk och hämtas därför inte automatiskt. */
  socialOnly: boolean
}

const SOCIAL = /(^|\.)(instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|x\.com|twitter\.com|youtube\.com|threads\.net)$/i
/** Kataloger och jobbsajter – inte en enskild PT:s egen sida. */
const NOISE = /(^|\.)(hitta\.se|eniro\.se|allabolag\.se|ratsit\.se|merinfo\.se|indeed\.com|blocket\.se|wikipedia\.org|reco\.se|trustpilot\.com|google\.com|bokadirekt\.se)$/i

export function buildQuery(q: SearchQuery): string {
  const city = q.city?.trim()
  const specialty = q.specialty?.trim()
  const parts: string[] = []
  if (q.segment === "influencer") parts.push('("online coach" OR "onlinecoach" OR "online PT")', "(site:linktr.ee OR site:beacons.ai OR kontakt)")
  else if (q.segment === "gym_chain") parts.push('"personlig tränare"', `"${q.gym?.trim() || "SATS"}"`)
  else parts.push('"personlig tränare"', "(kontakt OR boka)", ...GYM_CHAINS.slice(0, 4).map((g) => `-"${g.name}"`))
  if (specialty) parts.push(specialty)
  if (city) parts.push(city)
  return parts.join(" ").slice(0, 380)
}

export async function searchCandidates(q: SearchQuery): Promise<Candidate[]> {
  if (!searchConfigured()) throw new Error("Sökningen är inte konfigurerad (BRAVE_SEARCH_API_KEY saknas)")
  const base = (process.env.CRM_SEARCH_API_BASE?.trim() || "https://api.search.brave.com").replace(/\/$/, "")
  const params = new URLSearchParams({ q: buildQuery(q), country: "se", search_lang: "sv", count: "20", safesearch: "moderate" })
  const res = await fetch(`${base}/res/v1/web/search?${params}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!.trim() },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 429) throw new Error("Sök-API:ts gräns är nådd – försök igen om en stund")
  if (!res.ok) throw new Error(`Sök-API:t svarade ${res.status}`)
  const json = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } }
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const r of json.web?.results ?? []) {
    if (!r.url) continue
    let host: string
    try {
      host = new URL(r.url).hostname.toLowerCase()
    } catch {
      continue
    }
    if (NOISE.test(host) || seen.has(r.url)) continue
    seen.add(r.url)
    const strip = (s: string | undefined) => (s ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").trim().slice(0, 300)
    out.push({ title: strip(r.title) || host, url: r.url, host, snippet: strip(r.description), socialOnly: SOCIAL.test(host) })
  }
  return out
}
