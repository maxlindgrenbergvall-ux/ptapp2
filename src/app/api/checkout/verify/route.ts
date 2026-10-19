import { NextResponse, type NextRequest } from "next/server"

import { getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Klient, efter Stripe: är betalningen klar? Frågar Stripe direkt, så att
 * klienten inte behöver vänta på webhooken. Markeringen är idempotent.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? ""
  if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) return NextResponse.json({ status: "unknown" }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ status: "unknown" }, { status: 401 })

  // Kassan måste vara klientens egen (RLS).
  const { data: rows } = await supabase
    .from("purchases")
    .select("checkout_id, status, stripe_session_id")
    .eq("stripe_session_id", sessionId)
    .limit(10)
  const own = ((rows ?? []) as { checkout_id: string; status: string; stripe_session_id: string | null }[]).filter(
    (r) => r.stripe_session_id === sessionId
  )
  if (!own.length) return NextResponse.json({ status: "unknown" }, { status: 404 })
  if (own.every((r) => r.status === "paid")) return NextResponse.json({ status: "paid" })
  if (!isStripeEnabled()) return NextResponse.json({ status: "pending" })

  const session = await getStripe().checkout.sessions.retrieve(sessionId).catch(() => null)
  if (session && session.client_reference_id !== own[0].checkout_id) return NextResponse.json({ status: "unknown" }, { status: 404 })
  if (!session || session.payment_status !== "paid") return NextResponse.json({ status: session?.status === "expired" ? "expired" : "pending" })
  if (hasServiceRole()) {
    const { error } = await createSupabaseAdmin().rpc("mark_checkout_paid", {
      p_checkout: own[0].checkout_id,
      p_session: session.id,
      p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
      p_amount_sek: session.amount_total === null ? null : Math.round(session.amount_total / 100),
    })
    if (error) return NextResponse.json({ status: "pending" })
  }
  return NextResponse.json({ status: hasServiceRole() ? "paid" : "pending" })
}
