/**
 * Träningsformer (v58) – rena funktioner, enhetstestade i e2e/training-modes.unit.ts.
 *
 *   trackingTypeOf   styrka / löpning / kondition → vilka fält som visas
 *   newExerciseEntry övningens standardmål när den läggs i ett pass (SkiErg 1000 m …)
 *   formatPace/parseTime   "4:30" ⇄ 270 s
 *   blocks           block/varv: övningar i följd med samma blockId
 *   interest*        träningsintressen ⇄ filtret Alla/Styrka/Löpning/Hyrox
 */
import type { Exercise, Modality, SetLog, TrackingType, TrainingInterest, WorkoutExercise } from "@/types/domain"

export const TRAINING_INTERESTS: TrainingInterest[] = ["strength", "running", "hyrox", "hybrid", "health"]
export const isTrainingInterest = (v: unknown): v is TrainingInterest => typeof v === "string" && (TRAINING_INTERESTS as string[]).includes(v)
export const INTEREST_EMOJI: Record<TrainingInterest, string> = { strength: "🏋️", running: "🏃", hyrox: "🔥", hybrid: "⚡", health: "💚" }

/** Hur en övning loggas. Passets kopia vinner över övningsbanken; saknas båda = styrka. */
export function trackingTypeOf(item: Pick<WorkoutExercise, "trackingType"> | undefined, exercise?: Pick<Exercise, "trackingType"> | null): TrackingType {
  return item?.trackingType ?? exercise?.trackingType ?? "strength"
}

export function modalityOf(exercise: Pick<Exercise, "modality" | "trackingType"> | undefined | null): Modality {
  if (exercise?.modality) return exercise.modality
  if (exercise?.trackingType === "running") return "running"
  if (exercise?.trackingType === "conditioning") return "conditioning"
  return "strength"
}

/** En ny rad i ett pass med övningens standardmål – inga tomma "1" någonstans. */
export function newExerciseEntry(exercise: Pick<Exercise, "id" | "trackingType" | "defaults">): Omit<WorkoutExercise, "id"> {
  const type = exercise.trackingType ?? "strength"
  const d = exercise.defaults ?? {}
  if (type === "strength") return { exerciseId: exercise.id, sets: d.sets ?? 3, reps: d.reps ?? "8–12", restSec: d.restSec ?? 90 }
  return {
    exerciseId: exercise.id,
    trackingType: type,
    sets: d.sets ?? 1,
    reps: d.reps ?? "",
    restSec: d.restSec ?? (type === "running" ? 90 : 0),
    ...(d.distanceM !== undefined ? { distanceM: d.distanceM } : {}),
    ...(d.paceSecPerKm !== undefined ? { paceSecPerKm: d.paceSecPerKm } : {}),
  }
}

// ---------------------------------------------------------------- tider ---

