import "server-only"

/**
 * Open Food Facts – öppen produktdatabas med streckkoder (ODbL-licens,
 * https://world.openfoodfacts.org). Anropas bara från servern så att vi kan
 * sätta User-Agent (krävs enligt deras riktlinjer), cacha och normalisera.
 *
 * Gränser enligt OFF: ~100 produktuppslag/min och ~10 sökningar/min per IP.
 * Klienten debouncar sökningar och svaren cachas i CDN:en (Cache-Control).
 */
import type { FoodProduct } from "@/types/domain"

const BASE = process.env.OPENFOODFACTS_BASE_URL ?? "https://world.openfoodfacts.org"
const USER_AGENT = `Coavira/1.0 (${process.env.OPENFOODFACTS_CONTACT ?? "https://github.com/maxlindgrenbergvall-ux/ptapp2"})`
const FIELDS = [
  "code",
  "product_name",
  "product_name_sv",
  "generic_name_sv",
  "brands",
  "nutriments",
  "serving_quantity",
  "quantity",
  "image_front_small_url",
].join(",")

interface OffProduct {
  code?: string
  product_name?: string
  product_name_sv?: string
  generic_name_sv?: string
  brands?: string
  serving_quantity?: number | string
  image_front_small_url?: string
  nutriments?: Record<string, number | string | undefined>
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : undefined
}
const r1 = (n: number) => Math.round(n * 10) / 10

/** OFF-produkt → vår modell. Null om namn eller energi saknas (då går den inte att logga vettigt). */
export function normalizeOff(p: OffProduct): FoodProduct | null {
  const n = p.nutriments ?? {}
  const kcal = num(n["energy-kcal_100g"]) ?? (num(n["energy_100g"]) !== undefined ? num(n["energy_100g"])! / 4.184 : undefined)
  const name = (p.product_name_sv || p.product_name || p.generic_name_sv || "").trim()
  if (!p.code || !name || kcal === undefined || kcal < 0 || kcal > 1000) return null
  const clamp = (v: number | undefined) => r1(Math.min(100, Math.max(0, v ?? 0)))
  const serving = num(p.serving_quantity)
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
    servingG: serving && serving > 0 && serving <= 5000 ? r1(serving) : undefined,
    source: "openfoodfacts",
    imageUrl: p.image_front_small_url?.startsWith("https://") ? p.image_front_small_url : undefined,
  }
}

async function offFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  })
  return res
}

export async function lookupBarcode(code: string): Promise<FoodProduct | null | "error"> {
  try {
    const res = await offFetch(`/api/v2/product/${code}.json?fields=${FIELDS}&lc=sv`)
    if (res.status === 404) return null
    if (!res.ok) return "error"
    const body = (await res.json()) as { status?: number; product?: OffProduct }
    if (body.status !== 1 || !body.product) return null
    return normalizeOff({ ...body.product, code: body.product.code ?? code })
  } catch {
    return "error"
  }
}

export async function searchOff(query: string): Promise<FoodProduct[] | "error"> {
  const q = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "20",
    sort_by: "unique_scans_n",
    fields: FIELDS,
    lc: "sv",
    // Svenska marknaden först (det är där användarna handlar).
    tagtype_0: "countries",
    tag_contains_0: "contains",
    tag_0: "sweden",
  })
  try {
    const res = await offFetch(`/cgi/search.pl?${q}`)
    if (!res.ok) return "error"
    const body = (await res.json()) as { products?: OffProduct[] }
    return (body.products ?? []).map(normalizeOff).filter((p): p is FoodProduct => p !== null)
  } catch {
    return "error"
  }
}
