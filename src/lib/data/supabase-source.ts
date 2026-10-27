/**
 * Supabase som datakälla: laddar allt användaren får se (RLS filtrerar),
 * översätter rader ⇄ domäntyper, skickar köade actions och lyssnar på realtid.
 */
import type { PostgrestError, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"

import type { PersistResult } from "@/lib/data/outbox"
import type { Action, PersistableAction } from "@/lib/data/state"
import { addDays, todayISO } from "@/lib/date"
import type {
  AcquisitionType,
  PtInvite,
  WeightUnit,
  Account,
  AppData,
  AppNotification,
  Attachment,
  AvailabilityRule,
  CalendarEvent,
  CartItem,
  Client,
  CoachingRelationship,
  ClientStatus,
  Exercise,
  ExerciseAlias,
  FoodEntry,
  FoodProduct,
  Me,
  Message,
  NutritionPlan,
  ProgressEntry,
  Referral,
  Purchase,
  Recipe,
  Review,
  ScheduledWorkout,
  SetLog,
  SleepLog,
  Slot,
  Specialty,
  Trainer,
  TrainerOffer,
  TrainerService,
  WaterLog,
  WearableConnection,
  WorkoutExercise,
  WorkoutTemplate,
} from "@/types/domain"

// ----------------------------------------------------------------- rader ---
// Speglar supabase/migrations/*_init.sql. (Kan bytas mot `supabase gen types`.)

interface ProfileRow {
  id: string
  /** null = kontot har inte valt kontotyp i välkomststeget än. */
  role: "client" | "trainer" | null
  full_name: string
  interests?: string[] | null
  focus?: string | null
  avatar_url?: string | null
}

/** Kontot finns men kontotyp är inte vald (nytt konto via e-post, Apple eller Google). */
export class OnboardingRequired extends Error {}
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
  offers_training?: boolean
  offers_nutrition?: boolean
  profile?: { full_name: string } | null
  min_notice_minutes?: number | null
  boosted_until?: string | null
  reviews?: ReviewRow[]
}
interface CartRow {
  client_id: string
  service_id: string
  trainer_id: string
  added_at: string
  quantity?: number
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
  /** v19 – saknas i äldre databaser. */
  acquisition_type?: AcquisitionType | null
  client?: { full_name: string; interests?: string[] | null; focus?: string | null; avatar_url?: string | null } | null
}
interface WorkoutRow {
  id: string
  client_id: string
  /** null = klientens eget pass. */
  trainer_id?: string | null
  event_id?: string | null
  verified_at?: string | null
  verified_by?: string | null
  trainer_comment?: string | null
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
  is_active?: boolean
}
interface MessageRow {
  id: string
  client_id: string
  trainer_id?: string | null
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
  grams: number | string | null
  unit?: "g" | "ml" | null
  barcode: string | null
  product_id: string | null
}
export interface ProductRow {
  id: string
  barcode: string | null
  name: string
  brand: string | null
  kcal_100g: number | string
  protein_100g: number | string
  carbs_100g: number | string
  fat_100g: number | string
  serving_g: number | string | null
  source: "openfoodfacts" | "custom"
  unit?: "g" | "ml" | null
  image_url?: string | null
  sold_in_se?: boolean | null
}
interface AliasRow {
  client_id: string
  exercise_id: string
  name: string
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
interface EventRow {
  id: string
  trainer_id: string
  client_id: string | null
  kind: CalendarEvent["kind"]
  status: CalendarEvent["status"]
  title: string
  start_time: string
  end_time: string
  mode: CalendarEvent["mode"]
  location: string | null
  notes: string | null
  workout_id: string | null
  created_by: string | null
  cancelled_by: string | null
  awaiting: "trainer" | "client" | null
  previous_start: string | null
  previous_end: string | null
}
interface NotificationRow {
  id: string
  user_id: string
  actor_id: string | null
  kind: AppNotification["kind"]
  event_id: string | null
  payload: { actor_name?: string; title?: string; start?: string; end?: string; previous_start?: string; previous_end?: string }
  read_at: string | null
  created_at: string
}
interface OfferRow {
  id: string
  trainer_id: string
  category: Specialty
  title: string
  description: string
  price_sek: number | null
  discount_percent: number | null
  valid_until: string | null
  active: boolean
  created_at: string
}
interface ServiceRow {
  id: string
  trainer_id: string
  kind: TrainerService["kind"]
  title: string
  description: string
  sessions: number
  includes_nutrition: boolean
  duration_weeks: number | null
  price_sek: number
  active: boolean
}
export interface PurchaseRow {
  id: string
  checkout_id: string
  client_id: string
  trainer_id: string
  service_id: string | null
  kind: Purchase["kind"]
  title: string
  sessions: number
  includes_nutrition: boolean
  price_sek: number
  quantity?: number
  status: Purchase["status"]
  created_at: string
  paid_at: string | null
}
interface RecipeRow {
  id: string
  trainer_id: string
  name: string
  notes: string
  items: Recipe["items"]
}
interface RuleRow {
  id: string
  trainer_id: string
  weekday: number | null
  date: string | null
  start_local: string
  end_local: string
  slot_minutes: number
}

// ------------------------------------------------------------ mappning ---

export interface CustomExerciseRow {
  id: string
  user_id: string
  name: string
  default_weight: number | string | null
  weight_unit: WeightUnit
  default_sets: number
  default_reps: string
  muscle_group: Exercise["muscleGroup"]
  created_at: string
}
/** Egen övning → samma form som övningsbanken (syns i alla övningslistor). */
export const toCustomExercise = (r: CustomExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  muscleGroup: r.muscle_group,
  equipment: "",
  custom: {
    ownerId: r.user_id,
    defaultWeight: r.default_weight === null ? undefined : Number(r.default_weight),
    weightUnit: r.weight_unit,
    defaultSets: r.default_sets,
    defaultReps: r.default_reps,
    createdAt: r.created_at,
  },
})

