"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { Loader2 } from "lucide-react"

import { FormError } from "@/components/auth/auth-card"
import { FlowShell } from "@/components/flow/flow-shell"
import { Reveal } from "@/components/flow/motion"
import { BrandMark } from "@/components/brand"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normalizePhone } from "@/lib/phone"
import { forgetReferral, normalizeReferralCode, REFERRAL_CODE, REFERRAL_PLUS_DAYS, storedReferral } from "@/lib/plus"
import { formatPtInviteInput } from "@/components/pt/pt-invite-redeem"
import { ConsentCheckbox } from "@/components/legal-links"
import { EXISTING_CLIENT_FEE_PERCENT } from "@/lib/payments/fees"
import { forgetPtInvite, normalizePtInviteCode, PT_INVITE_CODE, storedPtInvite } from "@/lib/pt-invites"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled, PT_LOGIN_PATH, roleFromClaims } from "@/lib/supabase/config"
import { START_PATH } from "@/lib/site"

/** Intro-flödet efter välkomststeget (v30). */
const GOAL_INTRO_PATH = "/klient/intro"

/**
 * Välkomststeget efter registrering (e-post, Apple eller Google): bekräfta
 * telefon och lämna samtycke till hälsodata. Sedan v78 tre korta sidor med
 * samma skal som intro-flödet: telefon → koder (valfria) → villkoren. I
 * demoläget bara villkoren. Namn och profilbild anges i steg 1
 * i intro-flödet som följer (v31). Självregistrerade konton blir
 * alltid klientkonton – PT-konton skapas av Coavira och loggar in via
 * PT-inloggningen.
 *
 * Sparas med RPC:n complete_onboarding(), som sätter rollen en gång och speglar
 * den i app_metadata. Sessionen förnyas sedan så att JWT:n (och därmed proxy.ts)
 * ser den nya rollen.
 */
