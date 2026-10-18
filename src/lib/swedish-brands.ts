/**
 * Vanliga varumärken i svenska matbutiker (ICA, Coop, Willys, Hemköp …).
 *
 * Används för att känna igen varumärket i en sökning ("barebells cookie",
 * "nocco") och söka med Open Food Facts varumärkesfilter, vilket ger träffar
 * på rätt produkter även när produktnamnet inte innehåller varumärket.
 * `tag` är Open Food Facts brands_tags (gemener, bindestreck i stället för
 * mellanslag/apostrof, utan å/ä/ö). Saknas varumärket i listan söks det ändå
 * som vanlig fritext.
 */
export interface KnownBrand {
  name: string
  tag: string
  /** Fler sätt att skriva varumärket i en sökning. */
  aliases?: string[]
  /** Visas som snabbval i sökningen. */
  popular?: boolean
}

export const SWEDISH_BRANDS: KnownBrand[] = [
  // Protein och sport
  { name: "Barebells", tag: "barebells", popular: true },
  { name: "Gainomax", tag: "gainomax", popular: true },
  { name: "Nutramino", tag: "nutramino" },
  { name: "Star Nutrition", tag: "star-nutrition" },
  { name: "NJIE", tag: "njie", aliases: ["propud", "njie propud"] },
  { name: "Powerking", tag: "powerking" },
  { name: "Fast", tag: "fast" },
  // Drycker
  { name: "Nocco", tag: "nocco", popular: true },
  { name: "Celsius", tag: "celsius", popular: true },
  { name: "Red Bull", tag: "red-bull", aliases: ["redbull"] },
  { name: "Monster", tag: "monster-energy", aliases: ["monster energy"] },
  { name: "Vitamin Well", tag: "vitamin-well", aliases: ["vitaminwell"], popular: true },
  { name: "Coca-Cola", tag: "coca-cola", aliases: ["coca cola", "cocacola", "coke", "cola zero"], popular: true },
  { name: "Pepsi", tag: "pepsi" },
  { name: "Fanta", tag: "fanta" },
  { name: "Sprite", tag: "sprite" },
  { name: "Zingo", tag: "zingo" },
  { name: "Trocadero", tag: "trocadero" },
  { name: "Loka", tag: "loka" },
  { name: "Ramlösa", tag: "ramlosa", aliases: ["ramlosa"] },
  { name: "Festis", tag: "festis" },
  { name: "Bravo", tag: "bravo" },
  { name: "Froosh", tag: "froosh" },
  { name: "Oatly", tag: "oatly", popular: true },
  // Mejeri
  { name: "Arla", tag: "arla", popular: true },
  { name: "Skånemejerier", tag: "skanemejerier", aliases: ["skanemejerier"] },
  { name: "Lindahls", tag: "lindahls" },
  { name: "Valio", tag: "valio" },
  { name: "Yoggi", tag: "yoggi" },
  { name: "Risifrutti", tag: "risifrutti" },
  { name: "ProViva", tag: "proviva" },
  { name: "Norrmejerier", tag: "norrmejerier" },
  // Vardag och skafferi
  { name: "Felix", tag: "felix", popular: true },
  { name: "Findus", tag: "findus" },
  { name: "Kungsörnen", tag: "kungsornen", aliases: ["kungsornen"] },
  { name: "Pågen", tag: "pagen", aliases: ["pagen"] },
  { name: "Wasa", tag: "wasa" },
  { name: "Polarbröd", tag: "polarbrod", aliases: ["polarbrod"] },
  { name: "Kavli", tag: "kavli" },
  { name: "Scan", tag: "scan" },
  { name: "Lithells", tag: "lithells" },
  { name: "Dafgårds", tag: "dafgards", aliases: ["dafgards"] },
  { name: "Santa Maria", tag: "santa-maria" },
  { name: "Zeta", tag: "zeta" },
  { name: "Kellogg's", tag: "kellogg-s", aliases: ["kelloggs", "kellogg"] },
  { name: "Axa", tag: "axa" },
  // Snacks och godis
  { name: "Marabou", tag: "marabou", popular: true },
  { name: "OLW", tag: "olw" },
  { name: "Estrella", tag: "estrella" },
  { name: "Cloetta", tag: "cloetta" },
  { name: "Fazer", tag: "fazer" },
  { name: "Daim", tag: "daim" },
  { name: "Göteborgs Kex", tag: "goteborgs-kex", aliases: ["goteborgs", "göteborgs"] },
  { name: "Gille", tag: "gille" },
  // Butikernas egna märken
  { name: "ICA", tag: "ica", aliases: ["ica basic", "ica i love eco"] },
  { name: "Coop", tag: "coop", aliases: ["coop xtra", "änglamark", "anglamark"] },
  { name: "Garant", tag: "garant" },
  { name: "Eldorado", tag: "eldorado" },
  { name: "Willys", tag: "willys" },
]

export const POPULAR_BRANDS = SWEDISH_BRANDS.filter((b) => b.popular)

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/**
 * Hittar ett känt varumärke i frågan och returnerar resten av frågan.
 * "Barebells cookies" → { brand: Barebells, rest: "cookies" }. Längsta
 * matchning vinner ("coca cola zero" → Coca-Cola, "zero").
 */
export function detectBrand(query: string): { brand: KnownBrand; rest: string } | null {
  const q = ` ${fold(query)} `
  let best: { brand: KnownBrand; alias: string } | null = null
  for (const brand of SWEDISH_BRANDS) {
    for (const alias of [brand.name, brand.tag.replace(/-/g, " "), ...(brand.aliases ?? [])].map(fold)) {
      if (alias && q.includes(` ${alias} `) && (!best || alias.length > best.alias.length)) best = { brand, alias }
    }
  }
  if (!best) return null
  return { brand: best.brand, rest: q.replace(` ${best.alias} `, " ").trim() }
}
