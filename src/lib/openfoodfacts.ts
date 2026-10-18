import "server-only"

/**
 * Open Food Facts – öppen produktdatabas med streckkoder (ODbL-licens,
 * https://world.openfoodfacts.org). Anropas bara från servern så att vi kan
 * sätta User-Agent (krävs enligt deras riktlinjer), cacha och normalisera.
 *
 * Endpoints som används:
 *  - Streckkod:  GET /api/v2/product/{ean}?fields=…&lc=sv&cc=se
 *  - Sök:        GET /cgi/search.pl?search_terms=…&tagtype_0=countries&tag_0=sweden
 *                    [&tagtype_1=brands&tag_1=barebells]&sort_by=unique_scans_n&json=1
 *
 * Svenska varor först: sökningen görs i första hand bland produkter som säljs i
 * Sverige (countries_tags = en:sweden), med varumärkesfilter när frågan nämner
 * ett känt varumärke (Barebells, Nocco …). Ger det för få träffar söks hela
 * databasen. Namn hämtas på svenska när de finns (product_name_sv, lc=sv).
 *
 * Gränser enligt OFF: ~100 produktuppslag/min och ~10 sökningar/min per IP.
 * Därför: klienten debouncar, svaren cachas i CDN:en och i vår egen databas
 * (food_products), och sökningen hoppar över OFF när cachen räcker.
 */
import { detectBrand } from "@/lib/swedish-brands"
import type { FoodProduct, FoodUnit } from "@/types/domain"

const BASE = process.env.OPENFOODFACTS_BASE_URL ?? "https://world.openfoodfacts.org"
const USER_AGENT = `Coavira/1.0 (${process.env.OPENFOODFACTS_CONTACT ?? "https://github.com/maxlindgrenbergvall-ux/ptapp2"})`
const FIELDS = [
  "code",
  "product_name",
  "product_name_sv",
  "abbreviated_product_name_sv",
  "generic_name_sv",
  "brands",
  "nutriments",
  "serving_quantity",
  "serving_quantity_unit",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "categories_tags",
  "countries_tags",
  "image_front_small_url",
].join(",")

/** Hur många träffar som räcker innan vi letar vidare (utanför Sverige / i OFF). */
const ENOUGH = 8

export interface OffProduct {
  code?: string
  product_name?: string
  product_name_sv?: string
  abbreviated_product_name_sv?: string
  generic_name_sv?: string
  brands?: string
  serving_quantity?: number | string
  serving_quantity_unit?: string
  quantity?: string
  product_quantity?: number | string
  product_quantity_unit?: string
  categories_tags?: string[]
  countries_tags?: string[]
  image_front_small_url?: string
  nutriments?: Record<string, number | string | undefined>
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : undefined
}
const r1 = (n: number) => Math.round(n * 10) / 10

/** "33 cl" → {330, ml}, "1,5 l" → {1500, ml}, "4 x 55 g" → {55, g}. */
export function parseQuantity(text: string | undefined): { amount: number; unit: FoodUnit } | null {
  if (!text) return null
  const m = text
    .toLowerCase()
    .replace(",", ".")
    .match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|dl|l)\b/)
  if (!m) return null
  const value = Number(m[2])
  const factor: Record<string, [number, FoodUnit]> = { kg: [1000, "g"], g: [1, "g"], ml: [1, "ml"], cl: [10, "ml"], dl: [100, "ml"], l: [1000, "ml"] }
  const [mult, unit] = factor[m[3]]
  return value > 0 ? { amount: r1(value * mult), unit } : null
}

/** Drycker (läsk, energidryck, mjölk …) anges per 100 ml. */
function unitOf(p: OffProduct): FoodUnit {
  const units = [p.product_quantity_unit, p.serving_quantity_unit].map((u) => u?.toLowerCase())
  if (units.includes("ml")) return "ml"
  if (parseQuantity(p.quantity)?.unit === "ml") return "ml"
  if (p.categories_tags?.some((c) => c === "en:beverages" || c === "en:drinks")) return "ml"
  return "g"
}

/** OFF-produkt → vår modell. Null om namn eller energi saknas (då går den inte att logga vettigt). */
export function normalizeOff(p: OffProduct): FoodProduct | null {
  const n = p.nutriments ?? {}
  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"])
  const kcal = num(n["energy-kcal_100g"]) ?? (kj !== undefined ? kj / 4.184 : undefined)
  const name = (p.product_name_sv || p.abbreviated_product_name_sv || p.product_name || p.generic_name_sv || "").trim()
  if (!p.code || !name || kcal === undefined || kcal < 0 || kcal > 1000) return null
  const clamp = (v: number | undefined) => r1(Math.min(100, Math.max(0, v ?? 0)))
  const unit = unitOf(p)
  // Portion: angiven portion, annars förpackningens storlek om den är en rimlig portion (burk, bar, flaska).
  const serving = num(p.serving_quantity)
  const pack = parseQuantity(p.quantity)
  const servingG =
    serving && serving > 0 && serving <= 5000 ? r1(serving) : pack && pack.unit === unit && pack.amount <= 750 ? pack.amount : undefined
  return {
    id: `off:${p.code}`,
    barcode: p.code,
    name: name.slice(0, 160),
    brand: p.brands?.split(",")[0]?.trim().slice(0, 120) || undefined,
    per100: {
      kcal: Math.round(kcal),
      protein: clamp(num(n["proteins_100g"])),
      carbs: clamp(num(n["carbohydrates_100g"])),
      fat: clamp(num(n["fat_100g"])),
    },
    servingG,
    unit,
    soldInSweden: p.countries_tags?.includes("en:sweden") ?? false,
    source: "openfoodfacts",
    imageUrl: p.image_front_small_url?.startsWith("https://") ? p.image_front_small_url : undefined,
  }
}

