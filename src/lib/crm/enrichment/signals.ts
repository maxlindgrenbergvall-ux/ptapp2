/**
 * Bevis ur varje källa (v54) – rena funktioner, enhetstestade.
 *   fromLead     leadens egna fält: kedjans e-postdomän, gym, segment, följare, org.nr
 *   fromText     en publik text (egen webbplats, Instagram-bio): org.nr, "AB", "enskild firma"
 *   fromSearch   sökträffar från företagsregister: bara träffar som nämner personens namn räknas
 *                v57: befattningar (VD, styrelseledamot, innehavare …) i ett AB räknas bara när
 *                bolaget håller på med träning, hälsa, coaching eller personlig utveckling
 *   cleanPersonName  "Anna 🏋️ | PT Stockholm" / "anna.andersson.pt" → "Anna Andersson"
 */
import { fold } from "@/lib/crm/quality"
import { GYM_CHAINS, type Lead } from "@/lib/crm/types"
import type { Evidence, EvidenceSource } from "@/lib/crm/enrichment/decide"
import { classifyNumber, findNumbers, formatOrgNumber } from "@/lib/crm/enrichment/orgnr"

export function fromLead(lead: Pick<Lead, "email" | "gym" | "segment" | "instagramFollowers" | "orgNumber" | "title">): Evidence[] {
  const out: Evidence[] = []
  const domain = lead.email?.split("@")[1]?.toLowerCase()
  const chainByEmail = domain ? GYM_CHAINS.find((g) => g.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) : undefined
  if (chainByEmail) out.push({ source: "email", kind: "gym_email", weight: 95, detail: `E-post på ${chainByEmail.name}s domän (@${domain})` })
  const chain = GYM_CHAINS.find((g) => g.name === lead.gym || (lead.gym && g.pattern.test(lead.gym)))
  if (chain) out.push({ source: "lead", kind: "gym", weight: 60, detail: `PT på ${chain.name}` })
  else if (lead.segment === "gym_chain") out.push({ source: "lead", kind: "gym", weight: 55, detail: "PT på gymkedja" })
  if (lead.segment === "influencer" || (lead.instagramFollowers ?? 0) >= 5000 || /online\s*-?\s*coach/i.test(lead.title ?? "")) {
    out.push({ source: "lead", kind: "influencer", weight: 60, detail: lead.instagramFollowers ? `Onlinecoach/influencer (${lead.instagramFollowers.toLocaleString("sv-SE")} följare)` : "Onlinecoach/influencer" })
  }
  if (lead.orgNumber) {
    const digits = lead.orgNumber.replace(/\D/g, "")
    if (classifyNumber(digits) === "ab") out.push({ source: "lead", kind: "ab", weight: 80, detail: `Org.nr ${formatOrgNumber(digits)} angivet`, orgNumber: formatOrgNumber(digits) })
  }
  return out
}

const ENSKILD_TEXT = /\benskild(?:\s+firma|\s+näringsidkare)\b/i
const AKTIEBOLAG_TEXT = /\baktiebolag(?:et)?\b/i
const AB_NAME = /\b[A-ZÅÄÖ][\wåäöÅÄÖ&.-]*(?:\s+[A-ZÅÄÖ][\wåäöÅÄÖ&.-]*){0,1}\s+AB\b/
const PRIVATE_TEXT = /\b(?:ingen\s+f-?skatt|saknar\s+f-?skatt|inte\s+(?:registrerad\s+)?(?:för\s+)?f-?skatt|privatperson)\b/i

/**
 * Bevis i en publik text. Vikterna är högre för personens egen webbplats
 * (hen har själv skrivit org.nr där) än för en Instagram-bio.
 */
export function fromText(text: string, source: Extract<EvidenceSource, "website" | "instagram">, url?: string): Evidence[] {
  const out: Evidence[] = []
  const own = source === "website" ? 0 : -5
  for (const hit of findNumbers(text)) {
    if (hit.kind === "ab") out.push({ source, kind: "ab", weight: 90 + own, detail: `Org.nr ${hit.orgNumber} (aktiebolag) på ${source === "website" ? "webbplatsen" : "Instagram"}`, url, orgNumber: hit.orgNumber! })
    // Ett personnummer i rollen som "org.nr" = enskild firma. Siffrorna sparas aldrig.
    if (hit.kind === "personnummer" && /org(?:anisations)?\.?\s*-?\s*(?:nr|nummer)/i.test(text)) out.push({ source, kind: "enskild", weight: 85 + own, detail: `Personnummer som organisationsnummer på ${source === "website" ? "webbplatsen" : "Instagram"} (enskild firma)`, url })
  }
  if (ENSKILD_TEXT.test(text)) out.push({ source, kind: "enskild", weight: 80 + own, detail: `"Enskild firma" på ${source === "website" ? "webbplatsen" : "Instagram"}`, url })
  if (AKTIEBOLAG_TEXT.test(text)) out.push({ source, kind: "ab", weight: 70 + own, detail: `"Aktiebolag" på ${source === "website" ? "webbplatsen" : "Instagram"}`, url })
  const abName = AB_NAME.exec(text)?.[0]
  if (abName && !/\b(SATS|Nordic Wellness|Actic|STC|Fitness24Seven|Friskis)\b/i.test(abName)) out.push({ source, kind: "ab", weight: 65 + own, detail: `Bolagsnamn "${abName.trim().slice(0, 60)}"`, url })
  if (PRIVATE_TEXT.test(text)) out.push({ source, kind: "private", weight: 75 + own, detail: "Ingen F-skatt / privatperson", url })
  return out
}

