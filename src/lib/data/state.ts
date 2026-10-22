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
  CartItem,
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
  Client,
  ClientStatus,
  CoachingRelationship,
  ID,
  ISODate,
  Message,
  NutritionPlan,
  ProgressEntry,
  Purchase,
  Recipe,
  ScheduledWorkout,
  SetLog,
  Trainer,
  WeightEntry,
  WorkoutStatus,
  WorkoutTemplate,
  TrainerService,
} from "@/types/domain"
import { isFreeOffer } from "@/lib/offers/policy"

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
  | { type: "markThreadRead"; threadId: ID; readerId: ID; readAt: string; trainerId?: ID }
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
  | { type: "saveService"; service: TrainerService }
  | { type: "deleteService"; serviceId: ID }
  | { type: "saveRecipe"; recipe: Recipe }
  | { type: "deleteRecipe"; recipeId: ID }
  /** Klient: lämna en PT (relationen avslutas, kommande pass avbokas, PT:ns kostschema slutar gälla). */
  | { type: "leaveTrainer"; clientId: ID; trainerId: ID; at: string }
  /** Klient: välj vilket kostschema som gäller (null = inget). */
  | { type: "chooseNutritionPlan"; clientId: ID; planId: ID | null }
  /** Klient: namn, intressen och fokus. */
  | { type: "updateClientProfile"; clientId: ID; patch: ClientProfilePatch }
  | { type: "addProgressEntry"; entry: ProgressEntry }
  /** PT: klarmarkera ett pass efter att ha kontrollerat vad som gjordes. */
  | { type: "verifyWorkout"; workoutId: ID; verifiedAt: string; verifiedBy: ID; comment?: string }
  /** Klient: ta bort ett eget pass. */
  | { type: "deleteWorkout"; workoutId: ID }
  | { type: "deleteProgressEntry"; id: ID }
  /** Klient: lägg en tjänst i varukorgen (samma tjänst bara en gång). */
  | { type: "addCartItem"; item: CartItem }
  /** Klient: ta bort tjänster ur varukorgen. */
  | { type: "removeCartItems"; clientId: ID; serviceIds: ID[] }
  /** Klient: ändra antalet enstaka pass i varukorgen. */
  | { type: "setCartQuantity"; clientId: ID; serviceId: ID; quantity: number }

