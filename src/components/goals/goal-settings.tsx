"use client"

import { Activity, Ruler, Save, Sparkles, Target } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { ActivityPicker, BodyFields, GoalDisclaimer, GoalPicker, GoalResults } from "@/components/goals/goal-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAppData } from "@/lib/data/store"
import { formatDay } from "@/lib/date"
import { draftErrors, draftFromProfile, type GoalDraft, profileFromDraft } from "@/lib/goals/draft"

/**
 * Profil → Mål: ändra mål, nuvarande vikt, aktivitet och reglaget när som
 * helst. Kalorimålet och grafen uppdateras direkt medan man ändrar; Spara
 * skriver till client_goals (och loggar en ny vikt i viktkurvan).
 */
export function GoalSettings() {
  const { data, actions, me } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)
  const saved = data.goalProfiles.find((g) => g.clientId === me.id)
  const [draft, setDraft] = React.useState<GoalDraft>(() => draftFromProfile(saved, client?.weightLog.at(-1)?.kg))
  const [showErrors, setShowErrors] = React.useState(false)
  const patch = (p: Partial<GoalDraft>) => setDraft((d) => ({ ...d, ...p }))
  const baseline = React.useMemo(() => JSON.stringify(draftFromProfile(saved, client?.weightLog.at(-1)?.kg)), [saved, client])
  const dirty = JSON.stringify(draft) !== baseline
  const errors = showErrors ? draftErrors(draft) : {}

  if (!saved) {
    return (
      <Card className="text-center" data-testid="goals-empty">
        <CardHeader>
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Target className="size-6" />
          </span>
          <CardTitle>Du har inga mål än</CardTitle>
          <CardDescription>Svara på några frågor så räknar vi ut ditt kalorimål och visar hur du kan utvecklas vecka för vecka.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/klient/intro">
              <Sparkles /> Sätt upp mina mål
            </Link>
          </Button>
          <GoalDisclaimer className="text-left" />
        </CardContent>
      </Card>
    )
  }

  const save = () => {
    const profile = profileFromDraft(draft, me.id, saved)
    if (!profile) {
      setShowErrors(true)
      return toast.error("Kontrollera de markerade fälten")
    }
    actions.saveGoalProfile(profile)
    setDraft(draftFromProfile(profile))
    setShowErrors(false)
    toast.success("Målen är uppdaterade", { description: `Nytt dagsmål: ${profile.targets.kcal} kcal.` })
  }

  const lost = Math.round((saved.currentWeightKg - saved.startWeightKg) * 10) / 10

  return (
    <div className="space-y-5" data-testid="goal-settings">
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4" /> Mina mål
          </CardTitle>
          <CardDescription>
            Sedan {formatDay(saved.startedAt).toLowerCase()}: {saved.startWeightKg.toLocaleString("sv-SE")} kg →{" "}
            {saved.currentWeightKg.toLocaleString("sv-SE")} kg ({lost > 0 ? "+" : lost < 0 ? "−" : "±"}
            {Math.abs(lost).toLocaleString("sv-SE")} kg)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalPicker value={draft.goals} onChange={(goals) => patch({ goals })} error={errors.goals} />
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="size-4" /> Mått
          </CardTitle>
          <CardDescription>Uppdatera vikten när du vägt dig – den loggas också i viktkurvan under Framsteg.</CardDescription>
        </CardHeader>
        <CardContent>
          <BodyFields draft={draft} onChange={patch} errors={errors} />
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> Aktivitetsnivå
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityPicker value={draft.activity} onChange={(activity) => patch({ activity })} error={errors.activity} />
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="plan-title">
        <h2 id="plan-title" className="flex items-center gap-2 px-1 text-base font-semibold">
          Kostplan och prognos {dirty && <Badge variant="outline">Osparat</Badge>}
        </h2>
        <GoalResults draft={draft} onChange={patch} errors={draftErrors(draft, ["targetWeightKg"])} />
      </section>

      <GoalDisclaimer />

      {/* Spara-knappen ligger kvar ovanför bottenmenyn medan man skrollar. */}
      <div className="sticky bottom-[calc(4.75rem+var(--safe-bottom))] z-10 flex gap-2 rounded-2xl border border-border/70 bg-background/90 p-2 shadow-float backdrop-blur-xl">
        <Button variant="ghost" className="flex-1" disabled={!dirty} onClick={() => (setDraft(draftFromProfile(saved, client?.weightLog.at(-1)?.kg)), setShowErrors(false))}>
          Ångra
        </Button>
        <Button className="flex-[2]" disabled={!dirty} onClick={save} data-testid="goals-save">
          <Save /> Spara mål
        </Button>
      </div>
    </div>
  )
}
