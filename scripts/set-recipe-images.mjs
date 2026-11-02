// Ladda upp riktiga matfoton till receptbiblioteket (v27).
//
//   SUPABASE_URL=https://<projekt>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/set-recipe-images.mjs <mapp-med-foton>
//
// Mappen innehåller ett foto per rätt med receptets slug som filnamn, t.ex.
// kycklingbowl-jasminris-broccoli.jpg (se supabase/recipe-photos.csv för
// listan och motivet). JPEG, WebP eller PNG, högst 2 MB, gärna 1600 × 900 px
// eller större (visas i 16:9 i receptet och kvadratiskt i listan).
//
// Skriptet:
//   1. laddar upp fotona till bucketen recipe-images (ersätter befintliga),
//   2. sätter library_recipes.image_url till fotots publika adress,
//   3. skriver adressen i supabase/recipe-photos.csv och kör generatorn, så
//      att library.json (demoläget) och seed-SQL:en får samma foton.
// Service role-nyckeln används bara här, lokalt – aldrig i appen.
import { createClient } from "@supabase/supabase-js"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const dir = process.argv[2]
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!dir || !url || !key) {
  console.error("Användning: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/set-recipe-images.mjs <mapp>")
  process.exit(1)
}

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png" }
const MAX_BYTES = 2 * 1024 * 1024
const csvPath = path.join(root, "supabase/recipe-photos.csv")
const rows = fs.readFileSync(csvPath, "utf8").trim().split("\n").map((l) => l.split(";"))
const [header, ...recipes] = rows
const slugs = new Set(recipes.map((r) => r[0]))
const sb = createClient(url, key, { auth: { persistSession: false } })

let done = 0
for (const file of fs.readdirSync(dir).sort()) {
  const ext = path.extname(file).toLowerCase()
  const slug = path.basename(file, path.extname(file))
  if (!TYPES[ext]) continue
  if (!slugs.has(slug)) {
    console.warn(`hoppar över ${file}: inget recept med slug "${slug}"`)
    continue
  }
  const body = fs.readFileSync(path.join(dir, file))
  if (body.length > MAX_BYTES) {
    console.warn(`hoppar över ${file}: ${(body.length / 1048576).toFixed(1)} MB (max 2 MB) – komprimera fotot`)
    continue
  }
  const object = `${slug}${ext === ".jpeg" ? ".jpg" : ext}`
  const up = await sb.storage.from("recipe-images").upload(object, body, { contentType: TYPES[ext], upsert: true, cacheControl: "31536000" })
  if (up.error) {
    console.error(`${file}: uppladdningen misslyckades – ${up.error.message}`)
    continue
  }
  // Versionsparameter så att ett utbytt foto inte fastnar i cachen.
  const publicUrl = `${sb.storage.from("recipe-images").getPublicUrl(object).data.publicUrl}?v=${Date.now().toString(36)}`
  const upd = await sb.from("library_recipes").update({ image_url: publicUrl, updated_at: new Date().toISOString() }).eq("slug", slug)
  if (upd.error) {
    console.error(`${file}: kunde inte spara bildlänken – ${upd.error.message}`)
    continue
  }
  const row = recipes.find((r) => r[0] === slug)
  row[3] = publicUrl
  done += 1
  console.log(`ok  ${slug}`)
}

fs.writeFileSync(csvPath, `${[header, ...recipes].map((r) => r.join(";")).join("\n")}\n`)
const missing = recipes.filter((r) => !r[3]).map((r) => r[0])
console.log(`${done} foton uppladdade. ${missing.length ? `Utan foto: ${missing.join(", ")}` : "Alla recept har foto."}`)
if (done) execFileSync(process.execPath, [path.join(root, "scripts/gen-recipe-library.mjs")], { stdio: "inherit" })
