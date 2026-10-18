import "server-only"

/**
 * Vår egen kopia av Open Food Facts-produkter (tabellen food_products).
 *
 * - Produkter som skannas eller söks fram sparas här av servern (service role).
 * - Sökningen läser här först: vanliga svenska varor som någon redan sökt fram
 *   hittas direkt, även om OFF är långsamt, nere eller har nått sin sökgräns.
 * - Skanningen faller tillbaka hit om OFF inte svarar.
 */
import { toProduct, type ProductRow } from "@/lib/data/supabase-source"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { FoodProduct } from "@/types/domain"

const COLUMNS = "id, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, source, unit, image_url, sold_in_se"

const toRow = (p: FoodProduct) => ({
  barcode: p.barcode!,
  name: p.name.slice(0, 160),
  brand: p.brand?.slice(0, 120) ?? null,
  kcal_100g: p.per100.kcal,
  protein_100g: p.per100.protein,
  carbs_100g: p.per100.carbs,
  fat_100g: p.per100.fat,
  serving_g: p.servingG ?? null,
  unit: p.unit ?? "g",
  image_url: p.imageUrl ?? null,
  sold_in_se: p.soldInSweden ?? false,
  source: "openfoodfacts" as const,
  updated_at: new Date().toISOString(),
})

const asOff = (row: ProductRow): FoodProduct => ({ ...toProduct(row), id: `off:${row.barcode}` })

/** Spara/uppdatera OFF-produkter i cachen. Tyst vid fel – får aldrig störa användaren. */
export async function cacheProducts(products: FoodProduct[], opts: { update?: boolean } = {}) {
  if (!isSupabaseEnabled || !hasServiceRole()) return
  const list = products.filter((p) => p.barcode && p.source === "openfoodfacts")
  if (list.length === 0) return
  const db = createSupabaseAdmin()
  // Unikheten gäller bara OFF-rader (partiellt index), så upsert på barcode går inte.
  const { data: existing, error } = await db
    .from("food_products")
    .select("id, barcode")
    .eq("source", "openfoodfacts")
    .in("barcode", list.map((p) => p.barcode!))
  if (error) return console.error("food_products cache", error.message)
  const byBarcode = new Map((existing ?? []).map((r) => [r.barcode as string, r.id as string]))
  const fresh = list.filter((p) => !byBarcode.has(p.barcode!)).map(toRow)
  if (fresh.length) {
    const { error: e } = await db.from("food_products").insert(fresh)
    if (e) console.error("food_products cache", e.message)
  }
  if (opts.update) {
    for (const p of list.filter((x) => byBarcode.has(x.barcode!))) {
      const { error: e } = await db.from("food_products").update(toRow(p)).eq("id", byBarcode.get(p.barcode!)!)
      if (e) console.error("food_products cache", e.message)
    }
  }
}

/** Cachad produkt för en streckkod (med inloggad användares session; RLS: OFF-rader är läsbara). */
export async function cachedByBarcode(codes: string[]): Promise<FoodProduct | null> {
  if (!isSupabaseEnabled) return null
  try {
    const sb = await createSupabaseServerClient()
    const { data } = await sb.from("food_products").select(COLUMNS).eq("source", "openfoodfacts").in("barcode", codes).limit(1)
    const row = data?.[0] as ProductRow | undefined
    return row ? asOff(row) : null
  } catch {
    return null
  }
}

/** Sök i cachen: alla ord måste finnas i namn eller varumärke. Svenska varor först. */
export async function searchCache(query: string, limit = 20): Promise<FoodProduct[]> {
  if (!isSupabaseEnabled) return []
  const tokens = query
    .toLowerCase()
    .replace(/[%_,()]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 5)
  if (tokens.length === 0) return []
  try {
    const sb = await createSupabaseServerClient()
    let req = sb.from("food_products").select(COLUMNS).eq("source", "openfoodfacts")
    for (const t of tokens) req = req.or(`name.ilike.%${t}%,brand.ilike.%${t}%`)
    const { data } = await req.order("sold_in_se", { ascending: false }).order("updated_at", { ascending: false }).limit(limit)
    return ((data ?? []) as ProductRow[]).map(asOff)
  } catch {
    return []
  }
}
