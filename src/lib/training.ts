import { addDays, parseISODate } from "@/lib/date"
import { targetRepsFor, hasSetReps } from "@/lib/exercises/draft"
import { sectionOf } from "@/lib/workout-rules"
import type { Exercise, ISODate, MuscleGroup, ScheduledWorkout, SetLog, WeightEntry, WorkoutExercise } from "@/types/domain"

/** Över 12 reps säger setet för lite om maxstyrkan – formlerna blir opålitliga. */
export const E1RM_MAX_REPS = 12

/**
 * Uppskattat 1RM (e1RM) från ett set. Brzycki (vikt × 36 / (37 − reps)) är
 * träffsäkrast upp till 10 reps; för 11–12 reps används Epley
 * (vikt × (1 + reps/30)). Fler reps än 12 räknas som 12.
 */
export function estimateOneRepMax(kg: number, reps: number): number {
  if (reps <= 0 || kg <= 0) return 0
  if (reps === 1) return kg
  const r = Math.min(reps, E1RM_MAX_REPS)
  const e1rm = r <= 10 ? (kg * 36) / (37 - r) : kg * (1 + r / 30)
  return Math.round(e1rm * 10) / 10
}

/** Första talet i ett reps-fält ("8–10" → 8, "AMRAP" → 0). */
export function parseTargetReps(reps: string): number {
  const match = reps.match(/\d+/)
  return match ? Number(match[0]) : 0
}

export function setsDone(workout: ScheduledWorkout): number {
  return workout.logs.filter((l) => l.done).length
}

export function setsTotal(workout: ScheduledWorkout): number {
  return workout.exercises.reduce((sum, e) => sum + e.sets, 0)
}

export function workoutVolume(workout: ScheduledWorkout): number {
  return workout.logs.filter((l) => l.done).reduce((sum, l) => sum + l.kg * l.reps, 0)
}

export function findLog(
  logs: SetLog[],
  workoutExerciseId: string,
  setIndex: number
): SetLog | undefined {
  return logs.find((l) => l.workoutExerciseId === workoutExerciseId && l.setIndex === setIndex)
}

/**
 * Förslag för ett set som inte loggats ännu, så att klienten bara behöver bocka av.
 * Ordning: föregående set i samma pass → senaste gången övningen gjordes → PT:ns mål.
 */
export function suggestSet(
  exercise: WorkoutExercise,
  setIndex: number,
  logs: SetLog[],
  history: ScheduledWorkout[]
): { kg: number; reps: number } {
  // Eget rep-mål för setet (pyramid, drop-set …) går före tidigare reps.
  const ownTarget = hasSetReps(exercise) ? parseTargetReps(targetRepsFor(exercise, setIndex)) : 0
  const withTarget = (s: { kg: number; reps: number }) => (ownTarget ? { kg: s.kg, reps: ownTarget } : s)

  const previousSet = findLog(logs, exercise.id, setIndex - 1)
  if (previousSet?.done) return withTarget({ kg: previousSet.kg, reps: previousSet.reps })

  const last = lastPerformance(exercise.exerciseId, history)
  if (last) return withTarget({ kg: last.kg, reps: last.reps })

  return { kg: exercise.targetKg ?? 0, reps: parseTargetReps(targetRepsFor(exercise, setIndex)) }
}

/** Tyngsta genomförda set för en övning i det senaste passet där den ingick. */
export function lastPerformance(
  exerciseId: string,
  history: ScheduledWorkout[]
): { kg: number; reps: number; date: string } | null {
  const done = history
    .filter((w) => w.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date))
  for (const w of done) {
    const entryIds = new Set(w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id))
    const sets = w.logs.filter((l) => l.done && entryIds.has(l.workoutExerciseId))
    if (sets.length) {
      const best = sets.reduce((a, b) => (b.kg > a.kg ? b : a))
      return { kg: best.kg, reps: best.reps, date: w.date }
    }
  }
  return null
}

/** Bästa uppskattade 1RM per pass för en övning, i datumordning (för styrkegrafen). */
export function oneRepMaxSeries(
  exerciseId: string,
  workouts: ScheduledWorkout[]
): { date: string; e1rm: number }[] {
  return workouts
    .filter((w) => w.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((w) => {
      const entryIds = new Set(
        w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id)
      )
      const best = w.logs
        .filter((l) => l.done && entryIds.has(l.workoutExerciseId))
        .reduce((max, l) => Math.max(max, estimateOneRepMax(l.kg, l.reps)), 0)
      return best > 0 ? [{ date: w.date, e1rm: best }] : []
    })
}

export interface ExerciseSession {
  workoutId: string
  workoutName: string
  date: string
  sets: SetLog[]
  topSet: { kg: number; reps: number } | null
  e1rm: number
  volume: number
  /** Nytt personbästa (uppskattat 1RM) jämfört med alla tidigare tillfällen. */
  isPR: boolean
}

/** Alla genomförda tillfällen för en övning, nyast först. */
export function exerciseHistory(exerciseId: string, workouts: ScheduledWorkout[]): ExerciseSession[] {
  let best = 0
  const chronological = workouts
    .filter((w) => w.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((w): ExerciseSession[] => {
      const ids = new Set(w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id))
      if (ids.size === 0) return []
      const sets = w.logs.filter((l) => l.done && ids.has(l.workoutExerciseId)).sort((a, b) => a.setIndex - b.setIndex)
      if (sets.length === 0) return []
      const top = sets.reduce((a, b) => (estimateOneRepMax(b.kg, b.reps) > estimateOneRepMax(a.kg, a.reps) ? b : a))
      const e1rm = estimateOneRepMax(top.kg, top.reps)
      const isPR = e1rm > best && best > 0
      best = Math.max(best, e1rm)
      return [
        {
          workoutId: w.id,
          workoutName: w.name,
          date: w.date,
          sets,
          topSet: top.kg || top.reps ? { kg: top.kg, reps: top.reps } : null,
          e1rm,
          volume: sets.reduce((s, l) => s + l.kg * l.reps, 0),
          isPR,
        },
      ]
    })
  return chronological.reverse()
}

