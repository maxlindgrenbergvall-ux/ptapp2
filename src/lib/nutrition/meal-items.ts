/**
 * Livsmedel i kostbyggaren. Varje rad sparar näringsvärdena per 100 g och
 * räknar fram makrona ur dem vid varje ändring. (Tidigare skalades makrona om
 * med kvoten ny/gammal vikt – vid 0 g blev de 0 för alltid, och värdena
 * "försvann" när PT:n ändrade gramvärdet.)
 *
 * Enheter: gram, styck och volym (ml, dl, msk, tsk). Styck räknas om till gram
 * med en uppskattad styckvikt (1 ägg ≈ 60 g) och volym med livsmedlets
 * densitet (1 dl havregryn ≈ 35 g, 1 msk olja ≈ 14 g).
 *
 * Bara logiska enheter per livsmedelstyp (se allowedUnits): vätskor i dl/ml,
 * ris/pasta/gryn i g/dl, kött/fisk/fågel och andra fasta livsmedel bara i g.
 * Samma regler gäller i PT:ns kostbyggare och i klientens matlogg.
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

/** Milliliter per volymenhet. */
export const VOLUME_ML = { ml: 1, dl: 100, msk: 15, tsk: 5 } as const
export type VolumeUnit = keyof typeof VOLUME_ML
export const isVolume = (u: MealUnit | undefined): u is VolumeUnit => u === "ml" || u === "dl" || u === "msk" || u === "tsk"
/** Steg vid avrundning: hela ml, annars kvarts mått (¼ dl, ½ tsk). */
const volumeStep = (u: VolumeUnit) => (u === "ml" ? 1 : 0.25)

// ------------------------------------------------------ logiska enheter ---

/**
 * Livsmedelstyp, som styr vilka enheter som är logiska:
 *  - liquid    mjölk, juice, dryck, buljong … → dl, ml
 *  - oil       olja → msk, tsk, ml, dl
 *  - grain     ris, pasta, gryn, flingor, mjöl, bönor, bär, kvarg/yoghurt → g, dl
 *  - countable ägg, frukt, bröd, potatis … → st, g
 *  - spoon     smör, honung, socker, pulver, frön, såser → g, msk, tsk
 *  - solid     kött, fisk, fågel och övriga fasta livsmedel → bara g
 */
export type FoodKind = "liquid" | "oil" | "grain" | "countable" | "spoon" | "solid"

export const KIND_UNITS: Record<FoodKind, MealUnit[]> = {
  liquid: ["dl", "ml"],
  oil: ["msk", "tsk", "ml", "dl"],
  grain: ["g", "dl"],
  countable: ["st", "g"],
  spoon: ["g", "msk", "tsk"],
  solid: ["g"],
}

const SOLID_EXCEPTIONS = /choklad|chips|godis|glass|bulle|kaka\b|kex/i
const OIL = /(?<!k)olja|(^|\s)oil\b/i
const LIQUID =
  /mjölk(?!choklad|pulver)|dryck|juice|vatten(?!melon)|kaffe|(^|\s)läsk|(^|\s)cola|smoothie|kefir|(^|\s)(fil|te|öl)(\s|$)|grädde|buljong|fond\b|soppa|nektar|saft/i
const MEAT =
  /kött|fläsk|biff|färs|kyckling|kalkon|lax|torsk|fisk|tonfisk|räk|skinka|bacon|korv|filé|entrecote|lamm|älg|hjort|vilt|sej|makrill|sill|kassler|anka|kräft|mussl|skaldjur|pollock|rödspätta|regnbåge|kotlett|grytbit|högrev|rostbiff|salami|chorizo|sardin|pulled/i
/** Vätskor som innehåller kött/fisk är fortfarande vätskor. */
const SOUP = /buljong|soppa|fond\b/i
/** Rätter som mäts som ris/gryn trots "vatten"/"tomat" i namnet. */
const GRAIN_FIRST = /gröt|tomatsås|pastasås|krossade tomater/i
const GRAIN =
  /ris\b|risgryn|basmati|jasmin|gryn|flingor|müsli|musli|granola|cornflakes|havrefras|mjöl|pasta|makaroner|spagetti|nudlar|bulgur|couscous|quinoa|matvete|bönor|linser|kikärt|majs|ärtor|bär|blåbär|hallon|jordgubb|kvarg|yoghurt|skyr|keso|kesella|cottage|gröt/i
