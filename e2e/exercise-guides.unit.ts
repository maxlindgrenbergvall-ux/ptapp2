// Verifiering för v60: VARJE förinlagd övning har en videoguide (animation med
// samma modell + ev. AI-video) och tre utförandesteg på alla fem språk. Egna
// övningar har ingen guide. Inga YouTube/Vimeo-källor och ingen 1RM.
//   npx tsx --tsconfig tsconfig.json e2e/exercise-guides.unit.ts
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import library from "@/lib/exercise-library.json"
import { fitMotion, frames, keyframesCss, type Motion, outOfFrame } from "@/lib/exercise-guides/figure"
import { GUIDES, guideFor, guideVideo } from "@/lib/exercise-guides/guides"
import { MOTIONS } from "@/lib/exercise-guides/motions"
import { LOCALES } from "@/lib/i18n/config"
import { translate } from "@/lib/i18n/translate"
import type { Exercise } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string, extra?: unknown) => {
  console.log(cond ? "ok  " : "FAIL", msg, cond || extra === undefined ? "" : JSON.stringify(extra).slice(0, 400))
  if (!cond) failed++
}

// ------------------------------------------------ 100 % av övningsbanken ---
const bank = library as unknown as Exercise[]
// Övningar i databasens seed och migrationer (samma id:n som banken ska ha).
const sql = ["supabase/seed.sql", ...readdirSync("supabase/migrations").map((f) => `supabase/migrations/${f}`)].map((f) => readFileSync(f, "utf8")).join("\n")
const dbIds = new Set([...sql.matchAll(/'(e-[a-z0-9-]+)'/g)].map((m) => m[1]))
const allIds = new Set([...bank.map((e) => e.id), ...dbIds])
const missing = [...allIds].filter((id) => !GUIDES[id])
check(missing.length === 0, `alla ${allIds.size} förinlagda övningar (JSON + databas) har en videoguide`, missing)
check(bank.length >= 135, `övningsbanken: ${bank.length} övningar`)
check(Object.keys(GUIDES).every((id) => allIds.has(id)), "inga guider för övningar som inte finns")

const named = (needle: RegExp) => bank.filter((e) => needle.test(`${e.name} ${(e as { sv?: string }).sv ?? ""}`)).map((e) => e.id)
for (const [label, re] of [
  ["EZ-Bar Curl", /EZ-Bar Curl/],
  ["Axelpress i maskin", /Axelpress i maskin/],
  ["Hip Thrust i maskin", /Hip Thrust i maskin/],
  ["Bulgarian Split Squats", /Bulgarian Split Squats/],
  ["Kickbacks", /^Kickbacks/],
  ["SkiErg", /^SkiErg/],
  ["Sled Push", /^Sled Push/],
  ["Sled Pull", /^Sled Pull/],
  ["Burpee Broad Jumps", /Burpee Broad Jumps/],
  ["Rowing", /^Rowing/],
  ["Farmers Carry", /Farmers Carry/],
  ["Sandbag Lunges", /Sandbag Lunges/],
  ["Wall Balls", /Wall Balls/],
  ["Hyrox 1 km", /Hyrox 1 km/],
] as const) {
  const ids = named(re)
  check(ids.length >= 1 && ids.every((id) => guideFor({ id, custom: undefined })), `${label}: guide finns`)
}
const runs = bank.filter((e) => e.modality === "running")
check(runs.length >= 7 && runs.every((e) => GUIDES[e.id]), `alla ${runs.length} löpövningar har guide`)

// ------------------------------------------- animationen (samma modell) ---
const usedMotions = new Set(Object.values(GUIDES).map((g) => g.motion))
check([...usedMotions].every((m) => m in MOTIONS), "varje guide pekar på en befintlig rörelse")
for (const [id, raw] of Object.entries(MOTIONS)) {
  const m = raw as Motion
  const css = keyframesCss(`cg-${id}`, m)
  const bad = /NaN|Infinity|undefined/.test(css)
  const fit = fitMotion(m)
  if (bad || outOfFrame(m) || !(fit.scale > 0.45) || frames(m).length < 9) check(false, `rörelsen ${id} renderas i bild`, { bad, out: outOfFrame(m), fit })
}
check(true, `alla ${Object.keys(MOTIONS).length} rörelser ger giltiga keyframes och ryms i bilden`)

