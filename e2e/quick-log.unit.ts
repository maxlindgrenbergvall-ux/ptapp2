// Enhetstest för snabbloggningen på Kost-sidan (v42).
//   npx tsx --tsconfig tsconfig.json e2e/quick-log.unit.ts
import { groupByMeal, mealForTime, quickEntry, recentFoods } from "@/lib/nutrition/quick-log"
import type { FoodEntry } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const at = (h: number) => new Date(2026, 10, 6, h, 30)

check(mealForTime(at(7)) === "breakfast" && mealForTime(at(9)) === "breakfast", "07:30/09:30 → frukost")
check(mealForTime(at(12)) === "lunch", "12:30 → lunch")
check(mealForTime(at(15)) === "snack", "15:30 → mellanmål")
check(mealForTime(at(18)) === "dinner" && mealForTime(at(20)) === "dinner", "18:30/20:30 → middag")
check(mealForTime(at(22)) === "snack" && mealForTime(at(2)) === "snack", "kväll/natt → mellanmål")

let n = 0
const e = (date: string, name: string, grams: number | undefined, kcal: number, extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `f${++n}`,
  clientId: "c1",
  date,
  name,
  kcal,
  protein: kcal / 20,
  carbs: kcal / 10,
  fat: kcal / 40,
  ...(grams ? { grams, unit: "g" } : {}),
  ...extra,
})
const log = [
  e("2026-11-01", "Kvarg", 250, 150, { barcode: "7310865004703" }),
  e("2026-11-03", "Banan", 120, 107),
  e("2026-11-04", "Kvarg", 200, 120, { barcode: "7310865004703" }),
  e("2026-11-04", "Kanelbulle", undefined, 300),
  e("2026-11-05", "banan ", 150, 134),
  e("2026-11-05", "Kycklingbowl", 450, 620, { libraryRecipeId: "r1" }),
  { ...e("2026-11-05", "Annan klients mat", 100, 100), clientId: "c2" },
]
const recent = recentFoods(log, "c1")
check(recent.map((r) => r.product.name).join(",") === "banan,Kvarg", `unika, nyast först, utan bara-kcal-rader, recept och andras mat (${recent.map((r) => r.product.name)})`)
const kvarg = recent.find((r) => r.product.barcode)!
check(kvarg.grams === 200 && kvarg.times === 2, `senaste mängden (200 g) och antal gånger (${kvarg.times})`)
check(Math.round(kvarg.product.per100.kcal) === 60, "per 100 g räknas tillbaka ur posten (120 kcal / 200 g = 60)")

const q = quickEntry(kvarg.product, 200, "breakfast")
check(q.kcal === 120 && q.grams === 200 && q.meal === "breakfast" && q.barcode === "7310865004703", "ett tryck: samma mängd, makron och måltid")
check(!("productId" in q), "inget produkt-id för 'senaste'-nycklar")
check(quickEntry({ id: "p1", name: "Ris", per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, source: "library" }, 150).productId === "p1", "riktiga produkter behåller sitt id")

const groups = groupByMeal([
  { ...e("2026-11-06", "Te", undefined, 2), meal: "snack" },
  { ...e("2026-11-06", "Gröt", 300, 250), meal: "breakfast" },
  e("2026-11-06", "Godis", undefined, 200),
  { ...e("2026-11-06", "Ägg", 60, 90), meal: "breakfast" },
])
check(groups.map((g) => g.label).join(",") === "Frukost,Mellanmål,Övrigt", `måltidsordning, tomma måltider döljs (${groups.map((g) => g.label)})`)
check(groups[0].kcal === 340 && groups[0].entries.length === 2, "summa per måltid")

console.log(failed ? `\n${failed} fel` : "\nSNABBLOGGNINGEN GODKÄND")
process.exit(failed ? 1 : 0)
