import "server-only"

import dns from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import net from "node:net"

/**
 * Säker hämtning av PUBLIKA sidor för berikning av leads (v47).
 *
 * Hållbart och hänsynsfullt:
 *   - Bara sidor en administratör själv har angett (eller valt ur en sökning) hämtas.
 *     Ingen crawler, ingen massinsamling – en sida och högst en kontaktsida.
 *   - robots.txt respekteras (User-agent: CoaviraBot, annars *).
 *   - Högst en förfrågan varannan sekund per webbplats.
 *   - Tydlig avsändare (User-Agent med kontaktadress).
 *   - Sociala nätverk (Instagram, Facebook, LinkedIn, TikTok …) hämtas ALDRIG
 *     automatiskt – deras villkor förbjuder det. Profiler där sparas bara som länk.
 *
 * Säkert (servern får aldrig bli ett verktyg för att nå interna adresser, SSRF):
 *   - Bara http/https på standardportar, inga inloggningsuppgifter i adressen.
 *   - Värdnamnet slås upp EN gång, alla adresser kontrolleras mot privata och
 *     reserverade nät, och anslutningen görs sedan till exakt den kontrollerade
 *     adressen (ingen andra DNS-uppslagning som kan peka om – "DNS rebinding").
 *   - Omdirigeringar följs högst tre gånger och kontrolleras på samma sätt.
 *   - Högst 1,5 MB, 8 sekunder, bara HTML/text.
 *
 * Tester: med CRM_FETCH_MOCK_ORIGIN (t.ex. http://localhost:54810) skickas ALLA
 * hämtningar dit med den riktiga adressen i rubriken x-original-url – då når
 * ingenting internet. Sätts aldrig i produktion.
 */

export const USER_AGENT = "CoaviraBot/1.0 (+https://coavira.fit/support; kontakt@coavira.fit)"
const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 8_000
const MIN_GAP_MS = 2_000
const MAX_REDIRECTS = 3

/** Plattformar vars villkor förbjuder automatisk hämtning. Länken sparas, sidan hämtas inte. */
const NO_FETCH = /(^|\.)(instagram\.com|facebook\.com|fb\.com|linkedin\.com|tiktok\.com|x\.com|twitter\.com|threads\.net|snapchat\.com|youtube\.com|youtu\.be|pinterest\.[a-z.]+)$/i

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_url" | "blocked_host" | "platform_terms" | "robots" | "not_html" | "too_large" | "timeout" | "http" | "network"
  ) {
    super(message)
  }
}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number)
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51) || (a === 203 && b === 0) || a >= 224
  )
}
/** Privat, lokal eller reserverad adress? Okänt format räknas som privat (hellre stoppa än släppa igenom). */
export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip)
  if (kind === 4) return ipv4Private(ip)
  if (kind !== 6) return true
  const v6 = ip.toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6) ?? /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(v6)
  if (mapped) return ipv4Private(mapped[1])
  if (/^::ffff:/.test(v6)) return true
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6) || /^2001:db8:/.test(v6) || /^2001:0?:/.test(v6)
}

/** Kontrollerar adressen (utan nätverk). Kastar FetchError med ett begripligt meddelande. */
export function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchError("Ogiltig webbadress", "invalid_url")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("Bara http- och https-adresser kan hämtas", "invalid_url")
  if (url.username || url.password) throw new FetchError("Adresser med inloggningsuppgifter hämtas inte", "invalid_url")
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchError("Bara standardportar (80/443) är tillåtna", "blocked_host")
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new FetchError("Interna adresser hämtas inte", "blocked_host")
  } else if (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp|test|invalid|example)$/.test(host) || host === "localhost") {
    throw new FetchError("Interna adresser hämtas inte", "blocked_host")
  }
  if (NO_FETCH.test(host)) throw new FetchError("Sociala nätverk hämtas inte automatiskt (plattformens villkor). Lägg in profilen som länk i stället.", "platform_terms")
  return url
}

const mockOrigin = () => process.env.CRM_FETCH_MOCK_ORIGIN?.trim().replace(/\/$/, "") || null

interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

/** En enda HTTP-förfrågan till en redan kontrollerad adress (ingen omdirigering följs här). */
async function request(url: URL, deadline: number): Promise<RawResponse> {
  const mock = mockOrigin()
  let target = url
  let lookup: net.LookupFunction | undefined
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain;q=0.8", "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.5", "Accept-Encoding": "identity" }
  if (mock) {
    target = new URL(url.pathname + url.search, mock)
    headers["x-original-url"] = url.href
  } else {
    const host = url.hostname.replace(/^\[|\]$/g, "")
    let addresses: { address: string; family: number }[]
    if (net.isIP(host)) addresses = [{ address: host, family: net.isIP(host) }]
    else {
      try {
        addresses = await dns.lookup(host, { all: true, verbatim: true })
      } catch {
        throw new FetchError("Webbplatsen hittades inte", "network")
      }
    }
    // Alla adresser måste vara publika – annars kunde en av dem peka in i ett internt nät.
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new FetchError("Interna adresser hämtas inte", "blocked_host")
    const pinned = addresses[0]
    // Anslut till exakt den kontrollerade adressen (ingen ny uppslagning).
    lookup = ((_h: string, opts: unknown, cb: unknown) => {
      const done = (typeof opts === "function" ? opts : cb) as (err: Error | null, address: unknown, family?: number) => void
      if (typeof opts === "object" && opts && (opts as { all?: boolean }).all) done(null, [pinned])
      else done(null, pinned.address, pinned.family)
    }) as unknown as net.LookupFunction
  }
  return new Promise<RawResponse>((resolve, reject) => {
    const lib = target.protocol === "https:" ? https : http
    const req = lib.request(target, { method: "GET", headers, lookup, timeout: Math.max(1, deadline - Date.now()) }, (res) => {
      const type = String(res.headers["content-type"] ?? "").toLowerCase()
      const status = res.statusCode ?? 0
      const redirect = status >= 300 && status < 400
      if (!redirect && status < 400 && type && !/text\/html|application\/xhtml\+xml|text\/plain/.test(type)) {
        res.destroy()
        return reject(new FetchError("Adressen är inte en webbsida (HTML)", "not_html"))
      }
      const chunks: Buffer[] = []
      let size = 0
      res.on("data", (c: Buffer) => {
        size += c.length
        if (size > MAX_BYTES) {
          res.destroy()
          reject(new FetchError("Sidan är för stor (över 1,5 MB)", "too_large"))
        } else chunks.push(c)
      })
      res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }))
      res.on("error", () => reject(new FetchError("Anslutningen bröts", "network")))
    })
    const timer = setTimeout(() => req.destroy(new FetchError("Webbplatsen svarade inte i tid", "timeout")), Math.max(1, deadline - Date.now()))
    req.on("timeout", () => req.destroy(new FetchError("Webbplatsen svarade inte i tid", "timeout")))
    req.on("error", (e) => reject(e instanceof FetchError ? e : new FetchError("Kunde inte ansluta till webbplatsen", "network")))
    req.on("close", () => clearTimeout(timer))
    req.end()
  })
}

