/**
 * Ingrediensrader → metriska mått (v25).
 *
 * Amerikanska mått räknas om innan receptet sparas:
 *   vikt    oz → g (28,35), lb → g (453,6), stick (smör) → 113 g
 *   volym   cup 236,6 ml, tbsp 14,8 ml, tsp 4,9 ml, fl oz 29,6 ml,
 *           pint 473 ml, quart 946 ml, gallon 3,79 l
 * Volym blir milliliter/deciliter för vätskor och gram för fasta
 * ingredienser (via densitet: 1 cup vetemjöl ≈ 125 g, 1 cup socker ≈ 200 g).
 * Svenska/metriska mått (g, kg, ml, dl, l, msk, tsk, krm, st) behålls.
 *
 * Tolkar t.ex. "1 1/2 cups all-purpose flour", "½ lb ground beef",
 * "1 (14.5 oz) can diced tomatoes", "2 burkar krossade tomater à 400 g",
 * "3 vitlöksklyftor" och "salt to taste".
 */
import { densityOf, foodKind, pieceWeight } from "@/lib/nutrition/meal-items"
import type { MealItem } from "@/types/domain"

export type Amount = { kind: "mass"; grams: number } | { kind: "volume"; ml: number } | { kind: "piece"; count: number }

export interface ParsedIngredient {
  original: string
  /** Ingrediensens namn utan mängd och enhet ("all-purpose flour"). */
  name: string
  amount?: Amount
  /** Enheten var amerikansk och har räknats om. */
  us: boolean
  /** Ursprunglig metrisk volymenhet (dl, msk, tsk …) – behålls som den är. */
  metricUnit?: "ml" | "dl" | "msk" | "tsk"
  metricQty?: number
}

const FRACTIONS: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅕": "1/5", "⅙": "1/6",
}

type UnitDef =
  | { kind: "mass"; g: number; us?: boolean }
  | { kind: "volume"; ml: number; us?: boolean; metric?: "ml" | "dl" | "msk" | "tsk" }
  | { kind: "piece" }
  | { kind: "container" }
  | { kind: "none" }

/** Enheter med alla stavningar. Längsta matchningen vinner (så "fl oz" före "oz"). */
const UNITS: [string[], UnitDef][] = [
  // Amerikansk vikt
  [["ounces", "ounce", "oz"], { kind: "mass", g: 28.3495, us: true }],
  [["pounds", "pound", "lbs", "lb"], { kind: "mass", g: 453.592, us: true }],
  [["sticks", "stick"], { kind: "mass", g: 113.4, us: true }],
  // Amerikansk volym
  [["fluid ounces", "fluid ounce", "fl. oz.", "fl. oz", "fl oz", "fl.oz"], { kind: "volume", ml: 29.5735, us: true }],
  [["cups", "cup"], { kind: "volume", ml: 236.588, us: true }],
  [["tablespoons", "tablespoon", "tbsps", "tbsp", "tbs", "tbl"], { kind: "volume", ml: 14.7868, us: true }],
  [["teaspoons", "teaspoon", "tsps", "tsp"], { kind: "volume", ml: 4.92892, us: true }],
  [["pints", "pint", "pt"], { kind: "volume", ml: 473.176, us: true }],
  [["quarts", "quart", "qt"], { kind: "volume", ml: 946.353, us: true }],
  [["gallons", "gallon", "gal"], { kind: "volume", ml: 3785.41, us: true }],
  // Metrisk vikt
  [["kilograms", "kilogram", "kilo", "kg"], { kind: "mass", g: 1000 }],
  [["grams", "gram", "gr", "g"], { kind: "mass", g: 1 }],
  [["milligrams", "mg"], { kind: "mass", g: 0.001 }],
  [["hekto", "hg"], { kind: "mass", g: 100 }],
  // Metrisk/svensk volym
  [["milliliters", "millilitres", "milliliter", "millilitre", "ml"], { kind: "volume", ml: 1, metric: "ml" }],
  [["centiliters", "centilitres", "cl"], { kind: "volume", ml: 10, metric: "ml" }],
  [["deciliters", "decilitres", "deciliter", "dl"], { kind: "volume", ml: 100, metric: "dl" }],
  [["liters", "litres", "liter", "litre", "l"], { kind: "volume", ml: 1000, metric: "dl" }],
  [["matskedar", "matsked", "msk"], { kind: "volume", ml: 15, metric: "msk" }],
  [["teskedar", "tesked", "tsk"], { kind: "volume", ml: 5, metric: "tsk" }],
  [["kryddmått", "krm"], { kind: "volume", ml: 1, metric: "ml" }],
  // Styck
  [["styck", "stycken", "st", "stk", "pieces", "piece", "pcs", "cloves", "clove", "klyftor", "klyfta", "slices", "slice", "skivor", "skiva",
    "fillets", "fillet", "filéer", "filé", "large", "medium", "small", "whole", "stora", "stor", "små", "liten", "medelstora", "medelstor"], { kind: "piece" }],
  // Förpackningar (storleken står i parentes eller efter "à")
  [["cans", "can", "tins", "tin", "jars", "jar", "packages", "package", "pkg", "packets", "packet", "bags", "bag", "boxes", "box", "cartons", "carton",
    "burkar", "burk", "paket", "förpackningar", "förpackning", "förp", "påsar", "påse"], { kind: "container" }],
  // Utan mängd
  [["pinches", "pinch", "dashes", "dash", "nypa", "nypor", "handful", "handfull"], { kind: "none" }],
]

