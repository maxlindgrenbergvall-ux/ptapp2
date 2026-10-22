import type Stripe from "stripe"
import { NextResponse, type NextRequest } from "next/server"

import { parseWebhookEvent } from "@/lib/payments/stripe"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const intentId = (v: string | { id: string } | null) => (typeof v === "string" ? v : (v?.id ?? null))

/**
 * Stripe → Coavira. Lägg till endpointen https://<din-domän>/api/stripe/webhook i
 * Stripe (Developers → Webhooks) med händelserna checkout.session.completed,
 * checkout.session.async_payment_succeeded och charge.refunded.
 *
 * Bara här (med service role) kan ett köp markeras som betalt. Databasen
 * aktiverar då klienten hos PT:n och ger klienten de köpta passen.
 *
 * PT Boost (metadata.kind = "boost"): mark_boost_paid() flyttar fram
 * trainers.boosted_until med boost_duration_days (7) – räknat från nu, eller
 * från slutet av en pågående boost.
 */
export async function POST(request: NextRequest) {
  const payload = await request.text()
  const event = parseWebhookEvent(payload, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET ?? "")
  if (!event) return NextResponse.json({ error: "Ogiltig signatur" }, { status: 400 })
  const admin = createSupabaseAdmin()

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.kind === "boost") {
      const boostId = session.metadata.boost_id ?? session.client_reference_id
      if (session.payment_status !== "paid" || !boostId) return NextResponse.json({ received: true })
      const { error } = await admin.rpc("mark_boost_paid", {
        p_boost: boostId,
        p_session: session.id,
        p_payment_intent: intentId(session.payment_intent),
        p_amount_sek: session.amount_total === null ? null : Math.round(session.amount_total / 100),
      })
      if (error) {
        console.error("mark_boost_paid", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ received: true })
    }
    const checkoutId = session.metadata?.checkout_id ?? session.client_reference_id
    if (session.payment_status !== "paid" || !checkoutId) return NextResponse.json({ received: true })
    const { error } = await admin.rpc("mark_checkout_paid", {
      p_checkout: checkoutId,
      p_session: session.id,
      p_payment_intent: intentId(session.payment_intent),
      p_amount_sek: session.amount_total === null ? null : Math.round(session.amount_total / 100),
    })
    // 500 → Stripe försöker igen senare.
    if (error) {
      console.error("mark_checkout_paid", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge
    const pi = intentId(charge.payment_intent)
    if (charge.refunded && pi) {
      // Klientköp eller boost – betalningen hör till högst ett av dem.
      const [checkout, boost] = await Promise.all([
        admin.rpc("mark_checkout_refunded", { p_payment_intent: pi }),
        admin.rpc("mark_boost_refunded", { p_payment_intent: pi }),
      ])
      const error = checkout.error ?? boost.error
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ received: true })
}
