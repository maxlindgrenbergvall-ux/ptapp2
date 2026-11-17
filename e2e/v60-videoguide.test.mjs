// E2E för v60 i demoläge: "Videoguide / Utförande" direkt under övningen –
// i passet och i passbyggaren (klient och PT). Lazy load, paus vid stängning,
// samma modell, steg på språket, inga egna övningar, inga YouTube-klipp.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v60-videoguide.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const KEY = "coavira:demo:v5"
const demo = () => p.evaluate((k) => JSON.parse(localStorage[k]).data, KEY)
const patch = async (fn) => {
  await p.evaluate(
    ([k, src]) => {
      const s = JSON.parse(localStorage[k])
      new Function("d", src)(s.data)
      localStorage[k] = JSON.stringify(s)
    },
    [KEY, fn]
  )
  await p.reload()
}
// Videoförfrågningar (ska bara ske när guiden fälls ut).
const videoRequests = []
await p.route("**/storage/v1/object/public/exercise-guides/**", (route) => {
  videoRequests.push(route.request().url())
  return route.abort()
})

// ------------------------------------------------- passet: förberedelser ---
await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
await patch(`
  d.exercises = d.exercises.map((e) => (e.id === "e-squat" ? { ...e, videoUrl: "https://demo.supabase.co/storage/v1/object/public/exercise-guides/e-squat.mp4" } : e))
  d.exercises.push({ id: "cx-v60", name: "Min egen v60-övning", muscleGroup: "ben", equipment: "", custom: { ownerId: "c1", weightUnit: "kg", defaultSets: 3, defaultReps: "10" } })
  d.workouts.push({ id: "w-v60", clientId: "c1", trainerId: null, byClient: true, date: new Date().toLocaleDateString("sv-SE"), name: "Guide-pass", status: "planned", logs: [],
    exercises: [
      { id: "a", exerciseId: "e-squat", sets: 3, reps: "8", restSec: 90 },
      { id: "b", exerciseId: "e-sledpush", trackingType: "conditioning", sets: 2, reps: "", restSec: 0, distanceM: 50 },
      { id: "c", exerciseId: "cx-v60", sets: 3, reps: "10", restSec: 60 },
    ] })`)
await p.goto(base + "/klient/pass/w-v60")
await p.waitForSelector("section[data-tracking]")

// ---------------------------------------- 1. inline under övningen (lazy) ---
const squat = p.locator("section[data-tracking]").nth(0)
if (!(await squat.locator("[data-testid=exercise-guide]").count())) await squat.locator("button[aria-expanded]").first().click()
const guide = squat.locator("[data-testid=exercise-guide]")
await guide.waitFor()
const toggle = guide.locator("[data-testid=exercise-guide-toggle]")
check((await toggle.innerText()).includes("Videoguide / Utförande"), "raden \"Videoguide / Utförande\" direkt under övningen")
check((await guide.locator("[data-testid=exercise-guide-panel]").count()) === 0 && videoRequests.length === 0, "inget laddas innan guiden fälls ut (lazy)")
const setsBox = await squat.locator("li").first().boundingBox()
// Sidövergången (template.tsx) glider in de första millisekunderna – mät när den är klar.
await p.waitForTimeout(700)
const docY = (loc) => loc.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY))
const headerY = await docY(squat.locator("button[aria-expanded]").first())
await toggle.click()
await guide.locator("[data-testid=exercise-guide-panel]").waitFor()
check((await toggle.getAttribute("aria-expanded")) === "true", "guiden är utfälld (inline, ingen popup)")
check((await p.locator("[role=dialog]").count()) === 0, "ingen dialog/popup som täcker skärmen")
// Video från exercise-guides (avbruten här) → samma modell som animation.
await p.waitForTimeout(400)
check(videoRequests.length === 1 && videoRequests[0].endsWith("/exercise-guides/e-squat.mp4"), "AI-videon hämtas först när guiden fälls ut", videoRequests)
await guide.locator("[data-testid=guide-figure]").waitFor()
ok("videon kunde inte laddas → guide-atleten tar över (ingen tom ruta)")
const fig = guide.locator("[data-testid=guide-figure]")
check((await fig.getAttribute("data-motion")) === "squat", "rätt rörelse för Back Squat")
const playing = await fig.evaluate((el) => [...el.querySelectorAll("g[style]")].some((g) => getComputedStyle(g).animationPlayState === "running" && getComputedStyle(g).animationName !== "none"))
check(playing, "animationen spelas när guiden är öppen")
const steps = await guide.locator("[data-testid=exercise-guide-steps] li").allInnerTexts()
check(steps.length === 3 && /Utgångsläge/.test(steps[0]) && /Rörelse/.test(steps[1]) && /Kontroll/.test(steps[2]), "tre steg: Utgångsläge, Rörelse, Kontroll / andning", steps)
check(steps[0].includes("Stången på övre ryggen"), "stegen hör till övningen (knäböj)")
check((await docY(squat.locator("button[aria-expanded]").first())) === headerY, "övningens rubrik står still när guiden fälls ut")
const media = await guide.locator("[data-testid=guide-figure]").evaluate((el) => el.parentElement.getBoundingClientRect())
check(Math.abs(media.width / media.height - 1.6) < 0.05 || media.height >= 223, "fast bildyta (16:10) för guiden – inget hopp när videon laddas", media)
const setsBox2 = await squat.locator("li").last().boundingBox()
check(setsBox2.y > setsBox.y, "seten ligger kvar under guiden och syns samtidigt")
await p.screenshot({ path: `${out}/v60-pass-guide.png` })

