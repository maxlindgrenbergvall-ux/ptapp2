/**
 * Aktivt träningsschema (v43) – en split som roterar, utan datum.
 *
 * Klienten väljer en split och hur många dagar per vecka hen vill träna
 * (t.ex. 3, 4 eller 5). Inga veckodagar, inget startdatum och inget antal
 * veckor: passen ligger i ordning och "Nästa pass" startar den dag som står
 * på tur.
 *
 *   nextSplitAction  vad "Nästa pass" ska göra: öppna passet som redan är
 *                    påbörjat (startat men inte klart), annars skapa nästa dag.
 *   advanceSplit     schemat efter att ett nytt pass startats (nästa dag på tur).
 *   weekProgress     genomförda pass denna vecka (mån–sön) mot målet dagar/vecka.
 *
 * Ren TypeScript – enhetstestad i e2e/active-split.unit.ts.
 */
import { addDays, parseISODate } from "@/lib/date"
import type { ActiveSplit, ID, ISODate, ScheduledWorkout } from "@/types/domain"

export const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6] as const
export const MIN_DAYS_PER_WEEK = 1
export const MAX_DAYS_PER_WEEK = 7

/** Föreslaget antal dagar per vecka för en split (lika många som splitens dagar, 3–5). */
export const suggestedDaysPerWeek = (splitDays: number) => Math.min(5, Math.max(3, splitDays))

/** Dagarna som har övningar (tomma dagar hoppas över i rotationen). */
export const trainableDays = (s: Pick<ActiveSplit, "days">) => s.days.map((d, i) => ({ ...d, index: i })).filter((d) => d.exercises.length > 0)

/** Dagen som står på tur (index i split.days), eller null om schemat saknar övningar. */
export function nextDayIndex(s: Pick<ActiveSplit, "days" | "nextDay">): number | null {
  const days = trainableDays(s)
  if (!days.length) return null
  // Första dag med övningar från och med nextDay (runt till början).
  const n = s.days.length
  for (let k = 0; k < n; k++) {
    const i = (((s.nextDay ?? 0) % n) + n + k) % n
    if (s.days[i].exercises.length) return i
  }
  return days[0].index
}

export type NextSplitAction =
  | { kind: "open"; workoutId: ID; dayIndex: number }
  | { kind: "create"; dayIndex: number; name: string }
  | { kind: "none" }

/** Påbörjat (startat men inte klart eller hoppat över) pass från schemat? */
const unfinished = (w: ScheduledWorkout | undefined) => !!w && (w.status === "planned" || w.status === "in_progress")

export function nextSplitAction(s: ActiveSplit | undefined, workouts: ScheduledWorkout[]): NextSplitAction {
  if (!s) return { kind: "none" }
  const current = s.currentWorkoutId ? workouts.find((w) => w.id === s.currentWorkoutId) : undefined
  if (current && unfinished(current)) return { kind: "open", workoutId: current.id, dayIndex: Math.max(0, (s.nextDay - 1 + s.days.length) % s.days.length) }
  const i = nextDayIndex(s)
  if (i === null) return { kind: "none" }
  return { kind: "create", dayIndex: i, name: `${s.short || s.name}: ${s.days[i].name}` }
}

/** Schemat efter att dag `dayIndex` startats: den blir aktuellt pass och nästa dag står på tur. */
export function advanceSplit(s: ActiveSplit, dayIndex: number, workoutId: ID, at: string): ActiveSplit {
  return { ...s, nextDay: (dayIndex + 1) % s.days.length, currentWorkoutId: workoutId, updatedAt: at }
}

/** Måndagen i veckan för ett datum. */
export const weekStart = (date: ISODate) => addDays(date, -((parseISODate(date).getDay() + 6) % 7))

/** Genomförda pass denna vecka (mån–sön) mot målet dagar/vecka. */
export function weekProgress(s: Pick<ActiveSplit, "daysPerWeek" | "clientId">, workouts: ScheduledWorkout[], today: ISODate) {
  const from = weekStart(today)
  const to = addDays(from, 6)
  const done = workouts.filter((w) => w.clientId === s.clientId && w.status === "completed" && w.date >= from && w.date <= to).length
  return { done, goal: s.daysPerWeek, reached: done >= s.daysPerWeek }
}
