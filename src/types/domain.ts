/**
 * Domänmodeller för PT-plattformen.
 *
 * Typerna speglar tabellerna i `supabase/migrations/` så att mock-lagret kan bytas
 * mot en riktig backend utan att UI:t behöver ändras. Datum lagras som ISO-strängar
 * (`YYYY-MM-DD` för dagar, full ISO för tidpunkter).
 */

export type ID = string
export type ISODate = string // YYYY-MM-DD
export type ISODateTime = string

export const SPECIALTIES = [
  "hyrox",
  "styrkelyft",
  "viktminskning",
  "rehab",
  "kalisthenics",
  "postnatal",
  "lopning",
  "bodybuilding",
] as const
export type Specialty = (typeof SPECIALTIES)[number]

export const SPECIALTY_LABEL: Record<Specialty, string> = {
  hyrox: "Hyrox",
  styrkelyft: "Styrkelyft",
  viktminskning: "Viktminskning",
  rehab: "Rehab",
  kalisthenics: "Kalisthenics",
  postnatal: "Post-natal",
  lopning: "Löpning",
  bodybuilding: "Bodybuilding",
}

export type CoachingMode = "remote" | "onsite" | "both"

export const COACHING_MODE_LABEL: Record<CoachingMode, string> = {
  remote: "Distanscoaching",
  onsite: "På plats",
  both: "Distans och på plats",
}

export const offersRemote = (m: CoachingMode) => m === "remote" || m === "both"
export const offersOnsite = (m: CoachingMode) => m === "onsite" || m === "both"

export interface Review {
  id: ID
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  text: string
  date: ISODate
}

export interface Trainer {
  id: ID
  name: string
  city: string
  specialties: Specialty[]
  bio: string
  yearsExperience: number
  pricePerSession: number // SEK
  rating: number
  reviews: Review[]
  /** Lediga bokningsbara tider (ISO). */
  coachingMode: CoachingMode
  /** Minsta framförhållning för bokningar (minuter). */
  minNoticeMinutes?: number
  /** Profilbild: publik URL, data-URL (demo) eller null. */
  avatarUrl?: string
  certifications: string[]
  /** Syns i PT-sökningen först när PT:n publicerat profilen. */
  isPublished: boolean
}

export type ClientStatus = "active" | "paused" | "pending"

export interface WeightEntry {
  date: ISODate
  kg: number
}

export interface Client {
  id: ID
  name: string
  trainerId: ID | null
  goal: string
  status: ClientStatus
  startDate: ISODate
  weightLog: WeightEntry[]
}

export type MuscleGroup =
  | "ben"
  | "bröst"
  | "rygg"
  | "axlar"
  | "armar"
  | "bål"
  | "helkropp"
  | "kondition"

export interface Exercise {
  id: ID
  name: string
  muscleGroup: MuscleGroup
  equipment: string
  videoUrl?: string
}

/** En övning i ett pass, med PT:ns målvärden. */
export interface WorkoutExercise {
  id: ID
  exerciseId: ID
  sets: number
  /** Fritext så att intervall fungerar, t.ex. "8–10" eller "AMRAP". */
  reps: string
  restSec: number
  rpe?: number
  targetKg?: number
  notes?: string
  /** Instruktionsvideo från PT:n (t.ex. YouTube/Vimeo eller egen uppladdning). */
  videoUrl?: string
}

export interface WorkoutTemplate {
  id: ID
  trainerId: ID
  name: string
  description: string
  exercises: WorkoutExercise[]
}

export interface SetLog {
  workoutExerciseId: ID
  setIndex: number
  kg: number
  reps: number
  done: boolean
}

export type WorkoutStatus = "planned" | "in_progress" | "completed" | "skipped"

/**
 * Ett pass schemalagt för en klient. Övningarna kopieras från mallen
 * (snapshot) så att senare ändringar av mallen inte skriver om historik.
 */
export interface ScheduledWorkout {
  id: ID
  clientId: ID
  templateId: ID | null
  name: string
  date: ISODate
  exercises: WorkoutExercise[]
  status: WorkoutStatus
  logs: SetLog[]
  completedAt?: ISODateTime
  clientComment?: string
}

