"use client"

/**
 * Datalagret som alla vyer använder via `useAppData()`.
 *
 * Två lägen, samma API:
 * - **Supabase** (när NEXT_PUBLIC_SUPABASE_* är satta): data laddas med RLS,
 *   ändringar appliceras direkt i UI:t, läggs i en offlinekö och skickas i
 *   ordning. Realtid håller chatt, bokningar och pass uppdaterade.
 * - **Demo**: mockdata i webbläsaren, för utveckling och visningar.
 */

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { BrandMark } from "@/components/brand"
import { extendBoost } from "@/lib/boost"
import { BRAND } from "@/lib/brand"
import { MAX_CART_ITEMS } from "@/lib/cart"
import { DEMO_CLIENT_ID, DEMO_TRAINER_ID, createSeedData } from "@/lib/data/seed"
import { backoffMs, Outbox } from "@/lib/data/outbox"
import {
  normalizeAppData,
  reducer,
  replay,
  type Action,
  type EventPatch,
  type PersistableAction,
  type ClientProfilePatch,
  type TrainerProfilePatch,
} from "@/lib/data/state"
import { findConflict } from "@/lib/calendar/slots"
import { diffNotifications } from "@/lib/notifications/rules"
import { forgetInterests } from "@/lib/offers/interests"
import { hasNutritionAccess, noCreditMessage, sessionBalance } from "@/lib/services/balance"
import { todayISO } from "@/lib/date"
import { getSupabase } from "@/lib/supabase/client"
import { completeBlocker, verifyBlocker } from "@/lib/workout-rules"
import { forgetPushToken } from "@/lib/native/push"
import { HOME_FOR_ROLE, isSupabaseEnabled, ONBOARDING_PATH } from "@/lib/supabase/config"
import type {
  AppData,
  Attachment,
  AvailabilityRule,
  CalendarEvent,
  EventStatus,
  SessionMode,
  Slot,
  TrainerOffer,
  ClientStatus,
  FoodEntry,
  FoodProduct,
  SleepLog,
  WearableConnection,
  ID,
  ISODate,
  Me,
  NutritionPlan,
  Purchase,
  Recipe,
  SetLog,
  TrainerService,
  UserRole,
  WeightEntry,
  WorkoutStatus,
  WorkoutTemplate,
} from "@/types/domain"
import { START_PATH } from "@/lib/site"

export type SyncStatus = "synced" | "syncing" | "offline" | "error"
export interface SyncState {
  status: SyncStatus
  pending: number
}

// Ny nyckel när demodatan ändrar form (v4: egna pass, kopplade program och klarmarkering) – demon börjar om med färsk data.
const DEMO_KEY = "coavira:demo:v4"
const outboxKey = (uid: string) => `coavira:outbox:v1:${uid}`
const cacheKey = (uid: string) => `coavira:cache:v1:${uid}`

/** Appen hette tidigare Forma. Flytta en ev. osynkad kö och cache till de nya nycklarna. */
function migrateLegacyKeys(uid: string) {
  try {
    for (const kind of ["outbox", "cache"]) {
      const old = `forma:${kind}:v1:${uid}`
      const value = window.localStorage.getItem(old)
      if (value === null) continue
      const next = `coavira:${kind}:v1:${uid}`
      if (window.localStorage.getItem(next) === null) window.localStorage.setItem(next, value)
      window.localStorage.removeItem(old)
    }
  } catch {}
}

// ------------------------------------------------------------- actions ---

