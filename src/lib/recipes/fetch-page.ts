import "server-only"

import { lookup } from "node:dns/promises"
import net from "node:net"

/**
 * Hämta en receptsida åt användaren – säkert (v25).
 *
 * Servern hämtar en adress som användaren skriver in, så skyddet mot SSRF är
 * viktigt (OWASP A10): bara http(s) på standardportar, inga inloggningsuppgifter
 * i adressen, inga interna/privata adresser (även efter DNS-uppslag och vid
 * varje omdirigering), högst 4 omdirigeringar, 10 s och 3 MB.
 *
 * RECIPE_IMPORT_TEST_ORIGIN (t.ex. http://localhost:54700) släpper igenom
 * exakt en lokal adress för e2e-testerna. Den ignoreras i Vercels produktion.
 */

export class RecipeImportError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const MAX_BYTES = 3 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 4
const USER_AGENT = "Mozilla/5.0 (compatible; CoaviraRecipeImport/1.0; +https://coavira.fit)"

const testOrigin = () => (process.env.VERCEL_ENV === "production" ? undefined : process.env.RECIPE_IMPORT_TEST_ORIGIN)

/** Privata, lokala och reserverade adresser (IPv4 och IPv6). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("ff")
  }
  return true
}

async function assertPublic(url: URL) {
  if (testOrigin() && url.origin === testOrigin()) return
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new RecipeImportError(400, "Bara webbadresser (http/https) kan hämtas.")
  if (url.username || url.password) throw new RecipeImportError(400, "Adressen får inte innehålla inloggningsuppgifter.")
  if (url.port && url.port !== "80" && url.port !== "443") throw new RecipeImportError(400, "Adressen använder en port som inte stöds.")
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || (!host.includes(".") && !net.isIP(host))) {
    throw new RecipeImportError(400, "Adressen pekar inte på en publik webbplats.")
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true }).catch(() => [])
  if (addresses.length === 0) throw new RecipeImportError(400, "Webbplatsen hittades inte. Kontrollera adressen.")
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new RecipeImportError(400, "Adressen pekar inte på en publik webbplats.")
}

/** Läs svaret men aldrig mer än MAX_BYTES. */
async function readLimited(res: Response): Promise<string> {
  const length = Number(res.headers.get("content-length") ?? 0)
  if (length > MAX_BYTES) throw new RecipeImportError(413, "Sidan är för stor för att läsas in.")
  const reader = res.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      throw new RecipeImportError(413, "Sidan är för stor för att läsas in.")
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  const charset = res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] ?? "utf-8"
  try {
    return new TextDecoder(charset).decode(buf)
  } catch {
    return new TextDecoder("utf-8").decode(buf)
  }
}

/** Hämta sidan och returnera HTML-koden och den slutliga adressen. */
export async function fetchRecipePage(input: string): Promise<{ html: string; url: string }> {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new RecipeImportError(400, "Det där ser inte ut som en webbadress.")
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8" },
      })
    } catch (e) {
      throw new RecipeImportError(504, (e as Error).name === "TimeoutError" ? "Sidan svarade inte i tid." : "Sidan kunde inte hämtas.")
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location")
      if (!location) throw new RecipeImportError(502, "Sidan skickade vidare till en okänd adress.")
      url = new URL(location, url)
      continue
    }
    if (res.status === 404 || res.status === 410) throw new RecipeImportError(404, "Sidan finns inte (404).")
    if (!res.ok) throw new RecipeImportError(502, `Sidan svarade med fel (${res.status}).`)
    const type = res.headers.get("content-type") ?? ""
    if (type && !/html|xml|ld\+json|text\/plain/i.test(type)) throw new RecipeImportError(415, "Adressen är ingen webbsida.")
    return { html: await readLimited(res), url: url.href }
  }
  throw new RecipeImportError(502, "För många omdirigeringar.")
}
