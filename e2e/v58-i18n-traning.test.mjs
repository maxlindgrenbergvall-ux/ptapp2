// E2E för v58 i demoläge: språk och träningsintressen (intro-flödet och
// Appinställningar), byte av språk utan omladdning, "Upplägg / Tips" med filter
// efter intressena, passbyggarens adaptiva fält, block/varv och loggning av
// löpning och Hyrox-stationer.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v58-i18n-traning.test.mjs [skärmdumpsmapp]
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
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
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
const navText = () => p.locator("nav[aria-label] a").allInnerTexts()

// ---------------------------------------------- 1. demo: svenska från start ---
await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
check((await p.evaluate(() => document.documentElement.lang)) === "sv", "demoläget: svenska från start (html lang=sv)")

// ------------------------------------- 2. intro-flödet: språk + intressen ---
await p.goto(base + "/klient/intro")
await p.waitForSelector("[data-testid=language-chips]")
check((await p.locator("[data-testid=language-chips] [role=radio]").count()) === 5, "första steget: fem språk (sv, en, es, fr, de)")
check((await p.locator("[data-testid=interest-pills] [data-interest]").count()) === 5, "första steget: fem intressen som pills")
await p.click("[data-testid=language-chips] [data-locale=en]")
await p.waitForSelector("[data-testid=interest-pills] >> text=Running")
check((await p.evaluate(() => document.documentElement.lang)) === "en", "ett tryck på EN: hela vyn på engelska direkt")
check(await p.locator("text=What do you train?").isVisible(), "rubriken på engelska")
const docBox = (sel) => p.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { y: Math.round(r.top + window.scrollY), width: Math.round(r.width) } })
await p.locator("[data-interest=running]").scrollIntoViewIfNeeded()
const pillBox = await docBox("[data-interest=running]")
await p.click("[data-interest=running]")
await p.click("[data-interest=hyrox]")
const pillBox2 = await docBox("[data-interest=running]")
check(pillBox.width === pillBox2.width && pillBox.y === pillBox2.y, "pillen ändrar inte storlek eller plats när den väljs", { pillBox, pillBox2 })
check((await p.getAttribute("[data-interest=running]", "aria-pressed")) === "true", "Running är vald")
let d = await demo()
check(d.preferences?.language === "en" && d.preferences?.trainingInterests?.join() === "running,hyrox", "språk och intressen sparas direkt (optimistiskt)", d.preferences)
await p.screenshot({ path: `${out}/v58-intro.png` })

// ------------------------------------------------ 3. Appinställningar ---
await p.goto(base + "/klient/installningar")
await p.waitForSelector("[data-testid=app-settings-link]")
check((await p.locator("[data-testid=app-settings-link]").innerText()).includes("English"), "Inställningar → Appinställningar visar valt språk")
await p.click("[data-testid=app-settings-link]")
await p.waitForURL(/\/klient\/installningar\/app$/)
await p.waitForSelector("[data-testid=language-picker]")
check((await p.getAttribute("[data-testid=language-picker] [data-locale=en]", "aria-checked")) === "true", "språkväljaren: English vald")
check((await navText()).join("|").includes("Nutrition"), "menyn på engelska", await navText())
await p.evaluate(() => (window.__noReload = true))
const navBox = await p.locator("nav[aria-label]").boundingBox()
await p.click("[data-testid=language-picker] [data-locale=de]")
await p.waitForSelector("nav a:has-text('Ernährung')")
check(await p.evaluate(() => window.__noReload === true), "språkbytet sker utan omladdning")
check(p.url().endsWith("/klient/installningar/app"), "ingen sidväxling")
const navBox2 = await p.locator("nav[aria-label]").boundingBox()
check(Math.round(navBox.height) === Math.round(navBox2.height) && Math.round(navBox.y) === Math.round(navBox2.y), "bottenmenyn hoppar inte vid språkbyte")
check((await navText()).join("|").includes("Heute") && (await p.locator("[data-testid=app-settings] h1").innerText()) === "App-Einstellungen", "hela vyn på tyska (Heute, App-Einstellungen)")
check((await p.evaluate(() => document.documentElement.lang)) === "de", "html lang=de")
await p.waitForSelector("[data-sonner-toast]:has-text('Sprache: Deutsch')")
ok("toast på det nya språket")
await p.click("[data-interest=hyrox]")
d = await demo()
check(d.preferences?.language === "de" && d.preferences?.trainingInterests?.join() === "running", "intressen ändras i efterhand (Hyrox bort)", d.preferences)
await p.screenshot({ path: `${out}/v58-appinstallningar-de.png` })
await p.reload()
await p.waitForSelector("nav a:has-text('Ernährung')")
ok("språket ligger kvar efter omladdning")

