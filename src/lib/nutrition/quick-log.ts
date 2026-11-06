/**
 * Snabb kostloggning (v42) – logiken bakom Kost-sidan (/klient/kost):
 *
 *   mealForTime   föreslår måltid efter klockslaget (frukost före 10, lunch
 *                 10–14, mellanmål 14–17, middag 17–21, annars mellanmål).
 *   recentFoods   unika livsmedel som loggats tidigare, nyast först, med den
 *                 senaste mängden – så att vanliga val loggas med ett tryck.
 *   quickEntry    en ny matpost av ett livsmedel, en mängd och en måltid.
 *   groupByMeal   dagens poster per måltid (frukost → mellanmål, övrigt sist).
 *
 * Ren TypeScript – enhetstestad i e2e/quick-log.unit.ts.
 */
import { forGrams } from "@/lib/food-search"
import { MEAL_LABEL, MEAL_TYPES } from "@/lib/recipes/goals"
import type { FoodEntry, FoodProduct, ID, MealType } from "@/types/domain"

export type NewFoodEntry = Omit<FoodEntry, "id" | "clientId" | "date">

/** Föreslagen måltid för ett klockslag. */
export function mealForTime(d: Date): MealType {
  const h = d.getHours()
  if (h >= 4 && h < 10) return "breakfast"
  if (h >= 10 && h < 14) return "lunch"
  if (h >= 17 && h < 21) return "dinner"
  return "snack"
}

export interface RecentFood {
  product: FoodProduct
  /** Senast loggade mängd (g eller ml). */
  grams: number
  /** Hur många gånger livsmedlet loggats. */
  times: number
}

/**
 * Tidigare loggade livsmedel (bara poster med mängd – inte "bara kcal"-rader),
 * nyast först. Samma vara känns igen på streckkod, produkt-id eller namn.
 */
export function recentFoods(entries: FoodEntry[], clientId: ID, limit = 8): RecentFood[] {
  const mine = entries.filter((e) => e.clientId === clientId && e.grams && e.grams > 0 && !e.recipeId && !e.libraryRecipeId)
  const key = (e: FoodEntry) => e.barcode ?? e.productId ?? e.name.trim().toLowerCase()
  const times = new Map<string, number>()
  for (const e of mine) times.set(key(e), (times.get(key(e)) ?? 0) + 1)
  // Senaste först: datum, sedan ordningen i listan (nyast loggad sist).
  const ordered = mine.map((e, i) => ({ e, i })).sort((a, b) => b.e.date.localeCompare(a.e.date) || b.i - a.i)
  const seen = new Set<string>()
  const out: RecentFood[] = []
  for (const { e } of ordered) {
    const k = key(e)
    if (seen.has(k)) continue
    seen.add(k)
    const f = 100 / e.grams!
    out.push({
      product: {
        id: e.productId ?? `recent:${k}`,
        name: e.name.trim(),
        barcode: e.barcode,
        per100: { kcal: e.kcal * f, protein: e.protein * f, carbs: e.carbs * f, fat: e.fat * f },
        servingG: e.grams,
        unit: e.unit,
        source: e.barcode ? "openfoodfacts" : "library",
      },
      grams: e.grams!,
      times: times.get(k) ?? 1,
    })
    if (out.length >= limit) break
  }
  return out
}

/** En matpost av ett livsmedel och en mängd (makron räknas om från per 100 g/ml). */
export function quickEntry(product: FoodProduct, grams: number, meal?: MealType): NewFoodEntry {
  const g = Math.max(0, Math.round(grams))
  return {
    name: product.name,
    ...forGrams(product.per100, g),
    grams: g,
    unit: product.unit ?? "g",
    ...(product.barcode ? { barcode: product.barcode } : {}),
    // Produkt-id:t sparas bara för riktiga produkter (inte "senaste"-nycklar).
    ...(product.id && !product.id.startsWith("recent:") ? { productId: product.id } : {}),
    ...(meal ? { meal } : {}),
  }
}

export interface MealGroup {
  meal: MealType | null
  label: string
  entries: FoodEntry[]
  kcal: number
}

/** Dagens poster per måltid i ordningen frukost, lunch, middag, mellanmål – poster utan måltid sist. */
export function groupByMeal(entries: FoodEntry[]): MealGroup[] {
  const groups: MealGroup[] = [...MEAL_TYPES, null].map((meal) => ({
    meal,
    label: meal ? MEAL_LABEL[meal] : "Övrigt",
    entries: entries.filter((e) => (e.meal ?? null) === meal),
    kcal: 0,
  }))
  for (const g of groups) g.kcal = Math.round(g.entries.reduce((s, e) => s + e.kcal, 0))
  return groups.filter((g) => g.entries.length > 0)
}
