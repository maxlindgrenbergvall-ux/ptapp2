/**
 * Läs ut ett recept ur en receptsidas HTML (v25).
 *
 *  1. JSON-LD (schema.org/Recipe) – de flesta receptsajter (ICA, Arla, Köket,
 *     BBC Good Food, Allrecipes …) lägger receptet i <script type="application/ld+json">.
 *  2. Reserv: HTML-microdata (itemprop="recipeIngredient" osv.) och og:-taggar.
 *
 * Bara text tas med (inga skript eller attribut), och allt kapas till rimliga längder.
 */

export interface RawNutrition {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

export interface RawRecipe {
  name: string
  image?: string
  servings?: number
  totalMinutes?: number
  ingredients: string[]
  instructions: string[]
  /** Per portion (schema.org NutritionInformation gäller en portion). */
  nutrition?: RawNutrition
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", deg: "°", frac12: "½", frac14: "¼", frac34: "¾",
  aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö", eacute: "é", egrave: "è", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×",
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""
    }
    return ENTITIES[e] ?? m
  })
}

/** Ren text: utan taggar, entiteter avkodade, ett mellanslag åt gången. */
export function text(s: string, max = 1000): string {
  return decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max)
}

/** ISO 8601-tid ("PT1H30M", "P0DT20M") eller "25 min" → minuter. */
export function parseDuration(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined
  const iso = v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (iso && (iso[1] || iso[2] || iso[3])) {
    const min = Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0)
    return min > 0 && min <= 1440 ? min : undefined
  }
  const h = v.match(/(\d+)\s*(h|tim|hour)/i)
  const m = v.match(/(\d+)\s*(m|min)/i)
  const total = Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0)
  return total > 0 && total <= 1440 ? total : undefined
}

/** recipeYield: 4, "4", "4 servings", "Serves 4", "4 portioner", ["4", "4 servings"]. */
export function parseYield(v: unknown): number | undefined {
  const values = Array.isArray(v) ? v : [v]
  for (const x of values) {
    const n = typeof x === "number" ? x : typeof x === "string" ? Number(x.match(/\d+/)?.[0]) : NaN
    if (Number.isFinite(n) && n >= 1 && n <= 100) return Math.round(n)
  }
  return undefined
}

/** "350 kcal", "350 calories", "1470 kJ", "25 g", "25,5g", 25 → tal (kJ räknas om till kcal). */
export function parseNutrient(v: unknown, energy = false): number | undefined {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v : ""
  const m = s.replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  if (!m) return undefined
  let n = Number(m[1])
  if (energy && /kj/i.test(s) && !/kcal/i.test(s)) n = n / 4.184
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

const isType = (o: JsonObject, type: string) => {
  const t = o["@type"]
  return t === type || (Array.isArray(t) && t.includes(type))
}

/** Hitta första objektet av typen Recipe (även i @graph, mainEntity eller listor). */
function findRecipe(node: Json, depth = 0): JsonObject | null {
  if (!node || typeof node !== "object" || depth > 6) return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipe(n, depth + 1)
      if (hit) return hit
    }
    return null
  }
  if (isType(node, "Recipe")) return node
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const hit = findRecipe(node[key] ?? null, depth + 1)
    if (hit) return hit
  }
  return null
}

function imageOf(v: Json | undefined): string | undefined {
  if (!v) return undefined
  if (typeof v === "string") return v
  if (Array.isArray(v)) return imageOf(v[0])
  if (typeof v === "object") return imageOf((v.url ?? v.contentUrl ?? v["@id"]) as Json)
  return undefined
}

/** recipeInstructions: text, lista med text, HowToStep eller HowToSection (med egna steg). */
function stepsOf(v: Json | undefined, depth = 0): string[] {
  if (!v || depth > 4) return []
  if (typeof v === "string") return splitSteps(text(v, 5000))
  if (Array.isArray(v)) return v.flatMap((x) => stepsOf(x, depth + 1))
  if (typeof v === "object") {
    if (isType(v, "HowToSection") || Array.isArray(v.itemListElement)) return stepsOf(v.itemListElement ?? null, depth + 1)
    const t = v.text ?? v.name
    return typeof t === "string" ? splitSteps(text(t, 5000)) : []
  }
  return []
}

/** En lång text blir flera steg (rader, eller meningar om allt står på en rad). */
function splitSteps(s: string): string[] {
  const lines = s.split("\n").map((l) => l.replace(/^\s*(\d+[.)]|step \d+:?|steg \d+:?)\s*/i, "").trim()).filter(Boolean)
  if (lines.length === 1 && lines[0].length > 400) {
    return lines[0].split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/).map((x) => x.trim()).filter(Boolean)
  }
  return lines
}

