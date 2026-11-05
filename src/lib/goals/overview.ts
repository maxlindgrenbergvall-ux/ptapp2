/**
 * Framsteg (v35): ett kort per valt mål med det mått som betyder något för just
 * det målet – i stället för de gamla intresse-mätpunkterna.
 *
 *   Viktnedgång       vikt sedan start, kvar till målvikten (förlopp)
 *   Ökad muskelmassa  viktökning sedan start, pass per vecka
 *   Bodybuilding      pass per vecka, avbockade set senaste 7 dagarna
 *   Body recomposition vikt sedan start + tyngsta set i baslyften (faktisk vikt)
 *   Styrka            utvecklingen i tyngsta set i bästa baslyftet sedan start
 *   Kondition         aktiva minuter senaste 7 dagarna (mål 150), förbränning
 *   Hälsa             aktiva minuter senaste 7 dagarna (WHO: 150 min/vecka), pass
 *
 * Ren TypeScript – enhetstestad i e2e/goal-overview.unit.ts.
 */
import { daySummary, dedupeActivities } from "@/lib/activity/summary"
import { addDays } from "@/lib/date"
import { GOAL_INFO, GOAL_KEYS } from "@/lib/goals/metabolism"
import { topSetSeries } from "@/lib/training"
import type { ActivityDay, ActivityLog, GoalKey, GoalProfile, ISODate, ScheduledWorkout, WeightEntry } from "@/types/domain"

export interface GoalCard {
  key: GoalKey
  label: string
  /** Det stora talet, t.ex. "−3,2 kg" eller "2,5 pass/v". */
  value: string
  /** Förklaring under talet. */
  detail: string
  /** 0–1 när målet har ett tydligt slut (målvikt, 150 min/vecka). */
  progress?: number
  /** Går det åt rätt håll? (färgen på talet) */
  trend: "good" | "neutral" | "bad"
}

const LIFTS: { id: string; name: string }[] = [
  { id: "e-squat", name: "Knäböj" },
  { id: "e-bench", name: "Bänkpress" },
  { id: "e-deadlift", name: "Marklyft" },
]
/** WHO: minst 150 minuters måttlig aktivitet per vecka. */
export const ACTIVE_MINUTES_GOAL = 150

