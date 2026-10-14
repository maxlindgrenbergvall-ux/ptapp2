import type { ScheduledWorkout, SetLog, WorkoutExercise } from "@/types/domain"

/** Epley-formeln för uppskattat 1RM. Över ~12 reps blir den opålitlig, så vi kapar. */
export function estimateOneRepMax(kg: number, reps: number): number {
  if (reps <= 0 || kg <= 0) return 0
  if (reps === 1) return kg
  return Math.round(kg * (1 + Math.min(reps, 12) / 30) * 10) / 10
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
  const previousSet = findLog(logs, exercise.id, setIndex - 1)
  if (previousSet?.done) return { kg: previousSet.kg, reps: previousSet.reps }

  const last = lastPerformance(exercise.exerciseId, history)
  if (last) return { kg: last.kg, reps: last.reps }

  return { kg: exercise.targetKg ?? 0, reps: parseTargetReps(exercise.reps) }
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
