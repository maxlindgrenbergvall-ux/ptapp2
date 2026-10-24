"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { AuthCard, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { InterestPicker } from "@/components/progress/metrics"
import { normalizePhone } from "@/lib/phone"
import { forgetReferral, normalizeReferralCode, REFERRAL_CODE, REFERRAL_PLUS_DAYS, storedReferral } from "@/lib/plus"
import { formatPtInviteInput } from "@/components/pt/pt-invite-redeem"
import { ConsentCheckbox } from "@/components/legal-links"
import { EXISTING_CLIENT_FEE_PERCENT } from "@/lib/payments/fees"
import { forgetPtInvite, normalizePtInviteCode, PT_INVITE_CODE, storedPtInvite } from "@/lib/pt-invites"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled, PT_LOGIN_PATH, roleFromClaims } from "@/lib/supabase/config"
import { START_PATH } from "@/lib/site"

/**
 * Välkomststeget efter registrering (e-post, Apple eller Google): bekräfta namn
 * och telefon och lämna samtycke till hälsodata. Självregistrerade konton blir
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
  // Intressen och mål styr mätpunkterna under Framsteg och syns för klientens PT:er.
  const [interests, setInterests] = React.useState<string[]>([])
  const [focus, setFocus] = React.useState("")
  // Inbjudningskod (valfri): förifylls från inbjudningslänken (/ref/KOD).
  const [referral, setReferral] = React.useState("")
  // PT:ns kod till en befintlig klient (valfri): förifylls från PT:ns länk (/ref/EX-…).
  const [ptCode, setPtCode] = React.useState("")
  const [loading, setLoading] = React.useState(isSupabaseEnabled)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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
    if (!consent) return setError("Du behöver godkänna användarvillkoren och behandlingen av dina hälsouppgifter för att använda Coavira.")
    const code = normalizeReferralCode(referral)
    if (code && !REFERRAL_CODE.test(code)) return setError("Vänkoden består av 8 tecken, t.ex. SARA7KQ2. Lämna fältet tomt om du saknar kod.")
    const pt = ptCode.trim() ? normalizePtInviteCode(ptCode) : ""
    if (pt && !PT_INVITE_CODE.test(pt)) return setError("PT:ns kod ser ut så här: EX-8FK29A. Lämna fältet tomt om du saknar kod.")

    if (!isSupabaseEnabled) {
      // Demoläge: gå till klientdemon. Namn/telefon finns redan i demodatan.
      router.push(HOME_FOR_ROLE.client)
      return
    }
    if (!name.trim()) return setError("Ange ditt namn.")
    const normalized = normalizePhone(phone)
    if (!normalized) return setError("Ange ett giltigt telefonnummer, t.ex. 070-123 45 67.")

    setPending(true)
    const sb = getSupabase()
    const { error: rpcError } = await sb.rpc("complete_onboarding", {
      p_role: "client",
      p_full_name: name.trim(),
      p_phone: normalized,
      p_health_data_consent: consent,
    })
    if (rpcError && !/redan vald/i.test(rpcError.message)) {
      setPending(false)
      return setError(/telefon/i.test(rpcError.message) ? "Ogiltigt telefonnummer." : rpcError.message)
    }
    if (interests.length || focus.trim()) {
      // Valfritt – ett fel här stoppar inte registreringen (kan ändras i profilen).
      const { data: u } = await sb.auth.getUser()
      if (u.user) await sb.from("profiles").update({ interests, focus: focus.trim().slice(0, 300) }).eq("id", u.user.id)
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
    window.location.href = HOME_FOR_ROLE.client
  }

  if (loading) {
    return (
      <AuthCard title="Välkommen till Coavira">
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Välkommen till Coavira"
      description="Bekräfta dina uppgifter så kommer du igång med träningen."
      footer={
        isSupabaseEnabled ? (
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
        )
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        {!isSupabaseEnabled && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Demoläge: du loggas in som en demoklient med påhittad data.</p>
        )}

        {isSupabaseEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Namn</Label>
              <Input id="name" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefonnummer</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                placeholder="070-123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11"
              />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label>Vad tränar du för?</Label>
          <p className="text-xs text-muted-foreground">Välj det som passar – vi visar rätt mätpunkter under Framsteg. Kan ändras när som helst.</p>
          <InterestPicker value={interests} onChange={setInterests} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="focus">Vad vill du utveckla? (valfritt)</Label>
          <Textarea
            id="focus"
            rows={2}
            maxLength={300}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="T.ex. springa milen under 50 minuter"
          />
        </div>

        {isSupabaseEnabled && (
          <div className="space-y-2">
            <Label htmlFor="pt-code">Har du en inbjudningskod från din PT?</Label>
            <Input
              id="pt-code"
              value={ptCode}
              onChange={(e) => setPtCode(formatPtInviteInput(e.target.value))}
              placeholder="EX-8FK29A (valfritt)"
              autoComplete="off"
              autoCapitalize="characters"
              className="h-11 font-mono tracking-widest uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Tränar du redan med en PT? Med PT:ns kod kopplas ni ihop direkt och du betalar {EXISTING_CLIENT_FEE_PERCENT} % serviceavgift.
            </p>
          </div>
        )}

        {isSupabaseEnabled && (
          <div className="space-y-2">
            <Label htmlFor="referral">Kod från en vän (valfritt)</Label>
            <Input
              id="referral"
              value={referral}
              onChange={(e) => setReferral(normalizeReferralCode(e.target.value).slice(0, 8))}
              placeholder="T.ex. SARA7KQ2"
              autoComplete="off"
              autoCapitalize="characters"
              className="h-11 font-mono tracking-widest uppercase"
            />
            <p className="text-xs text-muted-foreground">Fått en kod av en vän? Ni får båda {REFERRAL_PLUS_DAYS} dagar Coavira Plus.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <ConsentCheckbox id="consent" checked={consent} onCheckedChange={setConsent} />
          <p className="text-xs text-muted-foreground">Du kan när som helst ladda ner eller radera ditt konto och all data under Inställningar.</p>
        </div>

        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Sparar…" : "Kom igång"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Är du PT? PT-konton skapas av Coavira efter granskning.{" "}
          <Link href={PT_LOGIN_PATH} className="underline underline-offset-4">
            Logga in med dina uppgifter
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
