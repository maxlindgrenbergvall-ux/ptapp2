/**
 * Supabase som datakälla: laddar allt användaren får se (RLS filtrerar),
 * översätter rader ⇄ domäntyper, skickar köade actions och lyssnar på realtid.
 */
import type { PostgrestError, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"

import type { PersistResult } from "@/lib/data/outbox"
import type { Action, PersistableAction } from "@/lib/data/state"
import { addDays, todayISO } from "@/lib/date"
import type {
  AppData,
  Attachment,
  Booking,
  Client,
  ClientStatus,
  Exercise,
  FoodEntry,
  Me,
  Message,
  NutritionPlan,
  Review,
  ScheduledWorkout,
  SetLog,
  SleepLog,
  Specialty,
  Trainer,
  WaterLog,
  WearableConnection,
  WorkoutExercise,
  WorkoutTemplate,
} from "@/types/domain"

// ----------------------------------------------------------------- rader ---
// Speglar supabase/migrations/*_init.sql. (Kan bytas mot `supabase gen types`.)

interface ProfileRow {
  id: string
  role: "client" | "trainer"
  full_name: string
}
interface TrainerRow {
  id: string
  city: string
  specialties: Specialty[]
  bio: string
  years_experience: number
  price_per_session: number
  coaching_mode: Trainer["coachingMode"]
  avatar_url: string | null
  certifications: string[] | null
  is_published: boolean
  profile?: { full_name: string } | null
  trainer_availability?: { slot: string }[]
  reviews?: ReviewRow[]
}
interface ReviewRow {
  id: string
  author_name: string
  rating: number
  text: string
  created_at: string
}
interface RelationshipRow {
  trainer_id: string
  client_id: string
  status: ClientStatus | "ended"
  goal: string
  started_at: string | null
  created_at: string
  client?: { full_name: string } | null
}
interface WorkoutRow {
  id: string
  client_id: string
  template_id: string | null
  name: string
  date: string
  exercises: WorkoutExercise[]
  status: ScheduledWorkout["status"]
  completed_at: string | null
  client_comment: string | null
  set_logs?: SetLogRow[]
}
interface SetLogRow {
  workout_id: string
  workout_exercise_id: string
  set_index: number
  kg: number | string
  reps: number
  done: boolean
}
interface TemplateRow {
  id: string
  trainer_id: string
  name: string
  description: string
  exercises: WorkoutExercise[]
}
interface NutritionRow {
  id: string
  trainer_id: string
  client_id: string
  name: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  meals: NutritionPlan["meals"]
}
interface MessageRow {
  id: string
  client_id: string
  sender_id: string
  body: string
  workout_id: string | null
  sent_at: string
  read_at: string | null
  attachments: AttachmentRow[] | null
}
/** Bilagor sparas med sökväg i bucketen chat-attachments. */
interface AttachmentRow {
  id: string
  name: string
  mime: string
  size: number
  kind: Attachment["kind"]
  path: string
}
interface FoodRow {
  id: string
  client_id: string
  date: string
  name: string
  kcal: number
  protein_g: number | string
  carbs_g: number | string
  fat_g: number | string
}
interface WaterRow {
  client_id: string
  date: string
  ml: number
}
interface SleepRow {
  client_id: string
  date: string
  hours: number | string
  quality: number | null
  sleep_score: number | null
  stages: SleepLog["stages"] | null
  source: SleepLog["source"]
}
interface WearableRow {
  provider: WearableConnection["provider"]
  status: WearableConnection["status"]
  connected_at: string
  last_synced_at: string | null
  last_error: string | null
}
interface BookingRow {
  id: string
  trainer_id: string
  client_id: string
  slot: string
  status: Booking["status"]
  note: string | null
}

// ------------------------------------------------------------ mappning ---

const toTrainer = (r: TrainerRow, nameFallback = "PT"): Trainer => ({
  id: r.id,
  name: r.profile?.full_name ?? nameFallback,
  city: r.city,
  specialties: r.specialties ?? [],
  bio: r.bio,
  yearsExperience: r.years_experience,
  pricePerSession: r.price_per_session,
  coachingMode: r.coaching_mode,
  avatarUrl: r.avatar_url ?? undefined,
  certifications: r.certifications ?? [],
  isPublished: r.is_published,
  availability: (r.trainer_availability ?? []).map((a) => new Date(a.slot).toISOString()).sort(),
  reviews: (r.reviews ?? []).map(toReview),
  rating: r.reviews?.length ? r.reviews.reduce((s, x) => s + x.rating, 0) / r.reviews.length : 0,
})

const toReview = (r: ReviewRow): Review => ({
  id: r.id,
  author: r.author_name,
  rating: Math.min(5, Math.max(1, r.rating)) as Review["rating"],
  text: r.text,
  date: r.created_at.slice(0, 10),
})

const toSetLog = (r: SetLogRow): SetLog => ({
  workoutExerciseId: r.workout_exercise_id,
  setIndex: r.set_index,
  kg: Number(r.kg),
  reps: r.reps,
  done: r.done,
})

export const toWorkout = (r: WorkoutRow): ScheduledWorkout => ({
  id: r.id,
  clientId: r.client_id,
  templateId: r.template_id,
  name: r.name,
  date: r.date,
  exercises: r.exercises ?? [],
  status: r.status,
  logs: (r.set_logs ?? []).map(toSetLog),
  completedAt: r.completed_at ?? undefined,
  clientComment: r.client_comment ?? undefined,
})

const toTemplate = (r: TemplateRow): WorkoutTemplate => ({
  id: r.id,
  trainerId: r.trainer_id,
  name: r.name,
  description: r.description,
  exercises: r.exercises ?? [],
})

const toPlan = (r: NutritionRow): NutritionPlan => ({
  id: r.id,
  trainerId: r.trainer_id,
  clientId: r.client_id,
  name: r.name,
  targets: { kcal: r.kcal, protein: r.protein_g, carbs: r.carbs_g, fat: r.fat_g },
  meals: r.meals ?? [],
})

export const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  threadId: r.client_id,
  senderId: r.sender_id,
  body: r.body,
  workoutId: r.workout_id ?? undefined,
  sentAt: new Date(r.sent_at).toISOString(),
  readAt: r.read_at ?? undefined,
  attachments: (r.attachments ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    mime: a.mime,
    size: a.size,
    kind: a.kind,
    ref: `storage:chat-attachments/${a.path}`,
  })),
})

