"use client"

import { Flame, Plus, Target, TrendingDown, TrendingUp } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { WeightChart } from "@/components/charts/progress-charts"
import { GoalProjectionChart } from "@/components/goals/goal-chart"
import { FillBar } from "@/components/motion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SOURCE_LABEL } from "@/lib/activity/summary"
import { useAppData } from "@/lib/data/store"
import { parseISODate, todayISO } from "@/lib/date"
import { adaptiveProjection } from "@/lib/goals/adaptive"
import { chartSeries, GOAL_DISCLAIMER } from "@/lib/goals/metabolism"
import { progressSummary, type SummaryCard } from "@/lib/goals/progress-summary"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

const DAY = 86_400_000

/**
 * Framsteg (v40) – bara det viktigaste:
 *   1. Två kort: Viktnedgång (eller Tappat fett) och Ökad muskelmassa.
 *   2. En stor, ren graf: planen, dina vägningar och den uppdaterade kurvan som
 *      räknas om med kaloriförbränning och träning från Apple Hälsa, Health
 *      Connect, Strava och passen i appen. Inga extra paneler – källorna och
 *      friskrivningen står som en diskret rad under grafen.
 */
export function ProgressOverview({ clientId }: { clientId: ID }) {
  const { data } = useAppData()
  const client = data.clients.find((c) => c.id === clientId)
  const goal = data.goalProfiles.find((g) => g.clientId === clientId)
  const weightLog = client?.weightLog ?? []
  const r = goal ? adaptiveProjection({ goal, weightLog, activities: data.activities, activityDays: data.activityDays, workouts: data.workouts }) : null
  const { fat, muscle } = progressSummary(goal, weightLog, r)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3" data-testid="progress-cards">
        <StatCard card={fat} icon={TrendingDown} testId="card-fat" />
        <StatCard card={muscle} icon={TrendingUp} testId="card-muscle" />
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-card sm:p-5" aria-labelledby="curve-title" data-testid="progress-curve">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 id="curve-title" className="font-semibold">
            Viktkurva
          </h2>
          <LogWeightButton clientId={clientId} />
        </div>
        {goal && r ? (
          <>
            <GoalProjectionChart
              size="lg"
              points={r.planned}
              series={chartSeries(goal.goals)}
              actual={actualDeltas(goal.startedAt, goal.startWeightKg, weightLog)}
              adaptive={r.adaptive}
              nowWeek={r.nowWeek || undefined}
              reachedWeek={r.adaptiveReachWeek ?? r.plannedReachWeek}
            />
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-xs text-muted-foreground" data-testid="curve-sources">
              <Flame className="size-3.5 text-primary" aria-hidden />
              {r.basis === "plan" ? (
                <>
                  Följer planen –{" "}
                  <Link href="/klient/anslutningar" className="font-medium text-primary underline-offset-4 hover:underline">
                    koppla Apple Hälsa, Health Connect eller Strava
                  </Link>
                </>
              ) : (
                <>
                  Uppdaterad med {r.sources.map((s) => (s === "app" ? "dina pass" : SOURCE_LABEL[s])).join(", ")} · {r.measuredTdee.toLocaleString("sv-SE")} kcal/dag ·{" "}
                  {r.sessionsPerWeek.toLocaleString("sv-SE")} pass/v
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <WeightChart entries={weightLog} />
            <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
              <Target className="size-3.5 text-primary" aria-hidden />
              <Link href="/klient/intro" className="font-medium text-primary underline-offset-4 hover:underline">
                Välj mål
              </Link>{" "}
              för att se din plan och prognos.
            </p>
          </>
        )}
        <p className="mt-1 px-1 text-[11px] leading-snug text-muted-foreground/80" data-testid="goal-disclaimer">
          {GOAL_DISCLAIMER}
        </p>
      </section>
    </div>
  )
}

/** Faktiska vägningar som förändring från startvikten, senaste per vecka. */
function actualDeltas(startedAt: string, startKg: number, log: { date: string; kg: number }[]) {
  const start = parseISODate(startedAt).getTime()
  const byWeek = new Map<number, number>()
  for (const e of [...log].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date < startedAt || e.date > todayISO()) continue
    byWeek.set(Math.max(0, Math.floor((parseISODate(e.date).getTime() - start) / (7 * DAY))), Math.round((e.kg - startKg) * 10) / 10)
  }
  return [{ week: 0, delta: 0 }, ...[...byWeek.entries()].filter(([w]) => w > 0).map(([week, delta]) => ({ week, delta }))]
}

function StatCard({ card, icon: Icon, testId }: { card: SummaryCard; icon: typeof TrendingDown; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border/70 bg-card p-3 shadow-card sm:p-4" data-testid={testId}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden /> {card.title}
      </p>
      <p
        className={cn("text-2xl leading-none font-bold tracking-tight tabular", card.trend === "good" && "text-success", card.trend === "bad" && "text-warning")}
        data-testid={`${testId}-value`}
      >
        {card.estimated && card.value !== "–" ? <span className="mr-0.5 text-base font-semibold text-muted-foreground">≈</span> : null}
        {card.value}
      </p>
      {card.progress !== undefined && (
        <FillBar value={Math.round(card.progress * 100)} className="h-1.5" role="progressbar" aria-label={`${card.title}: förlopp`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(card.progress * 100)} />
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">{card.detail}</p>
    </div>
  )
}

/** Logga dagens vikt – en knapp i grafens rubrik i stället för en egen ruta. */
function LogWeightButton({ clientId }: { clientId: ID }) {
  const { actions } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [kg, setKg] = React.useState("")
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const value = Number(kg.replace(",", "."))
    if (!Number.isFinite(value) || value < 25 || value > 350) return toast.error("Ange en vikt mellan 25 och 350 kg")
    actions.addWeight(clientId, { date: todayISO(), kg: Math.round(value * 10) / 10 })
    setKg("")
    setOpen(false)
    toast.success("Vikten är sparad")
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8" data-testid="log-weight">
          <Plus /> Logga vikt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Dagens vikt</DialogTitle>
          <DialogDescription>Väg dig gärna samma tid och dag varje vecka.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex gap-2">
          <Input inputMode="decimal" autoFocus placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} aria-label="Dagens vikt i kg" className="h-11" />
          <Button type="submit" className="h-11">
            Spara
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