export type ClientProfilePatch = Partial<Pick<Client, "name" | "interests" | "focus" | "avatarUrl">>

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
    | "minNoticeMinutes"
    | "isPublished"
    | "offersTraining"
    | "offersNutrition"
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
  /** Köp från servern (eller demoläget). Ett betalt köp gör klienten aktiv hos PT:n, som databasen. */
  | { type: "upsertPurchases"; purchases: Purchase[]; today?: ISODate }
  /** PT: en ny klient (t.ex. efter ett köp) som inte fanns när datan laddades. */
  | { type: "addClient"; client: Client }
  /** PT Boost betald (servern eller demoläget): PT:n är utvald till och med `boostedUntil`. */
  | { type: "setTrainerBoost"; trainerId: ID; boostedUntil: string | null }
  /** Varukorgen ändrad på servern (t.ex. betald på en annan enhet). */
  | { type: "setCart"; cart: CartItem[] }

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

    case "upsertNutritionPlan": {
      // Samma regel som databasen: högst ett aktivt schema per klient. Är en annan
      // PT:s schema aktivt blir det sparade schemat ett förslag.
      const plan = action.plan
      const others = data.nutritionPlans.filter((p) => p.id !== plan.id)
      const otherActive = others.some((p) => p.clientId === plan.clientId && isActivePlan(p) && p.trainerId !== plan.trainerId)
      const active = isActivePlan(plan) && !otherActive
      return {
        ...data,
        nutritionPlans: [
          ...others
            // PT:ns tidigare scheman för klienten ersätts av det nya.
            .filter((p) => !(p.clientId === plan.clientId && p.trainerId === plan.trainerId)),
          { ...plan, active },
        ],
      }
    }

    case "chooseNutritionPlan":
      return {
        ...data,
        nutritionPlans: data.nutritionPlans.map((p) => (p.clientId === action.clientId ? { ...p, active: p.id === action.planId } : p)),
      }

    case "leaveTrainer": {
      const { clientId, trainerId } = action
      const relationships = data.relationships.map((r) =>
        r.clientId === clientId && r.trainerId === trainerId ? { ...r, status: "ended" as const } : r
      )
      const nextPrimary = relationships.find((r) => r.clientId === clientId && (r.status === "active" || r.status === "paused"))
      return {
        ...data,
        relationships,
        clients: data.clients.map((c) =>
          c.id === clientId && c.trainerId === trainerId
            ? { ...c, trainerId: nextPrimary?.trainerId ?? null, status: nextPrimary ? (nextPrimary.status as ClientStatus) : "pending" }
            : c
        ),
        events: data.events.map((e) =>
          e.clientId === clientId && e.trainerId === trainerId && e.kind === "session" && (e.status === "pending" || e.status === "confirmed") && e.start > action.at
            ? { ...e, status: "cancelled" as const, cancelledBy: clientId, awaiting: undefined }
            : e
        ),
        nutritionPlans: data.nutritionPlans.map((p) => (p.clientId === clientId && p.trainerId === trainerId ? { ...p, active: false } : p)),
      }
    }

    case "updateClientProfile":
      return { ...data, clients: data.clients.map((c) => (c.id === action.clientId ? { ...c, ...action.patch } : c)) }

    case "verifyWorkout": {
      const w = data.workouts.find((x) => x.id === action.workoutId)
      return {
        ...mapWorkout(data, action.workoutId, (x) => ({
          ...x,
          status: "completed",
          completedAt: x.completedAt ?? action.verifiedAt,
          verifiedAt: action.verifiedAt,
          verifiedBy: action.verifiedBy,
          trainerComment: action.comment,
        })),
        // Kopplade kalenderpass markeras också som genomförda.
        events: data.events.map((e) =>
          w && (e.workoutId === w.id || e.id === w.eventId) && (e.status === "confirmed" || e.status === "pending") ? { ...e, status: "completed" as const, awaiting: undefined } : e
        ),
      }
    }

    case "deleteWorkout":
      return { ...data, workouts: data.workouts.filter((w) => w.id !== action.workoutId) }

    case "addProgressEntry":
      return { ...data, progressEntries: upsertBy(data.progressEntries, action.entry, (e) => e.id === action.entry.id) }

    case "deleteProgressEntry":
      return { ...data, progressEntries: data.progressEntries.filter((e) => e.id !== action.id) }

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
        if (
          m.threadId === action.threadId &&
          (!action.trainerId || m.trainerId === action.trainerId) &&
          m.senderId !== action.readerId &&
          !m.readAt
        ) {
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
        relationships: data.relationships.some((r) => r.clientId === action.clientId && r.trainerId === action.trainerId)
          ? data.relationships
          : [...data.relationships, { trainerId: action.trainerId, clientId: action.clientId, status: "pending", goal: action.goal, startDate: "" }],
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
        relationships: data.relationships.map((r) =>
          r.clientId === action.clientId && (r.trainerId === data.clients.find((c) => c.id === action.clientId)?.trainerId)
            ? { ...r, status: action.status, startDate: action.startedAt ?? r.startDate }
            : r
        ),
        clients: data.clients.map((c) =>
          c.id === action.clientId
            ? { ...c, status: action.status, startDate: action.startedAt ?? c.startDate }
            : c
        ),
      }

    case "updateTrainerProfile": {
      const trainers = data.trainers.map((t) => (t.id === action.trainerId ? { ...t, ...action.patch } : t))
      const t = trainers.find((x) => x.id === action.trainerId)
      // Som databasen: tjänster utanför PT:ns utbud pausas.
      const services = t
        ? data.services.map((x) =>
            x.trainerId === t.id && x.active && ((x.sessions > 0 && !t.offersTraining) || (x.includesNutrition && !t.offersNutrition))
              ? { ...x, active: false }
              : x
          )
        : data.services
      return { ...data, trainers, services }
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

    case "saveService":
      return { ...data, services: upsertBy(data.services, action.service, (x) => x.id === action.service.id) }

    case "deleteService":
      return { ...data, services: data.services.filter((x) => x.id !== action.serviceId) }

    case "saveRecipe":
      return { ...data, recipes: upsertBy(data.recipes, action.recipe, (r) => r.id === action.recipe.id) }

    case "deleteRecipe":
      return { ...data, recipes: data.recipes.filter((r) => r.id !== action.recipeId) }

    case "addClient":
      if (data.clients.some((c) => c.id === action.client.id)) return data
      return {
        ...data,
        clients: [...data.clients, action.client],
        relationships: action.client.trainerId
          ? upsertBy(
              data.relationships,
              { trainerId: action.client.trainerId, clientId: action.client.id, status: action.client.status, goal: action.client.goal, startDate: action.client.startDate },
              (r) => r.clientId === action.client.id && r.trainerId === action.client.trainerId
            )
          : data.relationships,
      }

    case "upsertPurchases": {
      // Som databasen: ett betalt köp gör klienten aktiv hos PT:n (flera PT:er är tillåtet).
      const purchases = action.purchases.reduce((list, p) => upsertBy(list, p, (x) => x.id === p.id), data.purchases)
      const paid = action.purchases.filter((p) => p.status === "paid")
      let relationships = data.relationships
      for (const p of paid) {
        const existing = relationships.find((r) => r.clientId === p.clientId && r.trainerId === p.trainerId)
        const fresh = !existing || existing.status === "ended" || existing.status === "pending"
        const rel: CoachingRelationship = {
          trainerId: p.trainerId,
          clientId: p.clientId,
          status: "active",
          goal: existing?.goal ?? "",
          startDate: fresh ? (action.today ?? existing?.startDate ?? "") : existing!.startDate,
        }
        relationships = upsertBy(relationships, rel, (r) => r.clientId === p.clientId && r.trainerId === p.trainerId)
      }
      const clients = data.clients.map((c) => {
        const p = paid.find((x) => x.clientId === c.id)
        if (!p) return c
        // Huvud-PT:n byts bara om klienten saknar en aktiv PT (eller det är samma PT).
        const keep = c.trainerId && c.trainerId !== p.trainerId && c.status !== "pending"
        if (keep) return c
        const fresh = c.trainerId !== p.trainerId || c.status === "pending"
        return { ...c, trainerId: p.trainerId, status: "active" as const, startDate: fresh ? (action.today ?? c.startDate) : c.startDate }
      })
      // Som databasen: betalda tjänster försvinner ur varukorgen.
      const cart = data.cart.filter((c) => !paid.some((p) => p.clientId === c.clientId && p.serviceId === c.serviceId))
      return { ...data, purchases, clients, relationships, cart }
    }
    case "addCartItem": {
      const { item } = action
      if (data.cart.some((c) => c.clientId === item.clientId && c.serviceId === item.serviceId)) return data
      return { ...data, cart: [...data.cart, item] }
    }
    case "removeCartItems":
      return { ...data, cart: data.cart.filter((c) => c.clientId !== action.clientId || !action.serviceIds.includes(c.serviceId)) }
    case "setCart":
      return { ...data, cart: action.cart }
    case "setCartQuantity":
      return {
        ...data,
        cart: data.cart.map((c) => (c.clientId === action.clientId && c.serviceId === action.serviceId ? { ...c, quantity: action.quantity } : c)),
      }
    case "setTrainerBoost":
      return {
        ...data,
        trainers: data.trainers.map((t) => (t.id === action.trainerId ? { ...t, boostedUntil: action.boostedUntil ?? undefined } : t)),
      }
  }
}

