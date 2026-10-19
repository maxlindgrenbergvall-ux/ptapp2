/**
 * Livsmedel i kostbyggaren. Varje rad sparar näringsvärdena per 100 g och
 * räknar fram makrona ur dem vid varje ändring. (Tidigare skalades makrona om
 * med kvoten ny/gammal vikt – vid 0 g blev de 0 för alltid, och värdena
 * "försvann" när PT:n ändrade gramvärdet.)
 *
 * Enheter: gram, styck och köksmått (dl, msk, tsk). Styck räknas om till gram
 * med en uppskattad styckvikt (1 ägg ≈ 60 g) och köksmått med livsmedlets
 * densitet (1 dl havregryn ≈ 35 g, 1 msk olja ≈ 14 g). Ingen ml-enhet: drycker
 * anges i dl eller gram.
 */
import { FOOD_LIBRARY } from "@/lib/food-library"
import type { Food } from "@/lib/foods"
import type { MealItem, MealUnit, Per100 } from "@/types/domain"

/** Livsmedel som naturligt räknas i styck, med styckvikt i gram (ätlig del). */
const PIECES: [RegExp, number][] = [
  [/^ägg$|hönsägg/i, 60],
  [/äggvita/i, 33],
  [/banan/i, 120],
  [/äpple/i, 150],
  [/päron/i, 160],
  [/apelsin(?!juice)/i, 150],
  [/clementin|mandarin/i, 70],
  [/kiwi/i, 75],
  [/avokado/i, 140],
  [/dadl/i, 10],
  [/knäckebröd/i, 12],
  [/tortilla|wrap/i, 40],
  [/riskak/i, 8],
  [/fullkornsbröd|limpa|rostbröd|bröd(?!smul)/i, 35],
  [/köttbull/i, 20],
  [/pannkak/i, 80],
  [/potatis \(kokt\)|^potatis$/i, 90],
  [/tomat$|^tomat/i, 100],
  [/morot/i, 70],
  [/paprika/i, 150],
  [/gul lök|lök \(gul\)/i, 80],
  [/vitlök/i, 5],
  [/kycklingfilé/i, 125],
  [/proteinbar|bar\b/i, 55],
]

/** Milliliter per köksmått. */
export const VOLUME_ML = { dl: 100, msk: 15, tsk: 5 } as const
export type VolumeUnit = keyof typeof VOLUME_ML
export const isVolume = (u: MealUnit | undefined): u is VolumeUnit => u === "dl" || u === "msk" || u === "tsk"

/**
 * Densitet i gram per milliliter för vanliga livsmedel (Livsmedelsverkets
 * mått-och-vikt-tabeller, avrundat). Okända livsmedel räknas som 0,8 g/ml.
 */
const DENSITY: [RegExp, number][] = [
  // Ordningen spelar roll: "mjölk" före "mjöl", "jordnötssmör" före "smör".
  [/mjölk|dryck|juice|vatten|kaffe|läsk|filmjölk|(^|\s)(fil|te)(\s|$)|yoghurt|kvarg|grädde|kokosmjölk|buljong|soppa|sås/i, 1.03],
  [/havregryn|havrefras|müsli|musli|granola|cornflakes|flingor/i, 0.35],
  [/mjöl|vetemjöl|dinkel/i, 0.6],
  [/(^|\s)ris\b|basmati|jasmin|bulgur|couscous|quinoa|matvete/i, 0.85],
  [/pasta|makaroner|spagetti/i, 0.45],
  [/socker|strösocker/i, 0.85],
  [/honung|sirap/i, 1.4],
  [/olja|olivolja|rapsolja/i, 0.92],
  [/jordnötssmör|mandelsmör|nötsmör/i, 1.05],
  [/smör|margarin/i, 0.95],
  [/keso|kesella|cottage/i, 0.95],
  [/nötter|mandlar|cashew|hasselnöt|valnöt|frön|chiafrö|linfrö|solros|pumpa/i, 0.6],
  [/kakao|proteinpulver|pulver/i, 0.45],
  [/bönor|linser|kikärt/i, 0.8],
  [/bär|blåbär|hallon|jordgubb/i, 0.6],
]

export function densityOf(name: string): number {
  return DENSITY.find(([re]) => re.test(name))?.[1] ?? 0.8
}