// Mjuk utfällning (inte ett hopp): höjden växer över tid.
await toggle.click()
await p.waitForTimeout(40)
const midHeight = await guide.evaluate((el) => el.querySelector("[aria-hidden]")?.getBoundingClientRect().height ?? 0)
await p.waitForTimeout(500)
check((await guide.locator("[data-testid=exercise-guide-panel]").count()) === 0, "guiden stängs och släpps (video/animation avmonteras)")
check(midHeight > 0, "stängningen är en mjuk övergång (inte ett hopp)", midHeight)

// Sled Push: Hyrox-station med egen rörelse.
const sled = p.locator("section[data-tracking=conditioning]").first()
await sled.locator("button[aria-expanded]").first().click()
await sled.locator("[data-testid=exercise-guide-toggle]").click()
await sled.locator("[data-testid=guide-figure][data-motion=sled_push]").waitFor()
ok("Sled Push: egen rörelse med samma modell")

// Egen övning: ingen guide.
const own = p.locator("section[data-tracking]").nth(2)
await own.locator("button[aria-expanded]").first().click()
await p.waitForTimeout(200)
check((await own.locator("[data-testid=exercise-guide]").count()) === 0, "egen övning: ingen videoguide")
check((await p.locator("iframe").count()) === 0, "inga YouTube-iframes i passet")

// ----------------------------------------------- 2. passbyggaren (klient) ---
await p.goto(base + "/klient/schema")
await p.waitForSelector("[data-testid=split-library], [data-testid=change-split]")
if (await p.locator("[data-testid=change-split]").count()) await p.click("[data-testid=change-split]")
await p.click("[data-testid=split-hyrox_prep]")
await p.waitForSelector("[data-testid=split-exercise]")
const rows = p.locator("[data-testid=split-exercise]")
const withGuide = await rows.evaluateAll((els) => els.filter((e) => e.querySelector("[data-testid=exercise-guide]")).length)
check(withGuide === (await rows.count()), `klientens byggare: varje förinlagd övning har en guide (${withGuide})`)
await rows.first().locator("[data-testid=exercise-guide-toggle]").click()
await rows.first().locator("[data-testid=guide-figure]").waitFor()
ok("klientens byggare: guiden fälls ut under övningen")
await p.screenshot({ path: `${out}/v60-byggare-klient.png` })

// ------------------------------------------------- 3. passbyggaren (PT) ---
await p.goto(base + "/pt/pass")
await p.click("[data-testid=split-ppl]")
await p.waitForSelector("[data-testid=split-exercise]")
const ptRow = p.locator("[data-testid=split-exercise]").first()
await ptRow.locator("[data-testid=exercise-guide-toggle]").click()
await ptRow.locator("[data-testid=guide-figure]").waitFor()
check((await ptRow.locator("[data-testid=exercise-guide-steps] li").count()) === 3, "PT:ns byggare: samma guide med tre steg")
// En egen övning i PT:ns byggare får ingen guide.
await p.locator("[data-testid=split-create-exercise]").first().click()
await p.fill("#cx-name", "PT:s v60-övning")
await p.locator("[role=dialog] button:has-text('Spara och lägg i')").click()
const ptOwn = p.locator("[data-testid=split-exercise]:has-text('PT:s v60-övning')")
await ptOwn.waitFor()
check((await ptOwn.locator("[data-testid=exercise-guide]").count()) === 0, "PT:ns egen övning: ingen videoguide")
check((await p.locator("[data-testid=exercise-more]").first().count()) === 1, "Mer-panelen finns kvar")
await p.locator("[data-testid=exercise-more]").first().click()
check((await p.locator("input[aria-label='Videolänk']").count()) === 0, "inget fält för YouTube/Vimeo-länkar längre")

// --------------------------------------------------------- 4. språk ---
await p.goto(base + "/klient/installningar/app")
await p.click("[data-testid=language-picker] [data-locale=de]")
await p.goto(base + "/klient/pass/w-v60")
await p.waitForSelector("section[data-tracking]")
const sq = p.locator("section[data-tracking]").nth(0)
if (!(await sq.locator("[data-testid=exercise-guide]").count())) await sq.locator("button[aria-expanded]").first().click()
await sq.locator("[data-testid=exercise-guide-toggle]").click()
const de = await sq.locator("[data-testid=exercise-guide-steps] li").allInnerTexts()
check((await sq.locator("[data-testid=exercise-guide-toggle]").innerText()).includes("Videoanleitung / Ausführung") && /Ausgangsposition/.test(de[0]) && de[0].includes("Stange auf dem oberen Rücken"), "tyska: Videoanleitung / Ausführung och stegen på tyska", de)
await p.screenshot({ path: `${out}/v60-pass-guide-de.png` })
await p.goto(base + "/klient/installningar/app")
await p.click("[data-testid=language-picker] [data-locale=sv]")

// ------------------------------------------- 5. minska rörelse ---
const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
const r = await rctx.newPage()
await r.goto(base + "/klient")
await r.evaluate(([k, v]) => (localStorage[k] = v), [KEY, await p.evaluate((k) => localStorage[k], KEY)])
await r.goto(base + "/klient/pass/w-v60")
const rs = r.locator("section[data-tracking]").nth(0)
await rs.waitFor()
if (!(await rs.locator("[data-testid=exercise-guide]").count())) await rs.locator("button[aria-expanded]").first().click()
await rs.locator("[data-testid=exercise-guide-toggle]").click()
await rs.locator("[data-testid=exercise-guide-panel]").waitFor()
ok("guiden fungerar även med Minska rörelse")
await rctx.close()

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