/** Äldre data saknar `active` – då är schemat aktivt. */
export const isActivePlan = (p: NutritionPlan) => p.active !== false

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
        offersTraining: t.offersTraining ?? true,
        offersNutrition: t.offersNutrition ?? false,
      }
    }),
    clients: list<Client>(d.clients),
    exercises: list(d.exercises),
    templates: list(d.templates),
    workouts: list(d.workouts),
    nutritionPlans: list(d.nutritionPlans),
    mealChecks: list(d.mealChecks),
    // v12: en tråd per PT–klient-par. Äldre meddelanden hör till klientens PT.
    messages: list<Message>(d.messages).map((m) =>
      m.trainerId ? m : { ...m, trainerId: list<Client>(d.clients).find((c) => c.id === m.threadId)?.trainerId ?? undefined }
    ),
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
    // Inga gratispass: rensa bort sådana erbjudanden ur äldre sparad data.
    offers: list<TrainerOffer>(d.offers).filter((o) => !isFreeOffer(o)),
    services: list(d.services),
    purchases: list(d.purchases),
    recipes: list(d.recipes),
    // v12: relationer (flera PT:er). Äldre data: härled från klienternas PT.
    relationships: Array.isArray(d.relationships)
      ? list<CoachingRelationship>(d.relationships)
      : list<Client>(d.clients)
          .filter((c) => c.trainerId)
          .map((c) => ({ trainerId: c.trainerId!, clientId: c.id, status: c.status, goal: c.goal, startDate: c.startDate })),
    progressEntries: list(d.progressEntries),
    cart: list(d.cart),
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
