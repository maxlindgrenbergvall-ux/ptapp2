"use client"

import { Check } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { FlowShell } from "@/components/flow/flow-shell"
import { Reveal } from "@/components/flow/motion"
import { ActivityPicker, BodyFields, GoalDisclaimer, GoalPicker, GoalResults } from "@/components/goals/goal-editor"
import { AgreementFields } from "@/components/onboarding/agreement-step"
import { profileDraft, type ProfileDraft, profileErrors, ProfileStepFields } from "@/components/onboarding/profile-step"
import { InterestPills, LanguageChips, useChangeLanguage } from "@/components/settings/app-settings"
import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"
import { useT } from "@/lib/i18n/provider"
import { type DraftField, draftErrors, draftFromProfile, type GoalDraft, profileFromDraft } from "@/lib/goals/draft"
import { acceptUserAgreement, agreementAccepted, fetchOnboardingStatus, finishOnboarding, OnboardingError, saveGoalsNow, saveProfileStep } from "@/lib/onboarding-client"

type Step = { key: "profile" | "body" | "activity" | "goals" | "plan" | "agreement"; title: string; lead: string; fields: DraftField[] }
const ALL_STEPS: Step[] = [
  // Steg 1 för alla (v31): namn och profilbild. Valideras separat (profileErrors).
  { key: "profile", title: "Välkommen! Vem är du?", lead: "Ditt namn och en profilbild – dina PT:er ser dem.", fields: [] },
  { key: "body", title: "Dina mått", lead: "Vi räknar ut din ämnesomsättning utifrån dem.", fields: ["weightKg", "heightCm", "age", "sex"] },
  { key: "activity", title: "Hur aktiv är du?", lead: "Välj det som stämmer bäst för en vanlig vecka – träning inräknad.", fields: ["activity"] },
  { key: "goals", title: "Vad vill du uppnå?", lead: "Välj ett eller flera mål.", fields: ["goals"] },
  { key: "plan", title: "Din plan", lead: "Dra i reglaget – kalorimålet och grafen räknas om direkt.", fields: ["targetWeightKg"] },
  // v34: sista steget – ett obligatoriskt användaravtal och valfritt nyhetsbrev.
  { key: "agreement", title: "Sista steget: avtalet", lead: "Ett avtal, ett godkännande – sedan är du igång.", fields: [] },
]