// ------------------------------------------------------------- namntvätt ---

/** Ord i Instagram-namn som inte är en del av personens namn. */
const NAME_NOISE = new Set(
  "pt personlig personal tränare tranare trainer träning traning training coach coaching coachen online fitness fit official officiell nutrition kost kostrådgivare dietist yoga pilates crossfit hyrox gym health hälsa halsa wellness mindset ifbb nasm ace sverige sweden stockholm göteborg goteborg malmö malmo uppsala the by mr mrs dr ab".split(" ")
)

/**
 * Personens namn ur ett Instagram-namn eller användarnamn – för registersökningen.
 *   "Anna 🏋️ Andersson | PT Stockholm" → "Anna Andersson"
 *   "anna.andersson.pt"               → "Anna Andersson"
 *   "Coach Anna"                       → null (efternamn saknas – en sökning skulle ge namnes)
 */
export function cleanPersonName(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, " ").replace(/@/g, " ")
  // Ett användarnamn (inga mellanslag) delas på punkt och understreck.
  if (!/\s/.test(s.trim()) && /[._]/.test(s)) s = s.replace(/[._]+/g, " ")
  // Första delen före en avdelare: "Anna Andersson | PT", "Anna Andersson – Coach", "Anna Andersson (PT)".
  const first = s.split(/\s[|•·–—/-]\s|[|•·(),]|\s-{1,2}\s/)[0] ?? s
  const words = first
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .filter((w) => /^\p{L}[\p{L}'-]*$/u.test(w) && w.length >= 2 && !NAME_NOISE.has(w.toLowerCase()))
  if (words.length < 2 || words.length > 4) return null
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  return words.map((w) => w.split("-").map(cap).join("-")).join(" ")
}

// ------------------------------------------------ befattningar i ett AB ---

/** Bolag och verksamheter som hör ihop med PT-yrket. SNI: 93.11/93.12/93.13/93.19 idrott och gym, 85.51 sportutbildning, 96.04 kroppsvård, 96.09, 86.90 annan hälso- och sjukvård. */
const FITNESS =
  /(tr[äa]ning|tr[äa]nare|\bpt\b|personlig\s+(?:tr[äa]n|utveckling)|coach|h[äa]lsa|h[äa]lso|friskv[åa]rd|fitness|\bfit\b|\bgym|idrott|sport|motion|yoga|pilates|wellness|wellbeing|v[äa]lm[åa]ende|kost|nutrition|rehab|massage|styrka|strength|l[öo]pning|crossfit|hyrox|kampsport|mindset|ledarskap|livsstil|\b(?:93\.1[1239]|85\.51|96\.0[49]|86\.90)\b)/i
const ROLE = /(verkst[äa]llande\s+direkt[öo]r|\bvd\b|styrelseordf[öo]rande|ordf[öo]rande|styrelseledamot|ordinarie\s+ledamot|ledamot|styrelsesuppleant|suppleant|innehavare|del[äa]gare|bolagsman|grundare|[äa]gare)/i
const COMPANY = /\b([A-ZÅÄÖ0-9][\wåäöÅÄÖ&'.-]*(?:\s+(?:[A-ZÅÄÖ0-9&][\wåäöÅÄÖ&'.-]*|och|&|för)){0,5}\s+(?:AB|Aktiebolag))\b/g
const CHAINS = /\b(SATS|Nordic Wellness|Actic|STC|Fitness24Seven|Friskis|Svettis)\b/i

/** Rollen med stor bokstav: "styrelseledamot" → "Styrelseledamot". */
const roleLabel = (r: string) => {
  const t = r.toLowerCase().replace(/\s+/g, " ")
  return t === "vd" ? "VD" : t.charAt(0).toUpperCase() + t.slice(1)
}

interface CompanyHit {
  name: string
  role: string | null
  fitness: boolean
  orgNumber: string | null
}

