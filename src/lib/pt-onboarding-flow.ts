"use client"

/**
 * PT-introt i tre steg (v76) – tillståndet och anropen.
 *
 *   1. Konto och företag (självregistrering: /bli-pt/konto, eller för PT:er som
 *      Coavira skapat: namn, företag, portaler och avtal i /pt/onboarding)
 *   2. Utbetalningar (Stripe Connect) – kan hoppas över
 *   3. Första paketet – kan hoppas över
 *
 * Steget sparas i databasen (trainers.pt_onboarding_step), så att PT:n kommer
 * tillbaka till rätt steg om appen stängs eller efter Stripe. I demoläget sparas
 * samma tillstånd i webbläsaren.
 */
import { acceptUpdatedAgreement } from "@/lib/account-status"
import { authCallbackUrl } from "@/lib/auth-redirect"
import { LEGAL_VERSION } from "@/lib/legal"
import { fetchOnboardingStatus } from "@/lib/onboarding-client"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { fetchMyBusiness, saveMyBusiness, type TrainerBusiness } from "@/lib/wellness/api"
import { isValidOrgNumber } from "@/lib/wellness/identity"
import type { ID } from "@/types/domain"

export type PtStep = 1 | 2 | 3
export const PT_STEPS = 3

export interface Portals {
  epassi: boolean
  benifex: boolean
  edenred: boolean
}

export interface AccountDraft {
  firstName: string
  lastName: string
  email: string
  password: string
  business: TrainerBusiness
  portals: Portals
  terms: boolean
}

export interface PtFlowState {
  step: PtStep
  completed: boolean
  firstName: string
  lastName: string
  termsDone: boolean
  payoutsDone: boolean
  /** Stripe har uppgifterna men granskar dem fortfarande. */
  payoutsPending: boolean
  business: TrainerBusiness
  portals: Portals
}

// ----------------------------------------------------------------- demo ---
const DEMO_KEY = "coavira:demo:pt-onboarding:v1"
type DemoState = { step: PtStep; completed: boolean; payouts: boolean; firstName?: string; lastName?: string; portals?: Portals }

function demoRead(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null") as DemoState | null
    if (s) return s
  } catch {}
  return { step: 1, completed: false, payouts: false }
}
function demoWrite(patch: Partial<DemoState>) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify({ ...demoRead(), ...patch }))
  } catch {}
}

/** Demoläget: är utbetalningarna "kopplade" (statusraden i dashboarden)? */
export const demoPayoutsDone = () => (typeof window === "undefined" ? true : demoRead().payouts || !localStorage.getItem(DEMO_KEY))

