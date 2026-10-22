import { NextResponse, type NextRequest } from "next/server"

import { getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Klient, efter Stripe: är Coavira Plus betalt? Frågar Stripe direkt, så att
 * klienten inte behöver vänta på webhooken. Markeringen är idempotent (mark_plus_paid).
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? ""
  if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) return NextResponse.json({ status: "unknown" }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ status: "unknown" }, { status: 401 })

  // Köpet måste vara klientens eget (RLS).
  const { data: row } = await supabase.from("plus_purchases").select("id, status, stripe_session_id").eq("stripe_session_id", sessionId).maybeSingle()
  const purchase = row as { id: string; status: string; stripe_session_id: string | null } | null
  if (!purchase || purchase.stripe_session_id !== sessionId) return NextResponse.json({ status: "unknown" }, { status: 404 })
  if (purchase.status === "paid") return NextResponse.json({ status: "paid" })
  if (!isStripeEnabled()) return NextResponse.json({ status: "pending" })

  const session = await getStripe().checkout.sessions.retrieve(sessionId).catch(() => null)
  if (session && session.metadata?.plus_purchase_id !== purchase.id) return NextResponse.json({ status: "unknown" }, { status: 404 })
  if (!session || session.payment_status !== "paid") return NextResponse.json({ status: session?.status === "expired" ? "expired" : "pending" })
  if (!hasServiceRole()) return NextResponse.json({ status: "pending" })

  const { error } = await createSupabaseAdmin().rpc("mark_plus_paid", {
    p_purchase: purchase.id,
    p_session: session.id,
    p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
    p_amount_sek: session.amount_total === null ? null : Math.round(session.amount_total / 100),
  })
  return NextResponse.json({ status: error ? "pending" : "paid" })
}