function createActions(ctx: {
  me: Me
  getData: () => AppData
  commit: (a: PersistableAction) => void
  dispatch: React.Dispatch<Action>
  mode: "demo" | "supabase"
}) {
  const { me, getData, commit } = ctx
  const newId = () => crypto.randomUUID()
  const now = () => new Date().toISOString()

  /**
   * PT: koppla ett träningsprogram (från en mall) till ett bokat kalenderpass.
   * Passet tar kalenderpassets plats i passgränsen, inte ett nytt betalt pass.
   */
  const attachProgram = (eventId: ID, template: WorkoutTemplate): string | null => {
    const ev = getData().events.find((e) => e.id === eventId)
    if (!ev?.clientId || ev.kind !== "session") return "Passet har ingen klient."
    const id = newId()
    const start = new Date(ev.start)
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
    commit({
      type: "addWorkout",
      workout: {
        id,
        clientId: ev.clientId,
        trainerId: me.id,
        eventId,
        templateId: template.id,
        name: template.name,
        date,
        exercises: template.exercises.map((e) => ({ ...e, id: newId() })),
        status: "planned",
        logs: [],
      },
    })
    commit({ type: "updateEvent", eventId, patch: { workoutId: id } })
    return null
  }

  return {
    newId,
    logSet: (workoutId: ID, log: SetLog) => {
      // Första loggade setet startar passet.
      if (getData().workouts.find((w) => w.id === workoutId)?.status === "planned") {
        commit({ type: "setWorkoutStatus", workoutId, status: "in_progress" })
      }
      commit({ type: "upsertSetLog", workoutId, log })
    },
    /** Returnerar ett felmeddelande om passet inte har ägt rum än (databasen spärrar samma sak). */
    setWorkoutStatus: (workoutId: ID, status: WorkoutStatus, comment?: string): string | null => {
      const w = getData().workouts.find((x) => x.id === workoutId)
      if (w && status === "completed" && w.status !== "completed") {
        const blocked = completeBlocker(getData(), w)
        if (blocked) return blocked
      }
      commit({ type: "setWorkoutStatus", workoutId, status, comment, completedAt: status === "completed" ? now() : undefined })
      return null
    },
    /**
     * PT: schemalägg ett pass. Returnerar ett felmeddelande om klienten inte har
     * betalda pass kvar (databasen kontrollerar samma sak).
     */
    scheduleWorkout: (clientId: ID, template: WorkoutTemplate, date: ISODate): string | null => {
      const balance = sessionBalance(getData(), me.id, clientId)
      if (balance.remaining < 1) return noCreditMessage(balance)
      const id = newId()
      commit({
        type: "addWorkout",
        workout: {
          id,
          clientId,
          trainerId: me.id,
          templateId: template.id,
          name: template.name,
          date,
          // Ögonblicksbild av mallen med egna id:n per övning (set-loggar pekar på dem).
          exercises: template.exercises.map((e) => ({ ...e, id: newId() })),
          status: "planned",
          logs: [],
        },
      })
      return null
    },
    attachProgram,
    /**
     * PT: klarmarkera ett pass. Vikter, reps och set har PT:n redan kontrollerat
     * och rättat i passvyn; här bekräftas passet med en kommentar.
     */
    verifyWorkout: (workoutId: ID, comment?: string): string | null => {
      const w = getData().workouts.find((x) => x.id === workoutId)
      if (!w) return "Passet hittades inte."
      // Inte i förtid och inte utan vikter (databasen spärrar samma sak).
      const blocked = verifyBlocker(getData(), w)
      if (blocked) return blocked
      const linked = getData().events.filter(
        (e) => (e.workoutId === workoutId || e.id === w.eventId) && (e.status === "confirmed" || e.status === "pending")
      )
      commit({ type: "verifyWorkout", workoutId, verifiedAt: now(), verifiedBy: me.id, comment: comment?.trim().slice(0, 1000) || undefined })
      for (const e of linked) commit({ type: "setEventStatus", eventId: e.id, status: "completed" })
      return null
    },
    /** Klient: skapa ett eget pass (egen tracking, oberoende av PT). Returnerar passets id. */
    createOwnWorkout: (name: string, date: ISODate, exercises: WorkoutTemplate["exercises"]): ID => {
      const id = newId()
      commit({
        type: "addWorkout",
        workout: {
          id,
          clientId: me.id,
          byClient: true,
          templateId: null,
          name: name.trim().slice(0, 80) || "Eget pass",
          date,
          exercises: exercises.map((e) => ({ ...e, id: newId() })),
          status: "planned",
          logs: [],
        },
      })
      return id
    },
    deleteOwnWorkout: (workoutId: ID) => commit({ type: "deleteWorkout", workoutId }),
    saveTemplate: (template: WorkoutTemplate) => commit({ type: "upsertTemplate", template }),
    deleteTemplate: (templateId: ID) => commit({ type: "deleteTemplate", templateId }),
    /** PT: spara kostplanen. Kräver att klienten köpt kostcoaching. */
    saveNutritionPlan: (plan: NutritionPlan): { error: string } | { proposal: boolean } => {
      if (!hasNutritionAccess(getData(), me.id, plan.clientId)) return { error: "Klienten har inte köpt kostcoaching." }
      commit({ type: "upsertNutritionPlan", plan: { ...plan, active: true } })
      // Gäller en annan PT:s schema blir detta ett förslag som klienten kan välja.
      const saved = getData().nutritionPlans.find((p) => p.id === plan.id)
      return { proposal: saved?.active === false }
    },
    /** Klient: välj vilket kostschema som gäller. Bara ett kan vara aktivt. */
    chooseNutritionPlan: (planId: ID | null) => commit({ type: "chooseNutritionPlan", clientId: me.id, planId }),
    /** Klient: avsluta samarbetet med en PT. */
    leaveTrainer: (trainerId: ID) => commit({ type: "leaveTrainer", clientId: me.id, trainerId, at: now() }),
    /** Klient: namn, intressen och fokus (syns för klientens PT:er). */
    updateProfile: (patch: ClientProfilePatch) => {
      const clean: ClientProfilePatch = {
        ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 120) } : {}),
        ...(patch.interests ? { interests: [...new Set(patch.interests)].slice(0, 12) } : {}),
        ...(patch.focus !== undefined ? { focus: patch.focus.trim().slice(0, 300) } : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      }
      commit({ type: "updateClientProfile", clientId: me.id, patch: clean })
    },
    addProgressEntry: (metric: string, value: number, date: ISODate, note?: string) =>
      commit({ type: "addProgressEntry", entry: { id: newId(), clientId: me.id, metric, value, date, note: note?.trim() || undefined } }),
    deleteProgressEntry: (id: ID) => commit({ type: "deleteProgressEntry", id }),
    saveRecipe: (recipe: Omit<Recipe, "trainerId">) => commit({ type: "saveRecipe", recipe: { ...recipe, trainerId: me.id } }),
    deleteRecipe: (recipeId: ID) => commit({ type: "deleteRecipe", recipeId }),
    /** PT: skapa eller ändra en tjänst i menyn. */
    saveService: (service: Omit<TrainerService, "trainerId">) => commit({ type: "saveService", service: { ...service, trainerId: me.id } }),
    deleteService: (serviceId: ID) => commit({ type: "deleteService", serviceId }),
    /**
     * Klient: köp en eller flera tjänster hos samma PT. Med Supabase skickas
     * klienten till Stripe Checkout (servern hämtar priserna); i demoläget
     * simuleras en godkänd betalning direkt.
     */
    checkout: async (serviceIds: ID[]): Promise<string | null> => {
      const data = getData()
      const services = serviceIds.map((id) => data.services.find((x) => x.id === id)).filter((x): x is TrainerService => Boolean(x))
      if (!services.length || services.length !== serviceIds.length) return "Tjänsten finns inte längre."
      if (new Set(services.map((x) => x.trainerId)).size !== 1) return "Alla tjänster måste vara hos samma PT."
      if (ctx.mode === "demo") {
        const checkoutId = newId()
        const purchases: Purchase[] = services.map((x) => ({
          id: newId(),
          checkoutId,
          clientId: me.id,
          trainerId: x.trainerId,
          serviceId: x.id,
          kind: x.kind,
          title: x.title,
          sessions: x.sessions,
          includesNutrition: x.includesNutrition,
          priceSek: x.priceSek,
          status: "paid",
          createdAt: now(),
          paidAt: now(),
        }))
        ctx.dispatch({ type: "upsertPurchases", purchases, today: todayISO() })
        return null
      }
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ serviceIds }),
        })
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!res.ok || !body.url) return body.error ?? "Betalningen kunde inte startas. Försök igen."
        window.location.assign(body.url)
        return null
      } catch {
        return "Ingen uppkoppling – försök igen."
      }
    },
    /**
     * Klient: lägg en tjänst i varukorgen. Sparas lokalt direkt och i databasen
     * (cart_items), så att varukorgen finns kvar mellan besök och enheter.
     */
    addToCart: (serviceId: ID): string | null => {
      const data = getData()
      const service = data.services.find((x) => x.id === serviceId && x.active)
      if (!service) return "Tjänsten finns inte längre."
      const mine = data.cart.filter((c) => c.clientId === me.id)
      if (mine.some((c) => c.serviceId === serviceId)) return null
      if (mine.length >= MAX_CART_ITEMS) return `Varukorgen är full (högst ${MAX_CART_ITEMS} tjänster).`
      commit({ type: "addCartItem", item: { clientId: me.id, serviceId, trainerId: service.trainerId, addedAt: now() } })
      return null
    },
    removeFromCart: (serviceIds: ID[]) => {
      if (serviceIds.length) commit({ type: "removeCartItems", clientId: me.id, serviceIds })
    },
    /**
     * PT: köp PT Boost (199 kr, 7 dagar). Med Supabase skickas PT:n till Stripe
     * Checkout (priset bestäms av databasen); i demoläget simuleras köpet direkt.
     */
    buyBoost: async (): Promise<string | null> => {
      const self = getData().trainers.find((t) => t.id === me.id)
      if (!self?.isPublished) return "Publicera din profil innan du boostar den."
      if (ctx.mode === "demo") {
        ctx.dispatch({ type: "setTrainerBoost", trainerId: me.id, boostedUntil: extendBoost(self.boostedUntil) })
        return null
      }
      try {
        const res = await fetch("/api/stripe/boost-checkout", { method: "POST" })
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!res.ok || !body.url) return body.error ?? "Betalningen kunde inte startas. Försök igen."
        window.location.assign(body.url)
        return null
      } catch {
        return "Ingen uppkoppling – försök igen."
      }
    },
    /** PT, efter Stripe: är boosten betald? Uppdaterar profilen när den är det. */
    confirmBoost: async (sessionId: string): Promise<"paid" | "pending" | "expired" | "unknown"> => {
      try {
        const res = await fetch(`/api/stripe/boost-checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
        const body = (await res.json().catch(() => ({}))) as { status?: "paid" | "pending" | "expired" | "unknown"; boostedUntil?: string | null }
        if (body.status === "paid" && body.boostedUntil) ctx.dispatch({ type: "setTrainerBoost", trainerId: me.id, boostedUntil: body.boostedUntil })
        return body.status ?? "unknown"
      } catch {
        return "pending"
      }
    },
    toggleMeal: (clientId: ID, date: ISODate, mealId: ID) => {
      const checked = !getData().mealChecks.some((m) => m.clientId === clientId && m.date === date && m.mealId === mealId)
      commit({ type: "setMealCheck", clientId, date, mealId, checked })
    },
    /**
     * Skickar ett meddelande. `extra.id` används när bilagor laddats upp i förväg
     * till en sökväg med meddelandets id.
     */
    sendMessage: (threadId: ID, body: string, workoutId?: ID, extra?: { id?: ID; attachments?: Attachment[]; trainerId?: ID }) => {
      const text = body.trim()
      const attachments = extra?.attachments?.slice(0, 10)
      if (!text && !attachments?.length) return
      // En tråd per PT–klient-par: PT:n är alltid avsändarens PT eller den valda PT:n.
      const trainerId = me.role === "trainer" ? me.id : (extra?.trainerId ?? getData().clients.find((c) => c.id === threadId)?.trainerId ?? undefined)
      commit({
        type: "addMessage",
        message: {
          id: extra?.id ?? newId(),
          threadId,
          trainerId,
          senderId: me.id,
          body: text.slice(0, 2000),
          workoutId,
          sentAt: now(),
          ...(attachments?.length ? { attachments } : {}),
        },
      })
    },
    markThreadRead: (threadId: ID, trainerId?: ID) => {
      const t = me.role === "trainer" ? me.id : trainerId
      const hasUnread = getData().messages.some(
        (m) => m.threadId === threadId && (!t || m.trainerId === t) && m.senderId !== me.id && !m.readAt
      )
      if (hasUnread) commit({ type: "markThreadRead", threadId, readerId: me.id, readAt: now(), trainerId: t })
    },
    addWeight: (clientId: ID, entry: WeightEntry) => commit({ type: "addWeight", clientId, entry }),
    // ----- kalender
    /**
     * Klient: skicka en bokningsförfrågan på en ledig tid. Returnerar ett felmeddelande
     * om tiden hunnit bli upptagen (databasen kontrollerar också, även vid samtidiga bokningar).
     */
    requestBooking: (trainerId: ID, slot: Slot, mode: SessionMode, note?: string): string | null => {
      const data = getData()
      if (findConflict(data.events, trainerId, new Date(slot.start), new Date(slot.end))) return "Tiden hann bokas av någon annan."
      // Varje bokning tar ett betalt pass.
      if (sessionBalance(data, trainerId, me.id).remaining < 1) return "Du har inga betalda pass kvar hos PT:n. Köp pass för att boka."
      commit({
        type: "addEvent",
        event: {
          id: newId(),
          trainerId,
          clientId: me.id,
          kind: "session",
          status: "pending",
          awaiting: "trainer",
          title: "PT-pass",
          start: slot.start,
          end: slot.end,
          mode,
          notes: note?.trim() || undefined,
          createdBy: me.id,
        },
      })
      return null
    },
    /**
     * Flytta ett preliminärt pass till en ny starttid (längden behålls). PT:n drar i
     * kalendern; klienten föreslår en ny tid. Motparten aviseras och ska svara.
     * Bekräftade pass är låsta. Returnerar ett felmeddelande vid krock.
     */
    moveEvent: (eventId: ID, start: Date, slotEnd?: Date): string | null => {
      const ev = getData().events.find((e) => e.id === eventId)
      if (!ev) return "Passet finns inte längre."
      if (ev.status !== "pending" || !ev.clientId) return "Bara preliminära pass kan flyttas."
      // Klientens förslag följer slotens längd (databasen kräver en exakt ledig tid).
      const end = slotEnd ?? new Date(start.getTime() + (new Date(ev.end).getTime() - new Date(ev.start).getTime()))
      if (start.getTime() === new Date(ev.start).getTime() && end.getTime() === new Date(ev.end).getTime()) return null
      if (start < new Date()) return "Det går inte att flytta ett pass bakåt i tiden."
      const conflict = findConflict(getData().events, ev.trainerId, start, end, eventId)
      if (conflict) return `Krockar med "${conflict.title || "en annan händelse"}".`
      commit({ type: "rescheduleEvent", eventId, start: start.toISOString(), end: end.toISOString(), by: me.role === "trainer" ? "trainer" : "client" })
      return null
    },
    /** Klient: acceptera tiden PT:n föreslagit. */
    acceptProposal: (eventId: ID) => commit({ type: "setEventStatus", eventId, status: "confirmed" }),
    /** PT: svara på en förfrågan. Att acceptera en ny klients första bokning aktiverar också klienten. */
    respondToRequest: (eventId: ID, accept: boolean) => {
      const data = getData()
      const ev = data.events.find((e) => e.id === eventId)
      if (!ev) return
      if (accept && ev.clientId && data.clients.find((c) => c.id === ev.clientId)?.status === "pending") {
        commit({ type: "setClientStatus", clientId: ev.clientId, status: "active", startedAt: todayISO() })
      }
      commit({ type: "setEventStatus", eventId, status: accept ? "confirmed" : "cancelled", cancelledBy: accept ? undefined : me.id })
    },
    /** Avboka (klient eller PT) eller markera som genomfört (PT). */
    /** Returnerar ett felmeddelande om passet markeras som genomfört innan det har börjat. */
    setEventStatus: (eventId: ID, status: EventStatus): string | null => {
      const ev = getData().events.find((e) => e.id === eventId)
      if (ev && status === "completed" && ev.status !== "completed" && new Date(ev.start).getTime() > Date.now()) {
        return "Passet kan inte markeras som genomfört innan det har börjat."
      }
      commit({ type: "setEventStatus", eventId, status, cancelledBy: status === "cancelled" ? me.id : undefined })
      return null
    },
    /** PT: nytt pass, inbokad klient eller blockering. Returnerar felmeddelande vid krock. */
    createEvent: (input: Omit<CalendarEvent, "id" | "trainerId" | "createdBy">, opts?: { template?: WorkoutTemplate }): string | null => {
      const conflict = findConflict(getData().events, me.id, new Date(input.start), new Date(input.end))
      if (conflict) return `Krockar med "${conflict.title || "en annan händelse"}".`
      // Ett pass med klient (utan kopplat träningspass) tar ett betalt pass.
      if (input.kind === "session" && input.clientId && !input.workoutId && input.status !== "cancelled") {
        const balance = sessionBalance(getData(), me.id, input.clientId)
        if (balance.remaining < 1) return noCreditMessage(balance)
      }
      // Ett preliminärt pass med klient väntar på att klienten bekräftar.
      const awaiting = input.status === "pending" ? ("client" as const) : undefined
      const id = newId()
      commit({ type: "addEvent", event: { ...input, awaiting, id, trainerId: me.id, createdBy: me.id } })
      // Valt träningsprogram kopplas direkt till det nya passet.
      if (opts?.template && input.clientId && input.kind === "session") attachProgram(id, opts.template)
      return null
    },
    /** PT: ändra en händelse (tid, titel, plats …). Returnerar felmeddelande vid krock. */
    updateEvent: (eventId: ID, patch: EventPatch): string | null => {
      const ev = getData().events.find((e) => e.id === eventId)
      if (!ev) return "Händelsen finns inte längre."
      const start = new Date(patch.start ?? ev.start)
      const end = new Date(patch.end ?? ev.end)
      const conflict = findConflict(getData().events, ev.trainerId, start, end, eventId)
      if (conflict && (ev.status === "pending" || ev.status === "confirmed")) return `Krockar med "${conflict.title || "en annan händelse"}".`
      const moved = start.getTime() !== new Date(ev.start).getTime() || end.getTime() !== new Date(ev.end).getTime()
      if (moved && ev.status === "pending" && ev.clientId) {
        // Ny tid på ett preliminärt pass = ombokning: klienten aviseras och ska svara.
        commit({ type: "rescheduleEvent", eventId, start: start.toISOString(), end: end.toISOString(), by: "trainer" })
        const { start: _s, end: _e, ...rest } = patch
        void _s
        void _e
        if (Object.keys(rest).length) commit({ type: "updateEvent", eventId, patch: rest })
        return null
      }
      commit({ type: "updateEvent", eventId, patch })
      return null
    },
    /** PT: ta bort en blockering eller ett eget pass utan klient. */
    deleteEvent: (eventId: ID) => commit({ type: "deleteEvent", eventId }),
    saveAvailabilityRule: (rule: Omit<AvailabilityRule, "trainerId">) =>
      commit({ type: "saveAvailabilityRule", rule: { ...rule, trainerId: me.id } }),
    deleteAvailabilityRule: (ruleId: ID) => commit({ type: "deleteAvailabilityRule", ruleId }),

    // ----- aviseringar och erbjudanden
    markNotificationsRead: (ids: ID[]) => {
      const unread = ids.filter((id) => getData().notifications.some((n) => n.id === id && !n.readAt))
      if (unread.length) commit({ type: "markNotificationsRead", ids: unread, readAt: now() })
    },
    /** PT: skapa eller ändra ett erbjudande. */
    saveOffer: (offer: Omit<TrainerOffer, "trainerId" | "createdAt"> & { createdAt?: string }) =>
      commit({ type: "saveOffer", offer: { ...offer, trainerId: me.id, createdAt: offer.createdAt ?? now() } }),
    deleteOffer: (offerId: ID) => commit({ type: "deleteOffer", offerId }),

    setClientStatus: (clientId: ID, status: ClientStatus) => {
      const current = getData().clients.find((c) => c.id === clientId)
      commit({
        type: "setClientStatus",
        clientId,
        status,
        startedAt: current?.status === "pending" && status === "active" ? todayISO() : undefined,
      })
    },
    updateTrainerProfile: (patch: TrainerProfilePatch) => commit({ type: "updateTrainerProfile", trainerId: me.id, patch }),

    // ----- klientens trackers
    addFoodEntry: (date: ISODate, food: Omit<FoodEntry, "id" | "clientId" | "date">) =>
      commit({ type: "addFoodEntry", entry: { ...food, id: newId(), clientId: me.id, date } }),
    deleteFoodEntry: (id: ID) => commit({ type: "deleteFoodEntry", id }),
    /** Ändrar dagens vattenmängd med `deltaMl` (kan vara negativt). */
    addWater: (date: ISODate, deltaMl: number) => {
      const current = getData().waterLogs.find((w) => w.clientId === me.id && w.date === date)?.ml ?? 0
      const ml = Math.min(15000, Math.max(0, current + deltaMl))
      if (ml !== current) commit({ type: "setWater", clientId: me.id, date, ml })
    },
    logSleep: (date: ISODate, hours: number, quality?: number) => {
      const existing = getData().sleepLogs.find((l) => l.clientId === me.id && l.date === date)
      // Ändras bara känslan behålls klockans data (steg, poäng). Ändras tiden är det
      // en manuell registrering och klockans siffror stämmer inte längre.
      const keepDevice = existing && existing.source !== "manual" && existing.hours === hours
      commit({
        type: "upsertSleep",
        log: keepDevice
          ? { ...existing, quality }
          : { clientId: me.id, date, hours, quality, source: "manual" },
      })
    },
    /** PT: döp om en övning för en klient (null = återställ bibliotekets namn). */
    setExerciseAlias: (clientId: ID, exerciseId: ID, name: string | null) => {
      const clean = name?.trim().slice(0, 80) || null
      commit({ type: "setExerciseAlias", trainerId: me.id, clientId, exerciseId, name: clean })
    },
    /** Klient: spara en egen eller skannad produkt så att den hittas igen. */
    saveCustomFood: (product: FoodProduct) => commit({ type: "upsertCustomFood", product }),
    /** Resultat från en wearable-synk (servern har redan sparat dem). */
    applySleepSync: (logs: SleepLog[]) => ctx.dispatch({ type: "mergeSleepLogs", logs }),
    setWearables: (connections: WearableConnection[]) => ctx.dispatch({ type: "setWearables", connections }),
    resetDemo: () => {
      if (ctx.mode !== "demo") return
      try {
        window.localStorage.removeItem(DEMO_KEY)
      } catch {}
      ctx.dispatch({ type: "hydrate", data: createSeedData() })
    },
  }
}

export type AppActions = ReturnType<typeof createActions>

interface Ctx {
  data: AppData
  me: Me
  mode: "demo" | "supabase"
  actions: AppActions
  sync: SyncState
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const DataContext = React.createContext<Ctx | null>(null)

// ------------------------------------------------------------- provider ---

export function AppDataProvider({ children, role }: { children: React.ReactNode; role: UserRole }) {
  return isSupabaseEnabled ? <SupabaseProvider role={role}>{children}</SupabaseProvider> : <DemoProvider role={role}>{children}</DemoProvider>
}

/**
 * Håller senaste tillståndet utanför React så att actions (händelsehanterare)
 * alltid ser det, även flera ändringar i samma händelse.
 */
class LocalEngine {
  private data: AppData | null = null
  constructor(private readonly dispatch: React.Dispatch<Action>) {}
  getData = () => this.data!
  /**
   * ALLA ändringar (lokala, köade och realtid) går genom apply, så motorns kopia
   * och React-tillståndet är alltid i takt. Synka den inte via en effekt: barnens
   * effekter körs före förälderns och skulle då kunna se en nollställd kopia.
   */
  apply = (a: Action) => {
    this.data = reducer(this.data, a)
    this.dispatch(a)
  }
}

function DemoProvider({ children, role }: { children: React.ReactNode; role: UserRole }) {
  const [data, dispatch] = React.useReducer(reducer, null)
  const [engine] = React.useState(() => new LocalEngine(dispatch))

  // Datan skapas först i webbläsaren: den beror på dagens datum och localStorage.
  React.useEffect(() => {
    engine.apply({ type: "hydrate", data: loadDemo() })
  }, [engine])

  React.useEffect(() => {
    if (!data) return
    try {
      window.localStorage.setItem(DEMO_KEY, JSON.stringify({ savedOn: todayISO(), data }))
    } catch {}
  }, [data, engine])

  // Namnet hämtas från demoprofilen i datan (aldrig hårdkodat i gränssnittet).
  const id = role === "trainer" ? DEMO_TRAINER_ID : DEMO_CLIENT_ID
  const name = (role === "trainer" ? data?.trainers.find((t) => t.id === id)?.name : data?.clients.find((c) => c.id === id)?.name) ?? ""
  const me = React.useMemo<Me>(() => ({ id, role, name }), [id, role, name])

  const actions = React.useMemo(() => {
    // I demoläget finns ingen databastrigger: räkna fram motpartens aviseringar här.
    const commit = (a: PersistableAction) => {
      const before = engine.getData().events
      engine.apply(a)
      const after = engine.getData().events
      if (before === after) return
      for (const notification of diffNotifications(before, after, me, () => crypto.randomUUID())) {
        engine.apply({ type: "addNotification", notification })
      }
    }
    return createActions({ me, mode: "demo", dispatch: engine.apply, getData: engine.getData, commit })
  }, [me, engine])

  const value = React.useMemo<Ctx | null>(
    () =>
      data
        ? {
            data,
            me,
            mode: "demo",
            actions,
            sync: { status: "synced", pending: 0 },
            signOut: async () => {
              window.location.replace(START_PATH)
            },
            deleteAccount: async () => {
              toast.info("Kontoradering finns bara när Supabase är kopplat.")
            },
          }
        : null,
    [data, me, actions]
  )

  if (!value) return <LoadingScreen />
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

function loadDemo(): AppData {
  try {
    const raw = window.localStorage.getItem(DEMO_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { savedOn: ISODate; data: unknown }
      // Demodatan är relativ till datumet den skapades, så en ny dag ger ny data.
      // Data från en äldre version uppgraderas; oläsbar data ersätts med ny.
      const data = parsed.savedOn === todayISO() ? normalizeAppData(parsed.data) : null
      if (data) return data
    }
  } catch {}
  return createSeedData()
}

/**
 * Optimistiska ändringar + offlinekö mot Supabase. Varje ändring appliceras
 * lokalt direkt, läggs i kön och skickas i ordning. Vid nätverksfel väntar kön
 * (exponentiell backoff, 'online'-händelsen, flikfokus) och fortsätter sedan.
 */
class SyncEngine extends LocalEngine {
  me: Me | null = null
  outbox: Outbox | null = null
  private flushing = false
  private retryTimer: number | undefined

  constructor(
    dispatch: React.Dispatch<Action>,
    private readonly setSync: React.Dispatch<React.SetStateAction<SyncState>>
  ) {
    super(dispatch)
  }

  start(me: Me) {
    this.me = me
    migrateLegacyKeys(me.id)
    this.outbox = new Outbox(outboxKey(me.id))
  }

  get pending() {
    return this.outbox?.size ?? 0
  }

  commit = (a: PersistableAction) => {
    this.apply(a)
    this.outbox?.push(a)
    this.setSync((s) => ({ ...s, pending: this.pending }))
    void this.flush()
  }

  flush = async () => {
    const { outbox, me } = this
    if (!outbox || !me || this.flushing) return
    this.flushing = true
    window.clearTimeout(this.retryTimer)
    try {
      const { persistAction } = await import("@/lib/data/supabase-source")
      let hadError = false
      while (outbox.peek()) {
        this.setSync({ status: "syncing", pending: outbox.size })
        const op = outbox.peek()!
        const res = await persistAction(getSupabase(), me, op.action)
        if (res.ok) {
          outbox.shift()
          continue
        }
        if (res.retry) {
          outbox.markAttempt()
          this.setSync({ status: "offline", pending: outbox.size })
          this.retryTimer = window.setTimeout(() => void this.flush(), backoffMs(op.attempts))
          return
        }
        // Permanent nekad (RLS/validering): släpp den och berätta. Ingen idé att försöka igen.
        outbox.shift()
        hadError = true
        toast.error("En ändring kunde inte sparas", {
          description: res.message,
          action: { label: "Ladda om", onClick: () => window.location.reload() },
        })
      }
      this.setSync({ status: hadError ? "error" : "synced", pending: 0 })
    } finally {
      this.flushing = false
    }
  }

  /** Rensar kö och lokal cache (utloggning / radering). */
  forget() {
    window.clearTimeout(this.retryTimer)
    this.outbox?.clear()
    if (this.me) {
      clearCache(this.me.id)
      forgetInterests(this.me.id)
    }
  }
}

function SupabaseProvider({ children, role }: { children: React.ReactNode; role: UserRole }) {
  const router = useRouter()
  const [data, dispatch] = React.useReducer(reducer, null)
  const [me, setMe] = React.useState<Me | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [sync, setSync] = React.useState<SyncState>({ status: "synced", pending: 0 })
  const [engine] = React.useState(() => new SyncEngine(dispatch, setSync))

  // Laddning: server → (vid offline) cache. Köade ändringar spelas upp ovanpå.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      const { loadRemote, OfflineError, OnboardingRequired } = await import("@/lib/data/supabase-source")
      try {
        const loaded = await loadRemote(sb)
        if (cancelled) return
        if (loaded.me.role !== role) {
          router.replace(HOME_FOR_ROLE[loaded.me.role])
          return
        }
        engine.start(loaded.me)
        engine.apply({ type: "hydrate", data: replay(loaded.data, engine.outbox!.actions) })
        setMe(loaded.me)
        void engine.flush()
      } catch (e) {
        if (cancelled) return
        if (e instanceof OfflineError) {
          // Ingen kontakt: starta från senaste cache (sessionen finns lokalt i cookien).
          const { data: s } = await sb.auth.getSession()
          if (s.session) migrateLegacyKeys(s.session.user.id)
          const cached = s.session ? readCache(s.session.user.id) : null
          if (cached) {
            engine.start(cached.me)
            engine.apply({ type: "hydrate", data: replay(cached.data, engine.outbox!.actions) })
            setMe(cached.me)
            setSync({ status: "offline", pending: engine.pending })
            return
          }
          setError("Ingen uppkoppling, och ingen sparad data att visa än.")
          return
        }
        if (e instanceof OnboardingRequired) {
          window.location.replace(ONBOARDING_PATH)
          return
        }
        if (e instanceof Error && e.message === "Inte inloggad") {
          router.replace(`/logga-in?next=${encodeURIComponent(window.location.pathname)}`)
          return
        }
        setError(e instanceof Error ? e.message : "Kunde inte ladda data")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [role, router, engine])

  // Cache för offlinestart (avstudsad). Rensas vid utloggning.
  React.useEffect(() => {
    if (!data || !me) return
    const t = window.setTimeout(() => writeCache(me, data), 1000)
    return () => window.clearTimeout(t)
  }, [data, me])

  // Synka när nätet kommer tillbaka eller fliken blir aktiv igen.
  React.useEffect(() => {
    const kick = () => void engine.flush()
    const onVisible = () => document.visibilityState === "visible" && kick()
    window.addEventListener("online", kick)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("online", kick)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [engine])

  // Realtid.
  React.useEffect(() => {
    if (!me) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    void import("@/lib/data/supabase-source").then(({ subscribeRealtime }) => {
      if (!cancelled) unsubscribe = subscribeRealtime(getSupabase(), me, engine.apply)
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [me, engine])

  const actions = React.useMemo(
    () =>
      me && createActions({ me, mode: "supabase", dispatch: engine.apply, getData: engine.getData, commit: engine.commit }),
    [me, engine]
  )

  const signOut = React.useCallback(async () => {
    const pending = engine.pending
    if (pending > 0 && !window.confirm(`${pending} ändringar är inte synkade än och försvinner om du loggar ut. Logga ut ändå?`)) {
      return
    }
    engine.forget()
    // Appen: enheten ska inte få fler push-notiser för kontot.
    await forgetPushToken().catch(() => {})
    await getSupabase().auth.signOut()
    window.location.replace("/logga-in")
  }, [engine])

  const deleteAccount = React.useCallback(async () => {
    const { error: rpcError } = await getSupabase().rpc("delete_my_account")
    if (rpcError) {
      toast.error("Kontot kunde inte raderas", { description: rpcError.message })
      return
    }
    engine.forget()
    await getSupabase().auth.signOut()
    window.location.replace("/konto-raderat")
  }, [engine])

  const value = React.useMemo<Ctx | null>(
    () => (data && me && actions ? { data, me, mode: "supabase", actions, sync, signOut, deleteAccount } : null),
    [data, me, actions, sync, signOut, deleteAccount]
  )

  if (error) return <ErrorScreen message={error} />
  if (!value) return <LoadingScreen />
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

function readCache(uid: string): { me: Me; data: AppData } | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { me?: Me; data?: unknown }
    const data = normalizeAppData(parsed.data)
    return parsed.me && data ? { me: parsed.me, data } : null
  } catch {
    return null
  }
}
function writeCache(me: Me, data: AppData) {
  try {
    window.localStorage.setItem(cacheKey(me.id), JSON.stringify({ me, data }))
  } catch {}
}
function clearCache(uid: string) {
  try {
    window.localStorage.removeItem(cacheKey(uid))
  } catch {}
}

// ---------------------------------------------------------------- hooks ---

export function useAppData() {
  const ctx = React.useContext(DataContext)
  if (!ctx) throw new Error("useAppData måste användas inom <AppDataProvider>")
  return ctx
}

function LoadingScreen() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4" aria-busy="true">
      <BrandMark size="lg" className="animate-pulse" />
      <span className="text-sm font-semibold tracking-tight">{BRAND.name}</span>
      <span className="sr-only">Laddar…</span>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-medium">Något gick fel</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <button className="text-sm underline underline-offset-4" onClick={() => window.location.reload()}>
        Försök igen
      </button>
    </div>
  )
}