/** Aktiebolag som nämns i ett registerutdrag, med roll, bransch och org.nr i närheten. */
export function companiesIn(text: string): CompanyHit[] {
  const out: CompanyHit[] = []
  for (const m of text.matchAll(COMPANY)) {
    // "Styrelseledamot Lind Hälsa AB" (rubrik utan "i") – rollen hör inte till namnet.
    let name = m[1].trim()
    for (let prev = ""; prev !== name; ) {
      prev = name
      name = name.replace(new RegExp(`^(?:${ROLE.source}|och|för|på)\\s+`, "i"), "").trim()
    }
    if (!/\s/.test(name) || out.some((c) => c.name === name)) continue
    const at = m.index ?? 0
    const before = text.slice(Math.max(0, at - 80), at)
    const around = text.slice(Math.max(0, at - 80), at + m[0].length + 160)
    const role = ROLE.exec(before)?.[0] ?? ROLE.exec(around)?.[0] ?? null
    // Org.nr: det första aktiebolagsnumret efter namnet (annars före).
    const after = findNumbers(text.slice(at, at + m[0].length + 80)).find((h) => h.kind === "ab")
    const prior = findNumbers(before).find((h) => h.kind === "ab")
    out.push({ name, role: role ? roleLabel(role) : null, fitness: FITNESS.test(name) || FITNESS.test(around.replace(name, "")), orgNumber: (after ?? prior)?.orgNumber ?? null })
  }
  return out
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** Alla delar av namnet (minst två bokstäver) finns i texten – annars kan det vara en namne. */
function mentions(text: string, name: string): boolean {
  const parts = fold(name).split(/\s+/).filter((p) => p.length >= 2)
  if (parts.length < 2) return false
  const t = fold(text)
  return parts.every((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))
}

/**
 * Sökträffar (företagsregister som allabolag, merinfo m.fl. – deras egna utdrag
 * via ett officiellt sök-API, inga sidor hämtas). Bara träffar som nämner både
 * för- och efternamn räknas; samma ort höjer vikten.
 */
export function fromSearch(results: SearchResult[], lead: Pick<Lead, "name" | "city">): Evidence[] {
  const out: Evidence[] = []
  const name = cleanPersonName(lead.name) ?? lead.name
  for (const r of results) {
    const text = `${r.title} ${r.snippet}`
    if (!mentions(text, name)) continue
    const city = lead.city && fold(text).includes(fold(lead.city)) ? 10 : 0
    let host = ""
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "")
    } catch {
      continue
    }
    const companies = companiesIn(text).filter((c) => !CHAINS.test(c.name))
    const linked = new Set(companies.map((c) => c.orgNumber).filter(Boolean))
    // v57: befattningar och bolag i utdraget. Bara bolag inom träning/hälsa/coaching räknas som "personens" AB.
    for (const c of companies) {
      const who = c.role ? `${c.role} i ${c.name}` : c.name
      if (c.fitness) out.push({ source: "search", kind: "ab", weight: (c.orgNumber ? 74 : 70) + city, detail: `${who} – träning/hälsa (${host})`, url: r.url, ...(c.orgNumber ? { orgNumber: c.orgNumber } : {}) })
      else out.push({ source: "search", kind: "ab", weight: 30, detail: `${who} – ingen koppling till träning, räknas inte (${host})`, url: r.url })
    }
    for (const hit of findNumbers(text)) {
      if (hit.kind === "ab" && !linked.has(hit.orgNumber) && !companies.length) out.push({ source: "search", kind: "ab", weight: 70 + city, detail: `Org.nr ${hit.orgNumber} kopplat till ${lead.name} (${host})`, url: r.url, orgNumber: hit.orgNumber! })
      if (hit.kind === "personnummer") out.push({ source: "search", kind: "enskild", weight: 75 + city, detail: `Registrerad som enskild firma (${host})`, url: r.url })
    }
    if (ENSKILD_TEXT.test(text)) out.push({ source: "search", kind: "enskild", weight: 74 + city, detail: `Enskild näringsidkare/firma i ${host}`, url: r.url })
    else if (AKTIEBOLAG_TEXT.test(text) && !companies.length && !findNumbers(text).some((h) => h.kind === "ab")) out.push({ source: "search", kind: "ab", weight: 60 + city, detail: `"Aktiebolag" i ${host}`, url: r.url })
  }
  return out
}

/** Sökfrågan: namnet exakt, ort om den finns, och registerorden. */
export const searchQuery = (lead: Pick<Lead, "name" | "city">) =>
  [`"${(cleanPersonName(lead.name) ?? lead.name).trim()}"`, lead.city?.trim(), "(organisationsnummer OR \"enskild firma\" OR aktiebolag)"].filter(Boolean).join(" ").slice(0, 300)

/**
 * v57: första sökningen går direkt mot allabolags egna utdrag – där står både
 * "Enskild näringsidkare" och personens befattningar i aktiebolag.
 * null = namnet räcker inte (förnamn + efternamn behövs, annars blir det namnes).
 */
export const registerQuery = (lead: Pick<Lead, "name">) => {
  const name = cleanPersonName(lead.name)
  return name ? `site:allabolag.se "${name}"` : null
}
