/**
 * Regler för när ett pass får markeras som genomfört/klarmarkeras – samma som
 * databasen (workout_has_started, workout_missing_weights i v14-migrationen):
 *
 * 1. Tidsspärr: passet kan inte markeras som genomfört innan det har ägt rum –
 *    passdagen måste ha kommit och ett kopplat kalenderpass måste ha börjat.
 *    Klienten kan ändå se passet och logga set i förväg.
 * 2. Vikter: PT:n kan inte klarmarkera förrän minst ett set är genomfört och
 *    alla genomförda set i viktövningar (skivstång, hantlar, maskin …) har en vikt.
 */
import { todayISO } from "@/lib/date"
import type { AppData, Exercise, ScheduledWorkout, WorkoutExercise, WorkoutSection } from "@/types/domain"

/** Utrustning som innebär att vikten ska anges (samma mönster som i databasen). */
export const WEIGHTED_EQUIPMENT = /(skivstång|hantl|hantel|kettlebell|kabel|släde|trap bar|sandsäck|^maskin)/i

export const usesWeights = (exercise: Exercise | undefined) => Boolean(exercise && WEIGHTED_EQUIPMENT.test(exercise.equipment))

/** Starttid för passets kopplade (ej avbokade) kalenderpass, om det finns ett. */
export function linkedEventStart(data: AppData, workout: ScheduledWorkout): string | undefined {
  return data.events
    .filter((e) => (e.workoutId === workout.id || e.id === workout.eventId) && e.status !== "cancelled")
    .map((e) => e.start)
    .sort()[0]
}

/** Har passets tid inträffat? Passdagen har kommit och kopplat kalenderpass har börjat. */
export function hasWorkoutStarted(data: AppData, workout: ScheduledWorkout, now: Date = new Date()): boolean {
  if (workout.date > todayISO()) return false
  const start = linkedEventStart(data, workout)
  return !start || new Date(start).getTime() <= now.getTime()
}

/** Text för när passet kan markeras som genomfört. */
export function startsAtLabel(data: AppData, workout: ScheduledWorkout): string {
  const start = linkedEventStart(data, workout)
  if (start) {
    const d = new Date(start)
    return `${d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })} kl. ${d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`
  }
  return new Date(`${workout.date}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })
}

/** Övningar där genomförda set saknar vikt (bara viktövningar). */
export function exercisesMissingWeights(data: AppData, workout: ScheduledWorkout): WorkoutExercise[] {
  return workout.exercises.filter(
    (e) =>
      usesWeights(data.exercises.find((x) => x.id === e.exerciseId)) &&
      workout.logs.some((l) => l.workoutExerciseId === e.id && l.done && !(l.kg > 0))
  )
}

/** Felmeddelande om passet inte kan klarmarkeras ännu, annars null. */
export function verifyBlocker(data: AppData, workout: ScheduledWorkout): string | null {
  if (!hasWorkoutStarted(data, workout)) return `Passet kan klarmarkeras först när det har ägt rum (${startsAtLabel(data, workout)}).`
  if (!workout.logs.some((l) => l.done)) return "Bocka av minst ett genomfört set innan passet klarmarkeras."
  if (exercisesMissingWeights(data, workout).length) return "Fyll i vilka vikter som användes i alla genomförda set innan passet klarmarkeras."
  return null
}

/** Felmeddelande om passet inte kan markeras som genomfört ännu, annars null. */
export function completeBlocker(data: AppData, workout: ScheduledWorkout): string | null {
  return hasWorkoutStarted(data, workout) ? null : `Passet kan markeras som genomfört först när det har ägt rum (${startsAtLabel(data, workout)}).`
}

// ---------------------------------------------------------- passdelar ---

export const WORKOUT_SECTIONS: WorkoutSection[] = ["warmup", "main", "cooldown"]
export const SECTION_LABEL: Record<WorkoutSection, string> = { warmup: "Uppvärmning", main: "Huvudpass", cooldown: "Nedvarvning" }
export const sectionOf = (e: WorkoutExercise): WorkoutSection => e.section ?? "main"

/** Övningarna i ordningen uppvärmning → huvudpass → nedvarvning (stabil inom varje del). */
export const sortBySection = <T extends WorkoutExercise>(exercises: T[]): T[] =>
  WORKOUT_SECTIONS.flatMap((s) => exercises.filter((e) => sectionOf(e) === s))

/** Grupperat per del – tomma delar utelämnas. Rubriker visas bara om passet har fler delar än huvudpass. */
export function groupBySection<T extends WorkoutExercise>(exercises: T[]): { section: WorkoutSection; label: string; exercises: T[] }[] {
  return WORKOUT_SECTIONS.map((section) => ({ section, label: SECTION_LABEL[section], exercises: exercises.filter((e) => sectionOf(e) === section) })).filter(
    (g) => g.exercises.length > 0
  )
}
