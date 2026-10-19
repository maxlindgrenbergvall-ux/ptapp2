import { NextResponse, type NextRequest } from "next/server"

import { checkoutSessionParams, describeStripeError, getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { createSupabaseServerClient } from "@/lib/supabase/server"

interface CheckoutRpc {
  checkout_id: string
  trainer_id: string
  total_sek: number
  lines: { purchase_id: string; title: string; price_sek: number; kind: string }[]
}

/**
 * Klient: starta en betalning.
 *  1. create_checkout() i databasen (som klienten, med RLS) skapar obetalda köp.
 *     Priserna hämtas där – webbläsaren skickar bara vilka tjänster som valts.
 *  2. En Stripe Checkout-session skapas med samma rader och belopp.
 *  3. Klienten skickas till Stripe. Webhooken markerar köpet som betalt.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { serviceIds?: unknown } | null
  const serviceIds = Array.isArray(body?.serviceIds) ? body.serviceIds.filter((x): x is string => typeof x === "string").slice(0, 5) : []
  if (!serviceIds.length) return NextResponse.json({ error: "Välj minst en tjänst." }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Logga in för att köpa." }, { status: 401 })
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Kortbetalning är inte aktiverad än. Kontakta Coavira." }, { status: 503 })
  }

  const { data, error } = await supabase.rpc("create_checkout", { p_service_ids: serviceIds })
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Kunde inte skapa kassan." }, { status: 400 })
  const checkout = data as CheckoutRpc

  try {
    const params = checkoutSessionParams({
      checkoutId: checkout.checkout_id,
      clientId: auth.user.id,
      trainerId: checkout.trainer_id,
      email: auth.user.email,
      lines: checkout.lines.map((l) => ({ title: l.title, priceSek: l.price_sek })),
      origin: request.nextUrl.origin,
    })
    const session = await getStripe().checkout.sessions.create(params, { idempotencyKey: `checkout-${checkout.checkout_id}` })
    await supabase.rpc("attach_checkout_session", { p_checkout: checkout.checkout_id, p_session: session.id })
    if (!session.url) throw new Error("Stripe gav ingen betalningslänk")
    return NextResponse.json({ url: session.url })
  } catch (e) {
    // Stripes egna felkod och meddelande loggas (syns i Vercel → Logs) och visas för klienten.
    const { message, log } = describeStripeError(e)
    console.error("stripe checkout", { checkoutId: checkout.checkout_id, ...log })
    return NextResponse.json({ error: `Betalningen kunde inte startas: ${message}` }, { status: 502 })
  }
}
