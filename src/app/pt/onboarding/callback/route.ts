import { NextResponse, type NextRequest } from "next/server"

import { connectAccountState, describeStripeError, getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { PT_LOGIN_PATH } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

interface ApplyResult {
  complete: boolean
  pt_ready: boolean
}

/**
 * Stripe skickar tillbaka PT:n hit efter onboardingen (return_url). Länken bevisar
 * ingenting – statusen hämtas alltid från Stripe (accounts.retrieve):
 *  - details_submitted + charges_enabled → onboardingen är klar
 *    (trainers.stripe_onboarding_complete, apply_stripe_account).
 *  - Sessionen förnyas, så att JWT:n får app_metadata.pt_ready och proxy.ts
 *    släpper in PT:n i portalen direkt.
 *  - Klar → tillbaka till /pt/onboarding, där nästa steg (villkoren, v31) väntar –
 *    eller portalen om intro-flödet redan är klart. Annars med besked.
 * Webhooken (account.updated) gör samma uppdatering om PT:n aldrig kommer tillbaka hit.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl
  const to = (path: string) => NextResponse.redirect(`${origin}${path}`)
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return to(`${PT_LOGIN_PATH}?next=${encodeURIComponent("/pt/onboarding")}`)

  const admin = createSupabaseAdmin()
  const { data: row } = await admin
    .from("trainer_payout_accounts")
    .select("stripe_account_id, exempt")
    .eq("trainer_id", auth.user.id)
    .maybeSingle()
  const account = row as { stripe_account_id: string | null; exempt: boolean } | null
  if (!account?.stripe_account_id || !isStripeEnabled()) {
    // Undantaget demokonto eller inget konto ännu: bara spärren i JWT:n behöver vara aktuell.
    await supabase.auth.refreshSession()
    return to("/pt/onboarding")
  }

  let result: ApplyResult | null = null
  try {
    const state = connectAccountState(await getStripe().accounts.retrieve(account.stripe_account_id))
    const { data, error } = await admin.rpc("apply_stripe_account", {
      p_account: account.stripe_account_id,
      p_details: state.detailsSubmitted,
      p_charges: state.chargesEnabled,
      p_payouts: state.payoutsEnabled,
      p_due: state.due,
    })
    if (error) throw new Error(error.message)
    result = data as ApplyResult | null
  } catch (e) {
    const { log } = describeStripeError(e)
    console.error("stripe connect callback", { trainerId: auth.user.id, ...log })
    return to("/pt/onboarding?stripe=fel")
  }

  // Ny token med app_metadata.pt_ready (proxy.ts läser spärren därifrån).
  await supabase.auth.refreshSession()
  // Stripe klart: villkoren (steg 3) – onboarding-sidan väljer rätt steg (eller portalen om allt är klart).
  if (result?.complete || result?.pt_ready) return to("/pt/onboarding")
  return to("/pt/onboarding?stripe=ofullstandig")
}