const ALIASES = UNITS.flatMap(([names, def]) => names.map((n) => ({ n, def }))).sort((a, b) => b.n.length - a.n.length)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const UNIT_RE = new RegExp(`^(${ALIASES.map((a) => escapeRe(a.n)).join("|")})(?![\\p{L}])\\.?\\s*`, "iu")
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`
const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(?:-|–|—|to|till|or|eller)\\s*(${NUM}))?\\s*(?:x|×)?\\s*`, "i")
const SIZE_RE = new RegExp(`(?:\\(|(?:^|\\s)à\\s*)(${NUM})\\s*-?\\s*(ounces?|oz|pounds?|lbs?|lb|grams?|g|kg|ml|cl|dl|l|liters?|fl\\.? ?oz)(?![a-zåäö])\\.?\\)?`, "i")

/** "1 1/2" → 1,5, "3/4" → 0,75, "1,5" → 1,5. */
export function toNumber(s: string): number {
  const t = s.trim().replace(",", ".")
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : 0
  return Number(t)
}

/** Unicode-bråk och annat brus bort: "1½ cups" → "1 1/2 cups". */
function clean(line: string) {
  return line
    .replace(/(\d)?\s*([¼½¾⅓⅔⅛⅜⅝⅞⅕⅙])/g, (_, d: string | undefined, f: string) => `${d ? `${d} ` : ""}${FRACTIONS[f]}`)
    .replace(/⁄/g, "/")
    .replace(/^[\s•·\-–*▢□☐]+/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function unitAt(s: string): { def: UnitDef; rest: string } | null {
  const m = s.match(UNIT_RE)
  if (!m) return null
  const def = ALIASES.find((a) => a.n.toLowerCase() === m[1].toLowerCase())!.def
  return { def, rest: s.slice(m[0].length) }
}

function sizeAmount(qty: string, unit: string): Amount | null {
  const n = toNumber(qty)
  const hit = unitAt(`${unit} `)
  if (!hit || !Number.isFinite(n)) return null
  if (hit.def.kind === "mass") return { kind: "mass", grams: n * hit.def.g }
  if (hit.def.kind === "volume") return { kind: "volume", ml: n * hit.def.ml }
  return null
}

/** Tolka en ingrediensrad. */
export function parseIngredient(line: string): ParsedIngredient {
  const original = clean(line)
  let s = original
  let qty: number | undefined
  const q = s.match(QTY_RE)
  if (q && q[1]) {
    const a = toNumber(q[1])
    const b = q[2] ? toNumber(q[2]) : undefined
    qty = b !== undefined && Number.isFinite(b) ? (a + b) / 2 : a
    s = s.slice(q[0].length)
  } else if (/^(a|an|en|ett)\s+/i.test(s)) {
    qty = 1
    s = s.replace(/^(a|an|en|ett)\s+/i, "")
  }

  // Storlek i parentes eller efter "à": "1 (14.5 oz) can", "2 burkar à 400 g", "1 burk tomater (400 g)".
  const size = s.match(SIZE_RE)
  const sizeEach = size ? sizeAmount(size[1], size[2]) : null

  let def: UnitDef | undefined
  const u = unitAt(s.replace(/^\([^)]*\)\s*/, ""))
  if (u && (qty !== undefined || u.def.kind === "none")) {
    def = u.def
    s = u.rest
  } else {
    s = s.replace(/^\([^)]*\)\s*/, "")
  }
  // "2 large eggs": storleksord följt av ingrediensen – stycken.
  const name = s
    .replace(SIZE_RE, " ")
    .replace(/^of\s+/i, "")
    .replace(/\s*,\s*(to taste|optional|divided|plus more.*|efter smak|valfritt)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.;:\s]+|[,.;:\s]+$/g, "")

  const result: ParsedIngredient = { original, name: name || original, us: false }
  if (qty === undefined || !Number.isFinite(qty) || qty <= 0) return result

  if (!def || def.kind === "piece") {
    // Utan enhet: förpackningsstorlek om den finns ("1 (400 g) burk"), annars styck.
    result.amount = sizeEach && !def ? scale(sizeEach, qty) : { kind: "piece", count: qty }
  } else if (def.kind === "container") {
    if (sizeEach) {
      result.amount = scale(sizeEach, qty)
      result.us = /oz|lb|pound/i.test(size![2])
    } else result.amount = { kind: "piece", count: qty }
  } else if (def.kind === "mass") {
    result.amount = { kind: "mass", grams: qty * def.g }
    result.us = Boolean(def.us)
  } else if (def.kind === "volume") {
    result.amount = { kind: "volume", ml: qty * def.ml }
    result.us = Boolean(def.us)
    if (def.metric) {
      result.metricUnit = def.metric
      result.metricQty = def.metric === "dl" ? (qty * def.ml) / 100 : def.metric === "ml" ? qty * def.ml : qty
    }
  }
  return result
}