// ------------------------------------------------------------ validering ---
export function accountErrors(d: AccountDraft, opts: { signup: boolean; needsTerms: boolean }) {
  const e: Partial<Record<"name" | "email" | "password" | "org" | "terms", true>> = {}
  if (!d.firstName.trim() || !d.lastName.trim()) e.name = true
  if (opts.signup && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = true
  if (opts.signup && d.password.length < 8) e.password = true
  if (d.business.orgNumber.trim() && !isValidOrgNumber(d.business.orgNumber)) e.org = true
  if (opts.needsTerms && !d.terms) e.terms = true
  return e
}

// ------------------------------------------------------------- steg 1 ---
/**
 * Självregistrering. Allt från steg 1 skickas med i registreringen och sparas av
 * databasen (handle_new_user, v76) – även om e-postadressen först ska bekräftas.
 */
export async function signUpPt(d: AccountDraft, demoMe: { id: ID; name: string }): Promise<{ error: string | null; confirmEmail: boolean }> {
  if (!isSupabaseEnabled) {
    // Demoläget: ingen riktig registrering – uppgifterna sparas på demo-PT:n.
    await saveMyBusiness(demoMe, d.business)
    demoWrite({ step: 2, completed: false, payouts: false, firstName: d.firstName.trim(), lastName: d.lastName.trim(), portals: d.portals })
    return { error: null, confirmEmail: false }
  }
  const sb = getSupabase()
  const { data, error } = await sb.auth.signUp({
    email: d.email.trim(),
    password: d.password,
    options: {
      emailRedirectTo: authCallbackUrl("/pt/onboarding"),
      data: {
        pt_signup: true,
        first_name: d.firstName.trim(),
        last_name: d.lastName.trim(),
        terms_version: d.terms ? LEGAL_VERSION : null,
        company_name: d.business.companyName.trim(),
        org_number: d.business.orgNumber.trim(),
        company_address: d.business.companyAddress.trim(),
        accepts_epassi: d.portals.epassi,
        accepts_benifex: d.portals.benifex,
        accepts_edenred: d.portals.edenred,
      },
    },
  })
  if (error) return { error: error.message, confirmEmail: false }
  if (!data.session) return { error: null, confirmEmail: true }
  // Ny token: rollen (app_metadata) sattes av databasen i samma registrering.
  await sb.auth.refreshSession().catch(() => {})
  return { error: null, confirmEmail: false }
}

/** Steg 1 för en inloggad PT (t.ex. ett konto Coavira skapat): namn, företag, portaler och avtal. */
export async function saveAccountStep(me: { id: ID; name: string }, d: AccountDraft, needsTerms: boolean): Promise<string | null> {
  if (!isSupabaseEnabled) {
    await saveMyBusiness(me, d.business)
    demoWrite({ step: 2, firstName: d.firstName.trim(), lastName: d.lastName.trim(), portals: d.portals })
    return null
  }
  const sb = getSupabase()
  const { error } = await sb.rpc("save_pt_account_step", {
    p_first_name: d.firstName.trim(),
    p_last_name: d.lastName.trim(),
    p_epassi: d.portals.epassi,
    p_benifex: d.portals.benifex,
    p_edenred: d.portals.edenred,
  })
  if (error) return error.message
  const bizError = await saveMyBusiness(me, d.business)
  if (bizError) return bizError
  if (needsTerms) {
    try {
      await acceptUpdatedAgreement("trainer")
    } catch (e) {
      return e instanceof Error ? e.message : "Avtalet kunde inte sparas"
    }
  }
  return null
}

// -------------------------------------------------------------- tillstånd ---
export async function fetchPtFlow(me: { id: ID; name: string }): Promise<PtFlowState> {
  const business = await fetchMyBusiness(me).catch(() => null)
  const biz = business ?? { companyName: "", orgNumber: "", companyAddress: "", vatRegistered: true, wellnessInstructions: "" }
  if (!isSupabaseEnabled) {
    const s = demoRead()
    const [first, ...rest] = me.name.split(" ")
    return {
      step: s.step,
      completed: s.completed,
      firstName: s.firstName ?? first ?? "",
      lastName: s.lastName ?? rest.join(" "),
      termsDone: true,
      payoutsDone: s.payouts,
      payoutsPending: false,
      business: biz,
      portals: s.portals ?? { epassi: false, benifex: false, edenred: false },
    }
  }
  const sb = getSupabase()
  const [status, trainer, payout] = await Promise.all([
    fetchOnboardingStatus().catch(() => null),
    sb.from("trainers").select("pt_onboarding_step, pt_onboarding_completed, stripe_onboarding_complete, accepts_epassi, accepts_benifex, accepts_edenred").eq("id", me.id).maybeSingle(),
    sb.rpc("my_payout_status"),
  ])
  const t = (trainer.data ?? {}) as {
    pt_onboarding_step?: number
    pt_onboarding_completed?: boolean
    stripe_onboarding_complete?: boolean
    accepts_epassi?: boolean
    accepts_benifex?: boolean
    accepts_edenred?: boolean
  }
  const p = (payout.data ?? null) as { stripe_onboarding_complete?: boolean; details_submitted?: boolean; charges_enabled?: boolean } | null
  const payoutsDone = Boolean(t.stripe_onboarding_complete || p?.stripe_onboarding_complete)
  // Tillbaka från Stripe med klara utbetalningar: vidare till steg 3 även om steget inte hann sparas.
  const saved = Math.min(3, Math.max(1, t.pt_onboarding_step ?? 1)) as PtStep
  const step: PtStep = saved === 2 && payoutsDone ? 3 : saved
  return {
    // Har PT:n inte godkänt avtalet än (t.ex. ett konto Coavira skapat) börjar introt på steg 1.
    step: status && !status.terms_done ? 1 : step,
    completed: Boolean(t.pt_onboarding_completed),
    firstName: status?.first_name ?? me.name.split(" ")[0] ?? "",
    lastName: status?.last_name ?? me.name.split(" ").slice(1).join(" "),
    termsDone: Boolean(status?.terms_done),
    payoutsDone,
    payoutsPending: Boolean(p?.details_submitted && !p?.charges_enabled),
    business: biz,
    portals: { epassi: Boolean(t.accepts_epassi), benifex: Boolean(t.accepts_benifex), edenred: Boolean(t.accepts_edenred) },
  }
}

export async function savePtStep(step: PtStep): Promise<void> {
  if (!isSupabaseEnabled) return demoWrite({ step })
  await getSupabase().rpc("set_pt_onboarding_step", { p_step: step })
}

/** Demoläget: Stripe "kopplat". */
export const demoConnectPayouts = () => demoWrite({ payouts: true, step: 3 })

/** Avsluta introt och öppna dashboarden (steg 3 klart eller överhoppat). */
export async function finishPtFlow(): Promise<string | null> {
  if (!isSupabaseEnabled) {
    demoWrite({ completed: true, step: 3 })
    return null
  }
  const sb = getSupabase()
  const { error } = await sb.rpc("finish_pt_onboarding")
  if (error) return error.message
  // Ny token med app_metadata.onboarding_completed – proxy.ts släpper in PT:n i portalen.
  await sb.auth.refreshSession().catch(() => {})
  return null
}
