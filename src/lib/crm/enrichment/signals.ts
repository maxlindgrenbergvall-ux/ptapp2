/**
 * Bevis ur varje källa (v54) – rena funktioner, enhetstestade.
 *   fromLead     leadens egna fält: kedjans e-postdomän, gym, segment, följare, org.nr
 *   fromText     en publik text (egen webbplats, Instagram-bio): org.nr, "AB", "enskild firma"
 *   fromSearch   sökträffar från företagsregister: bara träffar som nämner personens namn räknas
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
  for (const r of results) {
    const text = `${r.title} ${r.snippet}`
    if (!mentions(text, lead.name)) continue
    const city = lead.city && fold(text).includes(fold(lead.city)) ? 10 : 0
    let host = ""
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "")
    } catch {
      continue
    }
    for (const hit of findNumbers(text)) {
      if (hit.kind === "ab") out.push({ source: "search", kind: "ab", weight: 70 + city, detail: `Org.nr ${hit.orgNumber} kopplat till ${lead.name} (${host})`, url: r.url, orgNumber: hit.orgNumber! })
      if (hit.kind === "personnummer") out.push({ source: "search", kind: "enskild", weight: 75 + city, detail: `Registrerad som enskild firma (${host})`, url: r.url })
    }
    if (ENSKILD_TEXT.test(text)) out.push({ source: "search", kind: "enskild", weight: 72 + city, detail: `"Enskild firma" i ${host}`, url: r.url })
    else if (AKTIEBOLAG_TEXT.test(text) && !findNumbers(text).some((h) => h.kind === "ab")) out.push({ source: "search", kind: "ab", weight: 60 + city, detail: `"Aktiebolag" i ${host}`, url: r.url })
  }
  return out
}

/** Sökfrågan: namnet exakt, ort om den finns, och registerorden. */
export const searchQuery = (lead: Pick<Lead, "name" | "city">) =>
  [`"${lead.name.trim()}"`, lead.city?.trim(), "(organisationsnummer OR \"enskild firma\" OR aktiebolag)"].filter(Boolean).join(" ").slice(0, 300)
