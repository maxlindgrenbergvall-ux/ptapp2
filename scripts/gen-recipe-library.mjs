// Genererar Coaviras receptbibliotek (v26) från src/lib/recipes/library-source.ts:
//   - src/lib/recipes/library.json        (appen och demoläget)
//   - public/recipes/<slug>.svg            (illustrerade rättbilder, fungerar offline i appen)
//   - seed-SQL i v26-migrationen           (mellan BEGIN/END LIBRARY SEED)
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

const MIGRATION = path.join(root, "supabase/migrations/20261108000000_v26_recipe_library.sql")
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
    imageUrl: `/recipes/${src.slug}.svg`,
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

// ------------------------------------------------------------ bilder ---
function rng(seed) {
  let s = parseInt(createHash("md5").update(seed).digest("hex").slice(0, 8), 16)
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Färg och form per livsmedel. */
const LOOK = [
  [/(^|\s)ris\b|jasminris|basmatiris|fullkornsris|couscous|quinoa|bulgur/i, { kind: "grains", color: "#f4ecd8", edge: "#e2d5b5" }],
  [/pasta|nudlar/i, { kind: "noodles", color: "#f2d38c", edge: "#d9b764" }],
  [/havregryn|granola|müsli/i, { kind: "grains", color: "#dcc394", edge: "#c3a671" }],
  [/kyckling|kalkon/i, { kind: "strips", color: "#e7b57d", edge: "#b9824c" }],
  [/lax/i, { kind: "fillet", color: "#f28d6b", edge: "#ffd7c6" }],
  [/torsk/i, { kind: "fillet", color: "#f6efe4", edge: "#e2d6c3" }],
  [/biff|entrecôte|innerfilé|fläskfilé/i, { kind: "strips", color: "#9b4a3a", edge: "#6d2f24" }],
  [/färs(\s|$)/i, { kind: "crumbs", color: "#8a5236", edge: "#5f3522" }],
  [/räkor/i, { kind: "shrimp", color: "#f6957a", edge: "#fff1ea" }],
  [/tonfisk/i, { kind: "crumbs", color: "#d79c84", edge: "#b77762" }],
  [/tofu|halloumi|fetaost/i, { kind: "cubes", color: "#f5ead2", edge: "#dccaa1" }],
  [/^ägg|äggvita/i, { kind: "egg", color: "#fffaf0", edge: "#f6c343" }],
  [/kvarg|skyr|yoghurt|keso|tzatziki|hummus/i, { kind: "cream", color: "#fbf8f1", edge: "#ece4d3" }],
  [/broccoli/i, { kind: "florets", color: "#3f8f46", edge: "#2c6b33" }],
  [/blomkål/i, { kind: "florets", color: "#f1ead6", edge: "#d7cba9" }],
  [/spenat|ruccola|sallad|grönkål/i, { kind: "leaves", color: "#5aa952", edge: "#3e8139" }],
  [/sparris|haricots|sockerärtor|edamame/i, { kind: "sticks", color: "#6dbb4a", edge: "#4c9233" }],
  [/gurka|zucchini/i, { kind: "slices", color: "#a9d18e", edge: "#4f8a35" }],
  [/tomat(?!sås)|körsbärstomater/i, { kind: "berries", color: "#e2442f", edge: "#ff8a75", size: 26 }],
  [/krossade tomater|tomatsås/i, { kind: "sauce", color: "#c8402c", edge: "#e3654e" }],
  [/paprika/i, { kind: "strips", color: "#e8553b", edge: "#f4a62a" }],
  [/morot|sötpotatis|mango|röda linser/i, { kind: "cubes", color: "#f08a2c", edge: "#d06b14" }],
  [/potatis/i, { kind: "cubes", color: "#efd28b", edge: "#d1b061" }],
  [/lök/i, { kind: "rings", color: "#c98bb9", edge: "#f1dcea" }],
  [/champinjoner/i, { kind: "slices", color: "#d9c3a5", edge: "#a88a66" }],
  [/avokado/i, { kind: "slices", color: "#b9d37a", edge: "#55762c" }],
  [/kikärtor|bönor|majs/i, { kind: "beans", color: "#d9b25f", edge: "#b8903d" }],
  [/svarta bönor|kidney/i, { kind: "beans", color: "#4a2a2a", edge: "#2a1515" }],
  [/banan/i, { kind: "slices", color: "#f8e79a", edge: "#e2c75a" }],
  [/blåbär|bär/i, { kind: "berries", color: "#4b4f9e", edge: "#8d90d6", size: 14 }],
  [/hallon|jordgubb/i, { kind: "berries", color: "#d9375b", edge: "#ff8aa5", size: 16 }],
  [/ananas|äpple/i, { kind: "cubes", color: "#f7d94c", edge: "#e2b928" }],
  [/dadlar|choklad/i, { kind: "berries", color: "#5b3420", edge: "#8b5a3c", size: 22 }],
  [/tortilla|pita|bröd|riskakor/i, { kind: "bread", color: "#e9c58f", edge: "#c99a5a" }],
  [/kokosmjölk|mjölk|juice|proteinpulver/i, { kind: "none" }],
]
const lookOf = (name) => LOOK.find(([re]) => re.test(name))?.[1] ?? { kind: "berries", color: "#7fb069", edge: "#5a8a48", size: 12 }

const BG = { high_protein: ["#f7d9c4", "#e9a77d"], weight_loss: ["#dff0d8", "#9fd08f"], pre_workout: ["#fbecc0", "#f2c75c"], post_workout: ["#d8e8f7", "#8fb8e3"], quick_easy: ["#ece0f7", "#b99be0"] }

function shapes(look, cx, cy, r, rand) {
  const out = []
  const n = { grains: 170, noodles: 22, strips: 8, fillet: 1, crumbs: 90, shrimp: 8, cubes: 14, egg: 2, cream: 1, florets: 10, leaves: 14, sticks: 14, slices: 11, berries: 18, sauce: 1, rings: 6, beans: 42, bread: 2, none: 0 }[look.kind]
  // Ris, färs och bönor ligger i en bädd – inte som enstaka korn på en tom tallrik.
  if (["grains", "crumbs", "beans", "noodles"].includes(look.kind)) out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * 0.92).toFixed(1)}" fill="${look.color}" opacity=".85"/>`)
  const at = () => {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * r
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d]
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = at()
    const rot = Math.round(rand() * 180)
    switch (look.kind) {
      case "grains":
        out.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="3.2" fill="${look.color}" stroke="${look.edge}" stroke-width="1" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "noodles":
        out.push(`<path d="M${(x - 30).toFixed(1)} ${y.toFixed(1)} q15 -18 30 0 t30 0" fill="none" stroke="${look.color}" stroke-width="7" stroke-linecap="round" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "strips":
        out.push(`<g transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"><rect x="${(x - 36).toFixed(1)}" y="${(y - 14).toFixed(1)}" width="72" height="28" rx="12" fill="${look.color}" stroke="${look.edge}" stroke-width="2"/><path d="M${(x - 14).toFixed(1)} ${(y - 9).toFixed(1)} l-6 18 M${(x + 4).toFixed(1)} ${(y - 9).toFixed(1)} l-6 18 M${(x + 22).toFixed(1)} ${(y - 9).toFixed(1)} l-6 18" stroke="${look.edge}" stroke-width="3" opacity=".55"/></g>`)
        break
      case "fillet":
        out.push(`<g transform="rotate(${rot % 40 - 20} ${cx} ${cy})"><rect x="${cx - r * 0.8}" y="${cy - r * 0.42}" width="${r * 1.6}" height="${r * 0.84}" rx="${r * 0.35}" fill="${look.color}"/>${[0, 1, 2, 3].map((k) => `<path d="M${cx - r * 0.5 + k * r * 0.3} ${cy - r * 0.36} q-12 ${r * 0.36} 0 ${r * 0.72}" stroke="${look.edge}" stroke-width="5" fill="none" opacity=".7"/>`).join("")}</g>`)
        break
      case "crumbs":
        out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(5 + rand() * 5).toFixed(1)}" fill="${rand() > 0.5 ? look.color : look.edge}"/>`)
        break
      case "shrimp":
        out.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} a18 18 0 1 1 18 18" fill="none" stroke="${look.color}" stroke-width="12" stroke-linecap="round" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "cubes":
        out.push(`<rect x="${(x - 11).toFixed(1)}" y="${(y - 11).toFixed(1)}" width="22" height="22" rx="5" fill="${look.color}" stroke="${look.edge}" stroke-width="2" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "egg":
        out.push(`<g><path d="M${x - 34} ${y} c0 -30 20 -38 36 -30 c22 -8 38 14 30 34 c-6 24 -60 30 -66 -4z" fill="${look.color}" stroke="#eee3cf" stroke-width="2"/><circle cx="${x + 2}" cy="${y - 2}" r="15" fill="${look.edge}"/></g>`)
        break
      case "cream":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${r * 1.05}" fill="${look.color}" stroke="${look.edge}" stroke-width="3"/><path d="M${cx - r * 0.5} ${cy - r * 0.2} q${r * 0.5} -${r * 0.3} ${r} 0" stroke="${look.edge}" stroke-width="4" fill="none"/>`)
        break
      case "sauce":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${r * 1.05}" fill="${look.color}"/><circle cx="${cx - r * 0.3}" cy="${cy - r * 0.3}" r="${r * 0.18}" fill="${look.edge}" opacity=".6"/>`)
        break
      case "florets":
        out.push(`<g><rect x="${(x - 4).toFixed(1)}" y="${y.toFixed(1)}" width="8" height="18" rx="3" fill="#8bc06a"/>${[[-9, -2], [0, -9], [9, -2], [0, 2]].map(([dx, dy]) => `<circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="10" fill="${look.color}" stroke="${look.edge}" stroke-width="1.5"/>`).join("")}</g>`)
        break
      case "leaves":
        out.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} q24 -26 48 0 q-24 26 -48 0z" fill="${look.color}" stroke="${look.edge}" stroke-width="2" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "sticks":
        out.push(`<rect x="${(x - 28).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="56" height="10" rx="5" fill="${look.color}" stroke="${look.edge}" stroke-width="1.5" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "slices":
        out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17" fill="${look.color}" stroke="${look.edge}" stroke-width="4"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${look.edge}" opacity=".35"/>`)
        break
      case "berries":
        out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${look.size ?? 14}" fill="${look.color}"/><circle cx="${(x - (look.size ?? 14) * 0.35).toFixed(1)}" cy="${(y - (look.size ?? 14) * 0.35).toFixed(1)}" r="${((look.size ?? 14) * 0.28).toFixed(1)}" fill="${look.edge}" opacity=".7"/>`)
        break
      case "rings":
        out.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="20" ry="13" fill="none" stroke="${look.color}" stroke-width="4" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "beans":
        out.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="6.5" fill="${look.color}" stroke="${look.edge}" stroke-width="1.5" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
      case "bread":
        out.push(`<path d="M${(x - 50).toFixed(1)} ${(y + 20).toFixed(1)} q0 -60 50 -60 q50 0 50 60z" fill="${look.color}" stroke="${look.edge}" stroke-width="3" transform="rotate(${rot % 60 - 30} ${x.toFixed(1)} ${y.toFixed(1)})"/>`)
        break
    }
  }
  return out.join("")
}

