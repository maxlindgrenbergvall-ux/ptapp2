import { NextResponse } from "next/server"

import { rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { isRevenueCatEnabled, syncStoreCustomer } from "@/lib/payments/revenuecat-server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Appen, direkt efter ett köp eller "Återställ köp": hämta den inloggades köp
 * från RevenueCat och uppdatera Plus/Boost – utan att vänta på webhooken.
 * Användaren kan bara synka sitt eget konto (sessionen avgör vem).
 */
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Logga in igen." }, { status: 401 })
  if (await rateLimited(`revenuecat-sync:${auth.user.id}`, 20, 60)) return tooManyRequests(60)
  if (!isRevenueCatEnabled()) return NextResponse.json({ error: "Köp i appen är inte aktiverat än." }, { status: 503 })
  try {
    const result = await syncStoreCustomer(auth.user.id)
    return NextResponse.json(result)
  } catch (e) {
    console.error("revenuecat sync", { userId: auth.user.id, message: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: "Köpet kunde inte bekräftas just nu. Försök igen om en stund." }, { status: 502 })
  }
}
