import { NextResponse, type NextRequest } from "next/server"

import { rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { returnBase } from "@/lib/app-return"
import { connectAccountParams, describeStripeError, getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

interface PayoutStatus {
  profile_complete: boolean
  exempt: boolean
}

/**
 * PT: koppla bankkonto för utbetalningar (steg 2 i /pt/onboarding).
 *  1. PT:n måste vara inloggad, vara PT och ha en färdig profil (steg 1).
 *  2. Ett Stripe Connect-konto (Express) skapas första gången och kopplas till
 *     PT:n i databasen (attach_stripe_account). Samma konto återanvänds sedan.
 *  3. Svaret är en engångslänk till Stripes onboarding. Stripe skickar tillbaka
 *     till /pt/onboarding/callback (från appen via /app-retur, som lämnar över
 *     till appen) eller till /pt/onboarding?stripe=forny om länken gått ut.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Logga in igen." }, { status: 401 })
  if (await rateLimited(`connect-onboard:${auth.user.id}`, 10, 600)) return tooManyRequests(600)
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single()
  if ((profile as { role?: string } | null)?.role !== "trainer") {
    return NextResponse.json({ error: "Utbetalningar gäller PT-konton." }, { status: 403 })
  }
  const { data: statusData, error: statusError } = await supabase.rpc("my_payout_status")
  const status = statusData as PayoutStatus | null
  if (statusError || !status) return NextResponse.json({ error: "Kunde inte läsa din profil." }, { status: 500 })
  if (!status.profile_complete) {
    return NextResponse.json({ error: "Gör klart din profil först (namn, presentation, inriktning och profilbild)." }, { status: 409 })
  }
  if (status.exempt) return NextResponse.json({ done: true })
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Utbetalningar är inte aktiverade än. Kontakta Coavira." }, { status: 503 })
  }

  const admin = createSupabaseAdmin()
  const stripe = getStripe()
  try {
    const { data: row } = await admin
      .from("trainer_payout_accounts")
      .select("stripe_account_id")
      .eq("trainer_id", auth.user.id)
      .maybeSingle()
    let accountId = (row as { stripe_account_id: string | null } | null)?.stripe_account_id ?? null
    if (!accountId) {
      // Idempotent mot Stripe: ett omförsök (dubbelklick, nätverksfel) ger samma konto.
      const account = await stripe.accounts.create(connectAccountParams({ trainerId: auth.user.id, email: auth.user.email }), {
        idempotencyKey: `connect-account-${auth.user.id}`,
      })
      const { data: attached, error } = await admin.rpc("attach_stripe_account", { p_trainer: auth.user.id, p_account: account.id })
      if (error) throw new Error(error.message)
      accountId = attached as string
    }

    const base = returnBase(request.nextUrl.origin, request.headers.get("user-agent"))
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      collect: "currently_due",
      return_url: `${base}/pt/onboarding/callback`,
      refresh_url: `${base}/pt/onboarding?stripe=forny`,
    })
    return NextResponse.json({ url: link.url })
  } catch (e) {
    const { message, log } = describeStripeError(e)
    console.error("stripe connect onboard", { trainerId: auth.user.id, ...log })
    return NextResponse.json({ error: `Kopplingen till Stripe kunde inte startas: ${message}` }, { status: 502 })
  }
}