export function OnboardingForm() {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [consent, setConsent] = React.useState(false)
  // Inbjudningskod (valfri): förifylls från inbjudningslänken (/ref/KOD).
  const [referral, setReferral] = React.useState("")
  // PT:ns kod till en befintlig klient (valfri): förifylls från PT:ns länk (/ref/EX-…).
  const [ptCode, setPtCode] = React.useState("")
  const [loading, setLoading] = React.useState(isSupabaseEnabled)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const pages = isSupabaseEnabled ? (["phone", "codes", "consent"] as const) : (["consent"] as const)
  const [pageIndex, setPageIndex] = React.useState(0)
  const page = pages[pageIndex]
  const goPage = (i: number) => {
    setError(null)
    setPageIndex(i)
  }

  // Förifyll namn och telefon från registreringen eller från Apple/Google.
  React.useEffect(() => {
    if (!isSupabaseEnabled) return
    let cancelled = false
    void getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return
        const user = data.user
        if (!user) {
          window.location.replace("/logga-in")
          return
        }
        const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string; phone?: string; terms_consent_at?: string }
        // Redan klar (t.ex. bakåtknappen) eller admin-skapad PT: gå hem.
        const existing = roleFromClaims(user)
        if (existing) {
          window.location.replace(HOME_FOR_ROLE[existing])
          return
        }
        setReferral(storedReferral() ?? "")
        // Godkänt vid registreringen med e-post: rutan är förifylld (kan avmarkeras).
        if (meta.terms_consent_at) setConsent(true)
        setPtCode(storedPtInvite() ?? "")
        setName((meta.full_name ?? meta.name ?? "").slice(0, 120))
        setPhone(meta.phone ?? user.phone ?? "")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (page === "phone") {
      if (!normalizePhone(phone)) return setError("Ange ett giltigt telefonnummer, t.ex. 070-123 45 67.")
      return goPage(pageIndex + 1)
    }
    if (page === "codes") {
      const c = normalizeReferralCode(referral)
      if (c && !REFERRAL_CODE.test(c)) return setError("Vänkoden består av 8 tecken, t.ex. SARA7KQ2. Lämna fältet tomt om du saknar kod.")
      const ptc = ptCode.trim() ? normalizePtInviteCode(ptCode) : ""
      if (ptc && !PT_INVITE_CODE.test(ptc)) return setError("PT:ns kod ser ut så här: EX-8FK29A. Lämna fältet tomt om du saknar kod.")
      return goPage(pageIndex + 1)
    }
    if (!consent) return setError("Du behöver godkänna användarvillkoren, communityreglerna och behandlingen av dina hälsouppgifter för att använda Coavira.")
    const code = normalizeReferralCode(referral)
    if (code && !REFERRAL_CODE.test(code)) return setError("Vänkoden består av 8 tecken, t.ex. SARA7KQ2. Lämna fältet tomt om du saknar kod.")
    const pt = ptCode.trim() ? normalizePtInviteCode(ptCode) : ""
    if (pt && !PT_INVITE_CODE.test(pt)) return setError("PT:ns kod ser ut så här: EX-8FK29A. Lämna fältet tomt om du saknar kod.")

    if (!isSupabaseEnabled) {
      // Demoläge: gå vidare till intro-flödet (mål och kostplan). Namn/telefon finns redan i demodatan.
      router.push(GOAL_INTRO_PATH)
      return
    }
    const normalized = normalizePhone(phone)
    if (!normalized) return setError("Ange ett giltigt telefonnummer, t.ex. 070-123 45 67.")

    setPending(true)
    const sb = getSupabase()
    const { error: rpcError } = await sb.rpc("complete_onboarding", {
      p_role: "client",
      // Namnet anges i steg 1 i intro-flödet (v31); här skickas bara det vi redan vet (Apple/Google/registreringen).
      p_full_name: name.trim() || null,
      p_phone: normalized,
      p_health_data_consent: consent,
    })
    if (rpcError && !/redan vald/i.test(rpcError.message)) {
      setPending(false)
      return setError(/telefon/i.test(rpcError.message) ? "Ogiltigt telefonnummer." : rpcError.message)
    }
    // Ny JWT med rollen i user_metadata, sedan hel sidladdning (proxy.ts läser cookien).
    await sb.auth.refreshSession()
    if (pt) {
      // Kopplar klienten direkt till PT:n som befintlig klient (5 % serviceavgift).
      const { data: res, error: ptError } = await sb.rpc("redeem_pt_invite", { p_code: pt })
      const r = res as { ok?: boolean; error?: string } | null
      if (ptError || !r?.ok) {
        setPending(false)
        setPtCode("")
        forgetPtInvite()
        return setError(`${ptError?.message ?? r?.error ?? "PT:ns kod kunde inte användas."} Kontot är skapat – tryck på Kom igång för att fortsätta utan kod.`)
      }
      forgetPtInvite()
    }
    if (code) {
      // Belöningarna (1 månad Plus till båda) delas ut av databasen.
      const { error: refError } = await sb.rpc("redeem_referral", { p_code: code })
      if (refError) {
        setPending(false)
        setReferral("")
        forgetReferral()
        return setError(`${refError.message} Kontot är skapat – tryck på Kom igång för att fortsätta utan kod.`)
      }
      forgetReferral()
    }
    // Vidare till intro-flödet: mått, aktivitet, mål och kostplan (v30). Kan hoppas över.
    // Hel sidladdning med flit: proxy.ts ska läsa den nya JWT:n (rollen) från cookien.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = GOAL_INTRO_PATH
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center" aria-busy="true">
        <span className="sr-only">Laddar…</span>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const copy = {
    phone: { title: "Välkommen till Coavira", lead: "Börja med att bekräfta ditt telefonnummer." },
    codes: { title: "Har du en kod?", lead: "Från din PT eller en vän – annars går du bara vidare." },
    consent: isSupabaseEnabled
      ? { title: "Godkänn villkoren", lead: "Ett godkännande – sedan är du igång." }
      : { title: "Välkommen till Coavira", lead: "Godkänn villkoren – sedan är du igång." },
  }[page]
  const last = pageIndex === pages.length - 1
  const fieldClass = "h-12 rounded-xl bg-muted/40 px-4 text-base"

  return (
    <FlowShell
      rootTestId="welcome-flow"
      step={pageIndex + 1}
      total={pages.length}
      page={pageIndex}
      stepLabel={pages.length > 1 ? `Välkommen · ${pageIndex + 1} av ${pages.length}` : "Välkommen"}
      backLabel="Tillbaka"
      onBack={pageIndex > 0 ? () => goPage(pageIndex - 1) : undefined}
      right={<BrandMark size="sm" />}
      title={copy.title}
      lead={copy.lead}
      primary={{ label: pending ? "Sparar…" : last ? "Kom igång" : "Fortsätt", form: "welcome-form", busy: pending, testId: "welcome-next" }}
    >
      <form id="welcome-form" onSubmit={submit} className="space-y-5" noValidate data-page={page}>
        <FormError message={error} />

        {page === "phone" && (
          <Reveal className="space-y-1.5">
            <Label htmlFor="phone" className="text-sm text-muted-foreground">
              Telefonnummer
            </Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="070-123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldClass}
            />
          </Reveal>
        )}

        {page === "codes" && (
          <>
            <Reveal className="space-y-1.5">
              <Label htmlFor="pt-code" className="text-sm text-muted-foreground">
                Har du en inbjudningskod från din PT?
              </Label>
              <Input
                id="pt-code"
                value={ptCode}
                onChange={(e) => setPtCode(formatPtInviteInput(e.target.value))}
                placeholder="EX-8FK29A (valfritt)"
                autoComplete="off"
                autoCapitalize="characters"
                className={`${fieldClass} font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case`}
              />
              <p className="text-xs text-muted-foreground">Ni kopplas ihop direkt och du betalar {EXISTING_CLIENT_FEE_PERCENT} % serviceavgift.</p>
            </Reveal>
            <Reveal className="space-y-1.5">
              <Label htmlFor="referral" className="text-sm text-muted-foreground">
                Kod från en vän (valfritt)
              </Label>
              <Input
                id="referral"
                value={referral}
                onChange={(e) => setReferral(normalizeReferralCode(e.target.value).slice(0, 8))}
                placeholder="T.ex. SARA7KQ2"
                autoComplete="off"
                autoCapitalize="characters"
                className={`${fieldClass} font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case`}
              />
              <p className="text-xs text-muted-foreground">Ni får båda {REFERRAL_PLUS_DAYS} dagar Coavira Plus.</p>
            </Reveal>
          </>
        )}

        {page === "consent" && (
          <>
            {!isSupabaseEnabled && (
              <Reveal>
                <p className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">Demoläge: du loggas in som en demoklient med påhittad data.</p>
              </Reveal>
            )}
            <Reveal className="space-y-2">
              <ConsentCheckbox id="consent" checked={consent} onCheckedChange={setConsent} />
              <p className="px-1 text-xs text-muted-foreground">Du kan när som helst ladda ner eller radera ditt konto och all data under Inställningar.</p>
            </Reveal>
          </>
        )}

        {pageIndex === 0 && (
          <Reveal className="space-y-2 pt-4 text-center text-xs text-muted-foreground">
            <p>
              Är du PT?{" "}
              <Link href="/bli-pt" className="underline underline-offset-4">
                Skapa PT-konto
              </Link>{" "}
              eller{" "}
              <Link href={PT_LOGIN_PATH} className="underline underline-offset-4">
                logga in
              </Link>
            </p>
            <p>
              {isSupabaseEnabled ? (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={async () => {
                    await getSupabase().auth.signOut()
                    window.location.replace(START_PATH)
                  }}
                >
                  Fel konto? Logga ut
                </button>
              ) : (
                <Link href={START_PATH} className="underline underline-offset-4">
                  Tillbaka
                </Link>
              )}
            </p>
          </Reveal>
        )}
      </form>
    </FlowShell>
  )
}