// ------------------------------------------------------------------ KPI:er ---

/** Kroppsvikten som gällde ett visst datum (senaste vägningen före eller samma dag). */
export function bodyweightOn(log: WeightEntry[], date: ISODate): number | null {
  let best: WeightEntry | null = null
  for (const e of log) if (e.date <= date && (!best || e.date > best.date)) best = e
  return best?.kg ?? log.slice().sort((a, b) => a.date.localeCompare(b.date))[0]?.kg ?? null
}

/** Relativ styrka: e1RM delat med kroppsvikten (t.ex. 1,5 × kroppsvikten). */
export function relativeStrength(e1rm: number, bodyweightKg: number | null): number | null {
  if (!bodyweightKg || bodyweightKg <= 0 || e1rm <= 0) return null
  return Math.round((e1rm / bodyweightKg) * 100) / 100
}

/**
 * Effektiva set: genomförda arbetsset i huvudpasset (inte uppvärmning eller
 * nedvarvning) med minst en rep. Konditionsövningar räknas inte.
 */
function effectiveSets(w: ScheduledWorkout): { exercise: WorkoutExercise; log: SetLog }[] {
  const byId = new Map(w.exercises.map((e) => [e.id, e]))
  return w.logs.flatMap((log) => {
    const exercise = byId.get(log.workoutExerciseId)
    return exercise && log.done && log.reps > 0 && sectionOf(exercise) === "main" ? [{ exercise, log }] : []
  })
}

export type MuscleSets = Partial<Record<MuscleGroup, number>>

/**
 * Effektiva set per muskelgrupp i rullande 7-dagarsperioder, de senaste
 * `weeks` perioderna (äldst först). Sista perioden = de senaste 7 dagarna
 * t.o.m. idag – så att siffran aldrig nollställs en måndag.
 */
export function weeklySetsByMuscle(
  workouts: ScheduledWorkout[],
  exercises: Exercise[],
  today: ISODate,
  weeks = 8
): { week: ISODate; sets: MuscleSets; total: number }[] {
  const group = new Map(exercises.map((e) => [e.id, e.muscleGroup]))
  const first = addDays(today, -7 * weeks + 1)
  const rows = Array.from({ length: weeks }, (_, i) => ({ week: addDays(first, 7 * i), sets: {} as MuscleSets, total: 0 }))
  const DAY = 86_400_000
  for (const w of workouts) {
    if (w.status !== "completed" || w.date < first || w.date > today) continue
    const row = rows[Math.floor(Math.round((parseISODate(w.date).getTime() - parseISODate(first).getTime()) / DAY) / 7)]
    if (!row) continue
    for (const { exercise } of effectiveSets(w)) {
      const g = group.get(exercise.exerciseId)
      if (!g || g === "kondition") continue
      row.sets[g] = (row.sets[g] ?? 0) + 1
      row.total += 1
    }
  }
  return rows
}

export interface LiftKpi {
  exerciseId: string
  /** Bästa e1RM senaste 4 veckorna (annars senaste kända). */
  e1rm: number
  date: ISODate
  /** Förändring mot bästa e1RM 4–8 veckor tidigare (kg), om det finns. */
  change: number | null
  /** e1RM / kroppsvikt. */
  relative: number | null
  sessions: number
}

/**
 * e1RM, utveckling och relativ styrka per lyft, sorterat på e1RM. Bara set
 * med vikt och högst 12 reps räknas (annars blir uppskattningen för osäker).
 */
export function liftKpis(workouts: ScheduledWorkout[], weightLog: WeightEntry[], today: ISODate): LiftKpi[] {
  const recentFrom = addDays(today, -28)
  const previousFrom = addDays(today, -56)
  const best = new Map<string, { recent: number; recentDate: ISODate; previous: number; latest: number; latestDate: ISODate; sessions: Set<string> }>()
  for (const w of workouts) {
    if (w.status !== "completed") continue
    for (const { exercise, log } of effectiveSets(w)) {
      if (log.kg <= 0 || log.reps > E1RM_MAX_REPS) continue
      const e1rm = estimateOneRepMax(log.kg, log.reps)
      const b = best.get(exercise.exerciseId) ?? { recent: 0, recentDate: "", previous: 0, latest: 0, latestDate: "", sessions: new Set<string>() }
      b.sessions.add(w.id)
      if (w.date >= recentFrom && e1rm > b.recent) Object.assign(b, { recent: e1rm, recentDate: w.date })
      else if (w.date >= previousFrom && w.date < recentFrom) b.previous = Math.max(b.previous, e1rm)
      if (w.date > b.latestDate || (w.date === b.latestDate && e1rm > b.latest)) Object.assign(b, { latest: e1rm, latestDate: w.date })
      best.set(exercise.exerciseId, b)
    }
  }
  return [...best.entries()]
    .map(([exerciseId, b]) => {
      const e1rm = b.recent || b.latest
      const date = b.recent ? b.recentDate : b.latestDate
      return {
        exerciseId,
        e1rm,
        date,
        change: b.recent && b.previous ? Math.round((b.recent - b.previous) * 10) / 10 : null,
        relative: relativeStrength(e1rm, bodyweightOn(weightLog, date)),
        sessions: b.sessions.size,
      }
    })
    .sort((a, b) => b.e1rm - a.e1rm)
}
