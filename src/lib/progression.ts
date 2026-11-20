/**
 * Progressiv överbelastning (v32): nästa mål per övning, räknat ur historiken.
 *
 * Hotfix v63 – automatisk viktökning: finns historik på en viktövning
 * förinställs vikten till senast genomförda toppset + 1,25 kg (AUTO_INCREMENT_KG).
 * Enkelt och förutsägbart – inga 1RM-beräkningar eller formler.
 *
 *   1. Varje övning har ett repintervall, t.ex. 6–8. Ett fast mål ("8") tolkas
 *      som 6–8 (målet är taket).
 *   2. Toppsetet (tyngsta avbockade setet) i senaste passet + 1,25 kg är
 *      dagens vikt (140 kg × 8 → 141,25 kg × 8). Reps: samma som förra
 *      gången, inom repintervallet.
 *   3. Kroppsviktsövningar (utrustning utan vikt, eller 0 kg loggat) ökar reps
 *      i stället. Tid/distans/AMRAP upprepar förra passet.
 *   4. Raka set (v34): alla arbetsset får samma mål – ingen automatisk stegring
 *      i vikt mellan seten. Har PT:n satt egna reps per set (12/10/8 …) används
 *      de, med samma vikt. Klienten ändrar själv vikten på ett set; nästa set
 *      utgår då från den (src/lib/training.ts → suggestSet).
 *
 * Ren TypeScript utan beroenden – enhetstestad i e2e/progression.unit.ts.
 */
import type { MuscleGroup, ScheduledWorkout, WorkoutExercise } from "@/types/domain"

export interface RepRange {
  min: number
  max: number
}

/**
 * Repintervallet ur PT:ns reps-fält: "8–10" → 8–10, "6-8" → 6–8, "8" → 6–8,
 * "5" → 4–5, "AMRAP"/"500 m"/"30 s" → null (ingen viktprogression).
 */
export function parseRepRange(reps: string): RepRange | null {
  const s = reps.trim().toLowerCase()
  const range = s.match(/^(\d+)\s*[–-]\s*(\d+)\s*(reps?)?$/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    return a > 0 && b >= a && b <= 50 ? { min: a, max: b } : null
  }
  const single = s.match(/^(\d+)\s*(reps?)?$/)
  if (!single) return null
  const n = Number(single[1])
  if (n <= 0 || n > 50) return null
  // Fast mål = taket. 1–3 reps (maxstyrka) har inget intervall under.
  if (n <= 3) return { min: n, max: n }
  return { min: Math.max(1, n - (n >= 8 ? 2 : 1)), max: n }
}

/** Viktsteg (kg) för en övning utifrån utrustning och muskelgrupp. 0 = kroppsvikt (öka reps i stället). */
export function weightIncrement(equipment: string | undefined, muscleGroup?: MuscleGroup): number {
  const e = (equipment ?? "").toLowerCase().trim()
  if (e.includes("skivstång") || e.includes("trap bar")) return 2.5
  if (e.includes("hant")) return 2
  if (e.includes("kettlebell")) return 4
  if (e.includes("maskin") || e.includes("kabel")) return muscleGroup === "ben" ? 5 : 2.5
  if (e.includes("släde") || e.includes("sandsäck")) return 5
  if (e.includes("medicinboll")) return 1
  // Med extra vikt (t.ex. "Kroppsvikt/vikt" – viktväst, dipsbälte).
  if (e.includes("/vikt")) return 2.5
  // Kroppsvikt, räckhäck, ringar, bänk, låda, band … : öka reps i stället.
  return 0
}

/** Automatisk viktökning per pass (kg) när övningen har historik. */
export const AUTO_INCREMENT_KG = 1.25

export interface SessionTopSet {
  date: string
  kg: number
  reps: number
  /** Alla avbockade set i passet (för förklaringen och avlastning). */
  sets: { kg: number; reps: number }[]
}

/** Toppsetet per pass för en övning, senaste först (bara genomförda pass). */
export function recentTopSets(exerciseId: string, history: ScheduledWorkout[], limit = 3): SessionTopSet[] {
  const out: SessionTopSet[] = []
  const done = history.filter((w) => w.status === "completed").sort((a, b) => b.date.localeCompare(a.date))
  for (const w of done) {
    const ids = new Set(w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id))
    const sets = w.logs.filter((l) => l.done && ids.has(l.workoutExerciseId) && l.reps > 0).map((l) => ({ kg: l.kg, reps: l.reps }))
    if (!sets.length) continue
    // Toppset = tyngst; vid lika vikt flest reps.
    const top = sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a))
    out.push({ date: w.date, kg: top.kg, reps: top.reps, sets })
    if (out.length >= limit) break
  }
  return out
}