export interface PtInviteRow {
  id: string
  pt_id?: string
  code: string
  label: string | null
  is_used?: boolean
  used_by?: string | null
  used_at?: string | null
  expires_at: string
  created_at: string
}
export const toPtInvite = (r: PtInviteRow, trainerId: string): PtInvite => ({
  id: r.id,
  trainerId: r.pt_id ?? trainerId,
  code: r.code,
  label: r.label ?? undefined,
  isUsed: r.is_used ?? false,
  usedBy: r.used_by ?? undefined,
  usedAt: r.used_at ?? undefined,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
})

export const TRAINER_SELECT = "*, profile:profiles!trainers_id_fkey(full_name), reviews(id, author_name, rating, text, created_at)"

export const toTrainer = (r: TrainerRow, nameFallback = "PT"): Trainer => ({
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
  offersTraining: r.offers_training ?? true,
  offersNutrition: r.offers_nutrition ?? false,
  minNoticeMinutes: r.min_notice_minutes ?? undefined,
  boostedUntil: r.boosted_until ?? undefined,
  reviews: (r.reviews ?? []).map(toReview),
  rating: r.reviews?.length ? r.reviews.reduce((s, x) => s + x.rating, 0) / r.reviews.length : 0,
})

const toCart = (r: CartRow): CartItem => ({
  clientId: r.client_id,
  serviceId: r.service_id,
  trainerId: r.trainer_id,
  addedAt: r.added_at,
  quantity: r.quantity ?? 1,
})

interface AccountRow {
  referral_code: string
  coavira_plus_until: string | null
  is_coavira_plus: boolean
  created_at?: string
  can_redeem?: boolean
  /** v21 */
  store_plus_renews?: boolean
  store_plus_product?: string | null
}
interface ReferralRow {
  id: string
  referrer_id: string
  referred_id: string
  type: Referral["type"]
  status: Referral["status"]
  referrer_rewarded: boolean
  created_at: string
  completed_at: string | null
}
export const toAccount = (r: AccountRow): Account => ({
  referralCode: r.referral_code,
  plusUntil: r.coavira_plus_until ?? undefined,
  plusLifetime: r.is_coavira_plus,
  createdAt: r.created_at,
  canRedeem: r.can_redeem ?? false,
  storePlusRenews: r.store_plus_renews ?? false,
  storePlusProduct: r.store_plus_product ?? undefined,
})
export const toReferral = (r: ReferralRow): Referral => ({
  id: r.id,
  referrerId: r.referrer_id,
  referredId: r.referred_id,
  type: r.type,
  status: r.status,
  referrerRewarded: r.referrer_rewarded,
  createdAt: r.created_at,
  completedAt: r.completed_at ?? undefined,
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
  ...(r.trainer_id ? { trainerId: r.trainer_id } : {}),
  ...(r.trainer_id === null ? { byClient: true } : {}),
  ...(r.event_id ? { eventId: r.event_id } : {}),
  ...(r.verified_at ? { verifiedAt: r.verified_at, verifiedBy: r.verified_by ?? undefined } : {}),
  ...(r.trainer_comment ? { trainerComment: r.trainer_comment } : {}),
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
  active: r.is_active ?? true,
})

interface ProgressRow {
  id: string
  client_id: string
  metric: string
  value: number | string
  date: string
  note: string | null
}
const toProgress = (r: ProgressRow): ProgressEntry => ({
  id: r.id,
  clientId: r.client_id,
  metric: r.metric,
  value: Number(r.value),
  date: r.date,
  note: r.note || undefined,
})

export const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  threadId: r.client_id,
  ...(r.trainer_id ? { trainerId: r.trainer_id } : {}),
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
  grams: r.grams === null ? undefined : Number(r.grams),
  unit: r.unit === "ml" ? "ml" : undefined,
  barcode: r.barcode ?? undefined,
  productId: r.product_id ?? undefined,
})

