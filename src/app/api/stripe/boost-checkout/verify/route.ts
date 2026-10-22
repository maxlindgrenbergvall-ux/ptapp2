import { NextResponse, type NextRequest } from "next/server"

import { getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * PT, efter Stripe: är boosten betald? Frågar Stripe direkt, så att PT:n inte
 * behöver vänta på webhooken. Markeringen är idempotent (mark_boost_paid).
 * Svar: { status, boostedUntil }.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? ""
  if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) return NextResponse.json({ status: "unknown" }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ status: "unknown" }, { status: 401 })

  // Boostköpet måste vara PT:ns eget (RLS).
  const { data: row } = await supabase
    .from("trainer_boosts")
    .select("id, status, stripe_session_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle()
  const boost = row as { id: string; status: string; stripe_session_id: string | null } | null
  if (!boost || boost.stripe_session_id !== sessionId) return NextResponse.json({ status: "unknown" }, { status: 404 })

  const until = async () => {
    const { data } = await supabase.from("trainers").select("boosted_until").eq("id", auth.user.id).maybeSingle()
    return (data as { boosted_until: string | null } | null)?.boosted_until ?? null
  }
  if (boost.status === "paid") return NextResponse.json({ status: "paid", boostedUntil: await until() })
  if (!isStripeEnabled()) return NextResponse.json({ status: "pending" })

  const session = await getStripe().checkout.sessions.retrieve(sessionId).catch(() => null)
  if (session && session.metadata?.boost_id !== boost.id) return NextResponse.json({ status: "unknown" }, { status: 404 })
  if (!session || session.payment_status !== "paid") return NextResponse.json({ status: session?.status === "expired" ? "expired" : "pending" })
  if (!hasServiceRole()) return NextResponse.json({ status: "pending" })

  const { data: boostedUntil, error } = await createSupabaseAdmin().rpc("mark_boost_paid", {
    p_boost: boost.id,
    p_session: session.id,
    p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
    p_amount_sek: session.amount_total === null ? null : Math.round(session.amount_total / 100),
  })
  if (error) return NextResponse.json({ status: "pending" })
  return NextResponse.json({ status: "paid", boostedUntil })
}
