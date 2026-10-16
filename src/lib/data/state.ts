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
  AppNotification,
  AvailabilityRule,
  CalendarEvent,
  EventParty,
  EventStatus,
  TrainerOffer,
  FoodEntry,
  FoodProduct,
  SleepLog,
  WearableConnection,
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
  | { type: "addEvent"; event: CalendarEvent }
  | { type: "updateEvent"; eventId: ID; patch: EventPatch }
  | { type: "setEventStatus"; eventId: ID; status: EventStatus; cancelledBy?: ID }
  /** Flytta ett preliminärt pass (dra-och-släpp eller "föreslå ny tid"). `by` = den som flyttar. */
  | { type: "rescheduleEvent"; eventId: ID; start: string; end: string; by: EventParty }
  | { type: "markNotificationsRead"; ids: ID[]; readAt: string }
  | { type: "saveOffer"; offer: TrainerOffer }
  | { type: "deleteOffer"; offerId: ID }
  | { type: "deleteEvent"; eventId: ID }
  | { type: "saveAvailabilityRule"; rule: AvailabilityRule }
  | { type: "deleteAvailabilityRule"; ruleId: ID }
  | { type: "setClientStatus"; clientId: ID; status: ClientStatus; startedAt?: ISODate }
  | { type: "updateTrainerProfile"; trainerId: ID; patch: TrainerProfilePatch }
  | { type: "addFoodEntry"; entry: FoodEntry }
  | { type: "deleteFoodEntry"; id: ID }
  | { type: "setWater"; clientId: ID; date: ISODate; ml: number }
  | { type: "upsertSleep"; log: SleepLog }
  | { type: "setExerciseAlias"; trainerId: ID; clientId: ID; exerciseId: ID; name: string | null }
  | { type: "upsertCustomFood"; product: FoodProduct }

/** Fält PT:n kan ändra på en händelse (klient, PT och typ är låsta). */
export type EventPatch = Partial<Pick<CalendarEvent, "title" | "start" | "end" | "mode" | "location" | "notes" | "workoutId">>

export type TrainerProfilePatch = Partial<
  Pick<
    Trainer,
    | "city"
    | "specialties"
    | "bio"
    | "yearsExperience"
    | "pricePerSession"
    | "coachingMode"
    | "avatarUrl"
    | "certifications"
    | "minNoticeMinutes"
    | "isPublished"
  >
>

/** Ändringar som kommer utifrån (laddning, realtid) och aldrig skickas tillbaka. */
export type LocalAction =
  | { type: "hydrate"; data: AppData }
  | { type: "remoteWorkout"; workout: Omit<ScheduledWorkout, "logs"> }
  | { type: "remoteEvent"; event: CalendarEvent }
  | { type: "addNotification"; notification: AppNotification }
  | { type: "setWearables"; connections: WearableConnection[] }
  | { type: "mergeSleepLogs"; logs: SleepLog[] }

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

    case "addEvent":
      if (data.events.some((e) => e.id === action.event.id)) return data
      return { ...data, events: [...data.events, action.event] }

    case "remoteEvent":
      return { ...data, events: upsertBy(data.events, action.event, (e) => e.id === action.event.id) }

    case "updateEvent":
      return {
        ...data,
        events: data.events.map((e) => {
          if (e.id !== action.eventId) return e
          const moved = (action.patch.start ?? e.start) !== e.start || (action.patch.end ?? e.end) !== e.end
          // Samma regel som databasen: en flytt sparar den tidigare tiden.
          return { ...e, ...action.patch, ...(moved ? { previousStart: e.start, previousEnd: e.end } : {}) }
        }),
      }

    case "rescheduleEvent":
      return {
        ...data,
        events: data.events.map((e) =>
          e.id === action.eventId && e.status === "pending"
            ? {
                ...e,
                start: action.start,
                end: action.end,
                previousStart: e.start,
                previousEnd: e.end,
                // Den som flyttar lämnar över till motparten.
                awaiting: action.by === "trainer" ? "client" : "trainer",
              }
            : e
        ),
      }

    case "setEventStatus":
      return {
        ...data,
        events: data.events.map((e) =>
          e.id === action.eventId
            ? {
                ...e,
                status: action.status,
                cancelledBy: action.status === "cancelled" ? action.cancelledBy : e.cancelledBy,
                awaiting: action.status === "pending" ? e.awaiting : undefined,
              }
            : e
        ),
      }

    case "addNotification":
      return {
        ...data,
        notifications: upsertBy(data.notifications, action.notification, (n) => n.id === action.notification.id),
      }

    case "markNotificationsRead": {
      const ids = new Set(action.ids)
      return {
        ...data,
        notifications: data.notifications.map((n) => (ids.has(n.id) && !n.readAt ? { ...n, readAt: action.readAt } : n)),
      }
    }

    case "saveOffer":
      return { ...data, offers: upsertBy(data.offers, action.offer, (o) => o.id === action.offer.id) }

    case "deleteOffer":
      return { ...data, offers: data.offers.filter((o) => o.id !== action.offerId) }

    case "deleteEvent":
      return { ...data, events: data.events.filter((e) => e.id !== action.eventId) }

    case "saveAvailabilityRule":
      return { ...data, availabilityRules: upsertBy(data.availabilityRules, action.rule, (r) => r.id === action.rule.id) }

    case "deleteAvailabilityRule":
      return { ...data, availabilityRules: data.availabilityRules.filter((r) => r.id !== action.ruleId) }

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

    case "addFoodEntry":
      return { ...data, foodEntries: upsertBy(data.foodEntries, action.entry, (e) => e.id === action.entry.id) }

    case "deleteFoodEntry":
      return { ...data, foodEntries: data.foodEntries.filter((e) => e.id !== action.id) }

    case "setWater": {
      const { clientId, date, ml } = action
      return {
        ...data,
        waterLogs: upsertBy(data.waterLogs, { clientId, date, ml }, (w) => w.clientId === clientId && w.date === date),
      }
    }

    case "upsertSleep":
      return {
        ...data,
        sleepLogs: upsertBy(
          data.sleepLogs,
          action.log,
          (l) => l.clientId === action.log.clientId && l.date === action.log.date
        ),
      }

    case "mergeSleepLogs":
      return {
        ...data,
        sleepLogs: action.logs.reduce(
          (list, log) => upsertBy(list, log, (l) => l.clientId === log.clientId && l.date === log.date),
          data.sleepLogs
        ),
      }

    case "setExerciseAlias": {
      const { clientId, exerciseId, name } = action
      const rest = data.exerciseAliases.filter((a) => !(a.clientId === clientId && a.exerciseId === exerciseId))
      return { ...data, exerciseAliases: name ? [...rest, { clientId, exerciseId, name }] : rest }
    }

    case "upsertCustomFood":
      return { ...data, customFoods: upsertBy(data.customFoods, action.product, (p) => p.id === action.product.id) }

    case "setWearables":
      return { ...data, wearables: action.connections }
  }
}