// ------------------------------------------------ 4. Upplägg / Tips ---
const openLibrary = async () => {
  await p.goto(base + "/klient/schema")
  await p.waitForSelector("[data-testid=plan-category], [data-testid=change-split]")
  if (await p.locator("[data-testid=change-split]").count()) await p.click("[data-testid=change-split]")
  await p.waitForSelector("[data-testid=plan-category]")
}
await openLibrary()
check((await p.locator("main h1").first().innerText()) === "Pläne / Tipps", "rubriken: Pläne / Tipps")
check((await p.getAttribute("[data-testid=plan-category] [data-category=running]", "aria-checked")) === "true", "intresset Laufen: filtret Laufen är förvalt")
const keysShown = async () => p.locator("[data-testid=split-list] [data-testid^=split-]").evaluateAll((els) => els.map((e) => e.dataset.testid.replace("split-", "")))
check((await keysShown()).join() === "run_5k,run_10k", "bara löpupplägg (5 km, 10 km)", await keysShown())
check((await p.locator("[data-testid=for-you]").count()) === 2, "märkta För dig")
check((await p.locator("[data-testid=plan-tips]").innerText()).includes("Grundlagenausdauer"), "tips för Laufen på tyska")
const tipsH = (await p.locator("[data-testid=plan-tips]").boundingBox()).height
await p.click("[data-testid=plan-category] [data-category=hyrox]")
check((await keysShown()).join() === "hyrox_prep,hybrid", "Hyrox: Hyrox Race Prep och Hybrid", await keysShown())
check(Math.abs((await p.locator("[data-testid=plan-tips]").boundingBox()).height - tipsH) < 24, "tipsrutan har stabil höjd vid byte av filter")
await p.click("[data-testid=plan-category] [data-category=all]")
check((await keysShown()).length === 10 && (await keysShown()).slice(0, 2).join() === "run_5k,run_10k", "Alla: tio upplägg, intressets först", await keysShown())
await p.screenshot({ path: `${out}/v58-upplagg-de.png` })

// Tillbaka till svenska för resten.
await p.goto(base + "/klient/installningar/app")
await p.click("[data-testid=language-picker] [data-locale=sv]")
await p.waitForSelector("nav a:has-text('Kost')")

// Hyrox Race Prep: dagarnas namn på svenska och adaptiva fält i editorn.
await openLibrary()
await p.click("[data-testid=plan-category] [data-category=hyrox]")
await p.click("[data-testid=split-hyrox_prep]")
await p.waitForSelector("[data-testid=split-exercise]")
const runRow = p.locator("[data-testid=split-exercise]").filter({ has: p.locator("[data-tracking=running]") }).first()
const runLabels = await runRow.locator("label").allInnerTexts()
check(runLabels.join("|") === "Intervaller|Distans (km)|Tempo (min/km)|Vila (s)", "löpning: bara Intervaller × Distans × Tempo × Vila", runLabels)
const stRow = p.locator("[data-testid=split-exercise]").filter({ has: p.locator("[data-tracking=conditioning]") }).first()
const stLabels = await stRow.locator("label").allInnerTexts()
check(stLabels.join("|") === "Varv|Distans (m)|Reps / kal", "Hyrox-station: Varv × Distans (m) × Reps / kal", stLabels)
check((await stRow.locator("text=Startvikt").count()) === 0, "inga viktfält på stationerna")
await p.screenshot({ path: `${out}/v58-hyrox-editor.png` })

