"use client"

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { ActivityPicker, BodyFields, GoalDisclaimer, GoalPicker, GoalResults } from "@/components/goals/goal-editor"
import { profileDraft, type ProfileDraft, profileErrors, ProfileStepFields } from "@/components/onboarding/profile-step"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useAppData } from "@/lib/data/store"
import { type DraftField, draftErrors, draftFromProfile, type GoalDraft, profileFromDraft } from "@/lib/goals/draft"
import { fetchOnboardingStatus, finishOnboarding, OnboardingError, saveGoalsNow, saveProfileStep } from "@/lib/onboarding-client"
import { cn } from "@/lib/utils"

const STEPS: { title: string; lead: string; fields: DraftField[] }[] = [
  // Steg 1 för alla (v31): namn och profilbild. Valideras separat (profileErrors).
  { title: "Välkommen! Vem är du?", lead: "Ditt namn och en profilbild – dina PT:er ser dem. Bilden granskas automatiskt.", fields: [] },
  { title: "Dina mått", lead: "Vi räknar ut din ämnesomsättning med Mifflin-St Jeor-formeln.", fields: ["weightKg", "heightCm", "age", "sex"] },
  { title: "Hur aktiv är du?", lead: "Välj det som stämmer bäst för en vanlig vecka – träning inräknad.", fields: ["activity"] },
  { title: "Vad vill du uppnå?", lead: "Välj ett eller flera mål. Fettförbränning och muskler samtidigt? Välj båda.", fields: ["goals"] },
  { title: "Din plan", lead: "Dra i reglaget – kalorimålet och grafen räknas om direkt.", fields: ["targetWeightKg"] },
]

/**
 * Intro-flödet för klienter (efter välkomststeget, v30/v31): steg 1 (förnamn,
 * efternamn, profilbild) → mått → aktivitet → mål → plan med kalorimål, makron,
 * aggressivitetsreglage och framtidsgraf. Sparas i profiles och client_goals;
 * sist markerar finish_onboarding() intro-flödet som klart (obligatoriskt för
 * nya och – efter v31 – alla befintliga klienter). Målen kan ändras under Profil → Mål.
 */
