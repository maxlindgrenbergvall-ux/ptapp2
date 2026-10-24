import { NextResponse, type NextRequest } from "next/server"

import { checkoutSessionParams, describeStripeError, getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { createSupabaseServerClient } from "@/lib/supabase/server"

interface CheckoutRpc {
  checkout_id: string
  trainer_id: string
  subtotal_sek: number
  fee_percent: number
  service_fee_sek: number
  total_sek: number
  lines: { purchase_id: string; title: string; unit_price_sek: number; quantity: number; price_sek: number; kind: string }[]
}

/**
 * Klient: starta en betalning.
 *  1. create_checkout() i databasen (som klienten, med RLS) skapar obetalda köp
 *     och räknar ut serviceavgiften: 5 % för PT:ns befintliga klienter (kod från
 *     PT:n), annars 10 %. Priserna hämtas där – webbläsaren
 *     skickar bara vilka tjänster och hur många enstaka pass som valts.
 *  2. En Stripe Checkout-session skapas med samma rader, antal och avgift.
 *  3. Klienten skickas till Stripe. Webhooken markerar köpet som betalt
 *     (beloppet måste vara deltotal + serviceavgift).
 *
 * Body: { items: [{ serviceId, quantity }] } (äldre appar: { serviceIds }).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { items?: unknown; serviceIds?: unknown } | null
  const items = parseItems(body)
  if (!items.length) return NextResponse.json({ error: "Välj minst en tjänst." }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Logga in för att köpa." }, { status: 401 })
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Kortbetalning är inte aktiverad än. Kontakta Coavira." }, { status: 503 })
  }

  const { data, error } = await supabase.rpc("create_checkout", {
    p_service_ids: items.map((i) => i.serviceId),
    p_quantities: items.map((i) => i.quantity),
  })
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Kunde inte skapa kassan." }, { status: 400 })
  const checkout = data as CheckoutRpc

  try {
    const params = checkoutSessionParams({
      checkoutId: checkout.checkout_id,
      clientId: auth.user.id,
      trainerId: checkout.trainer_id,
      email: auth.user.email,
      lines: checkout.lines.map((l) => ({ title: l.title, unitPriceSek: l.unit_price_sek, quantity: l.quantity })),
      serviceFeeSek: checkout.service_fee_sek,
      feePercent: Number(checkout.fee_percent),
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

/** Högst 5 tjänster; antal är heltal 1–20 (databasen kontrollerar igen). */
function parseItems(body: { items?: unknown; serviceIds?: unknown } | null): { serviceId: string; quantity: number }[] {
  if (Array.isArray(body?.items)) {
    return body.items
      .filter((x): x is { serviceId: string; quantity?: unknown } => typeof x === "object" && x !== null && typeof (x as { serviceId?: unknown }).serviceId === "string")
      .slice(0, 5)
      .map((x) => ({ serviceId: x.serviceId, quantity: typeof x.quantity === "number" && Number.isInteger(x.quantity) ? x.quantity : 1 }))
  }
  if (Array.isArray(body?.serviceIds)) {
    return body.serviceIds
      .filter((x): x is string => typeof x === "string")
      .slice(0, 5)
      .map((serviceId) => ({ serviceId, quantity: 1 }))
  }
  return []
}
