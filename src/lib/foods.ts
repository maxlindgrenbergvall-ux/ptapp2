/** Liten livsmedelsbas (per 100 g, avrundat från Livsmedelsverkets värden). */
export interface Food {
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export const FOODS: Food[] = [
  { name: "Havregryn", kcal: 375, protein: 12.5, carbs: 62, fat: 7 },
  { name: "Kvarg naturell", kcal: 64, protein: 11, carbs: 4, fat: 0.4 },
  { name: "Grekisk yoghurt 10 %", kcal: 120, protein: 4, carbs: 4, fat: 10 },
  { name: "Ägg", kcal: 140, protein: 12.5, carbs: 0.5, fat: 10 },
  { name: "Kycklingfilé", kcal: 110, protein: 23, carbs: 0, fat: 1.5 },
  { name: "Nötfärs 10 %", kcal: 175, protein: 20, carbs: 0, fat: 10 },
  { name: "Lax", kcal: 205, protein: 20, carbs: 0, fat: 14 },
  { name: "Tofu", kcal: 120, protein: 13, carbs: 1.5, fat: 7 },
  { name: "Jasminris (kokt)", kcal: 130, protein: 2.5, carbs: 28, fat: 0.3 },
  { name: "Fullkornspasta (kokt)", kcal: 140, protein: 5.5, carbs: 26, fat: 1 },
  { name: "Potatis (kokt)", kcal: 77, protein: 2, carbs: 17, fat: 0.1 },
  { name: "Fullkornsbröd", kcal: 240, protein: 9, carbs: 40, fat: 3.5 },
  { name: "Banan", kcal: 89, protein: 1.1, carbs: 22, fat: 0.3 },
  { name: "Blåbär", kcal: 57, protein: 0.7, carbs: 14, fat: 0.3 },
  { name: "Broccoli", kcal: 34, protein: 3, carbs: 4, fat: 0.4 },
  { name: "Avokado", kcal: 160, protein: 2, carbs: 2, fat: 15 },
  { name: "Olivolja", kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { name: "Jordnötssmör", kcal: 600, protein: 25, carbs: 12, fat: 50 },
  { name: "Mjölk 1,5 %", kcal: 46, protein: 3.5, carbs: 5, fat: 1.5 },
  { name: "Proteinpulver (vassle)", kcal: 380, protein: 78, carbs: 6, fat: 5 },
]

export function scaleFood(food: Food, grams: number) {
  const f = grams / 100
  const r = (n: number) => Math.round(n * f)
  return { name: food.name, grams, kcal: r(food.kcal), protein: r(food.protein), carbs: r(food.carbs), fat: r(food.fat) }
}

/** Atwater: 4 kcal/g protein & kolhydrater, 9 kcal/g fett. */
export function kcalFromMacros(protein: number, carbs: number, fat: number) {
  return Math.round(protein * 4 + carbs * 4 + fat * 9)
}