export const toProduct = (r: ProductRow): FoodProduct => ({
  id: r.id,
  name: r.name,
  brand: r.brand ?? undefined,
  barcode: r.barcode ?? undefined,
  per100: { kcal: Number(r.kcal_100g), protein: Number(r.protein_100g), carbs: Number(r.carbs_100g), fat: Number(r.fat_100g) },
  servingG: r.serving_g === null ? undefined : Number(r.serving_g),
  unit: r.unit === "ml" ? "ml" : "g",
  soldInSweden: r.sold_in_se ?? undefined,
  imageUrl: r.image_url ?? undefined,
  source: r.source,
})

const toAlias = (r: AliasRow): ExerciseAlias => ({ clientId: r.client_id, exerciseId: r.exercise_id, name: r.name })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export const toEvent = (r: EventRow): CalendarEvent => ({
  id: r.id,
  trainerId: r.trainer_id,
  clientId: r.client_id ?? undefined,
  kind: r.kind,
  status: r.status,
  title: r.title,
  start: new Date(r.start_time).toISOString(),
  end: new Date(r.end_time).toISOString(),
  mode: r.mode,
  location: r.location ?? undefined,
  notes: r.notes ?? undefined,
  workoutId: r.workout_id ?? undefined,
  createdBy: r.created_by ?? undefined,
  cancelledBy: r.cancelled_by ?? undefined,
  awaiting: r.awaiting ?? undefined,
  previousStart: r.previous_start ? new Date(r.previous_start).toISOString() : undefined,
  previousEnd: r.previous_end ? new Date(r.previous_end).toISOString() : undefined,
})

const iso = (v?: string) => (v ? new Date(v).toISOString() : undefined)

export const toNotification = (r: NotificationRow): AppNotification => ({
  id: r.id,
  userId: r.user_id,
  actorId: r.actor_id ?? undefined,
  actorName: r.payload?.actor_name,
  kind: r.kind,
  eventId: r.event_id ?? undefined,
  title: r.payload?.title,
  start: iso(r.payload?.start),
  end: iso(r.payload?.end),
  previousStart: iso(r.payload?.previous_start),
  previousEnd: iso(r.payload?.previous_end),
  createdAt: r.created_at,
  readAt: r.read_at ?? undefined,
})

export const toOffer = (r: OfferRow): TrainerOffer => ({
  id: r.id,
  trainerId: r.trainer_id,
  category: r.category,
  title: r.title,
  description: r.description,
  priceSek: r.price_sek ?? undefined,
  discountPercent: r.discount_percent ?? undefined,
  validUntil: r.valid_until ?? undefined,
  active: r.active,
  createdAt: r.created_at,
})

const toService = (r: ServiceRow): TrainerService => ({
  id: r.id,
  trainerId: r.trainer_id,
  kind: r.kind,
  title: r.title,
  description: r.description,
  sessions: r.sessions,
  includesNutrition: r.includes_nutrition,
  durationWeeks: r.duration_weeks ?? undefined,
  priceSek: r.price_sek,
  active: r.active,
})

export const toPurchase = (r: PurchaseRow): Purchase => ({
  id: r.id,
  checkoutId: r.checkout_id,
  clientId: r.client_id,
  trainerId: r.trainer_id,
  serviceId: r.service_id ?? undefined,
  kind: r.kind,
  title: r.title,
  sessions: r.sessions,
  includesNutrition: r.includes_nutrition,
  priceSek: r.price_sek,
  quantity: r.quantity ?? 1,
  status: r.status,
  createdAt: r.created_at,
  paidAt: r.paid_at ?? undefined,
})

const toRecipe = (r: RecipeRow): Recipe => ({
  id: r.id,
  trainerId: r.trainer_id,
  name: r.name,
  notes: r.notes,
  items: Array.isArray(r.items) ? r.items : [],
})