export type ProgressionKind = "increase_weight" | "add_reps" | "repeat" | "deload" | "start" | "bodyweight"

export interface ProgressionTarget {
  /** Dagens mål för toppsetet. */
  kg: number
  reps: number
  kind: ProgressionKind
  /** Förändring mot förra toppsetet (kg), t.ex. +2,5. */
  deltaKg: number
  /** Kort förklaring på svenska, visas i passet. */
  reason: string
  /** Föregående toppset (om det finns). */
  previous?: { kg: number; reps: number; date: string }
  range: RepRange | null
  increment: number
}

const kgText = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 2 })

/**
 * Nästa mål för toppsetet. null = ingen historik och inget mål från PT:n
 * (då gäller övningens vanliga förslag).
 */
export function nextTarget(
  exercise: Pick<WorkoutExercise, "exerciseId" | "reps" | "targetKg">,
  history: ScheduledWorkout[],
  info?: { equipment?: string; muscleGroup?: MuscleGroup }
): ProgressionTarget | null {
  const range = parseRepRange(exercise.reps)
  const increment = weightIncrement(info?.equipment, info?.muscleGroup)
  const [last] = recentTopSets(exercise.exerciseId, history, 1)

  if (!last) {
    if (!exercise.targetKg || !range) return null
    return {
      kg: exercise.targetKg,
      reps: range.min,
      kind: "start",
      deltaKg: 0,
      reason: `Första gången: börja på ${kgText(exercise.targetKg)} kg och sikta på ${range.min}–${range.max} reps.`,
      range,
      increment,
    }
  }
  const previous = { kg: last.kg, reps: last.reps, date: last.date }
  if (!range) {
    // Tid/distans/AMRAP: upprepa förra passet.
    return { kg: last.kg, reps: last.reps, kind: "repeat", deltaKg: 0, reason: "Försök slå förra passet.", previous, range, increment }
  }

  // Kroppsvikt (eller ingen vikt loggad): öka reps, max 3 över taket innan det blir uthållighet.
  if (increment === 0 || last.kg <= 0) {
    const reps = Math.min(last.reps + 1, range.max + 3)
    return {
      kg: last.kg,
      reps,
      kind: "bodyweight",
      deltaKg: 0,
      reason: reps > last.reps ? `Du klarade ${last.reps} reps – sikta på ${reps}.` : `Du är på taket (${range.max + 3} reps) – lägg till vikt eller en svårare variant.`,
      previous,
      range,
      increment,
    }
  }

  // Automatisk viktökning: förra toppsetet + 1,25 kg, samma reps (inom intervallet).
  const kg = Math.round((last.kg + AUTO_INCREMENT_KG) * 100) / 100
  const reps = Math.min(Math.max(last.reps, range.min), range.max)
  return {
    kg,
    reps,
    kind: "increase_weight",
    deltaKg: AUTO_INCREMENT_KG,
    reason: `Förra passet: ${kgText(last.kg)} kg × ${last.reps}. Vikten är förinställd med +${kgText(AUTO_INCREMENT_KG)} kg – sikta på ${reps} reps.`,
    previous,
    range,
    increment,
  }
}

/**
 * Passets set-plan för övningen (v34: raka set, ingen stegring mellan seten):
 *   - alla set på dagens mål (vikt och reps),
 *   - PT:ns reps per set (setReps, t.ex. 12/10/8) används om de finns – med samma vikt.
 */
export function setPlan(
  exercise: Pick<WorkoutExercise, "sets" | "setReps" | "reps">,
  target: Pick<ProgressionTarget, "kg" | "reps">
): { kg: number; reps: number }[] {
  const n = Math.max(1, exercise.sets)
  const own = exercise.setReps?.map((r) => Number(r.match(/\d+/)?.[0] ?? 0))
  return Array.from({ length: n }, (_, i) => ({ kg: target.kg, reps: own?.[i] || target.reps }))
}
