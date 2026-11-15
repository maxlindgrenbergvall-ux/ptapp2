import { detectCompanyForm } from "@/lib/crm/compliance"
import { normalizePhone } from "@/lib/phone"
import { CITIES, GYM_CHAINS, SPECIALTIES, type Extracted, type Segment } from "@/lib/crm/types"

/**
 * Parser för publika sidor (v47): läser ut kontaktuppgifter ur HTML från en
 * webbplats eller en länk-i-bio-sida (Linktree, Beacons …). Ren funktion –
 * ingen nätverkstrafik här (hämtningen sker i fetch-public.ts) – så att den går
 * att enhetstesta mot sparade sidor.
 *
 * Resultatet är ett FÖRSLAG som en människa granskar innan det sparas. Parsern
 * läser bara det som står öppet på sidan: mailto-/tel-länkar, synlig text,
 * metataggar och schema.org-data (JSON-LD).
 */

const LINK_IN_BIO = /(^|\.)(linktr\.ee|beacons\.ai|bio\.link|lnk\.bio|campsite\.bio|taplink\.cc|msha\.ke|linkin\.bio|stan\.store)$/i
const SOCIAL_HOST = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|x\.com|twitter\.com|threads\.net|snapchat\.com|spotify\.com|apple\.com|google\.com|wa\.me|whatsapp\.com|t\.me|pinterest\.[a-z.]+)$/i
/** Adresser som aldrig är en riktig kontaktväg (platshållare, spårning, bildfiler). */
const JUNK_EMAIL = /(@(example|exempel|domain|email|test|sentry|wixpress|sentry-next\.wixpress)\.[a-z.]+$)|(@.*\.(png|jpe?g|gif|webp|svg|css|js)$)|^(no-?reply|noreply|donotreply|postmaster|abuse|mailer-daemon)@|@(sentry\.io|wix\.com|squarespace\.com|godaddy\.com|shopify\.com|cloudflare\.com)$/i
const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)*\.[a-z]{2,24}/gi
/** "namn [at] domän [dot] se", "namn(at)domän.se", "namn (snabel-a) domän.se". */
const OBFUSCATED = /([a-z0-9._%+-]{1,64})\s*(?:\[|\(|\{)\s*(?:at|snabel-?a|@)\s*(?:\]|\)|\})\s*([a-z0-9-]+(?:(?:\.|\s*\[\s*(?:dot|punkt)\s*\]\s*|\s*\(\s*(?:dot|punkt)\s*\)\s*)[a-z0-9-]+)+)/gi
export const TRAINER = /\b(personlig(?:a)?\s+tr[äa]nare|personal\s+trainer|\bPT\b|online\s*-?\s*coach|kostr[åa]dgivare|tr[äa]ningscoach|styrkecoach|l[öo]pcoach|h[äa]lsocoach|certifierad\s+pt|licensierad\s+pt)/i
export const ONLINE = /\bonline\s*-?\s*(coach\w*|pt\b|tr[äa]ning\w*)|\bdistanscoach\w*|\bcoaching\s+p[åa]\s+distans\b/i

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö", eacute: "é", ndash: "–", mdash: "—" }
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d: string) => safeCodePoint(Number(d)))
    .replace(/&([a-zA-Z]{2,8});/g, (m, n: string) => ENTITIES[n] ?? m)
}
const safeCodePoint = (n: number) => (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "")

/** Synlig text: utan skript, stilmallar och taggar. */
export function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim()
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : null
}
const meta = (html: string, key: string) => {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = attr(m[0], "property") ?? attr(m[0], "name")
    if (k?.toLowerCase() === key) return attr(m[0], "content")?.trim() || null
  }
  return null
}
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], "href")).filter((h): h is string => !!h)

function validEmail(e: string): string | null {
  const email = e.trim().replace(/^[.\-_]+|[.,;:!?)\]}>'"]+$/g, "").toLowerCase()
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[a-z]{2,24}$/.test(email) || /\.\./.test(email) || JUNK_EMAIL.test(email)) return null
  return email
}

export function extractEmails(html: string, text: string, host: string): string[] {
  const found: string[] = []
  const push = (raw: string) => {
    const e = validEmail(raw)
    if (e && !found.includes(e)) found.push(e)
  }
  // 1. mailto-länkar är säkrast (någon har medvetet lagt ut adressen som kontaktväg).
  for (const h of hrefs(html)) {
    if (!/^mailto:/i.test(h)) continue
    let address = h.slice(7).split("?")[0]
    try {
      address = decodeURIComponent(address)
    } catch {
      // Felkodad länk: använd den som den står.
    }
    address.split(/[,;]/).forEach(push)
  }
  // 2. Adresser i synlig text, även lätt maskerade ("namn [at] domän.se").
  for (const m of text.matchAll(EMAIL)) push(m[0])
  for (const m of text.matchAll(OBFUSCATED)) push(`${m[1]}@${m[2].replace(/\s*(?:\[\s*(?:dot|punkt)\s*\]|\(\s*(?:dot|punkt)\s*\))\s*/gi, ".").replace(/\s+/g, "")}`)
  // Adresser på sidans egen domän först – de hör säkrast till den som äger sidan.
  const own = host.replace(/^www\./, "")
  return found.sort((a, b) => Number(b.endsWith(`@${own}`)) - Number(a.endsWith(`@${own}`))).slice(0, 5)
}

