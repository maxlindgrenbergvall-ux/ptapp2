/**
 * Recept och träningsmål (v25): kategorier, makron per portion och
 * måltidstyper i kostdagboken.
 */
import type { MacroTotals, MealItem, MealType, Recipe, RecipeGoal } from "@/types/domain"

export const RECIPE_GOALS: RecipeGoal[] = ["high_protein", "weight_loss", "pre_workout", "post_workout", "quick_easy"]

export const GOAL_INFO: Record<RecipeGoal, { label: string; hint: string }> = {
  high_protein: { label: "Högt protein", hint: "Muskeltillväxt: minst 25 g protein eller 30 % av energin per portion" },
  weight_loss: { label: "Kalorisnålt", hint: "Viktnedgång: högst 450 kcal per portion" },
  pre_workout: { label: "Före passet", hint: "Energi: kolhydratrikt (minst halva energin), lite fett" },
  post_workout: { label: "Efter passet", hint: "Återhämtning: minst 20 g protein och 30 g kolhydrater" },
  quick_easy: { label: "Snabbt & enkelt", hint: "Klart på 20 minuter eller mindre" },
}

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"]
export const MEAL_LABEL: Record<MealType, string> = { breakfast: "Frukost", lunch: "Lunch", dinner: "Middag", snack: "Mellanmål" }

const round1 = (n: number) => Math.round(n * 10) / 10

/** Energiandel (0–1) från ett makro: 4 kcal/g protein och kolhydrater, 9 kcal/g fett. */
function share(m: MacroTotals, key: "protein" | "carbs" | "fat") {
  const kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9
  if (kcal <= 0) return 0
  return (m[key] * (key === "fat" ? 9 : 4)) / kcal
}

/** Förslag på kategorier utifrån makron per portion och tillagningstid. */
export function suggestGoals(perServing: MacroTotals, totalMinutes?: number): RecipeGoal[] {
  const goals: RecipeGoal[] = []
  const p = perServing
  if (p.protein >= 25 || (p.protein >= 15 && share(p, "protein") >= 0.3)) goals.push("high_protein")
  if (p.kcal > 0 && p.kcal <= 450) goals.push("weight_loss")
  if (p.carbs >= 30 && share(p, "carbs") >= 0.5 && share(p, "fat") <= 0.25) goals.push("pre_workout")
  if (p.protein >= 20 && p.carbs >= 30 && share(p, "fat") <= 0.3) goals.push("post_workout")
  if (totalMinutes !== undefined && totalMinutes > 0 && totalMinutes <= 20) goals.push("quick_easy")
  return goals
}

/** Summan av ingrediensernas makron. */
export function sumItems(items: Pick<MealItem, "kcal" | "protein" | "carbs" | "fat">[]): MacroTotals {
  return items.reduce((s, i) => ({ kcal: s.kcal + i.kcal, protein: s.protein + i.protein, carbs: s.carbs + i.carbs, fat: s.fat + i.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  })
}

/**
 * Makron per portion: källans värden om de finns, annars ingrediensernas
 * summa delat med antalet portioner. `grams` = ungefärlig vikt per portion.
 */
export function perServing(recipe: Pick<Recipe, "items" | "servings" | "nutrition">): MacroTotals & { grams: number } {
  const n = Math.max(1, recipe.servings ?? 1)
  const grams = Math.round(recipe.items.reduce((s, i) => s + (i.grams || 0), 0) / n)
  const m = recipe.nutrition ?? (() => {
    const t = sumItems(recipe.items)
    return { kcal: t.kcal / n, protein: t.protein / n, carbs: t.carbs / n, fat: t.fat / n }
  })()
  return { kcal: Math.round(m.kcal), protein: round1(m.protein), carbs: round1(m.carbs), fat: round1(m.fat), grams }
}

/** Makron för ett antal portioner (0,5, 1, 1,5 …). */
export function scaleMacros(m: MacroTotals, portions: number): MacroTotals {
  return { kcal: Math.round(m.kcal * portions), protein: round1(m.protein * portions), carbs: round1(m.carbs * portions), fat: round1(m.fat * portions) }
}

const num = (n: number, digits = 1) => n.toLocaleString("sv-SE", { maximumFractionDigits: digits })

/**
 * Mängden i metriska mått, skalad med `factor` (valt antal portioner / receptets
 * portioner). Gram avrundas till hela (5 g över 100 g), dl till tiondelar, ml till hela.
 */
export function formatAmount(item: MealItem, factor = 1): string | null {
  const unit = item.unit ?? "g"
  if (unit === "g") {
    if (!item.grams) return null
    const g = item.grams * factor
    return g >= 1000 ? `${num(g / 1000, 2)} kg` : `${g >= 100 ? Math.round(g / 5) * 5 : num(g, g < 10 ? 1 : 0)} g`
  }
  if (item.qty === undefined) return null
  const q = item.qty * factor
  if (unit === "ml") return q >= 100 ? `${num(q / 100)} dl` : `${Math.round(q)} ml`
  if (unit === "dl") return q >= 10 ? `${num(q / 10, 2)} l` : `${num(q)} dl`
  if (unit === "st") return `${num(Math.round(q * 2) / 2)} st`
  return `${num(q)} ${unit}`
}
