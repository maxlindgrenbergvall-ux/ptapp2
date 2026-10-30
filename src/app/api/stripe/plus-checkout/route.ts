import { NextResponse, type NextRequest } from "next/server"

import { rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { returnBase } from "@/lib/app-return"
import { plusSessionParams, describeStripeError, getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { isIosAppUserAgent } from "@/lib/site"
import { createSupabaseServerClient } from "@/lib/supabase/server"

interface PlusRpc {
  purchase_id: string
  user_id: string
  price_sek: number
  days: number
}

/**
 * Klient: köp Coavira Plus.
 *  1. create_plus_checkout() i databasen skapar ett obetalt köp. Pris och längd
 *     kommer från den aktiva planen i plus_plans (sätts av Coavira) – utan plan
 *     svarar databasen att Plus inte går att köpa än.
 *  2. En Stripe Checkout-session skapas (metadata kind = "plus").
 *  3. Webhooken (checkout.session.completed) förlänger coavira_plus_until.
 */
export async function POST(request: NextRequest) {
  // Digitala tjänster säljs inte med Stripe i iOS-appen (App Store 3.1.1) – knappen visas inte heller där.
  if (isIosAppUserAgent(request.headers.get("user-agent"))) return NextResponse.json({ error: "Coavira Plus kan inte köpas i iOS-appen." }, { status: 403 })
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Logga in för att skaffa Coavira Plus." }, { status: 401 })
  if (await rateLimited(`plus-checkout:${auth.user.id}`, 10, 60)) return tooManyRequests(60)
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Kortbetalning är inte aktiverad än. Kontakta Coavira." }, { status: 503 })
  }

  const { data, error } = await supabase.rpc("create_plus_checkout")
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Kunde inte starta köpet." }, { status: error?.code === "P0002" ? 409 : 400 })
  const plus = data as PlusRpc

  try {
    const params = plusSessionParams({
      purchaseId: plus.purchase_id,
      userId: plus.user_id,
      priceSek: plus.price_sek,
      days: plus.days,
      email: auth.user.email,
      // Från appen: retur via /app-retur, som lämnar över till appen (betalningen sker i webbläsarvyn).
      origin: returnBase(request.nextUrl.origin, request.headers.get("user-agent")),
    })
    const session = await getStripe().checkout.sessions.create(params, { idempotencyKey: `plus-${plus.purchase_id}` })
    await supabase.rpc("attach_plus_session", { p_purchase: plus.purchase_id, p_session: session.id })
    if (!session.url) throw new Error("Stripe gav ingen betalningslänk")
    return NextResponse.json({ url: session.url })
  } catch (e) {
    const { message, log } = describeStripeError(e)
    console.error("stripe plus checkout", { purchaseId: plus.purchase_id, ...log })
    return NextResponse.json({ error: `Betalningen kunde inte startas: ${message}` }, { status: 502 })
  }
}