/** Spelar upp köade ändringar ovanpå (ny)laddad data. */
export function replay(data: AppData, actions: PersistableAction[]): AppData {
  return actions.reduce<AppData>((d, a) => reducer(d, a) ?? d, data)
}

/**
 * Uppgraderar data som sparats lokalt av en äldre version (demodata och
 * offlinecache) till dagens format. Saknade listor blir tomma och nya fält får
 * standardvärden, så att en uppdatering av appen aldrig kraschar på gammal data.
 */
export function normalizeAppData(raw: unknown): AppData | null {
  if (!raw || typeof raw !== "object") return null
  const d = raw as Partial<AppData> & Record<string, unknown>
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  if (!Array.isArray(d.clients) || !Array.isArray(d.workouts)) return null

  type OldTrainer = Trainer & { offersRemote?: boolean; availability?: string[] }
  const oldTrainers = list<OldTrainer>(d.trainers)

  return {
    trainers: oldTrainers.map(({ offersRemote, availability: _old, ...t }) => {
      void _old
      return {
        ...t,
        // v1 hade bara "erbjuder distans" (ja/nej).
        coachingMode: t.coachingMode ?? (offersRemote ? "both" : "onsite"),
        certifications: Array.isArray(t.certifications) ? t.certifications : [],
        reviews: list(t.reviews),
        specialties: list(t.specialties),
        isPublished: t.isPublished ?? true,
      }
    }),
    clients: list(d.clients),
    exercises: list(d.exercises),
    templates: list(d.templates),
    workouts: list(d.workouts),
    nutritionPlans: list(d.nutritionPlans),
    mealChecks: list(d.mealChecks),
    messages: list(d.messages),
    // v1–v3: bookings + enstaka lediga tider → kalenderhändelser + datumregler.
    // v4: preliminära pass saknar awaiting → den som skapade passet väntar på motparten.
    events: (Array.isArray(d.events) ? list<CalendarEvent>(d.events) : list<OldBooking>(d.bookings).map(bookingToEvent)).map((e) =>
      e.status === "pending" && !e.awaiting ? { ...e, awaiting: e.createdBy && e.createdBy === e.trainerId ? "client" : "trainer" } : e
    ),
    availabilityRules: Array.isArray(d.availabilityRules)
      ? list<AvailabilityRule>(d.availabilityRules)
      : oldTrainers.flatMap((t) => list<string>(t.availability).map((slot) => slotToRule(t.id, slot))),
    foodEntries: list(d.foodEntries),
    waterLogs: list(d.waterLogs),
    sleepLogs: list(d.sleepLogs),
    wearables: list(d.wearables),
    exerciseAliases: list(d.exerciseAliases),
    customFoods: list(d.customFoods),
    notifications: list(d.notifications),
    offers: list(d.offers),
  }
}

interface OldBooking {
  id: ID
  trainerId: ID
  clientId: ID
  slot: string
  status: "requested" | "confirmed" | "cancelled"
  note?: string
}

function bookingToEvent(b: OldBooking): CalendarEvent {
  return {
    id: b.id,
    trainerId: b.trainerId,
    clientId: b.clientId,
    kind: "session",
    status: b.status === "requested" ? "pending" : b.status,
    title: "PT-pass",
    start: b.slot,
    end: new Date(new Date(b.slot).getTime() + 60 * 60_000).toISOString(),
    mode: "onsite",
    notes: b.note,
    createdBy: b.clientId,
  }
}

function slotToRule(trainerId: ID, slot: string): AvailabilityRule {
  const d = new Date(slot)
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const start = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const end = `${pad(Math.min(23, d.getHours() + 1))}:${pad(d.getMinutes())}`
  return { id: `rule-${trainerId}-${slot}`, trainerId, date, start, end, slotMinutes: 60 }
}