// ---------------------------------- 5. PT:ns passbyggare: adaptiva fält + block ---
await patch(`d.preferences = { ...d.preferences, trainingInterests: ["hyrox"] }`)
await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/pass")
await p.waitForSelector("h1:has-text('Passbyggare')")
const cat = p.locator("[data-testid=builder-category]:visible").first()
check((await cat.locator("[data-category=hyrox]").getAttribute("aria-checked")) === "true", "övningsbanken: filtret Hyrox förvalt efter intresset")
const lib = p.locator("[data-testid=builder-category]:visible").first().locator("xpath=ancestor::div[contains(@class,'card') or @data-slot='card'][1]")
const libButtons = async () => (await p.locator("button:has(svg.lucide-plus):visible").allInnerTexts()).map((t) => t.trim())
const names = await libButtons()
check(names.some((n) => n.startsWith("Sled Push")) && !names.some((n) => n.startsWith("Bench Press")), "bara Hyrox/kondition i listan", names.slice(0, 8))
const rowsBefore = await p.locator("li[data-tracking]").count()
await p.locator("button:visible", { hasText: /^Sled Push/ }).first().click()
await p.locator("button:visible", { hasText: /^Hyrox 1 km Run/ }).first().click()
await p.waitForFunction((n) => document.querySelectorAll("li[data-tracking]").length === n + 2, rowsBefore)
const sledRow = p.locator("li[data-tracking=conditioning]").last()
const runLi = p.locator("li[data-tracking=running]").last()
check((await sledRow.getByLabel(/Distans \(m\)/).inputValue()) === "50", "Sled Push läggs till som 50 m")
check((await sledRow.locator("text=Kg").count()) === 0 && (await sledRow.locator("text=RPE").count()) === 0, "inga vikt- eller RPE-fält på Sled Push")
check((await runLi.getByLabel(/Distans \(km\)/).inputValue()) === "1" && (await runLi.getByLabel(/Tempo/).inputValue()) === "5:00", "Hyrox 1 km: 1 km i 5:00/km")
// Tömt fält blir blankt – inte 1.
await runLi.getByLabel(/Distans \(km\)/).fill("")
await runLi.getByLabel(/Tempo/).fill("")
await p.mouse.click(5, 5)
check((await runLi.getByLabel(/Distans \(km\)/).inputValue()) === "" && (await runLi.getByLabel(/Tempo/).inputValue()) === "", "raderade fält blir blanka (aldrig 1)")
await runLi.getByLabel(/Distans \(km\)/).fill("1")
await runLi.getByLabel(/Tempo/).fill("4:45")
// Block: koppla löpningen till Sled Push ovanför.
await runLi.locator("[data-testid=link-block]").click()
await p.waitForSelector("[data-testid=block-header]")
const header = p.locator("[data-testid=block-header]").last()
check((await header.innerText()).includes("Block A"), "block skapas: Block A")
await header.getByRole("textbox").fill("4")
await p.screenshot({ path: `${out}/v58-passbyggare-block.png` })
await p.getByRole("button", { name: "Spara", exact: true }).first().click()
await p.waitForSelector("text=Mallen är sparad")
d = await demo()
const tpl = d.templates.find((t) => t.exercises.some((e) => e.exerciseId === "e-hyrox-run"))
const sledEx = tpl?.exercises.find((e) => e.exerciseId === "e-sledpush")
const runEx = tpl?.exercises.find((e) => e.exerciseId === "e-hyrox-run")
check(sledEx?.trackingType === "conditioning" && sledEx.distanceM === 50 && runEx?.trackingType === "running" && runEx.distanceM === 1000 && runEx.paceSecPerKm === 285, "mallen sparar träningsform, distans och tempo", { sledEx, runEx })
check(sledEx?.blockId && sledEx.blockId === runEx?.blockId && sledEx.sets === 4 && runEx.sets === 4, "blocket: samma blockId, 4 varv på båda", { sledEx, runEx })
await p.setViewportSize({ width: 390, height: 844 })

// ------------------------------------- 6. passloggern: löpning och Hyrox ---
await patch(`d.workouts.push({ id: "w-v58", clientId: "c1", trainerId: null, byClient: true, date: new Date().toLocaleDateString("sv-SE"), name: "Hyrox-simulering", status: "planned", logs: [],
  exercises: [
    { id: "r1", exerciseId: "e-hyrox-run", trackingType: "running", sets: 2, reps: "", restSec: 0, distanceM: 1000, paceSecPerKm: 300, blockId: "a" },
    { id: "s1", exerciseId: "e-sledpush", trackingType: "conditioning", sets: 2, reps: "", restSec: 0, distanceM: 50, blockId: "a" },
    { id: "w1", exerciseId: "e-wallball", trackingType: "conditioning", sets: 1, reps: "100", restSec: 0 },
    { id: "q1", exerciseId: "e-squat", sets: 2, reps: "8", restSec: 90 }
  ] })`)
