import { cityFromText, extractEmails, extractPhones, ONLINE, TRAINER } from "@/lib/crm/extract"
import { normalizeUrl } from "@/lib/crm/csv"
import { EMAIL_VERDICT_TEXT, emailVerdict, isChainAccount, looksSwedish, NOT_TRAINER } from "@/lib/crm/quality"
import { scoreLead } from "@/lib/crm/score"
import { GYM_CHAINS, SPECIALTIES, type LeadInput, type Segment } from "@/lib/crm/types"
import { normalizePhone } from "@/lib/phone"

/**
 * Instagram-profiler via Apify (v49) – ren tolkning, ingen nätverkstrafik här
 * (anropen till Apify ligger i apify.ts). Går att enhetstesta mot sparade svar.
 *
 * Apifys utdata är inte en stabil, dokumenterad kontrakt-typ för oss, så varje
 * fält läses från flera tänkbara namn, och e-post/telefon letas dessutom upp i
 * biografin med samma regler som webbparsern.
 */

/** Konton per körning (kostnaden hos Apify räknas per resultat). */
export const MAX_PROFILES_PER_RUN = 50
export const MAX_HASHTAG_POSTS = 100

/** "@elin.pt", "elin.pt" eller "https://www.instagram.com/elin.pt/?hl=sv" → "elin.pt". Annars null. */
export function parseHandle(raw: string): string | null {
  const t = raw.trim()
  const fromUrl = /instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i.exec(t)
  const handle = (fromUrl ? fromUrl[1] : t.replace(/^@/, "")).replace(/\.+$/, "")
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null
  if (["p", "reel", "reels", "explore", "accounts", "stories", "tv", "direct"].includes(handle.toLowerCase())) return null
  return handle
}

/** En rad per konto (eller komma/mellanslag) → unika kontonamn, högst MAX_PROFILES_PER_RUN. */
export function parseHandles(text: string): { handles: string[]; invalid: string[] } {
  const handles: string[] = []
  const invalid: string[] = []
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const h = parseHandle(part)
    if (!h) invalid.push(part)
    else if (!handles.some((x) => x.toLowerCase() === h.toLowerCase())) handles.push(h)
  }
  return { handles: handles.slice(0, MAX_PROFILES_PER_RUN), invalid }
}

/** "#personligtränare" → "personligtränare" (Instagram tillåter bokstäver, siffror och _). */
export function parseHashtag(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "").toLowerCase()
  return /^[\p{L}\p{N}_]{2,60}$/u.test(t) ? t : null
}