const toAttachmentRow = (a: Attachment): AttachmentRow => ({
  id: a.id,
  name: a.name,
  mime: a.mime,
  size: a.size,
  kind: a.kind,
  path: a.ref.replace(/^storage:chat-attachments\//, ""),
})

export const toFood = (r: FoodRow): FoodEntry => ({
  id: r.id,
  clientId: r.client_id,
  date: r.date,
  name: r.name,
  kcal: r.kcal,
  protein: Number(r.protein_g),
  carbs: Number(r.carbs_g),
  fat: Number(r.fat_g),
})

export const toWater = (r: WaterRow): WaterLog => ({ clientId: r.client_id, date: r.date, ml: r.ml })

export const toSleep = (r: SleepRow): SleepLog => ({
  clientId: r.client_id,
  date: r.date,
  hours: Number(r.hours),
  quality: r.quality ?? undefined,
  sleepScore: r.sleep_score ?? undefined,
  stages: r.stages ?? undefined,
  source: r.source,
})

export const toWearable = (r: WearableRow): WearableConnection => ({
  provider: r.provider,
  status: r.status,
  connectedAt: r.connected_at,
  lastSyncedAt: r.last_synced_at ?? undefined,
  lastError: r.last_error ?? undefined,
})

export const toBooking = (r: BookingRow): Booking => ({
  id: r.id,
  trainerId: r.trainer_id,
  clientId: r.client_id,
  slot: new Date(r.slot).toISOString(),
  status: r.status,
  note: r.note ?? undefined,
})

// ------------------------------------------------------------- laddning ---

/** Fel som betyder "ingen kontakt" snarare än "nekad". */
export class OfflineError extends Error {}

function must<T>(res: { data: T | null; error: PostgrestError | null; status?: number }, what: string): T {
  if (res.error) {
    if (isTransient(res.error, res.status)) throw new OfflineError(`${what}: ${res.error.message}`)
    throw new Error(`${what}: ${res.error.message}`)
  }
  return (res.data ?? []) as T
}

/** Hur långt bak historik laddas. Äldre pass hämtas vid behov i en senare version. */
const HISTORY_DAYS = 365

export async function loadRemote(sb: SupabaseClient): Promise<{ me: Me; data: AppData }> {
  const { data: auth, error: authError } = await sb.auth.getUser()
  if (authError || !auth.user) {
    if (authError && isTransient(authError)) throw new OfflineError(authError.message)
    throw new Error("Inte inloggad")
  }
  const uid = auth.user.id

  const profile = must<ProfileRow>(await sb.from("profiles").select("id, role, full_name").eq("id", uid).single(), "profil")
  const me: Me = { id: uid, role: profile.role, name: profile.full_name, email: auth.user.email }
  const since = addDays(todayISO(), -HISTORY_DAYS)

  const trainerSelect =
    "*, profile:profiles!trainers_id_fkey(full_name), trainer_availability(slot), reviews(id, author_name, rating, text, created_at)"

  // Gemensamt för båda rollerna (RLS avgör vad som syns).
  const trackerSince = addDays(todayISO(), -60)
  const [exercises, workouts, messages, bookings, plans, food, water, sleep] = await Promise.all([
    sb.from("exercises").select("id, name, muscle_group, equipment, video_url").order("name"),
    sb.from("scheduled_workouts").select("*, set_logs(*)").gte("date", since).order("date"),
    sb.from("messages").select("*").order("sent_at"),
    sb.from("bookings").select("*").order("slot"),
    sb.from("nutrition_plans").select("*").eq("is_active", true),
    sb.from("food_entries").select("*").gte("date", trackerSince).order("created_at"),
    sb.from("water_logs").select("client_id, date, ml").gte("date", trackerSince),
    sb.from("sleep_logs").select("*").gte("date", trackerSince).order("date"),
  ])

  const base = {
    exercises: must<{ id: string; name: string; muscle_group: Exercise["muscleGroup"]; equipment: string; video_url: string | null }[]>(
      exercises,
      "övningar"
    ).map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscle_group, equipment: e.equipment, videoUrl: e.video_url ?? undefined })),
    workouts: must<WorkoutRow[]>(workouts, "pass").map(toWorkout),
    messages: must<MessageRow[]>(messages, "meddelanden").map(toMessage),
    bookings: must<BookingRow[]>(bookings, "bokningar").map(toBooking),
    nutritionPlans: must<NutritionRow[]>(plans, "kostscheman").map(toPlan),
    foodEntries: must<FoodRow[]>(food, "extra mat").map(toFood),
    waterLogs: must<WaterRow[]>(water, "vatten").map(toWater),
    sleepLogs: must<SleepRow[]>(sleep, "sömn").map(toSleep),
  }

  if (me.role === "trainer") {
    const [self, rels, weights, templates] = await Promise.all([
      sb.from("trainers").select(trainerSelect).eq("id", uid).single(),
      sb
        .from("coaching_relationships")
        .select("*, client:profiles!coaching_relationships_client_id_fkey(full_name)")
        .eq("trainer_id", uid)
        .neq("status", "ended"),
      sb.from("weight_entries").select("client_id, date, kg").gte("date", since).order("date"),
      sb.from("workout_templates").select("*").eq("trainer_id", uid).order("name"),
    ])
    const weightRows = must<{ client_id: string; date: string; kg: number | string }[]>(weights, "vikt")
    const clients: Client[] = must<RelationshipRow[]>(rels, "klienter").map((r) => ({
      id: r.client_id,
      name: r.client?.full_name ?? "Okänd",
      trainerId: uid,
      goal: r.goal,
      status: r.status === "ended" ? "paused" : r.status,
      startDate: r.started_at ?? r.created_at.slice(0, 10),
      weightLog: weightRows.filter((w) => w.client_id === r.client_id).map((w) => ({ date: w.date, kg: Number(w.kg) })),
    }))
    return {
      me,
      data: {
        ...base,
        trainers: [toTrainer(must<TrainerRow>(self, "PT-profil"), me.name)],
        clients,
        templates: must<TemplateRow[]>(templates, "mallar").map(toTemplate),
        mealChecks: [],
        wearables: [],
      },
    }
  }

  // Klient
  const [trainers, rels, weights, meals, wearables] = await Promise.all([
    sb.from("trainers").select(trainerSelect),
    sb.from("coaching_relationships").select("*").eq("client_id", uid).neq("status", "ended").order("created_at", { ascending: false }),
    sb.from("weight_entries").select("date, kg").eq("client_id", uid).order("date"),
    sb.from("meal_checks").select("date, meal_id").eq("client_id", uid).gte("date", addDays(todayISO(), -30)),
    sb.from("wearable_connections").select("provider, status, connected_at, last_synced_at, last_error"),
  ])
  // Aktiv relation går före en obesvarad förfrågan.
  const relRows = must<RelationshipRow[]>(rels, "relation")
  const rel = relRows.find((r) => r.status === "active" || r.status === "paused") ?? relRows[0]
  const self: Client = {
    id: uid,
    name: me.name,
    trainerId: rel?.trainer_id ?? null,
    goal: rel?.goal ?? "",
    status: rel && rel.status !== "ended" ? rel.status : "pending",
    startDate: rel?.started_at ?? todayISO(),
    weightLog: must<{ date: string; kg: number | string }[]>(weights, "vikt").map((w) => ({ date: w.date, kg: Number(w.kg) })),
  }
  return {
    me,
    data: {
      ...base,
      trainers: must<TrainerRow[]>(trainers, "tränare").map((t) => toTrainer(t)),
      clients: [self],
      templates: [],
      mealChecks: must<{ date: string; meal_id: string }[]>(meals, "måltider").map((m) => ({
        clientId: uid,
        date: m.date,
        mealId: m.meal_id,
      })),
      wearables: must<WearableRow[]>(wearables, "wearables").map(toWearable),
    },
  }
}

