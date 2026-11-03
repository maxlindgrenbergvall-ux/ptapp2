// Genererar Coaviras receptbibliotek (v26) från src/lib/recipes/library-source.ts:
//   - src/lib/recipes/library.json        (appen och demoläget)
//   - supabase/recipe-photos.csv           (checklista för riktiga matfoton, ett per rätt)
//   - seed-SQL i den senaste biblioteksmigrationen (mellan BEGIN/END LIBRARY SEED).
//     Äldre migrationer (v26, v28) är frysta – de har redan körts i produktion.
// Makrona räknas ur livsmedelsbasen (samma värden som resten av appen).
//   node scripts/gen-recipe-library.mjs
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const require = createRequire(import.meta.url)
const jiti = require("jiti")(path.join(root, "x.js"), { alias: { "@": path.join(root, "src") } })
const { LIBRARY_SOURCE } = jiti("./src/lib/recipes/library-source.ts")
const { FOOD_LIBRARY } = jiti("./src/lib/food-library.ts")
const { setAmount, pieceWeight, VOLUME_ML } = jiti("./src/lib/nutrition/meal-items.ts")
const { suggestGoals, RECIPE_GOALS } = jiti("./src/lib/recipes/goals.ts")

// Hela biblioteket upsertas i den senaste migrationen som har en seed-sektion (v29: Mealprep).
const MIGRATION = path.join(root, "supabase/migrations/20261111000000_v29_moderation_mealprep_templates.sql")
const round1 = (n) => Math.round(n * 10) / 10

