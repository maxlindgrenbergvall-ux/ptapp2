"use client"

import { Activity, Dumbbell, Flame, RefreshCw, Target } from "lucide-react"
import Link from "next/link"

import { GoalDisclaimer } from "@/components/goals/goal-editor"
import { GoalProjectionChart } from "@/components/goals/goal-chart"
import { Badge } from "@/components/ui/badge"
import { SOURCE_LABEL } from "@/lib/activity/summary"
import { useAppData } from "@/lib/data/store"
import { parseISODate, todayISO } from "@/lib/date"
import { adaptiveProjection, adaptiveSummary } from "@/lib/goals/adaptive"
import { chartSeries, formatRate } from "@/lib/goals/metabolism"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

const DAY = 86_400_000
const fmt = (n: number) => Math.round(n).toLocaleString("sv-SE")

/**
 * Framsteg och Mål (v34): planen, de faktiska vägningarna och en UPPDATERAD
 * prognos som räknas om löpande med klientens uppmätta förbränning och
 * träningsfrekvens (Apple Hälsa / Health Connect, Strava och passen i appen).
 * Se src/lib/goals/adaptive.ts. Returnerar null utan mål (då visas den vanliga viktgrafen).
 */
export function GoalProgressChart({
  clientId,
  readOnly = false,
  disclaimer = true,
  className,
}: {
  clientId: ID
  readOnly?: boolean
  /** Friskrivningen visas redan längre ned på Mål-sidan. */
  disclaimer?: boolean
  className?: string
}) {
  const { data } = useAppData()
  const g = data.goalProfiles.find((x) => x.clientId === clientId)
  const log = data.clients.find((c) => c.id === clientId)?.weightLog ?? []
  if (!g) return null
  const r = adaptiveProjection({ goal: g, weightLog: log, activities: data.activities, activityDays: data.activityDays, workouts: data.workouts })
  const { plan, planned, nowWeek } = r
  const start = parseISODate(g.startedAt).getTime()
  const weekOf = (date: string) => Math.max(0, Math.floor((parseISODate(date).getTime() - start) / (7 * DAY)))

  // Senaste vägningen varje vecka sedan start.
  const byWeek = new Map<number, number>()
  for (const e of [...log].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date < g.startedAt || e.date > todayISO()) continue
    byWeek.set(weekOf(e.date), Math.round((e.kg - g.startWeightKg) * 10) / 10)
  }
  const actual = [{ week: 0, delta: 0 }, ...[...byWeek.entries()].filter(([w]) => w > 0).map(([week, delta]) => ({ week, delta }))]
  const planNow = planned[Math.min(nowWeek, planned.length - 1)]?.weightDelta ?? 0
  const actualNow = actual.at(-1)?.delta ?? 0
  const diff = Math.round((actualNow - planNow) * 10) / 10
  const ahead = plan.mode === "bulk" ? diff > 0 : diff < 0
  const measured = r.basis !== "plan"
  const tdeeDiff = r.measuredTdee - r.plannedTdee
  const reachWeek = r.adaptiveReachWeek ?? r.plannedReachWeek

  return (
    <div className={cn("space-y-3", className)} data-testid="goal-progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Target className="size-4 text-primary" /> Plan {plan.mode === "maintain" ? "(stabil vikt)" : formatRate(g.weeklyChangeKg)} mot verklighet
        </span>
        {!readOnly && (
          <Link href="/klient/profil/mal" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Ändra mål
          </Link>
        )}
      </div>

      <GoalProjectionChart
        points={planned}
        series={chartSeries(g.goals)}
        actual={actual}
        adaptive={measured || byWeek.size > 0 ? r.adaptive : undefined}
        nowWeek={nowWeek || undefined}
        reachedWeek={reachWeek}
      />

      {/* Vad kurvan bygger på – uppmätt förbränning och träningsfrekvens. */}
      <div className="rounded-xl border bg-muted/30 p-3" data-testid="adaptive-curve" data-basis={r.basis}>
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <RefreshCw className="size-3.5" /> Uppdaterad efter din aktivitet
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-background/80 px-1 py-2">
            <dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Flame className="size-3" /> Förbränning
            </dt>
            <dd className="text-base font-semibold tabular" data-testid="adaptive-tdee">
              {fmt(r.measuredTdee)}
              <span className="text-[11px] font-normal text-muted-foreground"> kcal/d</span>
            </dd>
            {measured && Math.abs(tdeeDiff) >= 10 && (
              <dd className={cn("text-[11px] tabular", tdeeDiff > 0 ? "text-success" : "text-warning")}>
                {tdeeDiff > 0 ? "+" : "−"}
                {fmt(Math.abs(tdeeDiff))} mot plan
              </dd>
            )}
          </div>
          <div className="rounded-lg bg-background/80 px-1 py-2">
            <dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Activity className="size-3" /> Aktiv energi
            </dt>
            <dd className="text-base font-semibold tabular" data-testid="adaptive-active">
              {measured ? fmt(r.avgActiveKcal) : "–"}
              <span className="text-[11px] font-normal text-muted-foreground"> kcal/d</span>
            </dd>
          </div>
          <div className="rounded-lg bg-background/80 px-1 py-2">
            <dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Dumbbell className="size-3" /> Träning
            </dt>
            <dd className="text-base font-semibold tabular" data-testid="adaptive-sessions">
              {measured ? r.sessionsPerWeek.toLocaleString("sv-SE") : "–"}
              <span className="text-[11px] font-normal text-muted-foreground"> pass/v</span>
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground" data-testid="adaptive-summary">
          {adaptiveSummary(r)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {r.sources.map((s) => (
            <Badge key={s} variant="secondary" className="text-[11px]">
              {s === "app" ? "Pass i Coavira" : SOURCE_LABEL[s]}
            </Badge>
          ))}
          {!readOnly && !measured && (
            <Link href="/klient/anslutningar" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
              Koppla Apple Hälsa, Health Connect eller Strava
            </Link>
          )}
        </div>
      </div>

      {byWeek.size > 0 && plan.mode !== "maintain" && (
        <p className="text-sm" data-testid="goal-progress-summary">
          Vecka {nowWeek}:{" "}
          {Math.abs(diff) < 0.3 ? "du följer planen." : `${Math.abs(diff).toLocaleString("sv-SE")} kg ${ahead ? "före" : "efter"} planen.`}
        </p>
      )}
      {disclaimer && <GoalDisclaimer />}
    </div>
  )
}