export interface MealItem {
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Meal {
  id: ID
  name: string
  time: string // HH:mm
  items: MealItem[]
}

export interface MacroTargets {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface NutritionPlan {
  id: ID
  trainerId: ID
  clientId: ID
  name: string
  targets: MacroTargets
  meals: Meal[]
}

export interface MealCheck {
  clientId: ID
  date: ISODate
  mealId: ID
}

export interface Message {
  id: ID
  /** En tråd per PT–klient-relation; tråd-id = klient-id. */
  threadId: ID
  senderId: ID
  body: string
  sentAt: ISODateTime
  /** Valfri koppling till ett pass, för feedback på ett genomfört pass. */
  workoutId?: ID
  readAt?: ISODateTime
  attachments?: Attachment[]
}

export type AttachmentKind = "image" | "video" | "pdf" | "file"

/**
 * Fil i chatten. `ref` pekar ut filen: "storage:<bucket>/<sökväg>" i Supabase,
 * eller en blob:/data:-URL i demoläget.
 */
export interface Attachment {
  id: ID
  name: string
  mime: string
  size: number
  kind: AttachmentKind
  ref: string
}

/** Mat utöver kostschemat ("Övrigt / Extra"). Makron är för den ätna mängden. */
export interface FoodEntry {
  id: ID
  clientId: ID
  date: ISODate
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  grams?: number
  barcode?: string
  productId?: ID
}

/** Näringsvärden per 100 g. */
export interface Per100 {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export type FoodProductSource = "library" | "openfoodfacts" | "custom"

/** En vara att välja i kostregistreringen: baslivsmedel, skannad produkt eller egen. */
export interface FoodProduct {
  id: ID
  name: string
  brand?: string
  barcode?: string
  per100: Per100
  /** Vanlig portion i gram (t.ex. 1 burk = 330). */
  servingG?: number
  source: FoodProductSource
  imageUrl?: string
}

/** PT:ns eget namn på en övning för en viss klient. */
export interface ExerciseAlias {
  clientId: ID
  exerciseId: ID
  name: string
}

export interface WaterLog {
  clientId: ID
  date: ISODate
  ml: number
}

export type HealthSource = "manual" | "fitbit" | "apple_health" | "google_fit" | "mock"

export interface SleepStages {
  deep: number
  light: number
  rem: number
  awake: number
}

/** En natt, räknad på datumet man vaknar. */
export interface SleepLog {
  clientId: ID
  date: ISODate
  hours: number
  /** Egen skattning 1–5. */
  quality?: number
  /** 0–100 från wearable (eller beräknad). */
  sleepScore?: number
  /** Minuter per sömnsteg. */
  stages?: SleepStages
  source: HealthSource
}

export type WearableProvider = "fitbit" | "apple_health" | "google_fit"

export interface WearableConnection {
  provider: WearableProvider
  status: "active" | "error" | "revoked"
  connectedAt: ISODateTime
  lastSyncedAt?: ISODateTime
  lastError?: string
}

// ============================================================== kalender ===

/**
 * pending = preliminärt (väntar på svar, se `awaiting`), confirmed = bekräftat,
 * completed = genomfört, cancelled = avbokat/nekat.
 */
export type EventStatus = "pending" | "confirmed" | "cancelled" | "completed"
/** session = pass (med eller utan klient), block = PT:n är upptagen (lunch, semester …). */
export type EventKind = "session" | "block"
export type SessionMode = "onsite" | "remote"

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  pending: "Väntar på bekräftelse",
  confirmed: "Bekräftat",
  completed: "Genomfört",
  cancelled: "Avbokat",
}
export const SESSION_MODE_LABEL: Record<SessionMode, string> = { onsite: "På plats", remote: "Distans" }

export interface CalendarEvent {
  id: ID
  trainerId: ID
  clientId?: ID
  kind: EventKind
  status: EventStatus
  title: string
  start: ISODateTime
  end: ISODateTime
  mode: SessionMode
  location?: string
  notes?: string
  /** Kopplat träningspass (klientens schemalagda pass). */
  workoutId?: ID
  createdBy?: ID
  cancelledBy?: ID
  /** Preliminära pass: vem som ska svara. Den som flyttar ett pass lämnar över till motparten. */
  awaiting?: EventParty
  /** Tiden före senaste flytt (för "flyttat från …"). */
  previousStart?: ISODateTime
  previousEnd?: ISODateTime
}

export type EventParty = "trainer" | "client"

/** Preliminära pass utan låsning: kan flyttas med dra-och-släpp. Bekräftade pass är låsta. */
export const isMovable = (e: CalendarEvent) => e.kind === "session" && e.status === "pending" && Boolean(e.clientId)

/**
 * Tillgänglighet: en regel för en veckodag (1 = måndag … 7 = söndag) eller ett
 * datum. Datumregler ersätter veckoreglerna den dagen. Tider i PT:ns lokala tid.
 */
export interface AvailabilityRule {
  id: ID
  trainerId: ID
  weekday?: number
  date?: ISODate
  start: string // HH:MM
  end: string // HH:MM
  slotMinutes: number
}

/** En bokningsbar tid. */
export interface Slot {
  start: ISODateTime
  end: ISODateTime
}

export type UserRole = "client" | "trainer"

/** Inloggad användare. */
export interface Me {
  id: ID
  role: UserRole
  name: string
  email?: string
}

export interface AppData {
  trainers: Trainer[]
  clients: Client[]
  exercises: Exercise[]
  templates: WorkoutTemplate[]
  workouts: ScheduledWorkout[]
  nutritionPlans: NutritionPlan[]
  mealChecks: MealCheck[]
  messages: Message[]
  /** Kalendern: bokningar, egna pass och blockeringar. */
  events: CalendarEvent[]
  availabilityRules: AvailabilityRule[]
  foodEntries: FoodEntry[]
  waterLogs: WaterLog[]
  sleepLogs: SleepLog[]
  wearables: WearableConnection[]
  exerciseAliases: ExerciseAlias[]
  /** Klientens egna produkter (och produkter den skannat). */
  customFoods: FoodProduct[]
  /** Inloggad användares aviseringar (i demoläget alla användares, filtreras på userId). */
  notifications: AppNotification[]
  /** PT-erbjudanden: egna (PT) eller aktiva från publicerade PT:er (klient). */
  offers: TrainerOffer[]
}

// ============================================================ aviseringar ===

export type NotificationKind =
  | "booking_requested"
  | "booking_proposed"
  | "booking_confirmed"
  | "booking_declined"
  | "event_cancelled"
  | "event_rescheduled"
  | "reschedule_accepted"

export interface AppNotification {
  id: ID
  /** Mottagare. */
  userId: ID
  actorId?: ID
  actorName?: string
  kind: NotificationKind
  eventId?: ID
  title?: string
  start?: ISODateTime
  end?: ISODateTime
  previousStart?: ISODateTime
  previousEnd?: ISODateTime
  createdAt: ISODateTime
  readAt?: ISODateTime
}

// ========================================================= erbjudanden ===

export interface TrainerOffer {
  id: ID
  trainerId: ID
  /** En av PT:ns specialiteter; matchas mot klientens intressen. */
  category: Specialty
  title: string
  description: string
  priceSek?: number
  discountPercent?: number
  validUntil?: ISODate
  active: boolean
  createdAt: ISODateTime
}