function svgFor(recipe) {
  const rand = rng(recipe.slug)
  const [bg1, bg2] = BG[recipe.goalTypes[0]] ?? BG.quick_easy
  const drink = /shake|smoothie/i.test(recipe.name)
  const soup = /soppa/i.test(recipe.name)
  // Huvudingredienserna (inte olja, sås, kryddor eller vitlök).
  const main = recipe.items
    .filter((i) => i.per100 && i.grams >= 25 && !/olja|sojasås|honung|vitlök|sesam|chiafrön|parmesan|mjölk|juice|proteinpulver/i.test(i.name) && lookOf(i.name).kind !== "none")
    .sort((a, b) => b.grams - a.grams)
    .slice(0, 5)
  const W = 800
  const H = 600
  const cx = 400
  const cy = 305
  let food = ""
  if (drink) {
    const color = /bär|smoothie/i.test(recipe.name) ? "#c2577a" : "#e9d7b9"
    food = `<path d="M300 130 h200 l-22 330 a24 24 0 0 1 -24 22 h-108 a24 24 0 0 1 -24 -22z" fill="#ffffff" opacity=".55" stroke="#fff" stroke-width="6"/>
<path d="M310 190 h180 l-18 268 a18 18 0 0 1 -18 16 h-108 a18 18 0 0 1 -18 -16z" fill="${color}"/>
<rect x="420" y="80" width="16" height="200" rx="8" fill="#5cb85c" transform="rotate(14 428 180)"/>
<circle cx="360" cy="200" r="14" fill="#fff" opacity=".35"/>`
  } else {
    const base = soup ? `<circle cx="${cx}" cy="${cy}" r="196" fill="#e8742f"/><circle cx="${cx - 60}" cy="${cy - 50}" r="40" fill="#f39a52" opacity=".5"/>` : ""
    const sectors = main.length || 1
    let parts = ""
    main.forEach((item, k) => {
      const look = lookOf(item.name)
      if (look.kind === "cream" || look.kind === "sauce") {
        parts = shapes(look, cx, cy, 175, rand) + parts
        return
      }
      const a = (k / sectors) * Math.PI * 2 - Math.PI / 2
      const d = sectors === 1 ? 0 : 98
      parts += shapes(look, cx + Math.cos(a) * d, cy + Math.sin(a) * d, sectors === 1 ? 160 : 86, rand)
    })
    food = `${base}${parts}`
  }
  const plate = drink
    ? ""
    : soup
      ? `<circle cx="${cx}" cy="${cy + 10}" r="250" fill="#000" opacity=".12"/><circle cx="${cx}" cy="${cy}" r="245" fill="#fdfdfb"/><circle cx="${cx}" cy="${cy}" r="205" fill="#ebe7df"/>`
      : `<circle cx="${cx}" cy="${cy + 12}" r="262" fill="#000" opacity=".12"/><circle cx="${cx}" cy="${cy}" r="258" fill="#fdfdfb"/><circle cx="${cx}" cy="${cy}" r="214" fill="#f3f1ec"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${recipe.name.replace(/"/g, "")}">
<defs><radialGradient id="bg" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient>
<clipPath id="plate"><circle cx="${cx}" cy="${cy}" r="210"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${[...Array(14)].map(() => `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(2 + rand() * 4).toFixed(1)}" fill="#fff" opacity=".35"/>`).join("")}
<path d="M80 600 L140 470 L180 600z" fill="#fff" opacity=".18"/>
${plate}
<g ${drink ? "" : 'clip-path="url(#plate)"'}>${food}</g>
${drink ? "" : `<rect x="640" y="200" width="16" height="230" rx="8" fill="#cfd4d8" transform="rotate(8 648 315)"/><rect x="676" y="200" width="16" height="230" rx="8" fill="#cfd4d8" transform="rotate(8 684 315)"/>`}
</svg>
`
}

const imgDir = path.join(root, "public/recipes")
fs.mkdirSync(imgDir, { recursive: true })
for (const f of fs.readdirSync(imgDir)) if (f.endsWith(".svg") && !slugs.has(f.slice(0, -4))) fs.unlinkSync(path.join(imgDir, f))
for (const r of recipes) fs.writeFileSync(path.join(imgDir, `${r.slug}.svg`), svgFor(r))

// -------------------------------------------------------------- JSON ---
fs.writeFileSync(path.join(root, "src/lib/recipes/library.json"), `${JSON.stringify(recipes, null, 1)}\n`)

// --------------------------------------------------------------- SQL ---
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const j = (v) => `${q(JSON.stringify(v))}::jsonb`
const rows = recipes
  .map(
    (r) =>
      `  (${q(r.id)}, ${q(r.slug)}, ${q(r.name)}, ${r.servings}, ${r.totalMinutes}, ${q(`{${r.goalTypes.join(",")}}`)}::text[], ${q(r.imageUrl)},\n   ${j(r.items)},\n   ${j(r.steps)}, ${j(r.nutrition)})`
  )
  .join(",\n")
const seed = `-- BEGIN LIBRARY SEED (genererad av scripts/gen-recipe-library.mjs – ändra i library-source.ts)
insert into library_recipes (id, slug, name, servings, total_minutes, goal_types, image_url, items, steps, nutrition) values
${rows}
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, servings = excluded.servings, total_minutes = excluded.total_minutes,
  goal_types = excluded.goal_types, image_url = excluded.image_url, items = excluded.items, steps = excluded.steps,
  nutrition = excluded.nutrition, updated_at = now();
-- END LIBRARY SEED`
const sql = fs.readFileSync(MIGRATION, "utf8")
fs.writeFileSync(MIGRATION, sql.replace(/-- BEGIN LIBRARY SEED[\s\S]*?-- END LIBRARY SEED/, seed))

console.log(`${recipes.length} recept → library.json, ${recipes.length} bilder, SQL i ${path.relative(root, MIGRATION)}`)
for (const r of recipes) console.log(`  ${String(r.nutrition.kcal).padStart(4)} kcal P${String(r.nutrition.protein).padStart(5)} K${String(r.nutrition.carbs).padStart(5)} F${String(r.nutrition.fat).padStart(5)}  ${r.name}  [${r.goalTypes.join(", ")}]`)