const toRule = (r: RuleRow): AvailabilityRule => ({
  id: r.id,
  trainerId: r.trainer_id,
  weekday: r.weekday ?? undefined,
  date: r.date ?? undefined,
  start: r.start_local.slice(0, 5),
  end: r.end_local.slice(0, 5),
  slotMinutes: r.slot_minutes,
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

  const profile = must<ProfileRow>(await sb.from("profiles").select("id, role, full_name, interests, focus, avatar_url").eq("id", uid).single(), "profil")
  if (!profile.role) throw new OnboardingRequired("Välj kontotyp")
  const me: Me = { id: uid, role: profile.role, name: profile.full_name, email: auth.user.email }
  const since = addDays(todayISO(), -HISTORY_DAYS)

  const trainerSelect = TRAINER_SELECT

  // Gemensamt för båda rollerna (RLS avgör vad som syns).
  const trackerSince = addDays(todayISO(), -60)
  const [exercises, custom, workouts, messages, events, plans, food, water, sleep, aliases, notifications, offers, services, purchases, progress, account, referrals] = await Promise.all([
    sb.from("exercises").select("id, name, muscle_group, equipment, video_url").order("name"),
    // Egna övningar: mina och de jag tränar med (RLS).
    sb.from("custom_exercises").select("*").order("name").limit(1000),
    sb.from("scheduled_workouts").select("*, set_logs(*)").gte("date", since).order("date"),
    sb.from("messages").select("*").order("sent_at"),
    // Kalendern: 90 dagar bakåt och allt framåt (RLS: PT:ns egna / klientens egna).
    sb.from("calendar_events").select("*").gte("end_time", new Date(Date.now() - 90 * 86_400_000).toISOString()).order("start_time"),
    // Klient: aktivt schema + förslag från PT:er hon/han köpt kost av. PT: egna + det som gäller (RLS).
    sb.from("nutrition_plans").select("*").order("updated_at"),
    sb.from("food_entries").select("*").gte("date", trackerSince).order("created_at"),
    sb.from("water_logs").select("client_id, date, ml").gte("date", trackerSince),
    sb.from("sleep_logs").select("*").gte("date", trackerSince).order("date"),
    sb.from("client_exercise_aliases").select("client_id, exercise_id, name"),
    // Senaste 100 aviseringarna (RLS: bara mina).
    sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
    // PT: egna erbjudanden. Klient: aktiva erbjudanden från publicerade PT:er (RLS).
    me.role === "trainer"
      ? sb.from("trainer_offers").select("*").eq("trainer_id", uid).order("created_at", { ascending: false })
      : sb.from("trainer_offers").select("*").order("created_at", { ascending: false }).limit(200),
    // PT: hela egna menyn. Klient: aktiva tjänster hos publicerade PT:er och egen PT (RLS).
    me.role === "trainer"
      ? sb.from("trainer_services").select("*").eq("trainer_id", uid).order("price_sek")
      : sb.from("trainer_services").select("*").eq("active", true).order("price_sek").limit(500),
    // Köp där jag är klient eller PT (RLS). Obetalda kassor visas inte.
    sb.from("purchases").select("*").neq("status", "cancelled").order("created_at"),
    // Mätpunkter (Framsteg): klientens egna, eller PT:ns klienters (RLS).
    sb.from("progress_entries").select("*").order("date").limit(2000),
    // Egen kod och Coavira Plus (kolumnerna kan bara läsas via my_account) och inbjudningar (RLS: bara mina).
    sb.rpc("my_account"),
    sb.from("referrals").select("*").order("created_at", { ascending: false }).limit(200),
  ])

  const base = {
    exercises: must<{ id: string; name: string; muscle_group: Exercise["muscleGroup"]; equipment: string; video_url: string | null }[]>(
      exercises,
      "övningar"
    )
      .map((e): Exercise => ({ id: e.id, name: e.name, muscleGroup: e.muscle_group, equipment: e.equipment, videoUrl: e.video_url ?? undefined }))
      // Äldre databaser (före v19) saknar custom_exercises.
      .concat(custom.error ? [] : ((custom.data ?? []) as CustomExerciseRow[]).map(toCustomExercise)),
    workouts: must<WorkoutRow[]>(workouts, "pass").map(toWorkout),
    messages: must<MessageRow[]>(messages, "meddelanden").map(toMessage),
    events: must<EventRow[]>(events, "kalender").map(toEvent),
    nutritionPlans: must<NutritionRow[]>(plans, "kostscheman").map(toPlan),
    foodEntries: must<FoodRow[]>(food, "extra mat").map(toFood),
    waterLogs: must<WaterRow[]>(water, "vatten").map(toWater),
    sleepLogs: must<SleepRow[]>(sleep, "sömn").map(toSleep),
    exerciseAliases: must<AliasRow[]>(aliases, "övningsnamn").map(toAlias),
    notifications: must<NotificationRow[]>(notifications, "aviseringar").map(toNotification),
    offers: must<OfferRow[]>(offers, "erbjudanden").map(toOffer),
    services: must<ServiceRow[]>(services, "tjänster").map(toService),
    purchases: must<PurchaseRow[]>(purchases, "köp").map(toPurchase),
    progressEntries: must<ProgressRow[]>(progress, "mätpunkter").map(toProgress),
    // Äldre databaser (före v18) saknar my_account/referrals – då utan Plus och inbjudningar.
    accounts: account.error || !account.data ? {} : { [uid]: toAccount(account.data as AccountRow) },
    referrals: referrals.error ? [] : ((referrals.data ?? []) as ReferralRow[]).map(toReferral),
    ptInvites: [] as PtInvite[],
  }

  if (me.role === "trainer") {
    const [self, rels, weights, templates, rules, recipes, ptMeals, invites] = await Promise.all([
      sb.from("trainers").select(trainerSelect).eq("id", uid).single(),
      sb
        .from("coaching_relationships")
        .select("*, client:profiles!coaching_relationships_client_id_fkey(full_name, interests, focus, avatar_url)")
        .eq("trainer_id", uid)
        .neq("status", "ended"),
      sb.from("weight_entries").select("client_id, date, kg").gte("date", since).order("date"),
      sb.from("workout_templates").select("*").eq("trainer_id", uid).order("name"),
      sb.from("availability_rules").select("*").eq("trainer_id", uid),
      sb.from("recipes").select("*").eq("trainer_id", uid).order("name"),
      // Klienternas avbockade måltider – PT:n ser samma "Dagens kost" som klienten (RLS).
      sb.from("meal_checks").select("client_id, date, meal_id").gte("date", addDays(todayISO(), -30)),
      // PT:ns koder till befintliga klienter (RLS: bara egna).
      sb.from("pt_invites").select("*").order("created_at", { ascending: false }).limit(200),
    ])
    const relRowsPt = must<RelationshipRow[]>(rels, "klienter")
    const weightRows = must<{ client_id: string; date: string; kg: number | string }[]>(weights, "vikt")
    const clients: Client[] = relRowsPt.map((r) => ({
      id: r.client_id,
      name: r.client?.full_name ?? "Okänd",
      trainerId: uid,
      goal: r.goal,
      status: r.status === "ended" ? "paused" : r.status,
      startDate: r.started_at ?? r.created_at.slice(0, 10),
      weightLog: weightRows.filter((w) => w.client_id === r.client_id).map((w) => ({ date: w.date, kg: Number(w.kg) })),
      interests: r.client?.interests ?? [],
      focus: r.client?.focus ?? "",
      avatarUrl: r.client?.avatar_url ?? undefined,
    }))
    return {
      me,
      data: {
        ...base,
        trainers: [toTrainer(must<TrainerRow>(self, "PT-profil"), me.name)],
        clients,
        templates: must<TemplateRow[]>(templates, "mallar").map(toTemplate),
        availabilityRules: must<RuleRow[]>(rules, "tillgänglighet").map(toRule),
        recipes: must<RecipeRow[]>(recipes, "recept").map(toRecipe),
        relationships: clients.map((c) => ({
          trainerId: uid,
          clientId: c.id,
          status: c.status,
          goal: c.goal,
          startDate: c.startDate,
          acquisition: relRowsPt.find((r) => r.client_id === c.id)?.acquisition_type ?? "PLATFORM_CLIENT",
        })),
        ptInvites: invites.error ? [] : ((invites.data ?? []) as PtInviteRow[]).map((r) => toPtInvite(r, uid)),
        mealChecks: must<{ client_id: string; date: string; meal_id: string }[]>(ptMeals, "måltider").map((m) => ({
          clientId: m.client_id,
          date: m.date,
          mealId: m.meal_id,
        })),
        wearables: [],
        customFoods: [],
        cart: [],
      },
    }
  }

  // Klient
  const [trainers, rels, weights, meals, wearables, products, cart] = await Promise.all([
    sb.from("trainers").select(trainerSelect),
    sb.from("coaching_relationships").select("*").eq("client_id", uid).neq("status", "ended").order("created_at", { ascending: false }),
    sb.from("weight_entries").select("date, kg").eq("client_id", uid).order("date"),
    sb.from("meal_checks").select("date, meal_id").eq("client_id", uid).gte("date", addDays(todayISO(), -30)),
    sb.from("wearable_connections").select("provider, status, connected_at, last_synced_at, last_error"),
    sb.from("food_products").select("*").eq("source", "custom").order("updated_at", { ascending: false }).limit(200),
    // Varukorgen (RLS: bara min egen).
    sb.from("cart_items").select("client_id, service_id, trainer_id, added_at, quantity").order("added_at"),
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
    interests: profile.interests ?? [],
    focus: profile.focus ?? "",
    avatarUrl: profile.avatar_url ?? undefined,
  }
  // Alla PT:er klienten tränar med (flera samtidigt är tillåtet).
  const relationships: CoachingRelationship[] = relRows.map((r) => ({
    trainerId: r.trainer_id,
    clientId: uid,
    status: r.status,
    goal: r.goal,
    startDate: r.started_at ?? r.created_at.slice(0, 10),
    acquisition: r.acquisition_type ?? "PLATFORM_CLIENT",
  }))
  return {
    me,
    data: {
      ...base,
      trainers: must<TrainerRow[]>(trainers, "tränare").map((t) => toTrainer(t)),
      clients: [self],
      cart: must<CartRow[]>(cart, "varukorg").map(toCart),
      templates: [],
      availabilityRules: [],
      recipes: [],
      relationships,
      mealChecks: must<{ date: string; meal_id: string }[]>(meals, "måltider").map((m) => ({
        clientId: uid,
        date: m.date,
        mealId: m.meal_id,
      })),
      wearables: must<WearableRow[]>(wearables, "wearables").map(toWearable),
      customFoods: must<ProductRow[]>(products, "egna produkter").map(toProduct),
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
  if (error.code === "23P01") return "Tiden krockar med en annan bokning eller blockering."
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
          // Klientens egna pass har ingen PT.
          trainer_id: me.role === "trainer" ? me.id : null,
          ...(w.eventId ? { event_id: w.eventId } : {}),
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
          // Databasen gör schemat till ett förslag om en annan PT:s schema gäller.
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
          ...(m.trainerId ? { trainer_id: m.trainerId } : {}),
          sent_at: m.sentAt,
          attachments: (m.attachments ?? []).map(toAttachmentRow),
        })
      )
    }
    case "markThreadRead": {
      let q = sb.from("messages").update({ read_at: action.readAt }).eq("client_id", action.threadId).neq("sender_id", action.readerId)
      if (action.trainerId) q = q.eq("trainer_id", action.trainerId)
      return result(q.is("read_at", null))
    }
    case "addWeight":
      return result(sb.from("weight_entries").upsert({ client_id: action.clientId, date: action.entry.date, kg: action.entry.kg }))
    case "requestCoaching":
      return result(
        sb
          .from("coaching_relationships")
          .upsert({ trainer_id: action.trainerId, client_id: action.clientId, goal: action.goal }, { ignoreDuplicates: true })
      )
    case "addEvent": {
      const e = action.event
      // Klientens förfrågan: bara grundfälten; databasen validerar tiden och sätter resten.
      const row: Record<string, unknown> =
        me.role === "client"
          ? { id: e.id, trainer_id: e.trainerId, client_id: me.id, start_time: e.start, end_time: e.end, mode: e.mode, title: e.title, notes: e.notes ?? null }
          : {
              id: e.id,
              trainer_id: me.id,
              client_id: e.clientId ?? null,
              kind: e.kind,
              status: e.status,
              title: e.title,
              start_time: e.start,
              end_time: e.end,
              mode: e.mode,
              location: e.location ?? null,
              notes: e.notes ?? null,
              workout_id: e.workoutId ?? null,
            }
      return result(sb.from("calendar_events").insert(row))
    }
    case "updateEvent": {
      const p = action.patch
      const row: Record<string, unknown> = {}
      if (p.title !== undefined) row.title = p.title
      if (p.start !== undefined) row.start_time = p.start
      if (p.end !== undefined) row.end_time = p.end
      if (p.mode !== undefined) row.mode = p.mode
      if ("location" in p) row.location = p.location ?? null
      if ("notes" in p) row.notes = p.notes ?? null
      if ("workoutId" in p) row.workout_id = p.workoutId ?? null
      return result(sb.from("calendar_events").update(row).eq("id", action.eventId))
    }
    case "setEventStatus":
      return result(sb.from("calendar_events").update({ status: action.status }).eq("id", action.eventId))
    case "rescheduleEvent":
      // Databasen sätter awaiting/previous_* och aviserar motparten.
      return result(sb.from("calendar_events").update({ start_time: action.start, end_time: action.end }).eq("id", action.eventId))
    case "markNotificationsRead":
      return result(sb.from("notifications").update({ read_at: action.readAt }).in("id", action.ids))
    case "saveOffer": {
      const o = action.offer
      return result(
        sb.from("trainer_offers").upsert({
          id: o.id,
          trainer_id: me.id,
          category: o.category,
          title: o.title,
          description: o.description,
          price_sek: o.priceSek ?? null,
          discount_percent: o.discountPercent ?? null,
          valid_until: o.validUntil ?? null,
          active: o.active,
        })
      )
    }
    case "deleteOffer":
      return result(sb.from("trainer_offers").delete().eq("id", action.offerId))
    case "deleteEvent":
      return result(sb.from("calendar_events").delete().eq("id", action.eventId))
    case "saveAvailabilityRule": {
      const r = action.rule
      return result(
        sb.from("availability_rules").upsert({
          id: r.id,
          trainer_id: me.id,
          weekday: r.weekday ?? null,
          date: r.date ?? null,
          start_local: r.start,
          end_local: r.end,
          slot_minutes: r.slotMinutes,
        })
      )
    }
    case "deleteAvailabilityRule":
      return result(sb.from("availability_rules").delete().eq("id", action.ruleId))
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
      if (p.minNoticeMinutes !== undefined) row.min_notice_minutes = p.minNoticeMinutes
      if (p.isPublished !== undefined) row.is_published = p.isPublished
      if (p.offersTraining !== undefined) row.offers_training = p.offersTraining
      if (p.offersNutrition !== undefined) row.offers_nutrition = p.offersNutrition
      // Namnet ligger i profiles (samma för alla roller).
      if (p.name === undefined) return result(sb.from("trainers").update(row).eq("id", action.trainerId))
      const name = p.name
      return (async () => {
        const named = await result(sb.from("profiles").update({ full_name: name }).eq("id", action.trainerId))
        if (!named.ok || Object.keys(row).length === 0) return named
        return result(sb.from("trainers").update(row).eq("id", action.trainerId))
      })()
    }
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
          grams: e.grams ?? null,
          unit: e.unit ?? "g",
          barcode: e.barcode ?? null,
          // Bara riktiga produkt-id:n (baslivsmedel i appen har inga databas-id).
          product_id: e.productId && UUID.test(e.productId) ? e.productId : null,
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
    case "setExerciseAlias":
      return action.name
        ? result(
            sb.from("client_exercise_aliases").upsert({
              client_id: action.clientId,
              exercise_id: action.exerciseId,
              trainer_id: action.trainerId,
              name: action.name,
              updated_at: new Date().toISOString(),
            })
          )
        : result(sb.from("client_exercise_aliases").delete().match({ client_id: action.clientId, exercise_id: action.exerciseId }))
    case "upsertCustomFood": {
      const p = action.product
      const r1 = (n: number) => Math.round(n * 10) / 10
      return result(
        sb.from("food_products").upsert({
          id: p.id,
          barcode: p.barcode ?? null,
          name: p.name.slice(0, 160),
          brand: p.brand?.slice(0, 120) ?? null,
          kcal_100g: r1(p.per100.kcal),
          protein_100g: r1(p.per100.protein),
          carbs_100g: r1(p.per100.carbs),
          fat_100g: r1(p.per100.fat),
          serving_g: p.servingG ?? null,
          unit: p.unit ?? "g",
          source: "custom",
          created_by: me.id,
          updated_at: new Date().toISOString(),
        })
      )
    }
    case "saveService": {
      const x = action.service
      return result(
        sb.from("trainer_services").upsert({
          id: x.id,
          trainer_id: me.id,
          kind: x.kind,
          title: x.title,
          description: x.description,
          sessions: x.sessions,
          includes_nutrition: x.includesNutrition,
          duration_weeks: x.durationWeeks ?? null,
          price_sek: x.priceSek,
          active: x.active,
        })
      )
    }
    case "deleteService":
      return result(sb.from("trainer_services").delete().eq("id", action.serviceId))
    case "saveRecipe": {
      const r = action.recipe
      return result(sb.from("recipes").upsert({ id: r.id, trainer_id: me.id, name: r.name, notes: r.notes, items: r.items }))
    }
    case "deleteRecipe":
      return result(sb.from("recipes").delete().eq("id", action.recipeId))
    case "verifyWorkout":
      return result(
        sb
          .from("scheduled_workouts")
          .update({ status: "completed", completed_at: action.verifiedAt, verified_at: action.verifiedAt, trainer_comment: action.comment ?? null })
          .eq("id", action.workoutId)
      )
    case "deleteWorkout":
      return result(sb.from("scheduled_workouts").delete().eq("id", action.workoutId))
    case "leaveTrainer":
      return result(sb.rpc("end_coaching", { p_trainer: action.trainerId }))
    case "chooseNutritionPlan":
      return result(sb.rpc("choose_nutrition_plan", { p_plan: action.planId }))
    case "updateClientProfile": {
      const p = action.patch
      const row: Record<string, unknown> = {}
      if (p.name !== undefined) row.full_name = p.name
      if (p.interests !== undefined) row.interests = p.interests
      if (p.focus !== undefined) row.focus = p.focus
      if (p.avatarUrl !== undefined) row.avatar_url = p.avatarUrl || null
      return result(sb.from("profiles").update(row).eq("id", action.clientId))
    }
    case "addProgressEntry": {
      const e = action.entry
      return result(
        sb.from("progress_entries").insert({ id: e.id, client_id: e.clientId, metric: e.metric, value: e.value, date: e.date, note: e.note ?? "" })
      )
    }
    case "deleteProgressEntry":
      return result(sb.from("progress_entries").delete().eq("id", action.id))
    // Varukorgen: trainer_id sätts av databasen från tjänsten; samma tjänst två gånger ignoreras.
    case "addCartItem":
      return result(
        sb
          .from("cart_items")
          .upsert(
            {
              client_id: action.item.clientId,
              service_id: action.item.serviceId,
              trainer_id: action.item.trainerId,
              added_at: action.item.addedAt,
              quantity: action.item.quantity ?? 1,
            },
            { onConflict: "client_id,service_id", ignoreDuplicates: true }
          )
      )
    case "removeCartItems":
      return result(sb.from("cart_items").delete().eq("client_id", action.clientId).in("service_id", action.serviceIds))
    // Bara antalet får ändras (kolumnbehörighet i databasen).
    case "addCustomExercise": {
      const x = action.exercise
      return result(
        sb.from("custom_exercises").insert({
          id: x.id,
          user_id: me.id,
          name: x.name.trim().slice(0, 80),
          default_weight: x.custom?.defaultWeight ?? null,
          weight_unit: x.custom?.weightUnit ?? "kg",
          default_sets: x.custom?.defaultSets ?? 3,
          default_reps: x.custom?.defaultReps ?? "10",
          muscle_group: x.muscleGroup,
        })
      )
    }
    case "deleteCustomExercise":
      return result(sb.from("custom_exercises").delete().eq("id", action.exerciseId).eq("user_id", me.id))
    case "setCartQuantity":
      return result(
        sb.from("cart_items").update({ quantity: action.quantity }).eq("client_id", action.clientId).eq("service_id", action.serviceId)
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
    .channel(`coavira:${me.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
      if (p.new && "id" in p.new) dispatch({ type: "addMessage", message: toMessage(p.new as MessageRow) })
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, (p) => {
      if (p.eventType === "DELETE") {
        const id = (p.old as { id?: string } | undefined)?.id
        if (id) dispatch({ type: "deleteEvent", eventId: id })
      } else if (p.new && "id" in p.new) {
        dispatch({ type: "remoteEvent", event: toEvent(p.new as EventRow) })
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (p) => {
      if (p.eventType !== "DELETE" && p.new && "id" in p.new) {
        dispatch({ type: "addNotification", notification: toNotification(p.new as NotificationRow) })
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "client_exercise_aliases" }, (p) => {
      const row = (p.new && "exercise_id" in p.new ? p.new : p.old) as Partial<AliasRow> | undefined
      if (!row?.client_id || !row.exercise_id) return
      dispatch({
        type: "setExerciseAlias",
        trainerId: "",
        clientId: row.client_id,
        exerciseId: row.exercise_id,
        name: p.eventType === "DELETE" ? null : (row.name ?? null),
      })
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "cart_items" }, (p) => {
      // Varukorgen ändrad på en annan enhet, eller tömd av databasen efter en betalning.
      if (p.eventType === "DELETE") {
        const old = p.old as Partial<CartRow>
        if (old.client_id && old.service_id) dispatch({ type: "removeCartItems", clientId: old.client_id, serviceIds: [old.service_id] })
      } else if (p.new && "service_id" in p.new) {
        const item = toCart(p.new as CartRow)
        dispatch({ type: "addCartItem", item })
        if (p.eventType === "UPDATE") dispatch({ type: "setCartQuantity", clientId: item.clientId, serviceId: item.serviceId, quantity: item.quantity ?? 1 })
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, (p) => {
      if (p.eventType !== "DELETE" && p.new && "id" in p.new) {
        const row = p.new as PurchaseRow
        if (row.status === "cancelled") return
        if (me.role === "trainer" && row.status === "paid") {
          // Ny betalande klient: lägg till i Klientöversikten direkt (databasen har redan aktiverat relationen).
          void sb
            .from("profiles")
            .select("full_name")
            .eq("id", row.client_id)
            .maybeSingle()
            .then(({ data }) => {
              const name = (data as { full_name?: string } | null)?.full_name ?? "Ny klient"
              dispatch({ type: "addClient", client: { id: row.client_id, name, trainerId: me.id, goal: "", status: "active", startDate: todayISO(), weightLog: [] } })
              dispatch({ type: "upsertPurchases", purchases: [toPurchase(row)], today: todayISO() })
            })
          return
        }
        dispatch({ type: "upsertPurchases", purchases: [toPurchase(row)], today: todayISO() })
      }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_checks" }, (p) => {
        // Klienten bockar av/ångrar en måltid → PT:ns "Dagens kost" uppdateras.
        const row = (p.eventType === "DELETE" ? p.old : p.new) as { client_id?: string; date?: string; meal_id?: string } | undefined
        if (!row?.client_id || !row.date || !row.meal_id) return
        dispatch({ type: "setMealCheck", clientId: row.client_id, date: row.date, mealId: row.meal_id, checked: p.eventType !== "DELETE" })
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

// ---------------------------------------------------------- lediga tider ---

/** Lediga tider hos en PT, beräknade i databasen (klienten ser aldrig andras bokningar). */
export async function fetchSlots(sb: SupabaseClient, trainerId: string, from: Date, to: Date): Promise<Slot[]> {
  const { data, error } = await sb.rpc("available_slots", { p_trainer: trainerId, p_from: from.toISOString(), p_to: to.toISOString() })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { start_time: string; end_time: string }[]).map((r) => ({
    start: new Date(r.start_time).toISOString(),
    end: new Date(r.end_time).toISOString(),
  }))
}

/** Första lediga tid per PT (för PT-sökningen). */
export async function fetchNextSlots(sb: SupabaseClient, trainerIds: string[]): Promise<Record<string, string>> {
  if (trainerIds.length === 0) return {}
  const { data, error } = await sb.rpc("next_available_slots", { p_trainers: trainerIds })
  if (error) throw new Error(error.message)
  return Object.fromEntries(((data ?? []) as { trainer_id: string; start_time: string }[]).map((r) => [r.trainer_id, new Date(r.start_time).toISOString()]))
}