// ------------------------------------------------------------ skrivning ---

function isTransient(error: { code?: string; status?: number; message?: string; name?: string }, status?: number) {
  const s = status ?? error.status
  if (typeof navigator !== "undefined" && !navigator.onLine) return true
  if (s === 0 || s === 408 || s === 429 || (s !== undefined && s >= 500)) return true
  // fetch-fel (ingen HTTP-respons alls) saknar Postgres-felkod.
  return !error.code && /fetch|network|timeout|abort/i.test(`${error.name ?? ""} ${error.message ?? ""}`)
}

async function result(promise: PromiseLike<{ error: PostgrestError | null; status: number }>): Promise<PersistResult> {
  let res: { error: PostgrestError | null; status: number }
  try {
    res = await promise
  } catch (e) {
    return { ok: false, retry: true, message: e instanceof Error ? e.message : "Nätverksfel" }
  }
  const { error, status } = res
  if (!error) return { ok: true }
  // Omskick av en rad som redan sparats (samma primärnyckel) = redan klart.
  if (error.code === "23505" && /_pkey/.test(error.message)) return { ok: true }
  if (isTransient(error, status)) return { ok: false, retry: true, message: error.message }
  return { ok: false, retry: false, message: friendlyError(error) }
}

function friendlyError(error: PostgrestError) {
  if (error.code === "42501") return "Du saknar behörighet för ändringen."
  if (error.code === "23505" && /bookings_no_double/.test(error.message)) return "Tiden hann bokas av någon annan."
  if (error.code === "P0001") return error.message
  if (error.code === "23514") return "Ett värde ligger utanför tillåtna gränser."
  return error.message
}

