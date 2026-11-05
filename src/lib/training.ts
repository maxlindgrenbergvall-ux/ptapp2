import { addDays, parseISODate } from "@/lib/date"
import { targetRepsFor, hasSetReps } from "@/lib/exercises/draft"
import { nextTarget, setPlan } from "@/lib/progression"
import { sectionOf } from "@/lib/workout-rules"
import type { Exercise, ISODate, MuscleGroup, ScheduledWorkout, SetLog, WeightEntry, WorkoutExercise } from "@/types/domain"

/**
 * Tyngsta setet (v39): högst vikt – vid lika vikt flest reps. All statistik
 * bygger på faktiska lyft (vikt × reps) – inget räknas fram eller uppskattas.
 */
export function heavierSet<T extends { kg: number; reps: number }>(a: T, b: T): T {
  return b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a
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
 * Ingen automatisk stegring mellan seten (v34) – ordning:
 *   1. föregående avbockade set i samma pass (vikten klienten själv valt följer med),
 *   2. dagens mål från progressionen (samma för alla set, src/lib/progression.ts),
 *   3. samma set förra gången övningen kördes (passhistoriken),
 *   4. PT:ns mål.
 * PT:ns eget rep-mål per set (12/10/8 …) gäller alltid för reps.
 */
export function suggestSet(
  exercise: WorkoutExercise,
  setIndex: number,
  logs: SetLog[],
  history: ScheduledWorkout[],
  info?: { equipment?: string; muscleGroup?: MuscleGroup }
): { kg: number; reps: number } {
  const ownTarget = hasSetReps(exercise) ? parseTargetReps(targetRepsFor(exercise, setIndex)) : 0
  const withTarget = (s: { kg: number; reps: number }) => (ownTarget ? { kg: s.kg, reps: ownTarget } : s)

  const previousSet = findLog(logs, exercise.id, setIndex - 1)
  if (previousSet?.done) return withTarget({ kg: previousSet.kg, reps: previousSet.reps })

  const target = nextTarget(exercise, history, info)
  if (target) return setPlan(exercise, target)[Math.min(setIndex, Math.max(0, exercise.sets - 1))] ?? withTarget(target)

  const last = lastSessionSets(exercise.exerciseId, history)
  if (last?.length) return withTarget(last[Math.min(setIndex, last.length - 1)])

  return { kg: exercise.targetKg ?? 0, reps: parseTargetReps(targetRepsFor(exercise, setIndex)) }
}

/**
 * Seten (vikt × reps, i ordning) senaste gången övningen kördes – för
 * "Som förra passet" och som förslag när progressionen saknar mål.
 */
export function lastSessionSets(exerciseId: string, history: ScheduledWorkout[]): { kg: number; reps: number }[] | null {
  const done = history.filter((w) => w.status === "completed").sort((a, b) => b.date.localeCompare(a.date))
  for (const w of done) {
    const entryIds = new Set(w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id))
    const sets = w.logs.filter((l) => l.done && entryIds.has(l.workoutExerciseId)).sort((a, b) => a.setIndex - b.setIndex)
    if (sets.length) return sets.map((l) => ({ kg: l.kg, reps: l.reps }))
  }
  return null
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

/** Tyngsta setet per pass för en övning, i datumordning (för styrkegrafen). */
export function topSetSeries(exerciseId: string, workouts: ScheduledWorkout[]): { date: string; kg: number; reps: number }[] {
  return workouts
    .filter((w) => w.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((w) => {
      const entryIds = new Set(w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id))
      const sets = w.logs.filter((l) => l.done && entryIds.has(l.workoutExerciseId) && l.kg > 0)
      if (!sets.length) return []
      const top = sets.reduce(heavierSet)
      return [{ date: w.date, kg: top.kg, reps: top.reps }]
    })
}

export interface ExerciseSession {
  workoutId: string
  workoutName: string
  date: string
  sets: SetLog[]
  /** Tyngsta setet (högst vikt, vid lika vikt flest reps). */
  topSet: { kg: number; reps: number } | null
  volume: number
  /** Personbästa: tyngre än allt tidigare (eller samma vikt med fler reps). */
  isPR: boolean
}

/** Alla genomförda tillfällen för en övning, nyast först. */
export function exerciseHistory(exerciseId: string, workouts: ScheduledWorkout[]): ExerciseSession[] {
  let best: { kg: number; reps: number } | null = null
  const chronological = workouts
    .filter((w) => w.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((w): ExerciseSession[] => {
      const ids = new Set(w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id))
      if (ids.size === 0) return []
      const sets = w.logs.filter((l) => l.done && ids.has(l.workoutExerciseId)).sort((a, b) => a.setIndex - b.setIndex)
      if (sets.length === 0) return []
      const top = sets.reduce(heavierSet)
      const isPR = Boolean(best && top.kg > 0 && heavierSet(best, top) === top && (top.kg !== best.kg || top.reps !== best.reps))
      if (top.kg > 0 || top.reps > 0) best = best ? heavierSet(best, top) : { kg: top.kg, reps: top.reps }
      return [
        {
          workoutId: w.id,
          workoutName: w.name,
          date: w.date,
          sets,
          topSet: top.kg || top.reps ? { kg: top.kg, reps: top.reps } : null,
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
  /** Senaste passets tyngsta set. */
  latest: { kg: number; reps: number }
  date: ISODate
  /** Tyngsta setet senaste 4 veckorna (annars senaste kända). */
  best: { kg: number; reps: number }
  /** Förändring i tyngsta vikt mot 4–8 veckor tidigare (kg), om det finns. */
  change: number | null
  sessions: number
}

/**
 * Lyften med faktiska siffror (v39): senaste tyngsta set, bästa set senaste
 * 4 veckorna och utvecklingen i vikt mot perioden innan. Sorterat på tyngsta vikt.
 */
export function liftKpis(workouts: ScheduledWorkout[], today: ISODate): LiftKpi[] {
  const recentFrom = addDays(today, -28)
  const previousFrom = addDays(today, -56)
  type Lift = { kg: number; reps: number }
  const acc = new Map<string, { recent: Lift | null; previous: number; latest: Lift; latestDate: ISODate; sessions: Set<string> }>()
  for (const w of workouts) {
    if (w.status !== "completed" || w.date > today) continue
    for (const { exercise, log } of effectiveSets(w)) {
      if (log.kg <= 0) continue
      const set = { kg: log.kg, reps: log.reps }
      const b = acc.get(exercise.exerciseId) ?? { recent: null, previous: 0, latest: set, latestDate: "", sessions: new Set<string>() }
      b.sessions.add(w.id)
      if (w.date >= recentFrom) b.recent = b.recent ? heavierSet(b.recent, set) : set
      else if (w.date >= previousFrom) b.previous = Math.max(b.previous, log.kg)
      if (w.date > b.latestDate) Object.assign(b, { latest: set, latestDate: w.date })
      else if (w.date === b.latestDate) b.latest = heavierSet(b.latest, set)
      acc.set(exercise.exerciseId, b)
    }
  }
  return [...acc.entries()]
    .map(([exerciseId, b]) => ({
      exerciseId,
      latest: b.latest,
      date: b.latestDate,
      best: b.recent ?? b.latest,
      change: b.recent && b.previous ? Math.round((b.recent.kg - b.previous) * 10) / 10 : null,
      sessions: b.sessions.size,
    }))
    .sort((a, b) => b.best.kg - a.best.kg)
}
