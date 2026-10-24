import { NextResponse, type NextRequest } from "next/server"

import { boostSessionParams, describeStripeError, getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { isIosAppUserAgent } from "@/lib/site"
import { createSupabaseServerClient } from "@/lib/supabase/server"

interface BoostRpc {
  boost_id: string
  trainer_id: string
  price_sek: number
  duration_days: number
}

/**
 * PT: köp PT Boost (199 kr för 7 dagars synlighet).
 *  1. create_boost_checkout() i databasen (som PT:n, med RLS) skapar ett obetalt
 *     boostköp. Priset bestäms där – webbläsaren skickar ingenting.
 *  2. En Stripe Checkout-session skapas (19 900 öre, metadata: trainer_id,
 *     boost_duration_days = 7).
 *  3. PT:n skickas till Stripe. Webhooken (checkout.session.completed) flyttar
 *     fram trainers.boosted_until med 7 dagar.
 */
export async function POST(request: NextRequest) {
  // Digitala tjänster säljs inte med Stripe i iOS-appen (App Store 3.1.1) – knappen visas inte heller där.
  if (isIosAppUserAgent(request.headers.get("user-agent"))) return NextResponse.json({ error: "PT Boost kan inte köpas i iOS-appen." }, { status: 403 })
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Logga in för att köpa boost." }, { status: 401 })
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Kortbetalning är inte aktiverad än. Kontakta Coavira." }, { status: 503 })
  }

  const { data, error } = await supabase.rpc("create_boost_checkout")
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Kunde inte starta boostköpet." }, { status: 400 })
  const boost = data as BoostRpc

  try {
    const params = boostSessionParams({
      boostId: boost.boost_id,
      trainerId: boost.trainer_id,
      priceSek: boost.price_sek,
      durationDays: boost.duration_days,
      email: auth.user.email,
      origin: request.nextUrl.origin,
    })
    const session = await getStripe().checkout.sessions.create(params, { idempotencyKey: `boost-${boost.boost_id}` })
    await supabase.rpc("attach_boost_session", { p_boost: boost.boost_id, p_session: session.id })
    if (!session.url) throw new Error("Stripe gav ingen betalningslänk")
    return NextResponse.json({ url: session.url })
  } catch (e) {
    const { message, log } = describeStripeError(e)
    console.error("stripe boost checkout", { boostId: boost.boost_id, ...log })
    return NextResponse.json({ error: `Betalningen kunde inte startas: ${message}` }, { status: 502 })
  }
}
