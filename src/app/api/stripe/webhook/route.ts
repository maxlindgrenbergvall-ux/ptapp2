import { NextResponse, type NextRequest } from "next/server"

import { verifyStripeSignature, type CheckoutSession } from "@/lib/payments/stripe"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

interface StripeEvent {
  id: string
  type: string
  data: { object: CheckoutSession & { refunded?: boolean } }
}

/**
 * Stripe → Coavira. Lägg till endpointen https://<din-domän>/api/stripe/webhook i
 * Stripe (Developers → Webhooks) med händelserna checkout.session.completed,
 * checkout.session.async_payment_succeeded och charge.refunded.
 *
 * Bara här (med service role) kan ett köp markeras som betalt. Databasen
 * aktiverar då klienten hos PT:n och ger klienten de köpta passen.
 */
export async function POST(request: NextRequest) {
  const payload = await request.text()
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? ""
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Ogiltig signatur" }, { status: 400 })
  }
  const event = JSON.parse(payload) as StripeEvent
  const admin = createSupabaseAdmin()

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object
    const checkoutId = session.metadata?.checkout_id ?? session.client_reference_id
    if (session.payment_status !== "paid" || !checkoutId) return NextResponse.json({ received: true })
    const { error } = await admin.rpc("mark_checkout_paid", {
      p_checkout: checkoutId,
      p_session: session.id,
      p_payment_intent: session.payment_intent,
      p_amount_sek: session.amount_total === null ? null : Math.round(session.amount_total / 100),
    })
    // 500 → Stripe försöker igen senare.
    if (error) {
      console.error("mark_checkout_paid", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object
    if (charge.refunded && charge.payment_intent) {
      const { error } = await admin.rpc("mark_checkout_refunded", { p_payment_intent: charge.payment_intent })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ received: true })
}