/** Stabilt uuid (v5-format) ur receptets slug – samma id i JSON, SQL och favoriter. */
function uuidFor(slug) {
  const h = createHash("sha1").update(`coavira-recipe:${slug}`).digest("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function itemFor([food, amount, unit = "g"]) {
  if (food.startsWith("*")) {
    const name = food.slice(1)
    const grams = unit === "st" || unit === "g" ? (unit === "g" ? amount : 0) : Math.round(amount * VOLUME_ML[unit])
    return { name, unit, qty: unit === "g" ? undefined : amount, grams, kcal: 0, protein: 0, carbs: 0, fat: 0 }
  }
  const lib = FOOD_LIBRARY.find((f) => f.name === food)
  if (!lib) throw new Error(`Okänt livsmedel: ${food}`)
  const base = { name: lib.name, grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, per100: lib.per100 }
  if (unit === "st") {
    const pieceG = pieceWeight(lib.name, lib.servingG)
    if (!pieceG) throw new Error(`Styckvikt saknas: ${food}`)
    return setAmount({ ...base, pieceG }, amount, "st")
  }
  if (unit === "g") return setAmount(base, amount, "g")
  return setAmount(base, amount, unit)
}

// Foton som redan laddats upp (set-recipe-images.mjs skriver dem i fotolistan).
const PHOTOS_CSV = path.join(root, "supabase/recipe-photos.csv")
const uploaded = new Map(
  fs.existsSync(PHOTOS_CSV)
    ? fs.readFileSync(PHOTOS_CSV, "utf8").trim().split("\n").slice(1).map((l) => l.split(";")).filter((r) => /^https:\/\//.test(r[3] ?? "")).map((r) => [r[0], r[3]])
    : []
)

const recipes = LIBRARY_SOURCE.map((src) => {
  const items = src.ingredients.map(itemFor)
  const total = items.reduce((s, i) => ({ kcal: s.kcal + i.kcal, protein: s.protein + i.protein, carbs: s.carbs + i.carbs, fat: s.fat + i.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const n = src.servings
  const nutrition = { kcal: Math.round(total.kcal / n), protein: round1(total.protein / n), carbs: round1(total.carbs / n), fat: round1(total.fat / n) }
  const goals = RECIPE_GOALS.filter((g) => src.goals.includes(g) || suggestGoals(nutrition, src.minutes).includes(g))
  return {
    id: uuidFor(src.slug),
    slug: src.slug,
    name: src.name,
    servings: n,
    totalMinutes: src.minutes,
    goalTypes: goals,
    // Riktigt matfoto (https), eller null tills ett foto laddats upp (scripts/set-recipe-images.mjs).
    imageUrl: src.image ?? uploaded.get(src.slug) ?? null,
    items,
    steps: src.steps,
    nutrition,
  }
})

// Kontroller: unika slugs och minst 8 recept per kategori.
const slugs = new Set(recipes.map((r) => r.slug))
if (slugs.size !== recipes.length) throw new Error("Dubbla slugs")
for (const g of RECIPE_GOALS) {
  const count = recipes.filter((r) => r.goalTypes.includes(g)).length
  console.log(`${g.padEnd(14)} ${count} recept`)
  if (count < 8) throw new Error(`För få recept i ${g}`)
}

// ------------------------------------------------------- fotolista ---
// Checklista för riktiga matfoton: ett foto per rätt, filnamn = slug.
// Ladda upp med: node scripts/set-recipe-images.mjs <mapp-med-foton>
const photoList = ["slug;namn;motiv (huvudingredienser);foto", ...recipes.map((r) => {
  const motif = r.items.filter((i) => i.per100 && i.grams >= 25).sort((a, b) => b.grams - a.grams).slice(0, 4).map((i) => i.name.replace(/ \(.*\)$/, "").toLowerCase()).join(", ")
  return `${r.slug};${r.name};${motif};${r.imageUrl ?? ""}`
})].join("\n")
fs.writeFileSync(PHOTOS_CSV, `${photoList}\n`)

// -------------------------------------------------------------- JSON ---
fs.writeFileSync(path.join(root, "src/lib/recipes/library.json"), `${JSON.stringify(recipes, null, 1)}\n`)

// --------------------------------------------------------------- SQL ---
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const j = (v) => `${q(JSON.stringify(v))}::jsonb`
const rows = recipes
  .map(
    (r) =>
      `  (${q(r.id)}, ${q(r.slug)}, ${q(r.name)}, ${r.servings}, ${r.totalMinutes}, ${q(`{${r.goalTypes.join(",")}}`)}::text[], ${r.imageUrl ? q(r.imageUrl) : "null"},\n   ${j(r.items)},\n   ${j(r.steps)}, ${j(r.nutrition)})`
  )
  .join(",\n")
const seed = `-- BEGIN LIBRARY SEED (genererad av scripts/gen-recipe-library.mjs – ändra i library-source.ts)
insert into library_recipes (id, slug, name, servings, total_minutes, goal_types, image_url, items, steps, nutrition) values
${rows}
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, servings = excluded.servings, total_minutes = excluded.total_minutes,
  goal_types = excluded.goal_types, items = excluded.items, steps = excluded.steps,
  -- Pexels-länkar uppdateras; foton som laddats upp till Storage (set-recipe-images.mjs) skrivs aldrig över.
  image_url = case
    when excluded.image_url is null then library_recipes.image_url
    when library_recipes.image_url is null or library_recipes.image_url like 'https://images.pexels.com/%' then excluded.image_url
    else library_recipes.image_url
  end,
  nutrition = excluded.nutrition, updated_at = now();
-- END LIBRARY SEED`
const sql = fs.readFileSync(MIGRATION, "utf8")
if (!sql.includes("-- END LIBRARY SEED")) throw new Error(`Seed-sektionen saknas i ${MIGRATION}`)
fs.writeFileSync(MIGRATION, sql.replace(/-- BEGIN LIBRARY SEED[\s\S]*?-- END LIBRARY SEED/, seed))

console.log(`${recipes.length} recept → library.json, fotolista i supabase/recipe-photos.csv, SQL i ${path.relative(root, MIGRATION)}`)
for (const r of recipes) console.log(`  ${String(r.nutrition.kcal).padStart(4)} kcal P${String(r.nutrition.protein).padStart(5)} K${String(r.nutrition.carbs).padStart(5)} F${String(r.nutrition.fat).padStart(5)}  ${r.name}  [${r.goalTypes.join(", ")}]`)
