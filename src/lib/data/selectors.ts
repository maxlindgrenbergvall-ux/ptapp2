import { addDays, todayISO } from "@/lib/date"
import type { AppData, ID, ScheduledWorkout } from "@/types/domain"

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
