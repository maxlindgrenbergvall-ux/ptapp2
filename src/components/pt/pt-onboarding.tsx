"use client"

import { ArrowRight, BadgeCheck, Banknote, Check, Clock, FileCheck2, Loader2, Lock, RefreshCw, ShieldCheck, UserRound } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { BrandMark } from "@/components/brand"
import { profileDraft, type ProfileDraft, profileErrors, ProfileStepFields } from "@/components/onboarding/profile-step"
import { AgreementFields } from "@/components/onboarding/agreement-step"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { openCheckout } from "@/lib/native/checkout"
import { EXISTING_CLIENT_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "@/lib/payments/fees"
import { nextOnboardingStep, type OnboardingStatus, TRAINER_STEPS, STEP_LABEL } from "@/lib/onboarding"
import { acceptUserAgreement, fetchOnboardingStatus, finishOnboarding, OnboardingError, saveProfileStep } from "@/lib/onboarding-client"
import { MIN_BIO_LENGTH, missingProfileParts, type PayoutStatus } from "@/lib/pt-onboarding"
import { getSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { SPECIALTIES, SPECIALTY_LABEL, type Specialty } from "@/types/domain"

type Step = 1 | 2 | 3

const STRIPE_MESSAGES: Record<string, { kind: "info" | "error"; text: string }> = {
  forny: { kind: "info", text: "Länken till Stripe hann gå ut. Tryck på knappen igen för att fortsätta där du var." },
  ofullstandig: { kind: "info", text: "Stripe behöver några uppgifter till. Fortsätt hos Stripe för att bli klar." },
  fel: { kind: "error", text: "Vi kunde inte kontrollera kontot hos Stripe just nu. Försök igen om en stund." },
}

/**
 * /pt/onboarding: PT:ns intro-flöde (v22 + v31), obligatoriskt innan PT-portalen
 * öppnas (proxy.ts: app_metadata.onboarding_completed och pt_ready).
 *  1. Profil (steg 1 för alla): förnamn, efternamn, profilbild (bildfiltret) –
 *     plus PT:ns inriktningar och presentation.
 *  2. Utbetalningar: Stripe Connect (Express) med automatisk delning av
 *     betalningen (application_fee_amount). Stripe skickar tillbaka till
 *     /pt/onboarding/callback, som kontrollerar kontot.
 *  3. Användaravtalet (v34): ETT godkännande som täcker användarvillkor,
 *     integritetspolicy, PT-avtal och GDPR-åtagandet, plus valfritt nyhetsbrev.
 *     Sedan aktiverar finish_onboarding() kontot.
 */
export function PtOnboarding() {
  const { data, me, actions, mode } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const [person, setPerson] = React.useState<ProfileDraft>(() => profileDraft(me.name, trainer?.avatarUrl))
  const [form, setForm] = React.useState(() => ({
    specialties: trainer?.specialties ?? ([] as Specialty[]),
    bio: trainer?.bio ?? "",
  }))
  const [onboarding, setOnboarding] = React.useState<OnboardingStatus | null>(null)
  const [showErrors, setShowErrors] = React.useState(false)
  const [accepted, setAccepted] = React.useState(false)
  const [marketing, setMarketing] = React.useState(false)
  const [termsTried, setTermsTried] = React.useState(false)
  const [activating, setActivating] = React.useState(false)
  const [status, setStatus] = React.useState<PayoutStatus | null>(null)
  const [step, setStep] = React.useState<Step>(1)
  const [saving, setSaving] = React.useState(false)
  const [connecting, setConnecting] = React.useState(false)
  const [demoConnected, setDemoConnected] = React.useState(false)

  const name = `${person.firstName} ${person.lastName}`.trim()
  const missing = missingProfileParts({ name, avatarUrl: person.avatarUrl, ...form })
  const personErrors = showErrors ? profileErrors(person, true) : {}
  const profileDone = missing.length === 0 && Object.keys(profileErrors(person, true)).length === 0

  const loadStatus = React.useCallback(async (): Promise<PayoutStatus | null> => {
    if (mode === "demo") return null
    const { data: s, error } = await getSupabase().rpc("my_payout_status")
    if (error || !s) return null
    setStatus(s as PayoutStatus)
    return s as PayoutStatus
  }, [mode])

  // Första laddningen: rollrouterns nästa steg utifrån databasen (profil → Stripe → villkor).
  React.useEffect(() => {
    let cancelled = false
    if (mode === "supabase") {
      void Promise.all([fetchOnboardingStatus().catch(() => null), getSupabase().rpc("my_payout_status")]).then(([o, payout]) => {
        if (cancelled) return
        if (payout.data) setStatus(payout.data as PayoutStatus)
        if (!o) return
        setOnboarding(o)
        setAccepted(o.terms_done)
        setMarketing(Boolean(o.marketing_consent))
        setPerson((p) => ({ firstName: o.first_name ?? p.firstName, lastName: o.last_name ?? p.lastName, avatarUrl: o.avatar_url ?? p.avatarUrl }))
        const next = nextOnboardingStep(o)
        if (o.completed && next === "done") {
          // Redan klar (t.ex. tillbaka från Stripe efter en ny kontroll): till portalen.
          // Är något steg inte längre klart (t.ex. Stripe har stängt av kortbetalningar)
          // stannar PT:n här på det steget – annars skulle proxy.ts skicka tillbaka hit.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/pt")
          return
        }
        setStep(next === "payouts" ? 2 : next === "terms" || next === "done" ? 3 : 1)
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
    if (!profileDone) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    const patch = { name, avatarUrl: person.avatarUrl, specialties: form.specialties, bio: form.bio.trim() }
    if (mode === "supabase") {
      // Sparas direkt (inte via bakgrundskön), så att steg 2 vet att databasen har profilen
      // och PT:n får det riktiga felet om något går fel. Namn och bild via steg 1-funktionen
      // (samma regler som för klienter), presentationen på PT-profilen.
      const error = await saveProfileNow(me.id, person, patch)
      if (error) {
        setSaving(false)
        toast.error("Profilen kunde inte sparas", { description: error })
        return
      }
      const { data: s, error: statusError } = await getSupabase().rpc("my_payout_status")
      if (statusError || !s) {
        setSaving(false)
        toast.error("Profilen är sparad, men utbetalningssteget kan inte startas", {
          description: isMissingFunction(statusError)
            ? "Databasen är inte uppdaterad: kör migrationen v22 (supabase/migrations/…_v22_stripe_connect.sql) i Supabase."
            : (statusError?.message ?? "Försök igen om en stund."),
        })
        return
      }
      setStatus(s as PayoutStatus)
      if (!(s as PayoutStatus).profile_complete) {
        setSaving(false)
        toast.error("Profilen är inte komplett enligt databasen", { description: "Kontrollera namn, profilbild, inriktning och presentation och spara igen." })
        return
      }
    }
    // Uppdatera appens lokala data (i Supabase-läget skrivs samma värden igen – ofarligt).
    actions.updateTrainerProfile(patch)
    setSaving(false)
    setShowErrors(false)
    // Stripe redan klart (t.ex. befintlig PT i det nya flödet): direkt till villkoren.
    setStep(onboarding?.payouts_done || status?.stripe_onboarding_complete ? 3 : 2)
  }

  /**
   * Steg 3: godkänn avtalen och aktivera kontot. Databasen kontrollerar att
   * profil, Stripe och avtal är klara (finish_onboarding) och sätter flaggan;
   * sessionen förnyas (ny JWT) och portalen öppnas.
   */
  const activate = async () => {
    if (!accepted) {
      setTermsTried(true)
      return toast.error("Godkänn användaravtalet för att aktivera kontot")
    }
    setActivating(true)
    try {
      await acceptUserAgreement(marketing)
      await finishOnboarding()
    } catch (e) {
      setActivating(false)
      return toast.error("Kontot kunde inte aktiveras", { description: e instanceof OnboardingError ? e.message : "Försök igen." })
    }
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
      if (body.done) {
        // Stripe-kontot är redan klart: vidare till villkoren.
        await loadStatus()
        setConnecting(false)
        setStep(3)
        return
      }
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
  const firstName = person.firstName.trim() || "där"

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-[calc(var(--safe-bottom)+2rem)] sm:px-6">
      <header className="space-y-4">
        <BrandMark />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Välkommen till Coavira, {firstName}!</h1>
          <p className="text-muted-foreground">Tre steg innan du kan ta emot klienter: din profil, utbetalningar till ditt bankkonto och våra avtal.</p>
        </div>
        <Stepper step={step} profileDone={profileDone && step > 1} payoutsDone={payoutsDone && step > 2} />
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
            <ProfileStepFields
              value={person}
              onChange={(p) => setPerson((d) => ({ ...d, ...p }))}
              userId={me.id}
              errors={personErrors}
              requireAvatar
            />

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
            <Button className="w-full sm:w-auto" size="lg" disabled={saving} onClick={() => void saveProfile()} data-testid="onboarding-save-profile">
              {saving ? <Loader2 className="animate-spin" /> : <ArrowRight />} Spara och fortsätt
            </Button>
          </CardContent>
        </Card>
      ) : step === 2 ? (
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
                  <BadgeCheck className="size-5 text-success" /> Utbetalningarna är kopplade.
                </p>
                <Button size="lg" className="w-full sm:w-auto" onClick={() => setStep(3)} data-testid="onboarding-to-terms">
                  <ArrowRight /> Fortsätt till villkoren
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
                <Lock className="size-3.5" /> Resten av PT-portalen öppnas när alla tre stegen är klara.
              </span>
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setStep(1)}>
                Ändra profilen
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <TermsStep
          accepted={accepted}
          onChange={setAccepted}
          marketing={marketing}
          onMarketingChange={setMarketing}
          invalid={termsTried}
          activating={activating}
          onActivate={() => void activate()}
          onBack={() => setStep(payoutsDone ? 1 : 2)}
          version={onboarding?.terms_version}
        />
      )}
    </main>
  )
}

function Stepper({ step, profileDone, payoutsDone }: { step: Step; profileDone: boolean; payoutsDone: boolean }) {
  const items = TRAINER_STEPS.map((key, i) => ({ n: i + 1, label: STEP_LABEL[key], done: key === "profile" ? profileDone : key === "payouts" ? payoutsDone : false }))
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
          <span className={cn("text-sm leading-tight", step === it.n ? "font-medium" : "text-muted-foreground", step !== it.n && "max-sm:sr-only")}>{it.label}</span>
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

/**
 * Sparar steg 1 direkt i databasen: namn och profilbild via save_profile_step
 * (samma regler som för klienter, bilden måste ha gått genom bildfiltret),
 * inriktningar och presentation på PT-profilen. Returnerar ett läsbart fel eller null.
 */
async function saveProfileNow(
  userId: string,
  person: ProfileDraft,
  p: { specialties: Specialty[]; bio: string }
): Promise<string | null> {
  try {
    await saveProfileStep(person.firstName, person.lastName, person.avatarUrl || null)
    const { error } = await getSupabase().from("trainers").update({ specialties: p.specialties, bio: p.bio }).eq("id", userId)
    return error ? error.message : null
  } catch (e) {
    return e instanceof OnboardingError ? e.message : "Ingen uppkoppling – försök igen."
  }
}

/** Steg 3 (v34): det sammanslagna användaravtalet – en bock – och valfritt nyhetsbrev. */
function TermsStep({
  accepted,
  onChange,
  marketing,
  onMarketingChange,
  invalid,
  activating,
  onActivate,
  onBack,
  version,
}: {
  accepted: boolean
  onChange: (v: boolean) => void
  marketing: boolean
  onMarketingChange: (v: boolean) => void
  invalid: boolean
  activating: boolean
  onActivate: () => void
  onBack: () => void
  version?: string
}) {
  return (
    <Card data-testid="onboarding-terms">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 className="size-5 text-primary" /> Steg 3: Användaravtal
        </CardTitle>
        <CardDescription>Ett avtal och ett godkännande – sedan aktiveras ditt PT-konto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AgreementFields
          role="trainer"
          accepted={accepted}
          onAcceptedChange={onChange}
          marketing={marketing}
          onMarketingChange={onMarketingChange}
          invalid={invalid}
          version={version}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onBack}>
            Tillbaka
          </Button>
          <Button size="lg" disabled={activating} onClick={onActivate} data-testid="activate-account">
            {activating ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Godkänn och aktivera kontot
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Funktionen finns inte i databasen (migrationen är inte körd). */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(error.message ?? "")))
}