export function GoalIntro() {
  const { data, actions, me } = useAppData()
  const router = useRouter()
  const client = data.clients.find((c) => c.id === me.id)
  const existing = data.goalProfiles.find((g) => g.clientId === me.id)
  const [draft, setDraft] = React.useState<GoalDraft>(() => draftFromProfile(existing, client?.weightLog.at(-1)?.kg))
  const [profile, setProfile] = React.useState<ProfileDraft>(() => profileDraft(client?.name ?? me.name, client?.avatarUrl))
  const [step, setStep] = React.useState(0)
  // Obligatoriskt tills databasen markerat flödet som klart (v31). Annars (gjort om från startsidan) kan man hoppa över.
  const mandatory = me.onboardingCompleted === false
  const [showErrors, setShowErrors] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const current = STEPS[step]
  const errors = showErrors ? draftErrors(draft, current.fields) : {}
  const profileErrs = showErrors && step === 0 ? profileErrors(profile, false) : {}
  const patch = (p: Partial<GoalDraft>) => setDraft((d) => ({ ...d, ...p }))

  // Förifyll steg 1 med det databasen har (för- och efternamn sedan v31).
  React.useEffect(() => {
    let cancelled = false
    fetchOnboardingStatus()
      .then((s) => {
        if (cancelled || !s) return
        setProfile((p) => ({
          firstName: s.first_name ?? p.firstName,
          lastName: s.last_name ?? p.lastName,
          avatarUrl: s.avatar_url ?? p.avatarUrl,
        }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Nytt steg: överst och fokus på rubriken (skärmläsare och tangentbord).
  React.useEffect(() => {
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  /** Steg 1: spara namn och bild direkt (databasen kontrollerar dem igen). */
  const saveProfile = async (): Promise<boolean> => {
    if (Object.keys(profileErrors(profile, false)).length) {
      setShowErrors(true)
      return false
    }
    setSaving(true)
    try {
      await saveProfileStep(profile.firstName, profile.lastName, profile.avatarUrl || null)
    } catch (e) {
      toast.error("Uppgifterna kunde inte sparas", { description: e instanceof OnboardingError ? e.message : "Försök igen." })
      return false
    } finally {
      setSaving(false)
    }
    actions.updateProfile({ name: `${profile.firstName.trim()} ${profile.lastName.trim()}`, avatarUrl: profile.avatarUrl || undefined })
    return true
  }

  const next = async () => {
    if (step === 0) {
      if (!(await saveProfile())) return
      setShowErrors(false)
      setStep(1)
      return
    }
    if (Object.keys(draftErrors(draft, current.fields)).length) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }
    const goals = profileFromDraft(draft, me.id, existing)
    if (!goals) {
      setShowErrors(true)
      return toast.error("Kontrollera uppgifterna i stegen innan")
    }
    setSaving(true)
    try {
      // Målen direkt i databasen, sedan markeras intro-flödet som klart (kontrolleras av databasen).
      await saveGoalsNow(me.id, goals)
      if (mandatory) await finishOnboarding()
    } catch (e) {
      setSaving(false)
      return toast.error("Planen kunde inte sparas", { description: e instanceof OnboardingError ? e.message : "Försök igen." })
    }
    actions.saveGoalProfile(goals)
    toast.success("Din plan är sparad", { description: `${goals.targets.kcal} kcal per dag. Ändra när som helst under Profil → Mål.` })
    if (mandatory) {
      // Hel sidladdning: proxy.ts läser den nya JWT:n (onboarding_completed) och appen laddar om.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/klient")
      return
    }
    router.push("/klient")
  }

  return (
    <div className="flex min-h-svh flex-col pt-[var(--safe-top)]" data-testid="goal-intro">
      <header className="sticky top-0 z-10 space-y-3 border-b border-border/60 bg-background/85 px-4 pt-3 pb-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" aria-label="Föregående steg" disabled={step === 0} onClick={() => setStep(step - 1)} className={cn(step === 0 && "invisible")}>
            <ArrowLeft />
          </Button>
          <p className="text-xs font-medium text-muted-foreground tabular" aria-live="polite">
            Steg {step + 1} av {STEPS.length}
          </p>
          {mandatory ? (
            <span className="w-16" aria-hidden />
          ) : (
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href="/klient">Gör senare</Link>
            </Button>
          )}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" aria-label={`Steg ${step + 1} av ${STEPS.length}`} />
      </header>

      <main className="flex-1 space-y-5 px-4 pt-5 pb-[calc(7rem+var(--safe-bottom))]">
        <div key={step} className="animate-in fade-in-0 slide-in-from-right-4 space-y-5 duration-300 motion-reduce:animate-none">
          <div className="space-y-1">
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
              {current.title}
            </h1>
            <p className="text-sm text-muted-foreground">{current.lead}</p>
          </div>
          {step === 0 && <ProfileStepFields value={profile} onChange={(p) => setProfile((d) => ({ ...d, ...p }))} userId={me.id} errors={profileErrs} requireAvatar={false} />}
          {step === 1 && <BodyFields draft={draft} onChange={patch} errors={errors} />}
          {step === 2 && <ActivityPicker value={draft.activity} onChange={(activity) => patch({ activity })} error={errors.activity} />}
          {step === 3 && <GoalPicker value={draft.goals} onChange={(goals) => patch({ goals })} error={errors.goals} />}
          {step === 4 && <GoalResults draft={draft} onChange={patch} errors={draftErrors(draft, ["targetWeightKg"])} />}
        </div>
        {step > 0 && <GoalDisclaimer />}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-lg border-t border-border/60 bg-background/90 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] backdrop-blur-xl">
        <Button size="lg" className="h-12 w-full text-base" onClick={() => void next()} disabled={saving} data-testid="intro-next">
          {saving ? (
            <Loader2 className="animate-spin" />
          ) : step === STEPS.length - 1 ? (
            <>
              <Check /> Spara min plan
            </>
          ) : (
            <>
              Fortsätt <ArrowRight />
            </>
          )}
        </Button>
      </footer>
    </div>
  )
}
