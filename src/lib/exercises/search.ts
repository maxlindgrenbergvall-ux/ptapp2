/**
 * Sök i övningsbanken. Övningarna heter som i branschen (engelska facktermer:
 * Romanian Deadlift, Bench Press …), men de tidigare svenska namnen finns kvar
 * som sökord – "knäböj" hittar Back Squat och "latsdrag" Lat Pulldown.
 */
import library from "@/lib/exercise-library.json"
import type { Exercise } from "@/types/domain"

const SWEDISH = new Map(library.map((e) => [e.id, e.sv]))

/** Det svenska namnet (sökord) för en övning i övningsbanken. */
export const swedishExerciseName = (id: string) => SWEDISH.get(id)

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-‐]/g, " ")

/** Matchar namn, svenskt sökord, utrustning eller muskelgrupp. Tom fråga matchar allt. */
export function matchesExercise(e: Exercise, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return [e.name, SWEDISH.get(e.id) ?? "", e.equipment, e.muscleGroup].some((s) => fold(s).includes(q))
}