export function persistAction(sb: SupabaseClient, me: Me, action: PersistableAction): Promise<PersistResult> {
  switch (action.type) {
    case "upsertSetLog": {
      const { log } = action
      return result(
        sb.from("set_logs").upsert({
          workout_id: action.workoutId,
          workout_exercise_id: log.workoutExerciseId,
          set_index: log.setIndex,
          kg: log.kg,
          reps: log.reps,
          done: log.done,
          logged_at: new Date().toISOString(),
        })
      )
    }
    case "setWorkoutStatus":
      return result(
        sb
          .from("scheduled_workouts")
          .update({
            status: action.status,
            completed_at: action.status === "completed" ? action.completedAt ?? new Date().toISOString() : null,
            ...(action.comment !== undefined ? { client_comment: action.comment } : {}),
          })
          .eq("id", action.workoutId)
      )
    case "addWorkout": {
      const w = action.workout
      return result(
        sb.from("scheduled_workouts").insert({
          id: w.id,
          client_id: w.clientId,
          trainer_id: me.id,
          template_id: w.templateId,
          name: w.name,
          date: w.date,
          exercises: w.exercises,
          status: w.status,
        })
      )
    }
    case "upsertTemplate": {
      const t = action.template
      return result(
        sb.from("workout_templates").upsert({
          id: t.id,
          trainer_id: me.id,
          name: t.name,
          description: t.description,
          exercises: t.exercises,
          updated_at: new Date().toISOString(),
        })
      )
    }
    case "deleteTemplate":
      return result(sb.from("workout_templates").delete().eq("id", action.templateId))
    case "upsertNutritionPlan": {
      const p = action.plan
      return result(
        sb.from("nutrition_plans").upsert({
          id: p.id,
          trainer_id: me.id,
          client_id: p.clientId,
          name: p.name,
          kcal: p.targets.kcal,
          protein_g: p.targets.protein,
          carbs_g: p.targets.carbs,
          fat_g: p.targets.fat,
          meals: p.meals,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
      )
    }
    case "setMealCheck":
      return action.checked
        ? result(
            sb
              .from("meal_checks")
              .upsert({ client_id: action.clientId, date: action.date, meal_id: action.mealId }, { ignoreDuplicates: true })
          )
        : result(
            sb.from("meal_checks").delete().match({ client_id: action.clientId, date: action.date, meal_id: action.mealId })
          )
    case "addMessage": {
      const m = action.message
      return result(
        sb.from("messages").insert({
          id: m.id,
          client_id: m.threadId,
          sender_id: m.senderId,
          body: m.body,
          workout_id: m.workoutId ?? null,
          sent_at: m.sentAt,
          attachments: (m.attachments ?? []).map(toAttachmentRow),
        })
      )
    }
    case "markThreadRead":
      return result(
        sb
          .from("messages")
          .update({ read_at: action.readAt })
          .eq("client_id", action.threadId)
          .neq("sender_id", action.readerId)
          .is("read_at", null)
      )
    case "addWeight":
      return result(sb.from("weight_entries").upsert({ client_id: action.clientId, date: action.entry.date, kg: action.entry.kg }))
    case "requestCoaching":
      return result(
        sb
          .from("coaching_relationships")
          .upsert({ trainer_id: action.trainerId, client_id: action.clientId, goal: action.goal }, { ignoreDuplicates: true })
      )
    case "addBooking": {
      const b = action.booking
      return result(
        sb.from("bookings").insert({ id: b.id, trainer_id: b.trainerId, client_id: b.clientId, slot: b.slot, note: b.note ?? null })
      )
    }
    case "setBookingStatus":
      return result(sb.from("bookings").update({ status: action.status }).eq("id", action.bookingId))
    case "setClientStatus":
      return result(
        sb
          .from("coaching_relationships")
          .update({ status: action.status, ...(action.startedAt ? { started_at: action.startedAt } : {}) })
          .match({ trainer_id: me.id, client_id: action.clientId })
      )
    case "updateTrainerProfile": {
      const p = action.patch
      const row: Record<string, unknown> = {}
      if (p.city !== undefined) row.city = p.city
      if (p.specialties !== undefined) row.specialties = p.specialties
      if (p.bio !== undefined) row.bio = p.bio
      if (p.yearsExperience !== undefined) row.years_experience = p.yearsExperience
      if (p.pricePerSession !== undefined) row.price_per_session = p.pricePerSession
      if (p.coachingMode !== undefined) row.coaching_mode = p.coachingMode
      if (p.avatarUrl !== undefined) row.avatar_url = p.avatarUrl || null
      if (p.certifications !== undefined) row.certifications = p.certifications
      if (p.isPublished !== undefined) row.is_published = p.isPublished
      return result(sb.from("trainers").update(row).eq("id", action.trainerId))
    }
    case "addAvailability":
      return result(
        sb.from("trainer_availability").upsert({ trainer_id: action.trainerId, slot: action.slot }, { ignoreDuplicates: true })
      )
    case "removeAvailability":
      return result(sb.from("trainer_availability").delete().match({ trainer_id: action.trainerId, slot: action.slot }))
    case "addFoodEntry": {
      const e = action.entry
      return result(
        sb.from("food_entries").insert({
          id: e.id,
          client_id: e.clientId,
          date: e.date,
          name: e.name,
          kcal: e.kcal,
          protein_g: e.protein,
          carbs_g: e.carbs,
          fat_g: e.fat,
        })
      )
    }
    case "deleteFoodEntry":
      return result(sb.from("food_entries").delete().eq("id", action.id))
    case "setWater":
      return result(
        sb.from("water_logs").upsert({
          client_id: action.clientId,
          date: action.date,
          ml: action.ml,
          updated_at: new Date().toISOString(),
        })
      )
    case "upsertSleep": {
      const l = action.log
      return result(
        sb.from("sleep_logs").upsert({
          client_id: l.clientId,
          date: l.date,
          hours: l.hours,
          quality: l.quality ?? null,
          sleep_score: l.sleepScore ?? null,
          stages: l.stages ?? null,
          source: l.source,
          updated_at: new Date().toISOString(),
        })
      )
    }
  }
}

// -------------------------------------------------------------- realtid ---

/**
 * Nya meddelanden, bokningar och pass (och för PT: loggade set) i realtid.
 * RLS gäller även här, så bara rader användaren får läsa skickas ut.
 */
export function subscribeRealtime(sb: SupabaseClient, me: Me, dispatch: (a: Action) => void): () => void {
  const channel: RealtimeChannel = sb
    .channel(`forma:${me.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
      if (p.new && "id" in p.new) dispatch({ type: "addMessage", message: toMessage(p.new as MessageRow) })
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (p) => {
      if (p.new && "id" in p.new) dispatch({ type: "remoteBooking", booking: toBooking(p.new as BookingRow) })
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_workouts" }, (p) => {
      if (p.new && "id" in p.new) {
        const { logs: _logs, ...workout } = toWorkout(p.new as WorkoutRow)
        void _logs
        dispatch({ type: "remoteWorkout", workout })
      }
    })

  if (me.role === "trainer") {
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "food_entries" }, (p) => {
        if (p.new && "id" in p.new) dispatch({ type: "addFoodEntry", entry: toFood(p.new as FoodRow) })
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "food_entries" }, (p) => {
        if (p.old && "id" in p.old) dispatch({ type: "deleteFoodEntry", id: (p.old as { id: string }).id })
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "water_logs" }, (p) => {
        const r = p.new as WaterRow | undefined
        if (r && "ml" in r) dispatch({ type: "setWater", clientId: r.client_id, date: r.date, ml: r.ml })
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sleep_logs" }, (p) => {
        const r = p.new as SleepRow | undefined
        if (r && "hours" in r) dispatch({ type: "upsertSleep", log: toSleep(r) })
      })
    channel.on("postgres_changes", { event: "*", schema: "public", table: "set_logs" }, (p) => {
      const row = p.new as SetLogRow | undefined
      if (row && "workout_id" in row) dispatch({ type: "upsertSetLog", workoutId: row.workout_id, log: toSetLog(row) })
    })
  }

  channel.subscribe()
  return () => {
    void sb.removeChannel(channel)
  }
}

/** Efter en wearable-synk: läs om sömn och anslutningar (RLS: bara egna rader). */
export async function reloadSleepAndWearables(sb: SupabaseClient) {
  const [sleep, conns] = await Promise.all([
    sb.from("sleep_logs").select("*").gte("date", addDays(todayISO(), -60)).order("date"),
    sb.from("wearable_connections").select("provider, status, connected_at, last_synced_at, last_error"),
  ])
  return {
    sleepLogs: must<SleepRow[]>(sleep, "sömn").map(toSleep),
    wearables: must<WearableRow[]>(conns, "wearables").map(toWearable),
  }
}
