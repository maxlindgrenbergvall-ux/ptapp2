import { after, NextResponse, type NextRequest } from "next/server"

import { cacheProducts, searchCache } from "@/lib/food-cache"
import { rankProducts, searchOff } from "@/lib/openfoodfacts"
import type { FoodProduct } from "@/types/domain"

/** Räcker cachen behöver vi inte fråga Open Food Facts (sparar deras sökkvot). */
const CACHE_IS_ENOUGH = 12

/**
 * Fritextsök bland märkesvaror: vår egen cache först, sedan Open Food Facts
 * (svenska marknaden först, med varumärkesfilter för t.ex. Barebells och Nocco).
 * GET /api/food/search?q=barebells
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ products: [] })

  const cached = await searchCache(q)
  const off = cached.length >= CACHE_IS_ENOUGH ? [] : await searchOff(q)
  if (off === "error" && cached.length === 0) {
    return NextResponse.json({ error: "Produktsökningen svarar inte just nu", products: [] }, { status: 502 })
  }

  const merged = new Map<string, FoodProduct>()
  for (const p of [...cached, ...(off === "error" ? [] : off)]) if (p.barcode && !merged.has(p.barcode)) merged.set(p.barcode, p)
  const products = rankProducts(q, [...merged.values()]).slice(0, 24)

  // Spara nya träffar i cachen efter svaret, så att de hittas snabbt nästa gång.
  if (off !== "error" && off.length) after(() => cacheProducts(off.slice(0, 24)))

  return NextResponse.json(
    { products, source: off === "error" ? "cache" : cached.length >= CACHE_IS_ENOUGH ? "cache" : "openfoodfacts" },
    // Delad CDN-cache bara när svaret inte beror på inloggning (cachen läses med användarens session).
    { headers: { "Cache-Control": "private, max-age=600" } }
  )
}
