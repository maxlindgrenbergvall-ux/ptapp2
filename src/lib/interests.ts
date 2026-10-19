/**
 * Intressen/träningsområden och mätpunkterna de ger i "Framsteg".
 *
 * Klienten väljer intressen i välkomststeget eller i profilen. Varje intresse
 * har en lista med mätpunkter: antingen räknade ur befintlig data (vikt,
 * uppskattat 1RM ur passloggen) eller loggade för hand (tid på milen, watt …).
 * Mätpunkternas nycklar sparas i progress_entries.metric.
 *
 * Nytt intresse = en rad i INTERESTS. Ingen databasändring behövs.
 */
import type { AppData, ID, ScheduledWorkout } from "@/types/domain"
import { oneRepMaxSeries } from "@/lib/training"

export type MetricFormat = "time" | "number"

export interface MetricDef {
  key: string
  label: string
  /** Enhet för tal ("kg", "W", "km", "slag/min" …). Tider visas som m:ss eller h:mm:ss. */
  unit?: string
  format: MetricFormat
  /** Är ett lägre värde bättre (tider, vilopuls)? */
  lowerIsBetter?: boolean
  /** Räknas fram ur appens data i stället för att loggas. */
  auto?: (data: AppData, clientId: ID) => { date: string; value: number }[]
  hint?: string
}

export interface InterestDef {
  key: string
  label: string
  emoji: string
  metrics: MetricDef[]
}

const e1rm = (exerciseId: string) => (data: AppData, clientId: ID) =>
  oneRepMaxSeries(exerciseId, data.workouts.filter((w: ScheduledWorkout) => w.clientId === clientId)).map((p) => ({ date: p.date, value: p.e1rm }))

const weight = (data: AppData, clientId: ID) => (data.clients.find((c) => c.id === clientId)?.weightLog ?? []).map((w) => ({ date: w.date, value: w.kg }))

export const INTERESTS: InterestDef[] = [
  {
    key: "styrkelyft",
    label: "Styrkelyft",
    emoji: "🏋️",
    metrics: [
      { key: "e1rm_squat", label: "Knäböj, uppsk. 1RM", unit: "kg", format: "number", auto: e1rm("e-squat") },
      { key: "e1rm_bench", label: "Bänkpress, uppsk. 1RM", unit: "kg", format: "number", auto: e1rm("e-bench") },
      { key: "e1rm_deadlift", label: "Marklyft, uppsk. 1RM", unit: "kg", format: "number", auto: e1rm("e-deadlift") },
    ],
  },
  {
    key: "cykling",
    label: "Cykling",
    emoji: "🚴",
    metrics: [
      { key: "cykling_10km", label: "Bästa tid på milen", format: "time", lowerIsBetter: true, hint: "10 km, t.ex. 18:30" },
      { key: "cykling_watt", label: "Snitt-watt (20 min)", unit: "W", format: "number" },
      { key: "cykling_ftp", label: "FTP", unit: "W", format: "number" },
      { key: "cykling_langsta", label: "Längsta tur", unit: "km", format: "number" },
    ],
  },
  {
    key: "lopning",
    label: "Löpning",
    emoji: "🏃",
    metrics: [
      { key: "lopning_5km", label: "Bästa tid 5 km", format: "time", lowerIsBetter: true, hint: "t.ex. 24:10" },
      { key: "lopning_10km", label: "Bästa tid på milen", format: "time", lowerIsBetter: true, hint: "t.ex. 52:00" },
      { key: "lopning_vecka", label: "Distans per vecka", unit: "km", format: "number" },
    ],
  },
  {
    key: "hyrox",
    label: "Hyrox",
    emoji: "🔥",
    metrics: [
      { key: "hyrox_total", label: "Hyrox-tid", format: "time", lowerIsBetter: true, hint: "t.ex. 1:24:30" },
      { key: "hyrox_ski", label: "SkiErg 1 000 m", format: "time", lowerIsBetter: true },
      { key: "hyrox_wallballs", label: "Wall balls i rad", unit: "st", format: "number" },
    ],
  },
  {
    key: "viktminskning",
    label: "Viktminskning",
    emoji: "⚖️",
    metrics: [
      { key: "vikt", label: "Vikt", unit: "kg", format: "number", lowerIsBetter: true, auto: weight },
      { key: "midja", label: "Midjemått", unit: "cm", format: "number", lowerIsBetter: true },
    ],
  },
  {
    key: "bodybuilding",
    label: "Bodybuilding",
    emoji: "💪",
    metrics: [
      { key: "vikt_bygg", label: "Kroppsvikt", unit: "kg", format: "number", auto: weight },
      { key: "arm", label: "Armomfång", unit: "cm", format: "number" },
      { key: "brost", label: "Bröstomfång", unit: "cm", format: "number" },
    ],
  },
  {
    key: "kondition",
    label: "Kondition",
    emoji: "❤️",
    metrics: [
      { key: "vilopuls", label: "Vilopuls", unit: "slag/min", format: "number", lowerIsBetter: true },
      { key: "vo2max", label: "VO₂max", unit: "ml/kg/min", format: "number" },
    ],
  },
  {
    key: "simning",
    label: "Simning",
    emoji: "🏊",
    metrics: [{ key: "simning_100m", label: "Bästa tid 100 m", format: "time", lowerIsBetter: true }],
  },
  {
    key: "kalisthenics",
    label: "Kalisthenics",
    emoji: "🤸",
    metrics: [
      { key: "chins", label: "Chins i rad", unit: "st", format: "number" },
      { key: "plank", label: "Planka", format: "time" },
    ],
  },
  {
    key: "rehab",
    label: "Rehab",
    emoji: "🩹",
    metrics: [{ key: "smarta", label: "Smärta (0–10)", format: "number", lowerIsBetter: true }],
  },
  { key: "rorlighet", label: "Rörlighet", emoji: "🧘", metrics: [{ key: "framatfallning", label: "Framåtfällning", unit: "cm", format: "number" }] },
]

