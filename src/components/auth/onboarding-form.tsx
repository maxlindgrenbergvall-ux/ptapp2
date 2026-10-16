"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { AuthCard, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normalizePhone } from "@/lib/phone"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled, PT_LOGIN_PATH, roleFromClaims } from "@/lib/supabase/config"

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
        const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string; phone?: string }
        // Redan klar (t.ex. bakåtknappen) eller admin-skapad PT: gå hem.
        const existing = roleFromClaims(user)
        if (existing) {
          window.location.replace(HOME_FOR_ROLE[existing])
          return
        }
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
    if (!consent) return setError("Du behöver godkänna behandlingen av hälsouppgifter för att kunna träna med en PT i Coavira.")

    if (!isSupabaseEnabled) {
      // Demoläge: gå till klientdemon (Sara). Namn/telefon finns redan i demodatan.
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
    // Ny JWT med rollen i user_metadata, sedan hel sidladdning (proxy.ts läser cookien).
    await sb.auth.refreshSession()
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
              window.location.replace("/")
            }}
          >
            Fel konto? Logga ut
          </button>
        ) : (
          <Link href="/" className="underline underline-offset-4">
            Tillbaka
          </Link>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        {!isSupabaseEnabled && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Demoläge: du loggas in som klienten Sara med påhittad data.</p>
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

        <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <Label htmlFor="consent" className="text-sm leading-snug font-normal">
              Jag samtycker till att Coavira behandlar mina hälsouppgifter (träning, vikt och kost) så att min PT kan coacha mig. Jag kan när som helst
              radera mitt konto och all data.{" "}
              <Link href="/integritet" target="_blank" className="underline underline-offset-4">
                Läs mer
              </Link>
            </Label>
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
