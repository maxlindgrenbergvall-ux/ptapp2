import { after, NextResponse } from "next/server"

import { isValidBarcode } from "@/lib/food-search"
import { lookupBarcode } from "@/lib/openfoodfacts"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { toProduct } from "@/lib/data/supabase-source"
import type { FoodProduct } from "@/types/domain"

/**
 * Streckkod → produkt med näringsvärden per 100 g.
 * 200: produkt · 404: finns inte/saknar näringsvärden · 400: ogiltig kod · 502: OFF svarar inte.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = (await ctx.params).code.replace(/\D/g, "")
  if (!isValidBarcode(code)) {
    return NextResponse.json({ error: "Ogiltig streckkod" }, { status: 400 })
  }

  const product = await lookupBarcode(code)
  if (product === "error") {
    // Reserv: produkter som skannats tidigare finns cachade i vår databas.
    const cached = isSupabaseEnabled ? await cachedProduct(code) : null
    if (cached) return NextResponse.json(cached, { headers: { "Cache-Control": "private, max-age=300" } })
    return NextResponse.json({ error: "Produktdatabasen svarar inte just nu" }, { status: 502 })
  }
  if (!product) {
    return NextResponse.json({ error: "Produkten finns inte i databasen" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } })
  }

  // Cacha produkten i vår egen databas (om Supabase + service role finns), så att den
  // fungerar även om OFF är nere. Körs efter svaret och får aldrig sinka skanningen.
  if (isSupabaseEnabled && hasServiceRole()) {
    after(async () => {
      const db = createSupabaseAdmin()
      const row = {
        barcode: product.barcode,
        name: product.name,
        brand: product.brand ?? null,
        kcal_100g: product.per100.kcal,
        protein_100g: product.per100.protein,
        carbs_100g: product.per100.carbs,
        fat_100g: product.per100.fat,
        serving_g: product.servingG ?? null,
        source: "openfoodfacts" as const,
        updated_at: new Date().toISOString(),
      }
      // Unikheten gäller bara OFF-rader (partiellt index), så upsert på barcode går inte.
      const { data: existing } = await db.from("food_products").select("id").match({ barcode: code, source: "openfoodfacts" }).maybeSingle()
      const { error } = existing
        ? await db.from("food_products").update(row).eq("id", existing.id)
        : await db.from("food_products").insert(row)
      if (error) console.error("food_products cache", error.message)
    })
  }

  return NextResponse.json(product, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } })
}

async function cachedProduct(code: string): Promise<FoodProduct | null> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.from("food_products").select("*").match({ barcode: code, source: "openfoodfacts" }).maybeSingle()
  return data ? { ...toProduct(data), id: `off:${code}` } : null
}