export function extractPhones(html: string, text: string): string[] {
  const found: string[] = []
  const push = (raw: string) => {
    const p = normalizePhone(raw.replace(/[^\d+]/g, "").replace(/^(\+46)0/, "$1"))
    // Bara svenska nummer med rimlig längd (+46 och 7–10 siffror).
    if (p && /^\+46[1-9]\d{6,9}$/.test(p) && !found.includes(p)) found.push(p)
  }
  for (const h of hrefs(html)) if (/^tel:/i.test(h)) push(decodeURIComponent(h.slice(4)))
  // +46 / 0046 följt av siffror, mobilnummer (07x) och riktnummer med bindestreck (08-123 456 78).
  const PHONE = /(?<![\d-])(?:(?:\+|00)46[\s-]?\(?0?\)?[\s-]?[1-9](?:[\s-]?\d){6,9}|07[02369](?:[\s-]?\d){7}|0[1-9]\d{0,2}[\s]?-[\s]?\d(?:[\s]?\d){4,7})(?![\d-])/g
  for (const m of text.matchAll(PHONE)) push(m[0])
  return found.slice(0, 3)
}

const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "direct", "about", "developer", "legal", "share", "sharer"])
export function extractInstagram(html: string, text: string): string | null {
  for (const h of hrefs(html)) {
    const m = /^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i.exec(h.trim())
    if (m && !IG_RESERVED.has(m[1].toLowerCase())) return m[1].replace(/\.+$/, "")
  }
  const m = /(?:instagram|insta|ig)\s*[:–-]?\s*@([A-Za-z0-9._]{2,30})/i.exec(text)
  return m ? m[1].replace(/\.+$/, "") : null
}

interface LdNode {
  [key: string]: unknown
}
/** schema.org-data (JSON-LD) – plattas ut, även @graph. Trasig JSON hoppas över. */
function jsonLd(html: string): LdNode[] {
  const nodes: LdNode[] = []
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (v: unknown, depth: number) => {
        if (depth > 4 || !v || typeof v !== "object") return
        if (Array.isArray(v)) return v.slice(0, 30).forEach((x) => walk(x, depth + 1))
        nodes.push(v as LdNode)
        walk((v as LdNode)["@graph"], depth + 1)
      }
      walk(JSON.parse(m[1]), 0)
    } catch {
      // Ogiltig JSON-LD: ignorera.
    }
  }
  return nodes
}
const ldType = (n: LdNode) => ([] as unknown[]).concat(n["@type"] ?? []).map(String)
const str = (v: unknown) => (typeof v === "string" && v.trim() ? decodeEntities(v.trim()).slice(0, 160) : null)

/** "Elin Söderberg" – två till fyra ord med stor begynnelsebokstav, inga siffror. */
const PERSON_NAME = /^(?:\p{Lu}[\p{L}'’-]+)(?:\s+(?:\p{Lu}[\p{L}'’-]+|af|von|de|van|der)){1,3}$/u
const GENERIC = /^(hem|home|start|startsida|kontakt|contact|om\s+(mig|oss)|about|v[äa]lkommen|welcome|linktree|beacons|personlig\s+tr[äa]nare|pt)$/i

function pickName(html: string, lds: LdNode[], host: string): string | null {
  const person = lds.find((n) => ldType(n).includes("Person"))
  if (str(person?.name)) return str(person?.name)
  const candidates = [meta(html, "og:title"), /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1], meta(html, "og:site_name"), meta(html, "author")]
    .map((c) => (c ? visibleText(c) : ""))
    .filter(Boolean)
  const pieces = candidates.flatMap((c) => c.split(/\s+[|–—·•:]\s+|\s+-\s+/)).map((p) => p.trim().replace(/^@/, "")).filter((p) => p && !GENERIC.test(p))
  const personLike = pieces.find((p) => PERSON_NAME.test(p))
  if (personLike) return personLike
  const business = lds.find((n) => ldType(n).some((t) => /Business|Organization|HealthClub|SportsActivityLocation|ExerciseGym/.test(t)))
  if (str(business?.name)) return str(business?.name)
  const first = pieces.find((p) => p.length <= 80)
  if (first) return first
  // Sista utvägen: domännamnet ("elinpt.se" → "elinpt").
  return LINK_IN_BIO.test(host) ? null : host.replace(/^www\./, "").split(".")[0] || null
}