export const interestByKey = (key: string) => INTERESTS.find((i) => i.key === key)

/** Mätpunkterna för en klients intressen (utan dubbletter). */
export function metricsFor(interests: string[] | undefined): { interest: InterestDef; metric: MetricDef }[] {
  const seen = new Set<string>()
  return (interests ?? []).flatMap((k) => {
    const interest = interestByKey(k)
    if (!interest) return []
    return interest.metrics.filter((m) => !seen.has(m.key) && seen.add(m.key)).map((metric) => ({ interest, metric }))
  })
}

/** Värden för en mätpunkt, äldst först: räknade eller loggade. */
export function metricSeries(data: AppData, clientId: ID, metric: MetricDef) {
  const series = metric.auto
    ? metric.auto(data, clientId)
    : data.progressEntries.filter((e) => e.clientId === clientId && e.metric === metric.key).map((e) => ({ date: e.date, value: e.value }))
  return [...series].sort((a, b) => a.date.localeCompare(b.date))
}

export function bestOf(series: { value: number }[], lowerIsBetter?: boolean) {
  if (!series.length) return undefined
  return series.reduce((best, p) => (lowerIsBetter ? (p.value < best ? p.value : best) : p.value > best ? p.value : best), series[0].value)
}

/** 1110 → "18:30"; 5070 → "1:24:30". */
export function formatSeconds(total: number) {
  const s = Math.round(total)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}

/** "18:30" → 1110, "1:24:30" → 5070, "95" → 95. Undefined om det inte går att läsa. */
export function parseTime(text: string): number | undefined {
  const parts = text.trim().replace(",", ".").split(":")
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return undefined
  return parts.reduce((sum, p) => sum * 60 + Number(p), 0)
}

export function formatMetric(metric: MetricDef, value: number) {
  if (metric.format === "time") return formatSeconds(value)
  const n = value.toLocaleString("sv-SE", { maximumFractionDigits: 1 })
  return metric.unit ? `${n} ${metric.unit}` : n
}