const scale = (a: Amount, n: number): Amount =>
  a.kind === "mass" ? { kind: "mass", grams: a.grams * n } : a.kind === "volume" ? { kind: "volume", ml: a.ml * n } : { kind: "piece", count: a.count * n }

// ----------------------------------------------- engelska ingredienser ---

/** Densitet (g/ml) för vanliga engelska ingredienser. Annars: svenska tabellen (0,8). */
const EN_DENSITY: [RegExp, number][] = [
  [/powdered sugar|icing sugar|confectioners/i, 0.5],
  [/brown sugar/i, 0.9],
  [/sugar/i, 0.85],
  [/flour|cornstarch|corn starch/i, 0.53],
  [/rolled oats|oats|oatmeal/i, 0.35],
  [/(^|\s)rice\b/i, 0.78],
  [/quinoa|couscous|bulgur|lentils/i, 0.8],
  [/pasta|macaroni|penne/i, 0.45],
  [/breadcrumbs|panko/i, 0.45],
  [/peanut butter|almond butter|nut butter/i, 1.08],
  [/butter/i, 0.96],
  [/honey/i, 1.42],
  [/maple syrup|syrup/i, 1.37],
  [/cocoa|protein powder|whey/i, 0.42],
  [/(^|\s)salt\b/i, 1.2],
  [/baking (powder|soda)/i, 0.9],
  [/parmesan|grated cheese/i, 0.4],
  [/shredded|cheddar|mozzarella|cheese/i, 0.45],
  [/greek yog|yog(h)?urt|sour cream|cream cheese|cottage/i, 1.03],
  [/chocolate chips/i, 0.7],
  [/almonds|walnuts|pecans|cashews|peanuts|nuts|seeds/i, 0.6],
  [/chia/i, 0.65],
  [/blueberries|raspberries|strawberries|berries/i, 0.6],
  [/beans|chickpeas/i, 0.75],
  [/spinach|kale|lettuce|arugula|greens/i, 0.15],
  [/chopped|diced|sliced|onion|pepper|carrot|celery|broccoli|corn|peas|tomato/i, 0.6],
]

/** Vätskor mäts i ml/dl, allt annat räknas om till gram. */
const EN_LIQUID =
  /\b(water|milk|buttermilk|broth|stock|juice|wine|beer|vinegar|heavy cream|whipping cream|half[- ]and[- ]half|coconut milk|almond milk|oat milk|soy milk|soy sauce|fish sauce|sauce|oil|coffee|tea|liquid|syrup)\b/i
const NOT_LIQUID = /cream cheese|sour cream|ice cream|peanut butter|tomato paste/i

export function isLiquid(name: string): boolean {
  if (NOT_LIQUID.test(name)) return false
  if (EN_LIQUID.test(name)) return true
  const kind = foodKind(name)
  return kind === "liquid" || kind === "oil"
}

export function densityFor(name: string): number {
  // Vätskor ≈ vatten (olja och sirap avviker).
  if (isLiquid(name)) return /oil|olja/i.test(name) ? 0.92 : /syrup|sirap|honey|honung/i.test(name) ? 1.37 : 1.02
  return EN_DENSITY.find(([re]) => re.test(name))?.[1] ?? densityOf(name)
}

