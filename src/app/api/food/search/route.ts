import { NextResponse, type NextRequest } from "next/server"

import { searchOff } from "@/lib/openfoodfacts"

/** Fritextsök bland märkesvaror i Open Food Facts (svenska marknaden). */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80)
  if (q.length < 3) return NextResponse.json({ products: [] })
  const products = await searchOff(q)
  if (products === "error") {
    return NextResponse.json({ error: "Produktsökningen svarar inte just nu", products: [] }, { status: 502 })
  }
  return NextResponse.json({ products }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } })
}