function fromJsonLd(recipe: JsonObject): RawRecipe {
  const n = (recipe.nutrition && typeof recipe.nutrition === "object" && !Array.isArray(recipe.nutrition) ? recipe.nutrition : {}) as JsonObject
  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => text(x, 300))
    .filter(Boolean)
  const nutrition: RawNutrition = {
    calories: parseNutrient(n.calories, true),
    protein: parseNutrient(n.proteinContent),
    carbs: parseNutrient(n.carbohydrateContent),
    fat: parseNutrient(n.fatContent),
  }
  return {
    name: text(typeof recipe.name === "string" ? recipe.name : "", 200),
    image: imageOf(recipe.image),
    servings: parseYield(recipe.recipeYield ?? recipe.yield),
    totalMinutes:
      parseDuration(recipe.totalTime) ??
      ((parseDuration(recipe.prepTime) ?? 0) + (parseDuration(recipe.cookTime) ?? 0) || undefined),
    ingredients,
    instructions: stepsOf(recipe.recipeInstructions),
    nutrition: Object.values(nutrition).some((x) => x !== undefined) ? nutrition : undefined,
  }
}

/** Alla element med ett visst itemprop: [attribut, innehåll]. */
function itemprops(html: string, prop: string): { attrs: string; inner: string }[] {
  const out: { attrs: string; inner: string }[] = []
  const re = new RegExp(`<([a-z][a-z0-9]*)\\b([^>]*\\bitemprop=["'](?:[^"']*\\s)?${prop}(?:\\s[^"']*)?["'][^>]*)>`, "gi")
  for (const m of html.matchAll(re)) {
    const tag = m[1].toLowerCase()
    const start = (m.index ?? 0) + m[0].length
    const selfClosing = /\/\s*$/.test(m[2]) || ["meta", "img", "link", "time"].includes(tag)
    const end = selfClosing ? start : html.toLowerCase().indexOf(`</${tag}`, start)
    out.push({ attrs: m[2], inner: end > start ? html.slice(start, end) : "" })
    if (out.length >= 80) break
  }
  return out
}

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1]
const meta = (html: string, property: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i"))?.[1]

function fromMicrodata(html: string): RawRecipe | null {
  const valueOf = (e: { attrs: string; inner: string }) => decodeEntities(attr(e.attrs, "content") ?? attr(e.attrs, "datetime") ?? "") || text(e.inner)
  const ingredients = [...itemprops(html, "recipeIngredient"), ...itemprops(html, "ingredients")].map(valueOf).filter(Boolean)
  if (!ingredients.length) return null
  const steps = itemprops(html, "recipeInstructions").flatMap((e) => {
    const lis = [...e.inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1]))
    return lis.length ? lis : splitSteps(text(e.inner, 5000))
  })
  const first = (prop: string) => {
    const e = itemprops(html, prop)[0]
    return e ? valueOf(e) : undefined
  }
  const img = itemprops(html, "image")[0]
  const nutrition: RawNutrition = {
    calories: parseNutrient(first("calories"), true),
    protein: parseNutrient(first("proteinContent")),
    carbs: parseNutrient(first("carbohydrateContent")),
    fat: parseNutrient(first("fatContent")),
  }
  return {
    name: text(first("name") ?? meta(html, "og:title") ?? "", 200),
    image: (img && (attr(img.attrs, "src") ?? attr(img.attrs, "content") ?? attr(img.attrs, "href"))) ?? meta(html, "og:image"),
    servings: parseYield(first("recipeYield")),
    totalMinutes: parseDuration(first("totalTime")),
    ingredients: ingredients.map((i) => i.slice(0, 300)),
    instructions: steps.filter(Boolean),
    nutrition: Object.values(nutrition).some((x) => x !== undefined) ? nutrition : undefined,
  }
}

/** Läs ut receptet ur sidan, eller null om sidan inte innehåller något recept. */
export function extractRecipe(html: string, pageUrl: string): RawRecipe | null {
  let recipe: RawRecipe | null = null
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let json: Json
    try {
      json = JSON.parse(m[1].trim()) as Json
    } catch {
      // Vissa sajter har styrtecken i JSON-texten.
      try {
        json = JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, " ").trim()) as Json
      } catch {
        continue
      }
    }
    const hit = findRecipe(json)
    if (hit) {
      recipe = fromJsonLd(hit)
      break
    }
  }
  if (!recipe || recipe.ingredients.length === 0) recipe = fromMicrodata(html) ?? recipe
  if (!recipe || recipe.ingredients.length === 0) return null
  if (!recipe.name) recipe.name = text(meta(html, "og:title") ?? "", 200)
  if (!recipe.image) recipe.image = meta(html, "og:image")
  // Relativa bildadresser → absoluta; bara http(s).
  if (recipe.image) {
    try {
      const u = new URL(decodeEntities(recipe.image), pageUrl)
      recipe.image = /^https?:$/.test(u.protocol) && u.href.length <= 1000 ? u.href : undefined
    } catch {
      recipe.image = undefined
    }
  }
  return recipe
}
