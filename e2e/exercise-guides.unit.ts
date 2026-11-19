// Verifiering för v60: VARJE förinlagd övning har en videoguide (animation med
// samma modell + ev. AI-video) och tre utförandesteg på alla fem språk. Egna
// övningar har ingen guide. Inga YouTube/Vimeo-källor och ingen 1RM.
//   npx tsx --tsconfig tsconfig.json e2e/exercise-guides.unit.ts
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { GuideFigure } from "@/components/exercises/guide-figure"
import library from "@/lib/exercise-library.json"
import { balanceError, freeStanding, midfoot, worldFrames } from "@/lib/exercise-guides/biomech"
import { fitMotion, frames, keyframesCss, type Motion, outOfFrame } from "@/lib/exercise-guides/figure"
import { GUIDES, guideFor } from "@/lib/exercise-guides/guides"
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

// -------------------------------------- bara animation, inga externa tjänster ---
const guideSrc = readFileSync("src/components/exercises/exercise-guide.tsx", "utf8") + readFileSync("src/components/exercises/guide-figure.tsx", "utf8")
check(!/<video|fetch\(|https?:\/\//.test(guideSrc.replace(/\/\*[\s\S]*?\*\//g, "")), "guiden ritas i appen – ingen video, inga nätverksanrop, inga API-nycklar")
check(!readdirSync("scripts").some((f) => /ai-exercise-videos/.test(f)), "inget betalt AI-videoscript")
// Övningens eget redskap (v61).
const hands = { "e-db-bench": "dumbbell", "e-bench": undefined, "e-cablecurl": "handle", "e-goblet": "kettlebell", "e-machine-hipthrust": "none" } as Record<string, string | undefined>
check(Object.entries(hands).every(([id, h]) => GUIDES[id].hand === h), "redskap per övning: hantlar i hantelpress, handtag i kabelcurl, kettlebell i goblet")

// ------------------------------------------ biomekanik (v62): stance, lyft, hållning ---
const M = MOTIONS as unknown as Record<string, Motion>
const W = (id: string) => worldFrames(M[id])

// Balans: tyngdpunkten (kropp + redskap) över fötterna i varje bildruta.
const unbalanced = Object.entries(M).filter(([, m]) => freeStanding(m) && balanceError(m) > 1).map(([id, m]) => `${id} ${balanceError(m).toFixed(1)}`)
const nFree = Object.values(M).filter(freeStanding).length
check(unbalanced.length === 0, `balans: tyngdpunkten över stödytan i alla ${nFree} fristående stående rörelser`, unbalanced)

// Stångbana: skivstången över mittfoten (foten är 14 enheter lång).
const barPath = (id: string) => Math.max(...W(id).map(({ j }) => Math.abs(j.hand.x - midfoot(j))))
const offPath = ["squat", "front_squat", "deadlift", "hinge", "good_morning", "overhead_press", "push_press", "thruster", "clean"].filter((id) => barPath(id) > 10)
check(offPath.length === 0, "stångbana: stången över mittfoten i knäböj, frontböj, marklyft, RDL, good morning, press, push press, thruster och frivändning", offPath.map((id) => `${id} ${barPath(id).toFixed(1)}`))
check(barPath("snatch") <= 14, "ryck: stången nära kroppen hela vägen upp", barPath("snatch"))

// Hållning: rak, lutande rygg i marklyftets start, höften över knäna och stången på golvet.
{
  const { j } = W("deadlift")[0]
  const sole = j.ankle.y + 5
  const plateBottom = j.hand.y + 2 + 12.5
  check(Math.abs(plateBottom - sole) < 3, "marklyft: skivorna står på golvet i startläget", { plateBottom, sole })
  check(j.pelvis.y < j.knee.y && j.shoulder.y < j.pelvis.y, "marklyft: axlar över höft, höft över knän i startläget")
  const p0 = frames(M.deadlift)[0].pose
  check(p0.t >= 45 && p0.t <= 70, `marklyft: ryggvinkel ${p0.t.toFixed(0)}° i startläget (45–70°)`)
}
{
  const bottom = frames(M.squat)[Math.floor(frames(M.squat).length / 2)]
  const j = W("squat")[Math.floor(frames(M.squat).length / 2)].j
  check(j.pelvis.y >= j.knee.y - 2, "knäböj: höften ner till knähöjd (parallellt) i bottenläget")
  check(bottom.pose.t >= 25 && bottom.pose.t <= 50, `knäböj: bållutning ${bottom.pose.t.toFixed(0)}° i botten (25–50°)`)
}

// Stance: plana fötter i stående styrka, hälen upp bara i tåhävningar.
const flatFail = ["squat", "front_squat", "deadlift", "hinge", "good_morning", "overhead_press", "bent_row", "curl", "kb_swing"].filter((id) => W(id).some(({ j }) => Math.abs(j.heel.y - j.toe.y) > 0.5))
check(flatFail.length === 0, "stance: hela foten i golvet (hälen nere) i stående styrkeövningar", flatFail)
{
  const fr = W("calf_raise")
  const toeMove = Math.max(...fr.map(({ j }) => Math.hypot(j.toe.x - fr[0].j.toe.x, j.toe.y - fr[0].j.toe.y)))
  const heelUp = Math.max(...fr.map(({ j }) => fr[0].j.heel.y - j.heel.y))
  check(toeMove < 0.5 && heelUp > 5, "tåhävning: tårna står kvar och hälen lyfts", { toeMove, heelUp })
}
// Utfall och split squat: bakre foten står kvar (i golvet resp. på bänken).
for (const id of ["lunge", "loaded_lunge", "sandbag_lunge", "split_squat"]) {
  const fr = W(id)
  const drift = Math.max(...fr.map(({ j }) => Math.hypot(j.toeB.x - fr[0].j.toeB.x, j.toeB.y - fr[0].j.toeB.y)))
  check(drift < 1, `${id}: bakre foten planterad (rör sig ${drift.toFixed(2)})`)
}
for (const id of ["lunge", "loaded_lunge", "sandbag_lunge"]) {
  const off = Math.max(...W(id).map(({ j }) => Math.abs(j.toeB.y - j.toe.y)))
  check(off < 1.5, `${id}: bakre tån i golvet`, off)
}
// Planka/armhävning: händer (armbågar) och tår i golvet samtidigt.
for (const id of ["push_up", "plank", "side_plank", "mountain_climber"]) {
  const off = Math.max(...W(id).map(({ j }) => {
    const rot = (q: { x: number; y: number }) => q.y
    return Math.abs(Math.max(rot(j.hand), rot(j.elbow)) - Math.max(rot(j.toe), rot(j.toeB)))
  }))
  check(off < 2, `${id}: händerna och tårna i golvet`, off.toFixed(2))
}
// Golvkontakt: rörelser som byter stöd (burpee, löpning) går aldrig igenom golvet.
for (const [id, m] of Object.entries(M).filter(([, m]) => m.ground)) {
  const low = W(id).map(({ j }) => Math.max(j.ankle.y, j.toe.y, j.heel.y, j.ankleB.y, j.toeB.y, j.heelB.y, j.knee.y, j.kneeB.y, j.hand.y, j.handB.y, j.elbow.y, j.elbowB.y, j.pelvis.y, j.shoulder.y))
  if (Math.max(...low) > low[0] + 1) check(false, `${id}: ingen del under golvet`, { first: low[0], max: Math.max(...low) })
  void m
}
check(true, `golvkontakt: ${Object.values(M).filter((m) => m.ground).length} rörelser med växlande stöd står på golvet`)
// Glute bridge: skulderbladen kvar i golvet.
{
  const fr = W("glute_bridge")
  const off = Math.max(...fr.map(({ j }) => Math.abs(j.shoulder.y - fr[0].j.shoulder.y)))
  const lift = Math.max(...fr.map(({ j }) => fr[0].j.pelvis.y - j.pelvis.y))
  check(off < 2 && lift > 15, "glute bridge: skulderbladen i golvet, höften lyfts", { off, lift })
}

// ------------------------------------------------ redskapen ritas tydligt (v62) ---
const svg = (id: string) => {
  const g = GUIDES[id]
  return renderToStaticMarkup(React.createElement(GuideFigure, { motion: g.motion, hand: g.hand, playing: false }))
}
const props: [string, RegExp, string][] = [
  ["e-squat", /data-prop="barbell"/, "skivstång (skiva + hylsa) i knäböj"],
  ["e-deadlift", /data-prop="barbell"/, "skivstång i marklyft"],
  ["e-db-bench", /data-prop="dumbbell"/, "hantlar i hantelpress"],
  ["e-goblet", /data-prop="kettlebell"/, "kettlebell i goblet squat"],
  ["e-cablecurl", /data-prop="handle"/, "kabelhandtag i kabelcurl"],
  ["e-abwheel", /data-prop="wheel"/, "maghjul i ab wheel"],
  ["e-pullup", /data-scene="pullup"/, "räcke (stång + stolpe) i chins/pull-ups"],
  ["e-hlr", /data-scene="pullup"/, "räcke i hängande benlyft"],
  ["e-dip", /data-scene="dip"/, "dipstation i dips"],
  ["e-invrow", /data-scene="lowbar"/, "låg stång i inverterad rodd"],
  ["e-sledpush", /data-scene="sled"/, "släde i sled push"],
  ["e-bench", /data-scene="bench"/, "bänk med ben i bänkpress"],
  ["e-bss", /data-scene="bench"/, "bänk under bakre foten i bulgarisk split squat"],
  ["e-benchdip", /data-scene="bench"/, "bänk under händerna i bänkdips"],
]
const missingProps = props.filter(([id, re]) => !re.test(svg(id))).map(([id, , l]) => `${id}: ${l}`)
check(missingProps.length === 0, `redskapen ritas: ${props.map(([, , l]) => l.split(" i ")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}`, missingProps)

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
