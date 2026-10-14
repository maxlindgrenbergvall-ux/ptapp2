/**
 * Domänmodeller för PT-plattformen.
 *
 * Typerna speglar tabellerna i `supabase/schema.sql` så att mock-lagret kan bytas
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
  availability: ISODateTime[]
  offersRemote: boolean
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
}

export type BookingStatus = "requested" | "confirmed" | "cancelled"

export interface Booking {
  id: ID
  trainerId: ID
  clientId: ID
  slot: ISODateTime
  status: BookingStatus
  note?: string
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
  bookings: Booking[]
}
