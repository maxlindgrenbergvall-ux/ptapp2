/**
 * Egna övningar (custom_exercises, v19): klienter och PT:er lägger till
 * övningar som saknas i övningsbanken, med startvikt (kg eller lbs), set och reps.
 */
import type { Exercise, MuscleGroup, WeightUnit, WorkoutExercise } from "@/types/domain"

export interface CustomExerciseInput {
  name: string
  /** Startvikt / standardvikt i `weightUnit` (tom = kroppsvikt eller okänd). */
  defaultWeight?: number
  weightUnit: WeightUnit
  defaultSets: number
  defaultReps: string
  muscleGroup?: MuscleGroup
}

const KG_PER_LB = 0.45359237

/** Passen loggas i kg: lbs räknas om och avrundas till närmaste 0,5 kg. */
export function toKg(weight: number | undefined, unit: WeightUnit) {
  if (weight === undefined) return undefined
  return unit === "lbs" ? Math.round(weight * KG_PER_LB * 2) / 2 : weight
}

/** "20 kg", "45 lbs (20,5 kg)" eller "Ingen startvikt". */
export function formatDefaultWeight(e: Exercise) {
  const c = e.custom
  if (!c || c.defaultWeight === undefined) return "Ingen startvikt"
  const n = (v: number) => v.toLocaleString("sv-SE", { maximumFractionDigits: 2 })
  return c.weightUnit === "lbs" ? `${n(c.defaultWeight)} lbs (${n(toKg(c.defaultWeight, "lbs")!)} kg)` : `${n(c.defaultWeight)} kg`
}

/** Övningen som rad i ett pass, med den egna övningens förslag (set, reps och startvikt). */
export function workoutExerciseFor(e: Exercise, id: string): WorkoutExercise {
  const c = e.custom
  return {
    id,
    exerciseId: e.id,
    sets: c?.defaultSets ?? 3,
    reps: c?.defaultReps ?? "10",
    restSec: 90,
    targetKg: c ? toKg(c.defaultWeight, c.weightUnit) : undefined,
  }
}