/** Uppskattad vikt för 1 st, eller undefined om livsmedlet inte räknas i styck. */
export function pieceWeight(name: string, servingG?: number): number | undefined {
  const hit = PIECES.find(([re]) => re.test(name))
  return hit ? hit[1] : servingG
}

export const isCountable = (name: string) => PIECES.some(([re]) => re.test(name))

const round1 = (n: number) => Math.round(n * 10) / 10

/** Makron för en viss vikt ur värden per 100 g. */
export function macrosFor(per100: Per100, grams: number) {
  const f = Math.max(0, grams) / 100
  return { kcal: Math.round(per100.kcal * f), protein: round1(per100.protein * f), carbs: round1(per100.carbs * f), fat: round1(per100.fat * f) }
}

/**
 * Värden per 100 g för en rad. Äldre rader saknar per100: räkna fram ur
 * vikten, eller slå upp namnet i biblioteket om vikten redan blivit 0.
 */
export function per100Of(item: MealItem): Per100 | undefined {
  if (item.per100) return item.per100
  if (item.grams > 0) {
    const f = 100 / item.grams
    return { kcal: item.kcal * f, protein: item.protein * f, carbs: item.carbs * f, fat: item.fat * f }
  }
  return FOOD_LIBRARY.find((x) => x.name.toLowerCase() === item.name.toLowerCase())?.per100
}

/** Ny rad från sökningen: styck för t.ex. ägg och frukt, annars 100 g. */
export function itemFromFood(food: Food): MealItem {
  const per100: Per100 = { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat }
  if (isCountable(food.name)) {
    const pieceG = pieceWeight(food.name, food.servingG) ?? 100
    return { name: food.name, unit: "st", qty: 1, pieceG, grams: pieceG, per100, ...macrosFor(per100, pieceG) }
  }
  return { name: food.name, unit: "g", grams: 100, per100, ...macrosFor(per100, 100) }
}

/** Ändra mängd och/eller enhet. Makrona räknas alltid om från per100. */
export function setAmount(item: MealItem, amount: number, unit: MealUnit = item.unit ?? "g"): MealItem {
  const per100 = per100Of(item)
  const a = Math.max(0, Number.isFinite(amount) ? amount : 0)
  if (isVolume(unit)) {
    const gPerMl = item.gPerMl ?? densityOf(item.name)
    const qty = Math.round(a * 4) / 4 // kvarts mått räcker (¼ dl, ½ tsk)
    const grams = Math.round(qty * VOLUME_ML[unit] * gPerMl)
    const { pieceG: _p, ...rest } = item
    void _p
    return { ...rest, unit, qty, gPerMl, grams, ...(per100 ? { per100, ...macrosFor(per100, grams) } : {}) }
  }
  if (unit === "st") {
    const pieceG = item.pieceG ?? pieceWeight(item.name) ?? (item.unit !== "st" && item.grams > 0 ? item.grams : 100)
    const qty = Math.round(a * 2) / 2 // halva styck räcker (½ avokado)
    const grams = Math.round(qty * pieceG)
    return { ...item, unit, qty, pieceG, grams, ...(per100 ? { per100, ...macrosFor(per100, grams) } : {}) }
  }
  const grams = Math.round(a)
  const { qty: _q, ...rest } = item
  void _q
  return { ...rest, unit: "g", grams, ...(per100 ? { per100, ...macrosFor(per100, grams) } : {}) }
}

/** Byt enhet och behåll ungefär samma mängd. */
export function switchUnit(item: MealItem, unit: MealUnit): MealItem {
  if ((item.unit ?? "g") === unit) return item
  if (isVolume(unit)) {
    const gPerMl = item.gPerMl ?? densityOf(item.name)
    const perUnit = VOLUME_ML[unit] * gPerMl
    const qty = item.grams > 0 ? Math.max(0.25, Math.round((item.grams / perUnit) * 4) / 4) : 1
    return setAmount({ ...item, gPerMl }, qty, unit)
  }
  if (unit === "st") {
    const pieceG = item.pieceG ?? pieceWeight(item.name) ?? (item.grams > 0 ? item.grams : 100)
    return setAmount({ ...item, pieceG }, Math.max(1, Math.round(item.grams / pieceG)), "st")
  }
  return setAmount(item, item.grams, "g")
}

/** Mängden som den visas: "2" (st/dl/msk/tsk) eller "120" (g). */
export const amountOf = (item: MealItem) => ((item.unit ?? "g") === "g" ? item.grams : (item.qty ?? 1))
