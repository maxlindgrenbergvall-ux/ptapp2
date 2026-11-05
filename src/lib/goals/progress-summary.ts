/**
 * Framsteg (v40): de två korten högst upp – Viktnedgång (eller Tappat fett) och
 * Ökad muskelmassa. Samma källa som grafen under: den dynamiska kurvan
 * (src/lib/goals/adaptive.ts), som räknas om med vägningar, kaloriförbränning
 * (Apple Hälsa / Health Connect / Strava) och träningsfrekvens.
 *
 *   Viktnedgång     – faktiska vägningar: förändring sedan start och kvar till målvikten.
 *                     Visas när målet är viktnedgång eller inga mål är valda.
 *   Tappat fett     – för övriga mål (t.ex. muskler, rekomp): beräknad fettförändring
 *                     enligt kurvan fram till idag.
 *   Ökad muskelmassa – beräknad muskeltillväxt enligt kurvan fram till idag, skalad
 *                     med faktisk träningsfrekvens (pass/vecka).
 *
 * Ren TypeScript – enhetstestad i e2e/progress-summary.unit.ts.
 */
import type { AdaptiveResult } from "@/lib/goals/adaptive"
import type { GoalProfile, WeightEntry } from "@/types/domain"

export interface SummaryCard {
  title: string
  /** Det stora talet, t.ex. "−3,2 kg". */
  value: string
  detail: string
  /** 0–1 mot målet, när det finns ett. */
  progress?: number
  trend: "good" | "neutral" | "bad"
  /** Beräknat (modell) i stället för uppmätt. */
  estimated: boolean
}

const nf = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${nf(Math.abs(n))} kg`
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const r1 = (n: number) => Math.round(n * 10) / 10

export function progressSummary(goal: GoalProfile | undefined, weightLog: WeightEntry[], r: AdaptiveResult | null): { fat: SummaryCard; muscle: SummaryCard } {
  const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date))

  // ------------------------------------------------ utan mål: bara vägningar ---
  if (!goal || !r) {
    const first = sorted[0]
    const last = sorted.at(-1)
    const delta = first && last ? r1(last.kg - first.kg) : null
    return {
      fat: {
        title: "Viktnedgång",
        value: delta === null ? "–" : signed(delta),
        detail: delta === null ? "Logga din vikt för att följa kurvan" : `Sedan första vägningen (${nf(first!.kg)} kg)`,
        trend: delta === null ? "neutral" : delta < 0 ? "good" : delta > 0 ? "bad" : "neutral",
        estimated: false,
      },
      muscle: { title: "Ökad muskelmassa", value: "–", detail: "Välj mål för att se beräknad muskeltillväxt", trend: "neutral", estimated: true },
    }
  }

  // Kurvans läge idag (planen fram till ankaret, den uppdaterade prognosen därefter).
  const now = r.adaptive.find((p) => p.week === r.nowWeek) ?? r.planned[Math.min(r.nowWeek, r.planned.length - 1)]
  const lean = r1(now.leanDelta)
  const fatDelta = r1(now.fatDelta)
  const freq = r.basis === "plan" ? "enligt planen" : `${nf(r.sessionsPerWeek)} pass/vecka`

  const weighIns = sorted.filter((e) => e.date >= goal.startedAt)
  const current = weighIns.at(-1)?.kg ?? goal.currentWeightKg
  const weightDelta = r1(current - goal.startWeightKg)
  const target = goal.targetWeightKg
  const losing = goal.goals.includes("weight_loss") || goal.goals.length === 0

  const fat: SummaryCard = losing
    ? {
        title: "Viktnedgång",
        value: signed(weightDelta),
        detail:
          target !== undefined && target < goal.startWeightKg
            ? current <= target
              ? `Målvikten ${nf(target)} kg är nådd!`
              : `${nf(current - target)} kg kvar till ${nf(target)} kg`
            : `Sedan start (${nf(goal.startWeightKg)} kg)`,
        progress: target !== undefined && target < goal.startWeightKg ? clamp01((goal.startWeightKg - current) / (goal.startWeightKg - target)) : undefined,
        trend: weightDelta < 0 ? "good" : weightDelta > 0 ? "bad" : "neutral",
        estimated: false,
      }
    : {
        title: "Tappat fett",
        value: signed(fatDelta),
        detail: `Beräknat sedan start · vikt ${signed(weightDelta)}`,
        trend: fatDelta < 0 ? "good" : fatDelta > 0 ? "bad" : "neutral",
        estimated: true,
      }

  const muscle: SummaryCard = {
    title: "Ökad muskelmassa",
    value: signed(lean),
    detail: `Beräknat sedan start · ${freq}`,
    trend: lean > 0 ? "good" : "neutral",
    estimated: true,
  }
  return { fat, muscle }
}