async function offFetch(path: string) {
  return fetch(`${BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  })
}

/**
 * Streckkoden som skannats kan vara UPC-A (12 siffror) medan OFF har den som
 * EAN-13 med inledande nolla, eller tvärtom. Prova båda.
 */
export function barcodeVariants(code: string): string[] {
  const out = [code]
  if (code.length === 12) out.push(`0${code}`)
  if (code.length === 13 && code.startsWith("0")) out.push(code.slice(1))
  return out
}

export async function lookupBarcode(code: string): Promise<FoodProduct | null | "error"> {
  let failed = false
  for (const variant of barcodeVariants(code)) {
    try {
      const res = await offFetch(`/api/v2/product/${variant}.json?fields=${FIELDS}&lc=sv&cc=se`)
      if (res.status === 404) continue
      if (!res.ok) {
        failed = true
        continue
      }
      const body = (await res.json()) as { status?: number; product?: OffProduct }
      if (body.status !== 1 || !body.product) continue
      // Behåll koden som användaren skannade, så att nästa skanning matchar cachen.
      const product = normalizeOff({ ...body.product, code: body.product.code ?? variant })
      if (product) return { ...product, id: `off:${code}`, barcode: code }
    } catch {
      failed = true
    }
  }
  return failed ? "error" : null
}

async function offSearch(opts: { terms: string; sweden: boolean; brandTag?: string }): Promise<FoodProduct[]> {
  const q = new URLSearchParams({
    search_terms: opts.terms,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "24",
    sort_by: "unique_scans_n",
    fields: FIELDS,
    lc: "sv",
    cc: "se",
  })
  let i = 0
  if (opts.sweden) {
    q.set(`tagtype_${i}`, "countries")
    q.set(`tag_contains_${i}`, "contains")
    q.set(`tag_${i}`, "sweden")
    i++
  }
  if (opts.brandTag) {
    q.set(`tagtype_${i}`, "brands")
    q.set(`tag_contains_${i}`, "contains")
    q.set(`tag_${i}`, opts.brandTag)
  }
  const res = await offFetch(`/cgi/search.pl?${q}`)
  if (!res.ok) throw new Error(`OFF ${res.status}`)
  const body = (await res.json()) as { products?: OffProduct[] }
  return (body.products ?? []).map(normalizeOff).filter((p): p is FoodProduct => p !== null)
}

/**
 * Sök märkesvaror. Ordning: svenska marknaden (med varumärkesfilter om frågan
 * nämner ett känt varumärke) → samma varumärke i alla länder → fritext i hela
 * databasen. Slutar så fort det finns tillräckligt många träffar.
 */
export async function searchOff(query: string): Promise<FoodProduct[] | "error"> {
  const hit = detectBrand(query)
  const attempts: { terms: string; sweden: boolean; brandTag?: string }[] = hit
    ? [
        { terms: hit.rest, sweden: true, brandTag: hit.brand.tag },
        { terms: hit.rest, sweden: false, brandTag: hit.brand.tag },
        { terms: query, sweden: false },
      ]
    : [
        { terms: query, sweden: true },
        { terms: query, sweden: false },
      ]

  const found = new Map<string, FoodProduct>()
  let anyOk = false
  for (const a of attempts) {
    try {
      for (const p of await offSearch(a)) if (p.barcode && !found.has(p.barcode)) found.set(p.barcode, p)
      anyOk = true
    } catch {
      // Prova nästa variant; fel bara om alla misslyckas.
    }
    if (found.size >= ENOUGH) break
  }
  if (!anyOk) return "error"
  return rankProducts(query, [...found.values()])
}

/**
 * Rangordning för märkesvaror: rätt varumärke och svensk marknad först, sedan
 * hur väl namnet matchar. OFF:s popularitetsordning behålls vid lika poäng.
 */
export function rankProducts(query: string, products: FoodProduct[]): FoodProduct[] {
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  const hit = detectBrand(query)
  const tokens = fold(hit ? hit.rest : query)
    .split(/\s+/)
    .filter((t) => t.length > 1)
  return products
    .map((p, i) => {
      const name = fold(p.name)
      const brand = fold(p.brand ?? "")
      let score = 0
      if (hit && (brand.includes(fold(hit.brand.name)) || brand.replace(/\s/g, "-").includes(hit.brand.tag))) score += 40
      if (p.soldInSweden) score += 25
      score += tokens.filter((t) => name.includes(t)).length * 10
      if (tokens[0] && name.startsWith(tokens[0])) score += 5
      return { p, score: score - i * 0.01 }
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
}
