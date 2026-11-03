"use client"

import { Target } from "lucide-react"
import Link from "next/link"

import { GoalDisclaimer } from "@/components/goals/goal-editor"
import { GoalProjectionChart } from "@/components/goals/goal-chart"
import { useAppData } from "@/lib/data/store"
import { parseISODate, todayISO } from "@/lib/date"
import { ageFromBirthYear, chartSeries, computePlan, formatRate, projectWeeks } from "@/lib/goals/metabolism"
import type { ID } from "@/types/domain"

const DAY = 86_400_000

/**
 * Framsteg (v31): de nya interaktiva graferna ersätter den gamla viktgrafen när
 * klienten har mål. Planen räknas från startdagen och startvikten; de faktiska
 * vägningarna ritas ovanpå, så att man ser om man ligger före eller efter planen.
 * Returnerar null utan mål (då visas den vanliga viktgrafen).
 */
export function GoalProgressChart({ clientId }: { clientId: ID }) {
  const { data } = useAppData()
  const g = data.goalProfiles.find((x) => x.clientId === clientId)
  const log = data.clients.find((c) => c.id === clientId)?.weightLog ?? []
  if (!g) return null
  const start = parseISODate(g.startedAt).getTime()
  const weekOf = (date: string) => Math.max(0, Math.floor((parseISODate(date).getTime() - start) / (7 * DAY)))
  const nowWeek = weekOf(todayISO())
  const input = {
    sex: g.sex,
    age: ageFromBirthYear(g.birthYear),
    heightCm: g.heightCm,
    weightKg: g.startWeightKg,
    activity: g.activity,
    goals: g.goals,
    weeklyChangeKg: g.weeklyChangeKg,
    targetWeightKg: g.targetWeightKg,
  }
  const plan = computePlan(input)
  const weeks = Math.min(104, Math.max(12, nowWeek + 6))
  const points = projectWeeks(input, plan, weeks)
  // Senaste vägningen varje vecka sedan start.
  const byWeek = new Map<number, number>()
  for (const e of [...log].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date < g.startedAt) continue
    byWeek.set(weekOf(e.date), Math.round((e.kg - g.startWeightKg) * 10) / 10)
  }
  const actual = [{ week: 0, delta: 0 }, ...[...byWeek.entries()].filter(([w]) => w > 0).map(([week, delta]) => ({ week, delta }))]
  const planNow = points[Math.min(nowWeek, points.length - 1)]?.weightDelta ?? 0
  const actualNow = actual.at(-1)?.delta ?? 0
  const diff = Math.round((actualNow - planNow) * 10) / 10
  const ahead = plan.mode === "bulk" ? diff > 0 : diff < 0

  return (
    <div className="space-y-3" data-testid="goal-progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Target className="size-4 text-primary" /> Plan {plan.mode === "maintain" ? "(stabil vikt)" : formatRate(g.weeklyChangeKg)} mot verklighet
        </span>
        <Link href="/klient/profil/mal" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
          Ändra mål
        </Link>
      </div>
      <GoalProjectionChart points={points} series={chartSeries(g.goals)} actual={actual} />
      {byWeek.size > 0 && plan.mode !== "maintain" && (
        <p className="text-sm" data-testid="goal-progress-summary">
          Vecka {nowWeek}:{" "}
          {Math.abs(diff) < 0.3 ? "du följer planen." : `${Math.abs(diff).toLocaleString("sv-SE")} kg ${ahead ? "före" : "efter"} planen.`}
        </p>
      )}
      <GoalDisclaimer />
    </div>
  )
}
