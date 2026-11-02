/**
 * Utläst recept → recept som kan sparas (v25): metriska mått, makron per
 * portion och träningsmål. Recept utan makron (varken från sidan eller
 * uträknade ur ingredienserna) tas inte med.
 */
import { estimateMacros, isReliable } from "@/lib/recipes/estimate"
import type { RawRecipe } from "@/lib/recipes/extract"
import { suggestGoals } from "@/lib/recipes/goals"
import { metricText, parseIngredient, toMetricItem } from "@/lib/recipes/units"
import type { MacroTotals, MealItem, RecipeGoal } from "@/types/domain"

export const MAX_INGREDIENTS = 60
export const MAX_STEPS = 60
/** Antal portioner när sidan inte anger något. */
export const DEFAULT_SERVINGS = 4

export interface ImportedRecipe {
  name: string
  imageUrl?: string
  sourceUrl: string
  sourceName: string
  servings: number
  /** Sidan angav inget antal portioner – vi antog DEFAULT_SERVINGS. */
  servingsAssumed: boolean
  totalMinutes?: number
  items: MealItem[]
  steps: string[]
  /** Makron per portion. */
  nutrition: MacroTotals
  macrosSource: "site" | "estimated"
  goalTypes: RecipeGoal[]
  /** Antal ingredienser med amerikanska mått som räknats om. */
  convertedUnits: number
}

export type ImportResult = { ok: true; recipe: ImportedRecipe } | { ok: false; reason: "no_ingredients" | "no_macros" }

const round1 = (n: number) => Math.round(n * 10) / 10

export function importRecipe(raw: RawRecipe, pageUrl: string): ImportResult {
  if (raw.ingredients.length === 0) return { ok: false, reason: "no_ingredients" }
  const parsed = raw.ingredients.slice(0, MAX_INGREDIENTS).map(parseIngredient)
  const metric = parsed.map(toMetricItem)
  const servingsAssumed = raw.servings === undefined
  const servings = raw.servings ?? DEFAULT_SERVINGS

  // Makron: sidans värden per portion i första hand (alla fyra måste finnas),
  // annars uträknade ur ingredienserna om tillräckligt mycket kunde matchas.
  const estimate = estimateMacros(metric)
  const n = raw.nutrition
  let nutrition: MacroTotals
  let macrosSource: ImportedRecipe["macrosSource"]
  if (n && n.calories !== undefined && n.protein !== undefined && n.carbs !== undefined && n.fat !== undefined && n.calories > 0) {
    nutrition = { kcal: Math.round(n.calories), protein: round1(n.protein), carbs: round1(n.carbs), fat: round1(n.fat) }
    macrosSource = "site"
  } else if (isReliable(estimate)) {
    const t = estimate.total
    nutrition = { kcal: Math.round(t.kcal / servings), protein: round1(t.protein / servings), carbs: round1(t.carbs / servings), fat: round1(t.fat / servings) }
    macrosSource = "estimated"
  } else {
    return { ok: false, reason: "no_macros" }
  }

  const url = new URL(pageUrl)
  return {
    ok: true,
    recipe: {
      name: (raw.name || url.hostname).slice(0, 120),
      imageUrl: raw.image,
      sourceUrl: url.href.slice(0, 1000),
      sourceName: url.hostname.replace(/^www\./, "").slice(0, 80),
      servings,
      servingsAssumed,
      totalMinutes: raw.totalMinutes,
      items: estimate.items,
      steps: raw.instructions.slice(0, MAX_STEPS).map((s) => metricText(s).slice(0, 1000)),
      nutrition,
      macrosSource,
      goalTypes: suggestGoals(nutrition, raw.totalMinutes),
      convertedUnits: parsed.filter((p) => p.us).length,
    },
  }
}