/** Vikt per styck (ätlig del) för engelska ingredienser; annars svenska tabellen. */
const EN_PIECES: [RegExp, number][] = [
  [/egg whites?/i, 33],
  [/egg yolks?/i, 17],
  [/\beggs?\b/i, 50],
  [/bananas?/i, 120],
  [/apples?/i, 180],
  [/oranges?/i, 140],
  [/lemons?/i, 100],
  [/limes?/i, 65],
  [/avocados?/i, 150],
  [/sweet potato(es)?/i, 200],
  [/potato(es)?/i, 170],
  [/red onions?|onions?/i, 150],
  [/shallots?/i, 40],
  [/garlic|cloves?/i, 5],
  [/cherry tomato(es)?/i, 15],
  [/tomato(es)?/i, 120],
  [/carrots?/i, 70],
  [/bell peppers?|peppers?/i, 150],
  [/zucchinis?|courgettes?/i, 200],
  [/cucumbers?/i, 300],
  [/chicken breasts?/i, 170],
  [/chicken thighs?/i, 110],
  [/salmon fillets?|fillets?/i, 140],
  [/tortillas?|wraps?/i, 45],
  [/slices? of bread|bread slices?/i, 35],
  [/bacon/i, 15],
  [/dates?\b/i, 8],
  [/mangos?|mangoes/i, 200],
  [/scoops?/i, 30],
]

export function pieceGramsFor(name: string): number | undefined {
  return EN_PIECES.find(([re]) => re.test(name))?.[1] ?? pieceWeight(name)
}

/** Avrunda till steg (0,1 dl, 0,5 st, 5 g) utan flyttalsbrus. */
const r = (n: number, step: number) => Number((Math.round(n / step) * step).toFixed(2))

/**
 * Ingrediens → rad med metriska mått (utan makron). Amerikansk volym blir ml/dl
 * för vätskor och gram för fast; vikt alltid gram; metriska volymmått behålls.
 */
export function toMetricItem(p: ParsedIngredient): MealItem {
  const base = { name: p.name, original: p.original, kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const a = p.amount
  if (!a) return { ...base, grams: 0 }
  if (a.kind === "mass") return { ...base, unit: "g", grams: Math.round(a.grams) }
  if (a.kind === "piece") {
    const pieceG = pieceGramsFor(p.name)
    return { ...base, unit: "st", qty: r(a.count, 0.5) || a.count, ...(pieceG ? { pieceG, grams: Math.round(a.count * pieceG) } : { grams: 0 }) }
  }
  const gPerMl = densityFor(p.name)
  const grams = Math.round(a.ml * gPerMl)
  if (!p.us && p.metricUnit) return { ...base, unit: p.metricUnit, qty: p.metricQty!, gPerMl, grams }
  if (isLiquid(p.name)) {
    return a.ml >= 100 ? { ...base, unit: "dl", qty: r(a.ml / 100, 0.1), gPerMl, grams } : { ...base, unit: "ml", qty: Math.max(1, Math.round(a.ml)), gPerMl, grams }
  }
  return { ...base, unit: "g", grams: Math.max(1, grams) }
}

/**
 * Amerikanska mått i löptext (instruktionerna): 350 °F → 175 °C, 9 inch → 23 cm, 9x13-inch → 23×33 cm,
 * 8 oz → 225 g, 2 lb → 905 g.
 */
export function metricText(text: string): string {
  return text
    .replace(/(\d{2,3})\s*(?:°|º|degrees?)\s*F\b|(\d{3})\s*F\b/gi, (_, a: string | undefined, b: string | undefined) => {
      const c = ((Number(a ?? b) - 32) * 5) / 9
      return `${Math.round(c / 5) * 5} °C`
    })
    // Formmått: "9x13-inch" → "23×33 cm".
    .replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*|-)(?:inch(?:es)?|in\.|")/gi, (_, a: string, b: string) => `${Math.round(Number(a) * 2.54)}×${Math.round(Number(b) * 2.54)} cm`)
    .replace(/(\d+(?:\.\d+)?)(?:\s*|-)(?:inch(?:es)?|in\.|")(?=[\s,.;)x×-]|$)/gi, (_, n: string) => `${Math.round(Number(n) * 2.54)} cm`)
    .replace(/(\d+(?:\.\d+)?)\s*(?:ounces?|oz)\b/gi, (_, n: string) => `${r(Number(n) * 28.3495, 5)} g`)
    .replace(/(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?)\b/gi, (_, n: string) => `${r(Number(n) * 453.592, 5)} g`)
}
