/**
 * Appens tillstånd och alla ändringar som "actions".
 *
 * Varje action är serialiserbar och fullständigt bestämd (id:n och tidpunkter
 * skapas INNAN den skickas). Samma action kan därför
 *  1. appliceras direkt i UI:t (optimistiskt),
 *  2. läggas i offlinekön och skickas till Supabase senare, och
 *  3. spelas upp igen ovanpå nyladdad data efter en omstart.
 */
import type {
  AppData,
  Booking,
  BookingStatus,
  ClientStatus,
  ID,
  ISODate,
  Message,
  NutritionPlan,
  ScheduledWorkout,
  SetLog,
  Trainer,
  WeightEntry,
  WorkoutStatus,
  WorkoutTemplate,
} from "@/types/domain"

/** Ändringar som användaren gör och som ska sparas i backend. */
export type PersistableAction =
  | { type: "upsertSetLog"; workoutId: ID; log: SetLog }
  | { type: "setWorkoutStatus"; workoutId: ID; status: WorkoutStatus; comment?: string; completedAt?: string }
  | { type: "addWorkout"; workout: ScheduledWorkout }
  | { type: "upsertTemplate"; template: WorkoutTemplate }
  | { type: "deleteTemplate"; templateId: ID }
  | { type: "upsertNutritionPlan"; plan: NutritionPlan }
  | { type: "setMealCheck"; clientId: ID; date: ISODate; mealId: ID; checked: boolean }
  | { type: "addMessage"; message: Message }
  | { type: "markThreadRead"; threadId: ID; readerId: ID; readAt: string }
  | { type: "addWeight"; clientId: ID; entry: WeightEntry }
  | { type: "requestCoaching"; trainerId: ID; clientId: ID; goal: string }
  | { type: "addBooking"; booking: Booking }
  | { type: "setBookingStatus"; bookingId: ID; status: BookingStatus }
  | { type: "setClientStatus"; clientId: ID; status: ClientStatus; startedAt?: ISODate }
  | { type: "updateTrainerProfile"; trainerId: ID; patch: TrainerProfilePatch }
  | { type: "addAvailability"; trainerId: ID; slot: string }
  | { type: "removeAvailability"; trainerId: ID; slot: string }

export type TrainerProfilePatch = Partial<
  Pick<Trainer, "city" | "specialties" | "bio" | "yearsExperience" | "pricePerSession" | "offersRemote" | "isPublished">
>

/** Ändringar som kommer utifrån (laddning, realtid) och aldrig skickas tillbaka. */
export type LocalAction =
  | { type: "hydrate"; data: AppData }
  | { type: "remoteWorkout"; workout: Omit<ScheduledWorkout, "logs"> }
  | { type: "remoteBooking"; booking: Booking }

export type Action = PersistableAction | LocalAction

function mapWorkout(data: AppData, id: ID, fn: (w: ScheduledWorkout) => ScheduledWorkout): AppData {
  return { ...data, workouts: data.workouts.map((w) => (w.id === id ? fn(w) : w)) }
}

function upsertBy<T>(list: T[], item: T, same: (a: T) => boolean): T[] {
  return list.some(same) ? list.map((x) => (same(x) ? item : x)) : [...list, item]
}