await p.goto(base + "/klient/pass/w-v58")
await p.waitForSelector("[data-testid=logger-block]")
check((await p.locator("[data-testid=logger-block]").innerText()).includes("Block A · 2 varv"), "loggern: Block A · 2 varv")
const runCard = p.locator("section[data-tracking=running]")
if (!(await runCard.locator("[data-testid=endurance-row]").count())) await runCard.locator("button[aria-expanded]").first().click()
await runCard.locator("[data-testid=endurance-row]").first().waitFor()
const head = await runCard.locator("div.grid").first().innerText()
check(/Distans \(km\)/.test(head) && /Tid/.test(head) && !/Kg/.test(head), "löpning: kolumnerna Distans (km) och Tid – ingen vikt", head)
const row1 = runCard.locator("[data-testid=endurance-row]").first()
const rowH = (await row1.boundingBox()).height
await row1.getByLabel(/Tid Intervall 1/).fill("4:51")
await row1.getByRole("button", { name: /Bocka av Intervall 1/ }).click()
await p.waitForFunction(() => JSON.parse(localStorage["coavira:demo:v5"]).data.workouts.find((w) => w.id === "w-v58").logs.some((l) => l.workoutExerciseId === "r1" && l.done))
d = await demo()
const log = d.workouts.find((w) => w.id === "w-v58").logs.find((l) => l.workoutExerciseId === "r1")
check(log.distanceM === 1000 && log.durationSec === 291 && log.kg === 0, "intervallet loggas: 1000 m på 4:51", log)
check((await row1.innerText()).includes("4:51/km"), "tempot räknas fram (4:51/km)")
check(Math.round((await row1.boundingBox()).height) === Math.round(rowH), "raden ändrar inte höjd när tempot visas")
// Utan tid: löpningen kan inte bockas av.
const row2 = runCard.locator("[data-testid=endurance-row]").nth(1)
await row2.getByLabel(/Tid Intervall 2/).fill("")
await row2.getByRole("button", { name: /Bocka av Intervall 2/ }).click()
await p.waitForSelector("[data-sonner-toast]:has-text('Fyll i tiden')")
ok("löpning utan tid: ber om tiden")

const sledCard = p.locator("section[data-tracking=conditioning]").first()
await sledCard.locator("button[aria-expanded]").first().click()
await sledCard.locator("[data-testid=hyrox-help]").waitFor()
check((await sledCard.locator("[data-testid=hyrox-help]").innerText()).includes("50 m"), "Sled Push: hjälptext (Station 2: 50 m)")
await sledCard.locator("[data-testid=endurance-row]").first().getByRole("button", { name: /Bocka av Varv 1/ }).click()
await p.waitForFunction(() => JSON.parse(localStorage["coavira:demo:v5"]).data.workouts.find((w) => w.id === "w-v58").logs.some((l) => l.workoutExerciseId === "s1" && l.done))
d = await demo()
check(d.workouts.find((w) => w.id === "w-v58").logs.find((l) => l.workoutExerciseId === "s1").distanceM === 50, "Sled Push-varvet loggas med 50 m (tid valfri)")

const wbCard = p.locator("section[data-tracking=conditioning]").nth(1)
await wbCard.locator("button[aria-expanded]").first().click()
const wbHead = await wbCard.locator("div.grid").first().innerText()
check(/Reps \/ kal/.test(wbHead), "Wall Balls: Reps / kal i stället för distans", wbHead)
const strengthCard = p.locator("section[data-tracking=strength]")
await strengthCard.locator("button[aria-expanded]").first().click()
check(/Kg/.test(await strengthCard.locator("div.grid").first().innerText()), "styrka: Set × Kg × Reps som förut")
await p.screenshot({ path: `${out}/v58-logger.png`, fullPage: true })

// Samma pass på spanska: gymlingo.
await p.goto(base + "/klient/installningar/app")
await p.click("[data-testid=language-picker] [data-locale=es]")
await p.goto(base + "/klient/pass/w-v58")
await p.waitForSelector("[data-testid=logger-block]")
check((await p.locator("[data-testid=logger-block]").innerText()).includes("Bloque A · 2 rondas"), "spanska: Bloque A · 2 rondas")
await p.locator("section[data-tracking=running] [data-testid=endurance-row]").first().waitFor().catch(async () => p.locator("section[data-tracking=running] button[aria-expanded]").first().click())
check(/Distancia \(km\)/.test(await p.locator("section[data-tracking=running] div.grid").first().innerText()) && /Tiempo/.test(await p.locator("section[data-tracking=running] div.grid").first().innerText()), "spanska: Distancia (km), Tiempo")
await p.screenshot({ path: `${out}/v58-logger-es.png` })
await p.goto(base + "/klient/installningar/app")
await p.click("[data-testid=language-picker] [data-locale=sv]")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