const SPOON = /smör|margarin|bregott|crème fraiche|gräddfil|färskost|honung|sirap|sylt|marmelad|socker|kakao|pulver|frön|chiafrö|linfrö|majonnäs|ketchup|senap|dressing|pesto|hummus|sås|kanel|(^|\s)salt$|tahini/i

export function foodKind(name: string): FoodKind {
  const lib = FOOD_LIBRARY.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (SOLID_EXCEPTIONS.test(name)) return "solid"
  if (SOUP.test(name)) return "liquid"
  // Kött, fisk och fågel: alltid gram (även kycklingfilé, köttbullar och tonfisk i olja).
  if (MEAT.test(name) || lib?.category === "Kött & chark" || lib?.category === "Fisk & skaldjur") return "solid"
  if (GRAIN_FIRST.test(name)) return "grain"
  if (OIL.test(name)) return "oil"
  if (LIQUID.test(name) || lib?.unit === "ml") return "liquid"
  if (isCountable(name)) return "countable"
  if (GRAIN.test(name)) return "grain"
  if (SPOON.test(name)) return "spoon"
  return "solid"
}

/** Logiska enheter för ett livsmedel, förvald enhet först. */
export const allowedUnits = (name: string): MealUnit[] => KIND_UNITS[foodKind(name)]

/** Enheterna att välja mellan för en rad: de logiska + radens nuvarande (äldre rader). */
export function unitOptions(item: MealItem): MealUnit[] {
  const units = allowedUnits(item.name)
  const current = item.unit ?? "g"
  return units.includes(current) ? units : [...units, current]
}

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

/**
 * Ny rad från sökningen i livsmedlets förvalda enhet: 1 st ägg/frukt,
 * 2 dl mjölk, 1 msk olja, annars 100 g.
 */
export function itemFromFood(food: Food): MealItem {
  const per100: Per100 = { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat }
  const unit = allowedUnits(food.name)[0]
  if (unit === "st") {
    const pieceG = pieceWeight(food.name, food.servingG) ?? 100
    return { name: food.name, unit: "st", qty: 1, pieceG, grams: pieceG, per100, ...macrosFor(per100, pieceG) }
  }
  const base: MealItem = { name: food.name, unit: "g", grams: 100, per100, ...macrosFor(per100, 100) }
  if (unit === "dl") return setAmount(base, 2, "dl")
  if (unit === "msk") return setAmount(base, 1, "msk")
  return base
}

/** Ändra mängd och/eller enhet. Makrona räknas alltid om från per100. */
export function setAmount(item: MealItem, amount: number, unit: MealUnit = item.unit ?? "g"): MealItem {
  const per100 = per100Of(item)
  const a = Math.max(0, Number.isFinite(amount) ? amount : 0)
  if (isVolume(unit)) {
    const gPerMl = item.gPerMl ?? densityOf(item.name)
    const step = volumeStep(unit)
    const qty = Math.round(a / step) * step
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
    const step = volumeStep(unit)
    const qty = item.grams > 0 ? Math.max(step, Math.round(item.grams / perUnit / step) * step) : 1
    return setAmount({ ...item, gPerMl }, qty, unit)
  }
  if (unit === "st") {
    const pieceG = item.pieceG ?? pieceWeight(item.name) ?? (item.grams > 0 ? item.grams : 100)
    return setAmount({ ...item, pieceG }, Math.max(1, Math.round(item.grams / pieceG)), "st")
  }
  return setAmount(item, item.grams, "g")
}

/** Mängden som den visas: "2" (st/ml/dl/msk/tsk) eller "120" (g). */
export const amountOf = (item: MealItem) => ((item.unit ?? "g") === "g" ? item.grams : (item.qty ?? 1))
