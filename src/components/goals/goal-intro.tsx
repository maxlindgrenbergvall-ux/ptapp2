"use client"

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { ActivityPicker, BodyFields, GoalDisclaimer, GoalPicker, GoalResults } from "@/components/goals/goal-editor"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useAppData } from "@/lib/data/store"
import { type DraftField, draftErrors, draftFromProfile, type GoalDraft, profileFromDraft } from "@/lib/goals/draft"
import { cn } from "@/lib/utils"

const STEPS: { title: string; lead: string; fields: DraftField[] }[] = [
  { title: "Dina mått", lead: "Vi räknar ut din ämnesomsättning med Mifflin-St Jeor-formeln.", fields: ["weightKg", "heightCm", "age", "sex"] },
  { title: "Hur aktiv är du?", lead: "Välj det som stämmer bäst för en vanlig vecka – träning inräknad.", fields: ["activity"] },
  { title: "Vad vill du uppnå?", lead: "Välj ett eller flera mål. Fettförbränning och muskler samtidigt? Välj båda.", fields: ["goals"] },
  { title: "Din plan", lead: "Dra i reglaget – kalorimålet och grafen räknas om direkt.", fields: ["targetWeightKg"] },
]

/**
 * Intro-flödet för nya klienter (efter välkomststeget): mått → aktivitet →
 * mål → plan med kalorimål, makron, aggressivitetsreglage och framtidsgraf.
 * Sparas i client_goals; kan göras om eller ändras under Profil → Mål.
 */
export function GoalIntro() {
  const { data, actions, me } = useAppData()
  const router = useRouter()
  const client = data.clients.find((c) => c.id === me.id)
  const existing = data.goalProfiles.find((g) => g.clientId === me.id)
  const [draft, setDraft] = React.useState<GoalDraft>(() => draftFromProfile(existing, client?.weightLog.at(-1)?.kg))
  const [step, setStep] = React.useState(0)
  const [showErrors, setShowErrors] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const current = STEPS[step]
  const errors = showErrors ? draftErrors(draft, current.fields) : {}
  const patch = (p: Partial<GoalDraft>) => setDraft((d) => ({ ...d, ...p }))

  // Nytt steg: överst och fokus på rubriken (skärmläsare och tangentbord).
  React.useEffect(() => {
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  const next = () => {
    if (Object.keys(draftErrors(draft, current.fields)).length) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }
    const profile = profileFromDraft(draft, me.id, existing)
    if (!profile) {
      setShowErrors(true)
      return toast.error("Kontrollera uppgifterna i stegen innan")
    }
    setSaving(true)
    actions.saveGoalProfile(profile)
    toast.success("Din plan är sparad", { description: `${profile.targets.kcal} kcal per dag. Ändra när som helst under Profil → Mål.` })
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
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/klient">Gör senare</Link>
          </Button>
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
          {step === 0 && <BodyFields draft={draft} onChange={patch} errors={errors} />}
          {step === 1 && <ActivityPicker value={draft.activity} onChange={(activity) => patch({ activity })} error={errors.activity} />}
          {step === 2 && <GoalPicker value={draft.goals} onChange={(goals) => patch({ goals })} error={errors.goals} />}
          {step === 3 && <GoalResults draft={draft} onChange={patch} errors={draftErrors(draft, ["targetWeightKg"])} />}
        </div>
        <GoalDisclaimer />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-lg border-t border-border/60 bg-background/90 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] backdrop-blur-xl">
        <Button size="lg" className="h-12 w-full text-base" onClick={next} disabled={saving} data-testid="intro-next">
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
