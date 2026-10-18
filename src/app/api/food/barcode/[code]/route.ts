import { after, NextResponse } from "next/server"

import { cacheProducts, cachedByBarcode } from "@/lib/food-cache"
import { isValidBarcode } from "@/lib/food-search"
import { barcodeVariants, lookupBarcode } from "@/lib/openfoodfacts"

/**
 * Streckkod → produkt med näringsvärden per 100 g/ml.
 * GET /api/food/barcode/7310865004703
 * 200: produkt · 404: finns inte/saknar näringsvärden · 400: ogiltig kod · 502: OFF svarar inte.
 * (Egna produkter med streckkod matchas redan i appen innan anropet.)
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = (await ctx.params).code.replace(/\D/g, "")
  if (!isValidBarcode(code)) {
    return NextResponse.json({ error: "Ogiltig streckkod" }, { status: 400 })
  }

  const product = await lookupBarcode(code)
  if (product === "error" || product === null) {
    // Reserv: produkter som skannats eller sökts fram tidigare finns i vår databas.
    const cached = await cachedByBarcode(barcodeVariants(code))
    if (cached) return NextResponse.json({ ...cached, barcode: code }, { headers: { "Cache-Control": "private, max-age=300" } })
    if (product === "error") return NextResponse.json({ error: "Produktdatabasen svarar inte just nu" }, { status: 502 })
    return NextResponse.json({ error: "Produkten finns inte i databasen" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } })
  }

  // Cacha (och uppdatera) produkten efter svaret – får aldrig sinka skanningen.
  after(() => cacheProducts([product], { update: true }))

  return NextResponse.json(product, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } })
}