export function reducer(data: AppData | null, action: Action): AppData | null {
  if (action.type === "hydrate") return action.data
  if (!data) return data

  switch (action.type) {
    case "upsertSetLog":
      return mapWorkout(data, action.workoutId, (w) => ({
        ...w,
        logs: upsertBy(
          w.logs,
          action.log,
          (l) => l.workoutExerciseId === action.log.workoutExerciseId && l.setIndex === action.log.setIndex
        ),
      }))

    case "setWorkoutStatus":
      return mapWorkout(data, action.workoutId, (w) => ({
        ...w,
        status: action.status,
        clientComment: action.comment ?? w.clientComment,
        completedAt: action.status === "completed" ? action.completedAt : undefined,
      }))

    case "addWorkout":
      if (data.workouts.some((w) => w.id === action.workout.id)) return data
      return { ...data, workouts: [...data.workouts, action.workout] }

    case "remoteWorkout": {
      const existing = data.workouts.find((w) => w.id === action.workout.id)
      const workout: ScheduledWorkout = { ...action.workout, logs: existing?.logs ?? [] }
      return { ...data, workouts: upsertBy(data.workouts, workout, (w) => w.id === workout.id) }
    }

    case "upsertTemplate":
      return { ...data, templates: upsertBy(data.templates, action.template, (t) => t.id === action.template.id) }

    case "deleteTemplate":
      return { ...data, templates: data.templates.filter((t) => t.id !== action.templateId) }

    case "upsertNutritionPlan":
      // En aktiv kostplan per klient.
      return {
        ...data,
        nutritionPlans: [...data.nutritionPlans.filter((p) => p.clientId !== action.plan.clientId), action.plan],
      }

    case "setMealCheck": {
      const { clientId, date, mealId, checked } = action
      const rest = data.mealChecks.filter((m) => !(m.clientId === clientId && m.date === date && m.mealId === mealId))
      return { ...data, mealChecks: checked ? [...rest, { clientId, date, mealId }] : rest }
    }

    case "addMessage":
      if (data.messages.some((m) => m.id === action.message.id)) {
        // Realtidseko eller uppdatering (t.ex. read_at) – ersätt.
        return { ...data, messages: data.messages.map((m) => (m.id === action.message.id ? action.message : m)) }
      }
      return { ...data, messages: [...data.messages, action.message] }

    case "markThreadRead": {
      let changed = false
      const messages = data.messages.map((m) => {
        if (m.threadId === action.threadId && m.senderId !== action.readerId && !m.readAt) {
          changed = true
          return { ...m, readAt: action.readAt }
        }
        return m
      })
      return changed ? { ...data, messages } : data
    }

    case "addWeight":
      return {
        ...data,
        clients: data.clients.map((c) =>
          c.id === action.clientId
            ? {
                ...c,
                // Ett värde per dag – en ny vägning samma dag ersätter den gamla.
                weightLog: [...c.weightLog.filter((e) => e.date !== action.entry.date), action.entry].sort((a, b) =>
                  a.date.localeCompare(b.date)
                ),
              }
            : c
        ),
      }

    case "requestCoaching":
      return {
        ...data,
        clients: data.clients.map((c) =>
          c.id === action.clientId && !c.trainerId
            ? { ...c, trainerId: action.trainerId, status: "pending", goal: action.goal || c.goal }
            : c
        ),
      }

    case "addBooking":
      if (data.bookings.some((b) => b.id === action.booking.id)) return data
      return {
        ...data,
        bookings: [...data.bookings, action.booking],
        // Tiden är inte längre ledig (databasen gör samma sak med en trigger).
        trainers: data.trainers.map((t) =>
          t.id === action.booking.trainerId
            ? { ...t, availability: t.availability.filter((s) => s !== action.booking.slot) }
            : t
        ),
      }

    case "remoteBooking":
      return { ...data, bookings: upsertBy(data.bookings, action.booking, (b) => b.id === action.booking.id) }

    case "setBookingStatus":
      return {
        ...data,
        bookings: data.bookings.map((b) => (b.id === action.bookingId ? { ...b, status: action.status } : b)),
      }

    case "setClientStatus":
      return {
        ...data,
        clients: data.clients.map((c) =>
          c.id === action.clientId
            ? { ...c, status: action.status, startDate: action.startedAt ?? c.startDate }
            : c
        ),
      }

    case "updateTrainerProfile":
      return {
        ...data,
        trainers: data.trainers.map((t) => (t.id === action.trainerId ? { ...t, ...action.patch } : t)),
      }

    case "addAvailability":
      return {
        ...data,
        trainers: data.trainers.map((t) =>
          t.id === action.trainerId && !t.availability.includes(action.slot)
            ? { ...t, availability: [...t.availability, action.slot].sort() }
            : t
        ),
      }

    case "removeAvailability":
      return {
        ...data,
        trainers: data.trainers.map((t) =>
          t.id === action.trainerId ? { ...t, availability: t.availability.filter((s) => s !== action.slot) } : t
        ),
      }
  }
}

/** Spelar upp köade ändringar ovanpå (ny)laddad data. */
export function replay(data: AppData, actions: PersistableAction[]): AppData {
  return actions.reduce<AppData>((d, a) => reducer(d, a) ?? d, data)
}
