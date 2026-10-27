"use client"

import { ArrowRight, BadgeCheck, Banknote, Check, Clock, Loader2, Lock, RefreshCw, ShieldCheck, UserRound } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { AvatarPicker } from "@/components/avatar-picker"
import { BrandMark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { openCheckout } from "@/lib/native/checkout"
import { EXISTING_CLIENT_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "@/lib/payments/fees"
import { MIN_BIO_LENGTH, missingProfileParts, type PayoutStatus } from "@/lib/pt-onboarding"
import { getSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { SPECIALTIES, SPECIALTY_LABEL, type Specialty } from "@/types/domain"

type Step = 1 | 2

const STRIPE_MESSAGES: Record<string, { kind: "info" | "error"; text: string }> = {
  forny: { kind: "info", text: "Länken till Stripe hann gå ut. Tryck på knappen igen för att fortsätta där du var." },
  ofullstandig: { kind: "info", text: "Stripe behöver några uppgifter till. Fortsätt hos Stripe för att bli klar." },
  fel: { kind: "error", text: "Vi kunde inte kontrollera kontot hos Stripe just nu. Försök igen om en stund." },
}

/**
 * /pt/onboarding: obligatoriskt innan PT-portalen öppnas (proxy.ts släpper in
 * PT:n först när app_metadata.pt_ready är satt).
 *  1. Profil: namn, profilbild, inriktningar och presentation.
 *  2. Utbetalningar: Stripe Connect (Express). Stripe skickar tillbaka till
 *     /pt/onboarding/callback, som kontrollerar kontot och öppnar portalen.
 */
export function PtOnboarding() {
  const { data, me, actions, mode } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const [form, setForm] = React.useState(() => ({
    name: me.name ?? "",
    avatarUrl: trainer?.avatarUrl ?? "",
    specialties: trainer?.specialties ?? ([] as Specialty[]),
    bio: trainer?.bio ?? "",
  }))
  const [status, setStatus] = React.useState<PayoutStatus | null>(null)
  const [step, setStep] = React.useState<Step>(1)
  const [saving, setSaving] = React.useState(false)
  const [connecting, setConnecting] = React.useState(false)
  const [demoConnected, setDemoConnected] = React.useState(false)

  const missing = missingProfileParts(form)
  const profileDone = missing.length === 0

  const loadStatus = React.useCallback(async (): Promise<PayoutStatus | null> => {
    if (mode === "demo") return null
    const { data: s, error } = await getSupabase().rpc("my_payout_status")
    if (error || !s) return null
    setStatus(s as PayoutStatus)
    return s as PayoutStatus
  }, [mode])

  // Första laddningen: hoppa till steg 2 om profilen redan är klar i databasen.
  React.useEffect(() => {
    let cancelled = false
    if (mode === "supabase") {
      void getSupabase()
        .rpc("my_payout_status")
        .then(({ data: s }) => {
          if (cancelled || !s) return
          setStatus(s as PayoutStatus)
          if ((s as PayoutStatus).profile_complete) setStep(2)
        })
    }
    const msg = STRIPE_MESSAGES[new URLSearchParams(window.location.search).get("stripe") ?? ""]
    if (msg) {
      if (msg.kind === "error") toast.error(msg.text)
      else toast(msg.text)
      window.history.replaceState(null, "", window.location.pathname)
    }
    return () => {
      cancelled = true
    }
  }, [mode])

  const saveProfile = async () => {
    if (!profileDone) return
    setSaving(true)
    actions.updateTrainerProfile({
      name: form.name.trim(),
      avatarUrl: form.avatarUrl,
      specialties: form.specialties,
      bio: form.bio.trim(),
    })
    if (mode === "supabase") {
      // Ändringen sparas i bakgrunden – vänta tills databasen räknar profilen som klar.
      let done = false
      for (let i = 0; i < 20 && !done; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 300 : 500))
        done = Boolean((await loadStatus())?.profile_complete)
      }
      if (!done) {
        setSaving(false)
        toast.error("Profilen kunde inte sparas just nu. Kontrollera uppkopplingen och försök igen.")
        return
      }
    }
    setSaving(false)
    setStep(2)
  }

  /** Klart: förnya sessionen (ny JWT med pt_ready) och öppna portalen. */
  const enterPortal = async () => {
    if (mode === "supabase") await getSupabase().auth.refreshSession()
    // Hel sidladdning: proxy.ts läser den nya JWT:n och PT-portalen laddar sina data.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/pt?valkommen=1")
  }

  const connect = async () => {
    setConnecting(true)
    if (mode === "demo") {
      await new Promise((r) => setTimeout(r, 600))
      setDemoConnected(true)
      setConnecting(false)
      toast.success("Demoläge: utbetalningarna är kopplade (inget riktigt Stripe-konto).")
      return
    }
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { url?: string; done?: boolean; error?: string }
      if (body.done) return void (await enterPortal())
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Kopplingen till Stripe kunde inte startas. Försök igen.")
        setConnecting(false)
        return
      }
      // Webben: hela sidan går till Stripe. Appen: Stripe öppnas i webbläsarvyn
      // (med Klar) och kommer tillbaka via /app-retur → /pt/onboarding/callback.
      if ((await openCheckout(body.url)) === "closed") {
        setConnecting(false)
        await loadStatus()
      }
    } catch {
      toast.error("Ingen uppkoppling – försök igen.")
      setConnecting(false)
    }
  }

  const payoutsDone = mode === "demo" ? demoConnected : Boolean(status?.stripe_onboarding_complete)
  const waitingForStripe = mode === "supabase" && Boolean(status?.details_submitted) && !status?.charges_enabled
  const allDone = profileDone && payoutsDone && step === 2
  const firstName = form.name.trim().split(/\s+/)[0] || "där"

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-[calc(var(--safe-bottom)+2rem)] sm:px-6">
      <header className="space-y-4">
        <BrandMark />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Välkommen till Coavira, {firstName}!</h1>
          <p className="text-muted-foreground">Två steg innan du kan ta emot klienter: din profil och utbetalningar till ditt bankkonto.</p>
        </div>
        <Stepper step={step} profileDone={profileDone && step === 2} payoutsDone={payoutsDone} />
      </header>

      {step === 1 ? (
        <Card data-testid="onboarding-profile">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-5 text-primary" /> Steg 1: Din profil
            </CardTitle>
            <CardDescription>Det här ser klienter när de hittar dig i appen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <AvatarPicker name={form.name || me.name} value={form.avatarUrl} userId={me.id} onChange={(avatarUrl) => setForm({ ...form, avatarUrl })} />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="onb-name">Namn</Label>
                <Input id="onb-name" autoComplete="name" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Inriktningar</legend>
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((s) => {
                  const on = form.specialties.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setForm({ ...form, specialties: on ? form.specialties.filter((x) => x !== s) : [...form.specialties, s] })}
                      className={cn(
                        "min-h-9 rounded-full border px-3 py-1 text-sm transition-colors",
                        on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      {SPECIALTY_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="onb-bio">Presentation</Label>
              <Textarea
                id="onb-bio"
                rows={5}
                maxLength={2000}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Vem är du, hur jobbar du och vem passar du för?"
              />
              <p className={cn("text-right text-xs tabular", form.bio.trim().length < MIN_BIO_LENGTH ? "text-muted-foreground" : "text-success")}>
                {form.bio.trim().length < MIN_BIO_LENGTH ? `Minst ${MIN_BIO_LENGTH} tecken (${form.bio.trim().length}/${MIN_BIO_LENGTH})` : "Bra!"}
              </p>
            </div>

            {missing.length > 0 && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground" data-testid="onboarding-missing">
                Kvar att fylla i: {missing.join(", ")}.
              </p>
            )}
            <Button className="w-full sm:w-auto" size="lg" disabled={!profileDone || saving} onClick={() => void saveProfile()}>
              {saving ? <Loader2 className="animate-spin" /> : <ArrowRight />} Spara och fortsätt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="onboarding-payouts">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-5 text-primary" /> Steg 2: Utbetalningar
            </CardTitle>
            <CardDescription>Klienterna betalar i appen – pengarna går direkt till ditt bankkonto via Stripe.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ul className="space-y-3 text-sm">
              <Point icon={Banknote} title="Du får hela ditt pris">
                Klienten betalar med kort i appen. Coaviras serviceavgift – {EXISTING_CLIENT_FEE_PERCENT} % för klienter du bjuder in med din kod,{" "}
                {PLATFORM_FEE_PERCENT} % för klienter som hittar dig i appen – läggs på klientens pris och dras automatiskt i kassan.
              </Point>
              <Point icon={ShieldCheck} title="Säkert via Stripe">
                Stripe verifierar din identitet och ditt bankkonto. Coavira ser aldrig dina bankuppgifter. Det tar ungefär 5 minuter.
              </Point>
              <Point icon={Clock} title="Automatiska utbetalningar">
                Betalningarna betalas ut till ditt konto enligt Stripes utbetalningsschema. Du ser allt i Stripes översikt.
              </Point>
            </ul>

            {allDone ? (
              <div className="space-y-3 rounded-xl border border-success/40 bg-success/10 p-4" data-testid="onboarding-done">
                <p className="flex items-center gap-2 font-medium">
                  <BadgeCheck className="size-5 text-success" /> Allt klart! Utbetalningarna är kopplade.
                </p>
                <Button size="lg" className="w-full sm:w-auto" onClick={() => void enterPortal()}>
                  <ArrowRight /> Gå till PT-portalen
                </Button>
              </div>
            ) : waitingForStripe ? (
              <div className="space-y-3 rounded-xl border border-warning/50 bg-warning/10 p-4" data-testid="onboarding-waiting">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="size-4" /> Stripe granskar dina uppgifter
                  {status && status.requirements_due > 0 ? " och behöver några till" : ""}.
                </p>
                <div className="flex flex-wrap gap-2">
                  {status && status.requirements_due > 0 && (
                    <Button onClick={() => void connect()} disabled={connecting}>
                      {connecting ? <Loader2 className="animate-spin" /> : <ArrowRight />} Fortsätt hos Stripe
                    </Button>
                  )}
                  {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination -- route handler, inte en sida */}
                  <Button variant="outline" onClick={() => window.location.assign("/pt/onboarding/callback")}>
                    <RefreshCw /> Kontrollera igen
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="lg" className="w-full sm:w-auto" onClick={() => void connect()} disabled={connecting} data-testid="connect-payouts">
                {connecting ? <Loader2 className="animate-spin" /> : <Banknote />} Koppla bankkonto för utbetalningar
              </Button>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5" /> Resten av PT-portalen öppnas när båda stegen är klara.
              </span>
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setStep(1)}>
                Ändra profilen
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

function Stepper({ step, profileDone, payoutsDone }: { step: Step; profileDone: boolean; payoutsDone: boolean }) {
  const items = [
    { n: 1, label: "Din profil", done: profileDone },
    { n: 2, label: "Utbetalningar", done: payoutsDone },
  ]
  return (
    <ol className="flex items-center gap-3" aria-label="Steg i onboardingen">
      {items.map((it, i) => (
        <li key={it.n} className="flex flex-1 items-center gap-2" aria-current={step === it.n ? "step" : undefined}>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
              it.done ? "border-success bg-success text-white" : step === it.n ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            {it.done ? <Check className="size-4" /> : it.n}
          </span>
          <span className={cn("text-sm", step === it.n ? "font-medium" : "text-muted-foreground")}>{it.label}</span>
          {i < items.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

function Point({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-4 text-primary" />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground">{children}</span>
      </span>
    </li>
  )
}