function pickCity(lds: LdNode[], text: string): string | null {
  for (const n of lds) {
    const address = n.address as LdNode | undefined
    const locality = str(address?.addressLocality) ?? str((n.areaServed as LdNode | undefined)?.name) ?? str(n.areaServed)
    const hit = locality && CITIES.find((c) => c.toLowerCase() === locality.toLowerCase())
    if (hit) return hit
  }
  // Annars den ort som nämns flest gånger i texten.
  let best: { city: string; n: number } | null = null
  for (const city of CITIES) {
    const n = text.match(new RegExp(`(?<![\\p{L}])${city}(?:s)?(?![\\p{L}])`, "giu"))?.length ?? 0
    if (n > (best?.n ?? 0)) best = { city, n }
  }
  return best?.city ?? null
}

export function extractContacts(html: string, pageUrl: string): Extracted {
  const url = new URL(pageUrl)
  const host = url.hostname.toLowerCase()
  const text = visibleText(html)
  const lds = jsonLd(html)
  const description = [meta(html, "description"), meta(html, "og:description")].filter(Boolean).join(" ")
  const all = `${description}\n${text}`

  const emails = extractEmails(html, text, host)
  for (const n of lds) {
    const e = str(n.email)?.replace(/^mailto:/i, "")
    const valid = e && validEmail(e)
    if (valid && !emails.includes(valid)) emails.push(valid)
  }
  const phones = extractPhones(html, text)
  for (const n of lds) {
    const p = str(n.telephone)
    const normalized = p && normalizePhone(p.replace(/[^\d+]/g, "").replace(/^(\+46)0/, "$1"))
    if (normalized && /^\+46[1-9]\d{6,9}$/.test(normalized) && !phones.includes(normalized)) phones.push(normalized)
  }

  const linkInBio = LINK_IN_BIO.test(host)
  // Länk-i-bio-sidor: personens egen sida är första externa länken som inte är ett socialt nätverk.
  const external = hrefs(html)
    .map((h) => {
      try {
        return new URL(h, url)
      } catch {
        return null
      }
    })
    .find((u) => u && /^https?:$/.test(u.protocol) && u.hostname !== host && !SOCIAL_HOST.test(u.hostname) && !LINK_IN_BIO.test(u.hostname))
  const websiteUrl = linkInBio ? (external ? `${external.origin}${external.pathname === "/" ? "" : external.pathname}` : null) : `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`

  const person = lds.find((n) => ldType(n).includes("Person"))
  const chainByHost = GYM_CHAINS.find((g) => g.domains.some((d) => host === d || host.endsWith(`.${d}`)))
  const chainByEmail = GYM_CHAINS.find((g) => emails.some((e) => g.domains.some((d) => e.endsWith(`@${d}`))))
  const chainByText = GYM_CHAINS.find((g) => new RegExp(`(?:pt|tr[äa]nare|coach|instrukt[öo]r|jobbar|arbetar|verksam)[^.\\n]{0,40}(?:p[åa]|hos|vid|@)\\s+${g.pattern.source}`, "i").test(all))
  const chain = chainByHost ?? chainByEmail ?? chainByText
  const worksFor = person?.worksFor as LdNode | undefined
  const gym = chain?.name ?? str(worksFor?.name) ?? null

  const isTrainer = TRAINER.test(all) || /Personal\s*Trainer/i.test(String(person?.jobTitle ?? ""))
  const segment: Segment = chain ? "gym_chain" : linkInBio || (ONLINE.test(all) && Boolean(extractInstagram(html, text))) ? "influencer" : "freelance"
  const title = str(person?.jobTitle) ?? (ONLINE.test(all) ? "Onlinecoach" : /kostr[åa]dgivare/i.test(all) && !/personlig(?:a)?\s+tr[äa]nare|\bPT\b/i.test(all) ? "Kostrådgivare" : isTrainer ? "Personlig tränare" : null)

  return {
    name: pickName(html, lds, host),
    title,
    emails,
    phones,
    instagram: extractInstagram(html, text),
    websiteUrl,
    gym,
    city: pickCity(lds, all),
    specialties: SPECIALTIES.filter((s) => s.pattern.test(all)).map((s) => s.label).slice(0, 6),
    segment,
    isTrainer,
    // v53: bolagsform (org.nr som börjar på 5 = aktiebolag). En gymkedja är alltid ett bolag.
    ...(() => {
      const d = detectCompanyForm(all)
      return { companyForm: chain ? ("ab" as const) : d.form, orgNumber: d.orgNumber }
    })(),
  }
}

/** Länkar till en kontakt-/om-sida på samma domän (för ett extra, enda hopp). */
export function contactLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl)
  const out: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = attr(m[0], "href")
    if (!href || /^(mailto|tel|javascript|#)/i.test(href)) continue
    const label = visibleText(m[1])
    if (!/kontakt|contact|om\s+mig|om\s+oss|about/i.test(`${label} ${href}`)) continue
    try {
      const u = new URL(href, base)
      u.hash = ""
      if (u.hostname === base.hostname && /^https?:$/.test(u.protocol) && u.href !== base.href && !out.includes(u.href)) out.push(u.href)
    } catch {
      // Ogiltig länk: hoppa över.
    }
  }
  return out.slice(0, 2)
}

/** Den ort i CITIES som nämns flest gånger i en text (t.ex. en Instagram-bio). */
export function cityFromText(text: string): string | null {
  return pickCity([], text)
}