/**
 * Intro-flödet för klienter (efter välkomststeget, v30/v31): steg 1 (förnamn,
 * efternamn, profilbild) → mått → aktivitet → mål → plan med kalorimål, makron,
 * aggressivitetsreglage och framtidsgraf → användaravtalet (v34, obligatoriskt,
 * ett godkännande + valfritt nyhetsbrev). Sparas i profiles och client_goals;
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
  const [step, setStepState] = React.useState(0)
  // v78: steg 1 är två korta sidor – namn och bild, sedan träningsintressen.
  const [sub, setSub] = React.useState<0 | 1>(0)
  const setStep = (n: number) => {
    setSub(n === 0 ? 1 : 0)
    setStepState(n)
  }
  // v34: avtalssteget visas tills avtalets nuvarande version är godkänd.
  const [agreed, setAgreed] = React.useState<boolean | null>(null)
  const [accepted, setAccepted] = React.useState(false)
  const [marketing, setMarketing] = React.useState(false)
  const [version, setVersion] = React.useState<string | undefined>()
  const STEPS = agreed ? ALL_STEPS.filter((s) => s.key !== "agreement") : ALL_STEPS
  // Obligatoriskt tills databasen markerat flödet som klart (v31). Annars (gjort om från startsidan) kan man hoppa över.
  const mandatory = me.onboardingCompleted === false
  const [showErrors, setShowErrors] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const current = STEPS[step]
  const errors = showErrors ? draftErrors(draft, current.fields) : {}
  const profileErrs = showErrors && step === 0 && sub === 0 ? profileErrors(profile, false) : {}
  const patch = (p: Partial<GoalDraft>) => setDraft((d) => ({ ...d, ...p }))
  // v58: språk och träningsintressen i första steget – sparas direkt (optimistiskt).
  const t = useT()
  const changeLanguage = useChangeLanguage()
  const interests = data.preferences?.trainingInterests ?? []

  // Förifyll steg 1 med det databasen har (för- och efternamn sedan v31).
  React.useEffect(() => {
    let cancelled = false
    fetchOnboardingStatus()
      .then((s) => {
        if (cancelled) return
        if (!s) {
          void agreementAccepted().then((a) => !cancelled && setAgreed(a))
          return
        }
        setAgreed(s.terms_done)
        setVersion(s.terms_version)
        setMarketing(Boolean(s.marketing_consent))
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

  // Ny sida: överst (fokus på rubriken sköts av FlowShell).
  React.useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step, sub])

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
    if (step === 0 && sub === 0) {
      if (!(await saveProfile())) return
      setShowErrors(false)
      setSub(1)
      return
    }
    if (step === 0) {
      setStepState(1)
      setSub(0)
      return
    }
    if (Object.keys(draftErrors(draft, current.fields)).length) {
      setShowErrors(true)
      return
    }
    // Avtalet är obligatoriskt för att gå vidare.
    if (current.key === "agreement" && !accepted) {
      setShowErrors(true)
      return toast.error("Godkänn användaravtalet för att gå vidare")
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
      if (current.key === "agreement") await acceptUserAgreement(marketing)
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

  const interestsPage = step === 0 && sub === 1
  const title = interestsPage ? t("interests.title") : current.title
  const lead = interestsPage ? t("interests.lead") : current.lead
  const label =
    current.key === "agreement" ? "Godkänn och kom igång" : step === STEPS.length - 1 ? "Spara min plan" : "Fortsätt"
  const finalIcon = current.key === "agreement" || step === STEPS.length - 1 ? <Check /> : undefined

  return (
    <FlowShell
      rootTestId="goal-intro"
      testId={`intro-${interestsPage ? "interests" : current.key}`}
      step={step + 1}
      total={STEPS.length}
      page={step * 10 + sub}
      progress={step === 0 ? (sub + 1) / 2 : 1}
      stepLabel={`Steg ${step + 1} av ${STEPS.length}`}
      backLabel="Föregående steg"
      onBack={interestsPage ? () => setSub(0) : step > 0 ? () => setStep(step - 1) : undefined}
      right={
        mandatory ? undefined : (
          <Button asChild variant="ghost" size="sm" className="-mr-2 text-muted-foreground">
            <Link href="/klient">Gör senare</Link>
          </Button>
        )
      }
      title={title}
      lead={lead}
      primary={{
        label,
        icon: finalIcon,
        onClick: () => void next(),
        busy: saving,
        disabled: current.key === "plan" && agreed === null && mandatory,
        testId: "intro-next",
      }}
    >
      {step === 0 && sub === 0 && (
        <>
          <Reveal>
            <section className="space-y-2" aria-labelledby="intro-lang">
              <h2 id="intro-lang" className="text-sm text-muted-foreground">
                {t("lang.choose")}
              </h2>
              <LanguageChips onPick={(l) => changeLanguage(l)} />
            </section>
          </Reveal>
          <Reveal>
            <ProfileStepFields value={profile} onChange={(p) => setProfile((d) => ({ ...d, ...p }))} userId={me.id} errors={profileErrs} requireAvatar={false} />
          </Reveal>
        </>
      )}
      {interestsPage && (
        <Reveal>
          <section aria-label={t("interests.title")}>
            <InterestPills value={interests} onChange={(next) => actions.setPreferences({ trainingInterests: next })} />
          </section>
        </Reveal>
      )}
      {step === 1 && (
        <Reveal>
          <BodyFields draft={draft} onChange={patch} errors={errors} />
        </Reveal>
      )}
      {step === 2 && (
        <Reveal>
          <ActivityPicker value={draft.activity} onChange={(activity) => patch({ activity })} error={errors.activity} />
        </Reveal>
      )}
      {step === 3 && (
        <Reveal>
          <GoalPicker value={draft.goals} onChange={(goals) => patch({ goals })} error={errors.goals} />
        </Reveal>
      )}
      {step === 4 && (
        <Reveal>
          <GoalResults draft={draft} onChange={patch} errors={draftErrors(draft, ["targetWeightKg"])} />
        </Reveal>
      )}
      {current.key === "agreement" && (
        <Reveal>
          <AgreementFields
            role="client"
            accepted={accepted}
            onAcceptedChange={setAccepted}
            marketing={marketing}
            onMarketingChange={setMarketing}
            invalid={showErrors}
            version={version}
          />
        </Reveal>
      )}
      {step > 0 && current.key !== "agreement" && (
        <Reveal>
          <GoalDisclaimer />
        </Reveal>
      )}
    </FlowShell>
  )
}
