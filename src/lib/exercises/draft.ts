/**
 * Övningar under redigering (passbyggaren, eget pass, redigering i efterhand).
 * Sifferfälten får vara tomma medan man skriver – inget hoppar tillbaka till
 * ett standardvärde – och valideras först när passet sparas.
 */
import type { WorkoutExercise } from "@/types/domain"

export type ExerciseDraft = Omit<WorkoutExercise, "sets" | "restSec"> & {
  /** undefined = tomt fält. */
  sets?: number
  restSec?: number
}

export const MAX_SETS = 20
export const MAX_REST_SEC = 900

/** Rep-målet för ett visst set: setReps[i] om det finns, annars övningens reps. */
export function targetRepsFor(exercise: Pick<WorkoutExercise, "reps" | "setReps">, setIndex: number): string {
  return exercise.setReps?.[setIndex]?.trim() || exercise.reps
}

/** Har övningen olika rep-mål för olika set? */
export const hasSetReps = (exercise: Pick<WorkoutExercise, "reps" | "setReps">) =>
  Boolean(exercise.setReps?.some((r) => r.trim() && r.trim() !== exercise.reps.trim()))

/** "12/10/8" när seten har olika mål, annars övningens reps. */
export function repsLabel(exercise: Pick<WorkoutExercise, "reps" | "setReps" | "sets">): string {
  if (!hasSetReps(exercise)) return exercise.reps
  return Array.from({ length: exercise.sets }, (_, i) => targetRepsFor(exercise, i)).join("/")
}

/** Anpassa rep-målen när antalet set ändras (nya set får övningens reps). */
export function resizeSetReps(setReps: string[] | undefined, sets: number | undefined): string[] | undefined {
  if (!setReps) return undefined
  const n = Math.max(0, Math.min(MAX_SETS, sets ?? setReps.length))
  return Array.from({ length: n }, (_, i) => setReps[i] ?? "")
}

/**
 * Kontrollera att alla fält är ifyllda och gör om utkasten till riktiga
 * övningar. Returnerar ett felmeddelande som nämner övningen.
 */
export function finalizeExercises(
  items: ExerciseDraft[],
  nameOf: (exerciseId: string) => string
): { exercises: WorkoutExercise[] } | { error: string } {
  const exercises: WorkoutExercise[] = []
  for (const [i, item] of items.entries()) {
    const label = `${i + 1}. ${nameOf(item.exerciseId)}`
    if (item.sets === undefined || !Number.isInteger(item.sets) || item.sets < 1 || item.sets > MAX_SETS) {
      return { error: `Fyll i antal set (1–${MAX_SETS}) för ${label}` }
    }
    if (!item.reps.trim()) return { error: `Fyll i reps för ${label}` }
    if (item.restSec === undefined || item.restSec < 0 || item.restSec > MAX_REST_SEC) {
      return { error: `Fyll i vilotid (0–${MAX_REST_SEC} s) för ${label}` }
    }
    const setReps = resizeSetReps(item.setReps, item.sets)?.map((r) => r.trim().slice(0, 20))
    exercises.push({
      ...item,
      sets: item.sets,
      restSec: Math.round(item.restSec),
      reps: item.reps.trim().slice(0, 20),
      // Inga egna mål (eller alla samma som reps) = ta bort fältet.
      setReps: setReps && hasSetReps({ reps: item.reps, setReps }) ? setReps : undefined,
    })
  }
  return { exercises }
}

/** Flytta ett element ett steg upp (-1) eller ned (+1). */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta
  if (to < 0 || to >= items.length) return items
  const next = items.slice()
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}
