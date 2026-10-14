import { FOOD_LIBRARY } from "@/lib/food-library"

/** Livsmedel med näringsvärden per 100 g. */
export interface Food {
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Grundbiblioteket i den enkla form som kostbyggaren använder (per 100 g). */
export const FOODS: Food[] = FOOD_LIBRARY.map((f) => ({ name: f.name, ...f.per100 }))

export function scaleFood(food: Food, grams: number) {
  const f = grams / 100
  const r = (n: number) => Math.round(n * f)
  return { name: food.name, grams, kcal: r(food.kcal), protein: r(food.protein), carbs: r(food.carbs), fat: r(food.fat) }
}

/** Atwater: 4 kcal/g protein & kolhydrater, 9 kcal/g fett. */
export function kcalFromMacros(protein: number, carbs: number, fat: number) {
  return Math.round(protein * 4 + carbs * 4 + fat * 9)
}
