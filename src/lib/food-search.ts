/**
 * Sökning och portionsberäkning för livsmedel, gemensamt för grundbiblioteket,
 * egna produkter och Open Food Facts.
 */
import { FOOD_LIBRARY } from "@/lib/food-library"
import type { FoodProduct, Per100 } from "@/types/domain"

/** Gemener utan diakritik ("Ägg" → "agg"), så att stavning med/utan prickar matchar. */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}%,.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

type Searchable = FoodProduct & { keywords?: string }

/**
 * Alla ord i frågan måste matcha början av ett ord i namn/varumärke/sökord.
 * Rangordning: namnet börjar med frågan > första ordet matchar > övrigt, och
 * kortare namn före längre (så "Ägg" kommer före "Äggnudlar").
 */
export function searchProducts<T extends Searchable>(query: string, products: T[], limit = 20): T[] {
  const q = normalize(query)
  if (!q) return []
  const tokens = q.split(" ")
  const scored: { p: T; score: number }[] = []
  for (const p of products) {
    const name = normalize(p.name)
    const hay = `${name} ${normalize(p.brand ?? "")} ${normalize(p.keywords ?? "")}`
    const words = hay.split(" ")
    if (!tokens.every((t) => words.some((w) => w.startsWith(t)))) continue
    let score = 0
    if (name === q) score += 200
    else if (name.startsWith(q)) score += 100
    else if (name.split(" ").some((w) => w.startsWith(tokens[0]))) score += 50
    score -= name.length / 10
    scored.push({ p, score })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p)
}

export function searchLibrary(query: string, limit = 12) {
  return searchProducts(query, FOOD_LIBRARY, limit)
}

/** Makron för en mängd i gram, avrundade för visning och lagring. */
export function forGrams(per100: Per100, grams: number) {
  const f = grams / 100
  const r1 = (n: number) => Math.round(n * f * 10) / 10
  return { kcal: Math.round(per100.kcal * f), protein: r1(per100.protein), carbs: r1(per100.carbs), fat: r1(per100.fat) }
}

/** GTIN/EAN/UPC (8, 12, 13 eller 14 siffror) med giltig kontrollsiffra. */
export function isValidBarcode(code: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false
  const digits = code.split("").map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}