/** Indata till actorn apify/instagram-scraper. */
export function profilesInput(handles: string[]) {
  return { directUrls: handles.map((h) => `https://www.instagram.com/${h}/`), resultsType: "details", resultsLimit: 1, addParentData: false }
}
export function hashtagInput(tag: string, limit: number) {
  return { directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`], resultsType: "posts", resultsLimit: Math.max(1, Math.min(MAX_HASHTAG_POSTS, Math.round(limit))), addParentData: false }
}

type Item = Record<string, unknown>
const str = (...values: unknown[]) => {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim()
  return null
}
const num = (...values: unknown[]) => {
  for (const v of values) {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN
    if (Number.isFinite(n) && n >= 0) return Math.round(n)
  }
  return null
}
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Item) : {})

/** Ett förslag ur en Instagram-profil, att granska innan det sparas. */
export interface InstagramCandidate {
  handle: string
  lead: LeadInput
  score: number
  bio: string
  followers: number | null
  category: string | null
  isPrivate: boolean
  isBusiness: boolean
  /** Profilen beskriver tydligt en personlig tränare/coach (och inte t.ex. en kennel). */
  isTrainer: boolean
  /** Kontot verkar finnas i Sverige. */
  isSwedish: boolean
  /** E-posten i profilen är en direkt adress till personen. */
  directEmail: boolean
  /** Konton Instagram visar som liknande (om Apify skickar med dem). */
  related: string[]
  /** Saker att känna till (privat konto, ser inte ut som en PT …). */
  warnings: string[]
}

/** Gränsen där ett konto räknas som influencer/onlinecoach snarare än frilans. */
export const INFLUENCER_FOLLOWERS = 5000

export function profileToCandidate(item: Item): InstagramCandidate | null {
  const handle = parseHandle(str(item.username, item.userName, item.ownerUsername) ?? "")
  if (!handle || item.error) return null
  const bio = (str(item.biography, item.bio) ?? "").slice(0, 2000)
  const fullName = str(item.fullName, item.full_name)
  const category = str(item.businessCategoryName, item.categoryName, item.category, item.category_name)
  const followers = num(item.followersCount, item.followers, item.followerCount, obj(item.edge_followed_by).count)
  const isPrivate = item.private === true || item.isPrivate === true || item.is_private === true
  const isBusiness = item.isBusinessAccount === true || item.is_business_account === true || Boolean(category)
  const links = [str(item.externalUrl, item.external_url), ...[item.externalUrls, item.bioLinks].flatMap((l) => (Array.isArray(l) ? l.map((x) => str(obj(x).url, obj(x).lynx_url, x)) : []))].filter(Boolean) as string[]
  const websiteUrl = links.map((l) => normalizeUrl(l)).find((u): u is string => Boolean(u) && !/instagram\.com/i.test(u!)) ?? null

  // Kontaktuppgifter: först de Instagram själv visar för företagskonton, sedan biografin.
  const text = `${fullName ?? ""}\n${category ?? ""}\n${bio}`
  const emails = [str(item.businessEmail, item.publicEmail, item.public_email, item.email), ...extractEmails("", bio, "")].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase())
  const email = emails.find((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,24}$/.test(e)) ?? null
  const rawPhone = str(item.businessPhoneNumber, item.publicPhoneNumber, item.public_phone_number, item.contactPhoneNumber)
  const phone = (rawPhone && normalizePhone(rawPhone.replace(/[^\d+]/g, "").replace(/^(\+46)0/, "$1"))) || extractPhones("", bio)[0] || null

  const chain = GYM_CHAINS.find((g) => g.pattern.test(text))
  const isTrainer = (TRAINER.test(text) || /personal\s*trainer|fitness\s*(coach|trainer)|\bcoach\b/i.test(category ?? "")) && !NOT_TRAINER.test(text) && !isChainAccount(fullName ?? "", handle)
  const segment: Segment = chain ? "gym_chain" : (followers ?? 0) >= INFLUENCER_FOLLOWERS || ONLINE.test(text) ? "influencer" : "freelance"
  const title = ONLINE.test(text) ? "Onlinecoach" : isTrainer ? "Personlig tränare" : category

  const lead: LeadInput = {
    name: (fullName || handle).slice(0, 160),
    title: title?.slice(0, 160) ?? null,
    segment,
    email,
    phone: phone && /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null,
    instagram: handle,
    instagramFollowers: followers,
    websiteUrl,
    gym: chain?.name ?? null,
    city: cityFromText(text),
    specialties: SPECIALTIES.filter((s) => s.pattern.test(text)).map((s) => s.label).slice(0, 6),
    source: "instagram",
    sourceUrl: `https://www.instagram.com/${handle}/`,
  }
  const { score } = scoreLead({
    name: lead.name!,
    title: lead.title ?? null,
    email: lead.email ?? null,
    emailVerified: null,
    phone: lead.phone ?? null,
    instagram: handle,
    instagramFollowers: followers,
    websiteUrl,
    gym: lead.gym ?? null,
    city: lead.city ?? null,
    specialties: lead.specialties ?? [],
    sourceUrl: lead.sourceUrl ?? null,
  })
  const isSwedish = looksSwedish(text, { email, website: websiteUrl, phone: lead.phone, city: lead.city })
  const verdict = emailVerdict(email, fullName ?? "", handle)
  const related = (Array.isArray(item.relatedProfiles) ? item.relatedProfiles : [])
    .map((r) => parseHandle(str(obj(r).username, r) ?? ""))
    .filter((h): h is string => Boolean(h))
    .slice(0, 30)
  const warnings: string[] = []
  if (isPrivate) warnings.push("Privat konto – inga uppgifter att hämta")
  if (!isTrainer) warnings.push(NOT_TRAINER.test(text) ? "Inte en personlig tränare (t.ex. kennel, salong, butik)" : "Profilen nämner inte personlig träning tydligt")
  if (!isSwedish) warnings.push("Verkar inte finnas i Sverige")
  if (email && verdict !== "direct") warnings.push(EMAIL_VERDICT_TEXT[verdict as Exclude<typeof verdict, "direct">])
  if (verdict !== "direct" && websiteUrl) warnings.push("Ingen direkt e-post i profilen – kan letas upp på webbplatsen")
  return { handle, lead, score, bio, followers, category, isPrivate, isBusiness, isTrainer, isSwedish, directEmail: verdict === "direct", related, warnings }
}

/** Hashtag-sökning: inläggens konton (unika, i den ordning de dök upp). */
export function ownersFromPosts(items: Item[]): string[] {
  const out: string[] = []
  for (const item of items) {
    const h = parseHandle(str(item.ownerUsername, obj(item.owner).username) ?? "")
    if (h && !out.some((x) => x.toLowerCase() === h.toLowerCase())) out.push(h)
  }
  return out.slice(0, MAX_PROFILES_PER_RUN)
}
