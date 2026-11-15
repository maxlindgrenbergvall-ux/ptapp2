import { addDays, todayISO } from "@/lib/date"
import type { AppData, ID, ScheduledWorkout, Trainer } from "@/types/domain"

export function workoutsFor(data: AppData, clientId: ID) {
  return data.workouts.filter((w) => w.clientId === clientId)
}

export function lastCompleted(workouts: ScheduledWorkout[]) {
  return workouts
    .filter((w) => w.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

export function nextPlanned(workouts: ScheduledWorkout[], today = todayISO()) {
  return workouts
    .filter((w) => w.status !== "completed" && w.status !== "skipped" && w.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
}

/**
 * Följsamhet = genomförda / schemalagda pass under perioden (exkl. idag, så att
 * dagens ej loggade pass inte sänker siffran). `null` om inget var schemalagt.
 */
export function adherence(workouts: ScheduledWorkout[], days: number, today = todayISO()) {
  const from = addDays(today, -days)
  const due = workouts.filter((w) => w.date >= from && w.date < today)
  if (due.length === 0) return null
  return Math.round((due.filter((w) => w.status === "completed").length / due.length) * 100)
}

/**
 * Följsamhet vecka för vecka (v52): andel genomförda av schemalagda pass per
 * vecka (måndag–söndag) de senaste `weeks` veckorna, äldst först. Dagens och
 * kommande pass räknas inte (som i adherence). `pct` är null en vecka utan
 * schemalagda pass – en lucka i grafen, inte 0 %.
 */
export function adherenceByWeek(workouts: Pick<ScheduledWorkout, "date" | "status">[], weeks: number, today = todayISO()) {
  const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7
  const thisMonday = addDays(today, -dow)
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisMonday, -7 * (weeks - 1 - i))
    const end = addDays(start, 6)
    const due = workouts.filter((w) => w.date >= start && w.date <= end && w.date < today)
    const done = due.filter((w) => w.status === "completed").length
    return { start, due: due.length, done, pct: due.length ? Math.round((done / due.length) * 100) : null }
  })
}

/**
 * Övningens namn för en viss klient: PT:ns eget namn om det finns, annars
 * bibliotekets namn.
 */
export function exerciseName(data: AppData, exerciseId: ID, clientId?: ID): string {
  const alias = clientId ? data.exerciseAliases.find((a) => a.clientId === clientId && a.exerciseId === exerciseId) : undefined
  return alias?.name ?? data.exercises.find((e) => e.id === exerciseId)?.name ?? "Okänd övning"
}

/** Klientens aktiva (och pausade) PT:er, huvud-PT:n först. En klient kan ha flera PT:er. */
export function myTrainers(data: AppData, clientId: ID): Trainer[] {
  const primary = data.clients.find((c) => c.id === clientId)?.trainerId
  return data.relationships
    .filter((r) => r.clientId === clientId && (r.status === "active" || r.status === "paused"))
    .sort((a, b) => Number(b.trainerId === primary) - Number(a.trainerId === primary))
    .map((r) => data.trainers.find((t) => t.id === r.trainerId))
    .filter((t): t is Trainer => Boolean(t))
}

export function relationshipWith(data: AppData, clientId: ID, trainerId: ID) {
  return data.relationships.find((r) => r.clientId === clientId && r.trainerId === trainerId)
}

/** Kostschemat som gäller för klienten (högst ett), och övriga förslag. */
export function nutritionPlansFor(data: AppData, clientId: ID) {
  const active = new Set(myTrainers(data, clientId).map((t) => t.id))
  const plans = data.nutritionPlans.filter((p) => p.clientId === clientId && active.has(p.trainerId))
  return { current: plans.find((p) => p.active !== false), all: plans }
}