// ------------------------------------------------------------ hänsyn ---
const lastHit = new Map<string, number>()
/** Vänta så att samma webbplats får högst en förfrågan varannan sekund. */
async function politeDelay(host: string) {
  const now = Date.now()
  const next = Math.max(now, (lastHit.get(host) ?? 0) + MIN_GAP_MS)
  lastHit.set(host, next)
  if (lastHit.size > 500) for (const [h, t] of lastHit) if (t < now - 60_000) lastHit.delete(h)
  if (next > now) await new Promise((r) => setTimeout(r, next - now))
}

interface Rules {
  allow: string[]
  disallow: string[]
}
/** Reglerna för CoaviraBot i en robots.txt (egen grupp om den finns, annars *). */
export function parseRobots(text: string): Rules {
  const groups = new Map<string, Rules>()
  let agents: string[] = []
  let inRules = false
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*([^#]*)/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === "user-agent") {
      if (inRules) {
        agents = []
        inRules = false
      }
      agents.push(value.toLowerCase())
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), { allow: [], disallow: [] })
    } else if (key === "allow" || key === "disallow") {
      inRules = true
      if (value) for (const a of agents) groups.get(a)?.[key].push(value)
    }
  }
  return groups.get("coavirabot") ?? groups.get("*") ?? { allow: [], disallow: [] }
}

const robotsPattern = (rule: string) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`)
/** Längsta matchande regel vinner; vid lika längd vinner Allow (samma som Google). */
export function robotsAllows(rules: Rules, path: string): boolean {
  const best = (list: string[]) => list.filter((r) => robotsPattern(r).test(path)).reduce((n, r) => Math.max(n, r.length), -1)
  return best(rules.allow) >= best(rules.disallow)
}

const robotsCache = new Map<string, { rules: Rules | "deny"; at: number }>()
async function robotsFor(url: URL, deadline: number): Promise<Rules | "deny"> {
  const cached = robotsCache.get(url.origin)
  if (cached && Date.now() - cached.at < 3_600_000) return cached.rules
  let rules: Rules | "deny"
  try {
    await politeDelay(url.hostname)
    const res = await request(new URL("/robots.txt", url.origin), deadline)
    // 4xx = ingen robots.txt → allt tillåtet. 5xx = webbplatsen har problem → hämta inte nu.
    rules = res.status >= 500 ? "deny" : res.status >= 400 || res.status >= 300 ? { allow: [], disallow: [] } : parseRobots(res.body)
  } catch (e) {
    // Går robots.txt inte att läsa (t.ex. inte HTML/text) behandlas det som att den saknas.
    rules = e instanceof FetchError && e.code === "not_html" ? { allow: [], disallow: [] } : "deny"
  }
  if (robotsCache.size > 500) robotsCache.clear()
  robotsCache.set(url.origin, { rules, at: Date.now() })
  return rules
}

export interface PublicPage {
  /** Adressen sidan till slut hämtades från (efter omdirigeringar). */
  url: string
  html: string
}

/** Hämtar en publik HTML-sida. Kastar FetchError med ett meddelande som kan visas för administratören. */
export async function fetchPublicPage(raw: string): Promise<PublicPage> {
  const deadline = Date.now() + TIMEOUT_MS * 2
  let url = checkUrl(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const rules = await robotsFor(url, deadline)
    if (rules === "deny") throw new FetchError("Webbplatsen svarar inte som den ska just nu – försök igen senare", "network")
    if (!robotsAllows(rules, url.pathname + url.search)) throw new FetchError("Webbplatsen vill inte att sidan hämtas automatiskt (robots.txt). Lägg in uppgifterna manuellt.", "robots")
    await politeDelay(url.hostname)
    const res = await request(url, deadline)
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      // Varje omdirigering kontrolleras som en ny adress (protokoll, värd, privata nät, robots.txt).
      url = checkUrl(new URL(res.headers.location, url).href)
      continue
    }
    if (res.status === 429) throw new FetchError("Webbplatsen bad oss vänta – försök igen senare", "http")
    if (res.status >= 400) throw new FetchError(`Webbplatsen svarade ${res.status}`, "http")
    return { url: url.href, html: res.body }
  }
  throw new FetchError("För många omdirigeringar", "http")
}
