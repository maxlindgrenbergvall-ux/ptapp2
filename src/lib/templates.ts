/**
 * Passmallar (v29): spara ett pass som återanvändbar mall och läs in en mall
 * i ett nytt pass. Samma logik för PT:n (passbyggaren, kontroll av klientens
 * pass) och klienten (eget pass, genomfört pass).
 */
import type { AppData, ID, ScheduledWorkout, WorkoutExercise, WorkoutTemplate } from "@/types/domain"

export const TEMPLATE_NAME_MAX = 80
/** Samma gräns som databasen (workout_templates_exercises_check). */
export const TEMPLATE_MAX_EXERCISES = 60

/** Mallarna som tillhör den inloggade (PT:ns egna eller klientens egna). */
export function myTemplates(data: Pick<AppData, "templates">, ownerId: ID): WorkoutTemplate[] {
  return data.templates.filter((t) => t.trainerId === ownerId)
}

/** Finns redan en mall med samma namn (skiftlägesokänsligt)? Då erbjuds "Ersätt". */
export function templateNamed(templates: WorkoutTemplate[], name: string): WorkoutTemplate | undefined {
  const key = name.trim().toLocaleLowerCase("sv")
  return templates.find((t) => t.name.trim().toLocaleLowerCase("sv") === key)
}

/**
 * Övningarna i ett genomfört (eller planerat) pass som mallövningar.
 * Vikten som faktiskt lyftes blir mallens startvikt (tyngsta avbockade
 * setet), så nästa pass börjar där det förra slutade.
 */
export function exercisesFromWorkout(workout: Pick<ScheduledWorkout, "exercises" | "logs">, newId: () => ID): WorkoutExercise[] {
  return workout.exercises.slice(0, TEMPLATE_MAX_EXERCISES).map((e) => {
    const lifted = workout.logs.filter((l) => l.workoutExerciseId === e.id && l.done && l.kg > 0).map((l) => l.kg)
    const targetKg = lifted.length ? Math.max(...lifted) : e.targetKg
    const { id: _old, ...rest } = e
    void _old
    return { ...rest, id: newId(), ...(targetKg !== undefined ? { targetKg } : {}) }
  })
}

/** Mallens övningar med nya id:n – för ett nytt pass eller en ny mall. */
export function copyExercises(exercises: WorkoutExercise[], newId: () => ID): WorkoutExercise[] {
  return exercises.map((e) => ({ ...e, id: newId() }))
}

/** Gör en mall av namn + övningar. `replace` = befintlig mall med samma namn som skrivs över. */
export function buildTemplate(input: {
  ownerId: ID
  name: string
  description?: string
  exercises: WorkoutExercise[]
  newId: () => ID
  replace?: WorkoutTemplate
}): WorkoutTemplate {
  return {
    id: input.replace?.id ?? input.newId(),
    trainerId: input.ownerId,
    name: input.name.trim().slice(0, TEMPLATE_NAME_MAX),
    description: input.description ?? input.replace?.description ?? "",
    exercises: input.exercises.slice(0, TEMPLATE_MAX_EXERCISES),
  }
}
