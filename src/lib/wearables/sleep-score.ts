import type { SleepStages } from "@/types/domain"

/**
 * Beräknad sömnpoäng 0–100 när leverantören inte lämnar ut sin egen.
 * (Fitbits "Sleep Score" finns i appen men inte i det publika Web API:t.)
 *
 * Viktning, löst efter samma idé som Fitbit: längd 50 %, återhämtning
 * (djupsömn + REM) 25 %, och hur ostörd sömnen var 25 %.
 */
export function estimateSleepScore(hours: number, stages?: SleepStages): number {
  const duration = Math.min(1, hours / 8) * 50
  if (!stages) return Math.round(duration / 0.5)
  const asleep = stages.deep + stages.light + stages.rem
  const total = asleep + stages.awake
  if (total <= 0) return 0
  const restorative = Math.min(1, (stages.deep + stages.rem) / asleep / 0.45) * 25
  const efficiency = Math.max(0, Math.min(1, (asleep / total - 0.75) / 0.2)) * 25
  return Math.round(Math.max(0, Math.min(100, duration + restorative + efficiency)))
}