/** 270 → "4:30", 3725 → "1:02:05". */
export function formatTime(sec: number | undefined | null): string {
  if (sec === undefined || sec === null || !Number.isFinite(sec) || sec < 0) return ""
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`
}
export const formatPace = formatTime

/**
 * "4:30" → 270, "1:02:05" → 3725, "45" → 2700 (minuter), "4.30"/"4,30" → 270.
 * Tomt eller ogiltigt → undefined (fältet blir blankt – aldrig ett påhittat värde).
 */
export function parseTime(raw: string): number | undefined {
  const s = raw.trim().replace(/[.,]/g, ":")
  if (!s) return undefined
  if (/^\d{1,3}$/.test(s)) return Number(s) * 60
  const parts = s.split(":")
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p) && !/^\d{1,3}$/.test(p))) return undefined
  const nums = parts.map(Number)
  if (nums.slice(1).some((n) => n >= 60)) return undefined
  return nums.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1]
}

/** Tempo (s/km) ur distans och tid. */
export function paceOf(distanceM: number | undefined, durationSec: number | undefined): number | undefined {
  if (!distanceM || !durationSec || distanceM <= 0 || durationSec <= 0) return undefined
  return Math.round(durationSec / (distanceM / 1000))
}

/** 5000 → "5 km", 800 → "800 m", 12500 → "12,5 km" (med språkets decimaltecken). */
export function formatDistance(m: number | undefined, tag = "sv-SE"): string {
  if (m === undefined || !Number.isFinite(m)) return ""
  if (m >= 1000) return `${(m / 1000).toLocaleString(tag, { maximumFractionDigits: 2 })} km`
  return `${Math.round(m).toLocaleString(tag)} m`
}

/** Vad saknas för att ett set ska kunna bockas av? (null = inget) */
export function missingForType(type: TrackingType, v: Partial<Pick<SetLog, "kg" | "reps" | "distanceM" | "durationSec" | "calories">>, usesWeight: boolean): "reps" | "kg" | "distance" | "time" | null {
  if (type === "strength") return v.reps === undefined ? "reps" : usesWeight && v.kg === undefined ? "kg" : null
  if (type === "running") return v.distanceM === undefined ? "distance" : v.durationSec === undefined ? "time" : null
  // Kondition: distans ELLER reps/kalorier räcker.
  return v.distanceM === undefined && v.reps === undefined && v.calories === undefined ? "distance" : null
}

// --------------------------------------------------------------- block ---

/** Det block-funktionerna behöver (sets får vara tomt medan man redigerar). */
type BlockItem = { blockId?: string; sets?: number }

export interface ExerciseBlock<T> {
  /** null = fristående övning. */
  id: string | null
  /** A, B, C … i passets ordning (bara block). */
  name: string | null
  rounds: number | undefined
  items: T[]
}

/**
 * Passets övningar i block: övningar i följd med samma blockId bildar ett block
 * ("4 varv: 1000 m löpning + 50 m Sled Push"). Antalet varv är blockets första
 * övnings `sets`. Ett blockId som bara har en övning räknas som fristående.
 */
export function blocks<T extends BlockItem>(items: T[]): ExerciseBlock<T>[] {
  const out: ExerciseBlock<T>[] = []
  for (const item of items) {
    const last = out.at(-1)
    if (item.blockId && last?.id === item.blockId) last.items.push(item)
    else out.push({ id: item.blockId ?? null, name: null, rounds: item.sets, items: [item] })
  }
  let letter = 0
  return out.map((b) => (b.id && b.items.length > 1 ? { ...b, name: String.fromCharCode(65 + letter++) } : { ...b, id: null, name: null }))
}

/**
 * Koppla övningen på `index` till blocket ovan (eller starta ett block med den
 * ovan). Hela blocket får samma antal varv. Returnerar en ny lista.
 */
export function linkToPrevious<T extends BlockItem>(items: T[], index: number, newId: () => string): T[] {
  if (index <= 0 || index >= items.length) return items
  const prev = items[index - 1]
  const id = prev.blockId ?? newId()
  const rounds = prev.sets
  return items.map((it, i) => (i === index - 1 || i === index || (it.blockId && it.blockId === id) ? { ...it, blockId: id, sets: rounds } : it))
}

/** Ta en övning ur sitt block. */
export function unlink<T extends Pick<WorkoutExercise, "blockId">>(items: T[], index: number): T[] {
  return items.map((it, i) => (i === index ? { ...it, blockId: undefined } : it))
}

/** Ändra antal varv för ett helt block. */
export function setBlockRounds<T extends BlockItem>(items: T[], blockId: string, rounds: number | undefined): T[] {
  return items.map((it) => (it.blockId === blockId ? { ...it, sets: rounds } : it))
}

// ------------------------------------------------- intressen och filter ---

export type PlanCategory = "strength" | "running" | "hyrox"
export const PLAN_CATEGORIES: PlanCategory[] = ["strength", "running", "hyrox"]

/** Filtret som är förvalt efter intressena: Hyrox före Löpning före Styrka; hybrid/hälsa = Alla. */
export function defaultCategory(interests: TrainingInterest[] | undefined): PlanCategory | "all" {
  const set = new Set(interests ?? [])
  if (set.has("hyrox")) return "hyrox"
  if (set.has("running")) return "running"
  if (set.has("strength") && set.size === 1) return "strength"
  return "all"
}

/** Kategorierna som intressena lyfter fram (för "För dig"-märkningen och sorteringen). */
export function favouredCategories(interests: TrainingInterest[] | undefined): Set<PlanCategory> {
  const out = new Set<PlanCategory>()
  for (const i of interests ?? []) {
    if (i === "strength") out.add("strength")
    if (i === "running") out.add("running")
    if (i === "hyrox") out.add("hyrox")
    if (i === "hybrid") {
      out.add("strength")
      out.add("hyrox")
    }
  }
  return out
}

/** Övningens kategori i filtret (ergometrar och kondition hör till Hyrox). */
export function exerciseCategory(exercise: Pick<Exercise, "modality" | "trackingType">): PlanCategory {
  const m = modalityOf(exercise)
  return m === "running" ? "running" : m === "hyrox" || m === "conditioning" ? "hyrox" : "strength"
}

/** Övningens namn på valt språk (löpövningar har egna namn; övriga behåller sitt). */
export function exerciseNameIn(exercise: Pick<Exercise, "name" | "names"> | undefined, locale: string, fallback: string): string {
  return exercise?.names?.[locale as keyof NonNullable<Exercise["names"]>] ?? fallback
}