const nf = (n: number, d = 1) => n.toLocaleString("sv-SE", { maximumFractionDigits: d, minimumFractionDigits: 0 })
const signed = (n: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${nf(Math.abs(n))} ${unit}`
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export interface GoalOverviewInput {
  goal: GoalProfile
  weightLog: WeightEntry[]
  workouts: ScheduledWorkout[]
  activities: ActivityLog[]
  activityDays: ActivityDay[]
  today: ISODate
}

export function goalCards({ goal: g, weightLog, workouts, activities, activityDays, today }: GoalOverviewInput): GoalCard[] {
  const weighIns = weightLog.filter((e) => e.date >= g.startedAt && e.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const now = weighIns.at(-1)?.kg ?? g.currentWeightKg
  const delta = Math.round((now - g.startWeightKg) * 10) / 10

  const mine = workouts.filter((w) => w.clientId === g.clientId && w.status === "completed" && w.date <= today)
  const since28 = addDays(today, -27)
  const since7 = addDays(today, -6)
  const synced28 = dedupeActivities(activities.filter((a) => a.clientId === g.clientId && a.date >= since28 && a.date <= today))
  const sessionsPerWeek = (mine.filter((w) => w.date >= since28).length + synced28.length) / 4
  const sets7 = mine.filter((w) => w.date >= since7).reduce((s, w) => s + w.logs.filter((l) => l.done).length, 0)
  const week = Array.from({ length: 7 }, (_, i) => daySummary(activities, activityDays, g.clientId, addDays(today, -i)))
  const activeMinutes = week.reduce((s, d) => s + d.activeMinutes, 0)
  const activeKcal = week.reduce((s, d) => s + d.activeKcal, 0)
  const sessions7 = mine.filter((w) => w.date >= since7).length

  // Bästa förändringen i ett baslyft sedan målets start – tyngsta set (vikt × reps), inga uppskattningar.
  const lift = LIFTS.map((l) => {
    const series = topSetSeries(l.id, mine)
    const before = [...series].reverse().find((p) => p.date < g.startedAt) ?? series.find((p) => p.date >= g.startedAt)
    const last = series.at(-1)
    return before && last && last.date >= g.startedAt ? { ...l, from: before, to: last } : null
  })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.to.kg - b.from.kg - (a.to.kg - a.from.kg))[0]
  const set = (x: { kg: number; reps: number }) => `${nf(x.kg)} kg × ${x.reps}`
  const liftText = lift ? `${lift.name}: ${set(lift.from)} → ${set(lift.to)}` : "Logga baslyft (knäböj, bänk, marklyft) för att se styrkan"
  /** Förändring i tyngsta setets vikt (kg) sedan start. */
  const liftKg = lift ? Math.round((lift.to.kg - lift.from.kg) * 10) / 10 : null
  const freq = `${nf(sessionsPerWeek)} pass/vecka senaste 4 veckorna`

  const card = (key: GoalKey): GoalCard => {
    const label = GOAL_INFO[key].label
    switch (key) {
      case "weight_loss": {
        const target = g.targetWeightKg
        const total = target !== undefined ? g.startWeightKg - target : 0
        return {
          key,
          label,
          value: signed(delta, "kg"),
          detail:
            target !== undefined
              ? now <= target
                ? `Målvikten ${nf(target)} kg är nådd!`
                : `${nf(Math.max(0, now - target))} kg kvar till ${nf(target)} kg`
              : `Sedan start (${nf(g.startWeightKg)} kg)`,
          progress: target !== undefined && total > 0 ? clamp01((g.startWeightKg - now) / total) : undefined,
          trend: delta < 0 ? "good" : delta > 0 ? "bad" : "neutral",
        }
      }
      case "muscle_gain": {
        const target = g.targetWeightKg
        const total = target !== undefined ? target - g.startWeightKg : 0
        return {
          key,
          label,
          value: signed(delta, "kg"),
          detail: `Sedan start · ${freq}`,
          progress: target !== undefined && total > 0 ? clamp01((now - g.startWeightKg) / total) : undefined,
          trend: delta > 0 ? "good" : delta < 0 ? "bad" : "neutral",
        }
      }
      case "bodybuilding":
        return {
          key,
          label,
          value: `${nf(sessionsPerWeek)} pass/v`,
          detail: `${sets7} avbockade set senaste 7 dagarna`,
          trend: sessionsPerWeek >= 3 ? "good" : "neutral",
        }
      case "recomp":
        return {
          key,
          label,
          value: liftKg !== null ? `${signed(liftKg, "kg")} i ${lift!.name.toLowerCase()}` : signed(delta, "kg"),
          detail: liftKg !== null ? `${liftText} · kroppsvikt ${signed(delta, "kg")}` : `Kroppsvikt sedan start · ${liftText}`,
          trend: (liftKg ?? 0) > 0 ? "good" : "neutral",
        }
      case "strength":
        return {
          key,
          label,
          value: liftKg !== null ? signed(liftKg, "kg") : "–",
          detail: liftText,
          trend: (liftKg ?? 0) > 0 ? "good" : (liftKg ?? 0) < 0 ? "bad" : "neutral",
        }
      case "endurance":
        return {
          key,
          label,
          value: `${nf(activeMinutes, 0)} min`,
          detail: `Aktiv tid senaste 7 dagarna · ${nf(activeKcal, 0)} kcal förbränt`,
          progress: clamp01(activeMinutes / ACTIVE_MINUTES_GOAL),
          trend: activeMinutes >= ACTIVE_MINUTES_GOAL ? "good" : "neutral",
        }
      case "health":
        return {
          key,
          label,
          value: `${nf(activeMinutes, 0)} / ${ACTIVE_MINUTES_GOAL} min`,
          detail: `Aktiv tid senaste 7 dagarna (rekommendation: 150 min) · ${sessions7} pass`,
          progress: clamp01(activeMinutes / ACTIVE_MINUTES_GOAL),
          trend: activeMinutes >= ACTIVE_MINUTES_GOAL ? "good" : "neutral",
        }
    }
  }
  return GOAL_KEYS.filter((k) => g.goals.includes(k)).map(card)
}