// ---------------------------------------- utförandesteg på fem språk ---
const stepKeys = [...new Set(Object.values(GUIDES).map((g) => g.steps))]
const missingSteps: string[] = []
for (const l of LOCALES)
  for (const k of stepKeys)
    for (const part of ["start", "move", "control"]) {
      const key = `guide.steps.${k}.${part}`
      const text = translate(l, key)
      if (text === key || !text.trim()) missingSteps.push(`${l}:${key}`)
    }
check(missingSteps.length === 0, `3 utförandesteg × ${stepKeys.length} mönster × ${LOCALES.length} språk finns`, missingSteps.slice(0, 10))
check(LOCALES.every((l) => !["start", "move", "control", "title"].some((k) => translate(l, `guide.${k}`).startsWith("guide."))), "rubrikerna (Utgångsläge, Rörelse, Kontroll/andning) på alla språk")
check(translate("sv", "guide.title") === "Videoguide / Utförande", "svenska: Videoguide / Utförande")
// Översättningarna är inte bara svensk text igen.
const same = stepKeys.filter((k) => translate("en", `guide.steps.${k}.move`) === translate("sv", `guide.steps.${k}.move`))
check(same.length === 0, "engelska stegen är översatta (inte svenska)", same)

// ----------------------------------------------------- egna övningar ---
check(guideFor({ id: "cx-123", custom: { ownerId: "t1" } as never }) === null, "egen övning: ingen videoguide")
check(guideFor({ id: "e-squat", custom: { ownerId: "t1" } as never }) === null, "egen övning med bankens id: ingen videoguide")
check(guideFor(undefined) === null && guideFor({ id: "okänd" }) === null, "okänd övning: ingen guide (kraschar inte)")

// --------------------------------------------- bara Coaviras AI-video ---
check(guideVideo("https://abc.supabase.co/storage/v1/object/public/exercise-guides/e-squat.mp4") !== null, "AI-video från exercise-guides godtas")
check(guideVideo("https://abc.supabase.co/storage/v1/object/public/exercise-guides/e-run.webm") !== null, "WebM godtas")
for (const bad of [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/dQw4w9WgXcQ",
  "https://vimeo.com/123456",
  "https://player.vimeo.com/video/1",
  "http://abc.supabase.co/storage/v1/object/public/exercise-guides/e-squat.mp4",
  "https://abc.supabase.co/storage/v1/object/public/exercise-videos/e-squat.mp4",
  "https://cdn.stock.example/squat.mp4",
  "javascript:alert(1)",
])
  check(guideVideo(bad) === null, `avvisas: ${bad}`)

// ------------------------------------------------ inga YouTube-embeds, ingen 1RM ---
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : []
  })
}
const src = walk("src").filter((f) => !f.includes("/crm/"))
const embeds = src.filter((f) => /youtube(-nocookie)?\.com\/embed|player\.vimeo\.com|<iframe/i.test(readFileSync(f, "utf8")))
check(embeds.length === 0, "inga YouTube/Vimeo-embeds eller iframes i appen", embeds)
const oneRm = src.filter((f) =>
  readFileSync(f, "utf8")
    .split("\n")
    .some((line) => !/^\s*(\*|\/\/)/.test(line) && /\b(e?1RM|oneRepMax|one[- ]rep[- ]max|epley|brzycki)\b/i.test(line))
)
check(oneRm.length === 0, "inga 1RM-beräkningar i appen", oneRm)

if (failed) {
  console.log(`\n${failed} fel`)
  process.exit(1)
}
console.log("\nVIDEOGUIDERNA GODKÄNDA – 100 % AV ÖVNINGSBANKEN")
