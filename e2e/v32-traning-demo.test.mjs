// E2E för v32 i demoläge: progressiv överbelastning i passet, lägg till set och
// övning live, egen vilotid, splits/scheman (klient och PT), kalorimätaren och
// den rensade profilen – på mobil (390 px).
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v32-traning-demo.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

// ------------------------------------------ 1. progressiv överbelastning ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
const history = (await demo()).workouts.filter((w) => w.clientId === "c1" && w.status === "completed")
const deadlift = history.flatMap((w) => w.exercises.filter((e) => e.exerciseId === "e-deadlift").map((e) => ({ w, e })))
check(deadlift.length > 0, "demoklienten har marklyft i historiken")
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-name", "Marklyft")
await p.fill("#own-search", "conventional deadlift")
await p.locator('ul[aria-label="Övningar att välja"] button:has-text("Conventional Deadlift")').click()
await p.click('[role=dialog] button:has-text("Starta passet")')
await p.waitForURL(/\/klient\/pass\//)
await p.waitForSelector("[data-testid=progression-hint]")
const hint = await p.locator("[data-testid=progression-hint]").innerText()
check(/Mål idag:/.test(hint) && /kg ×/.test(hint), `målet visas: "${hint.split("\n")[0]}"`)
const targetKg = Number((await p.locator("[data-testid=progression-target]").innerText()).match(/([\d,]+) kg/)[1].replace(",", "."))
const lastSet = await p.locator('input[aria-label="Vikt set 3 (kg)"]').inputValue().catch(() => "")
check(Number(lastSet.replace(",", ".")) === targetKg, `toppsetet (set 3) är förifyllt med målet ${targetKg} kg`)
const firstSet = Number((await p.locator('input[aria-label="Vikt set 1 (kg)"]').inputValue()).replace(",", "."))
check(firstSet <= targetKg, `pyramiden bygger upp: set 1 ${firstSet} kg ≤ ${targetKg} kg`)
await p.screenshot({ path: `${out}/v32-progression.png`, fullPage: true })

// ---------------------------------------------- 2. vilotid före/under passet ---
await p.click("[data-testid=rest-settings-button]")
await p.waitForSelector("[data-testid=rest-settings]")
await p.click('[data-testid=rest-settings] [role=radio]:has-text("Alltid min vilotid")')
await p.click('[data-testid=rest-settings] [role=radio]:text-is("1 min")')
await p.screenshot({ path: `${out}/v32-vilotid.png` })
await p.keyboard.press("Escape")
check((await p.locator("[data-testid=rest-settings-button]").innerText()).includes("1 min"), "knappen visar vald vilotid (1 min)")
await p.click('button[aria-label="Bocka av set 1"]')
await p.waitForSelector("[role=timer]")
check(/0:(59|60)|1:00/.test(await p.locator("[role=timer]").innerText()), "timern startar med min vilotid (60 s)")
await p.click('[role=timer] button:has-text("Hoppa över")')

// ------------------------------------------- 3. lägg till set och övning live ---
await p.click("[data-testid=add-set]")
check((await p.locator('button[aria-label="Bocka av set 4"]').count()) === 1, "ett fjärde set läggs till under passet")
await p.click("[data-testid=add-exercise]")
await p.fill('input[aria-label="Sök övning"]', "hip thrust")
await p.locator('ul[aria-label="Övningar att lägga till"] button').first().click()
await p.waitForSelector("text=Barbell Hip Thrust")
let d = await demo()
const w = d.workouts.find((x) => x.name === "Marklyft" && x.clientId === "c1")
check(w.exercises.length === 2 && w.exercises[0].sets === 4, "passet sparas med extra set och ny övning")
check(w.exercises[1].restSec === 60, "den nya övningen får min vilotid")
check(await noOverflow(), "passvyn: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v32-lagg-till.png`, fullPage: true })
// En tillagd övning utan avbockade set kan tas bort igen.
await p.click('button[aria-label="Ta bort Barbell Hip Thrust ur passet"]')
check((await demo()).workouts.find((x) => x.id === w.id).exercises.length === 1, "tillagd övning kan tas bort")

// ------------------------------------------------- 4. splits och schema ---
await p.goto(base + "/klient/schema")
await p.waitForSelector("[data-testid=split-library]")
for (const s of ["ppl", "upper_lower", "four_split", "bro_split", "full_body"]) check((await p.locator(`[data-testid=split-${s}]`).count()) === 1, `split: ${s}`)
await p.screenshot({ path: `${out}/v32-splits.png`, fullPage: true })
await p.click("[data-testid=split-ppl]")
await p.waitForSelector("[data-testid=split-editor]")
check((await p.locator("[data-testid=split-day]").count()) === 3, "PPL har tre dagar")
// Anpassa: ta bort en övning ur Push.
const pushExercises = await p.locator("[data-testid=split-day]").first().locator("li button[aria-label^='Ta bort']").count()
await p.locator("[data-testid=split-day]").first().locator("li button[aria-label^='Ta bort']").last().click()
check((await p.locator("[data-testid=split-day]").first().locator("li button[aria-label^='Ta bort']").count()) === pushExercises - 1, "en övning tas bort ur Push")
await p.fill("#split-weeks", "2")
check(/6 pass/.test(await p.locator("[data-testid=split-summary]").innerText()), "2 veckor PPL = 6 pass")
const before = (await demo()).workouts.length
await p.click("[data-testid=split-create]")
await p.waitForURL(/\/klient\/kalender/)
d = await demo()
const created = d.workouts.filter((x) => x.name.startsWith("Push/Pull/Legs:"))
check(d.workouts.length - before === 6 && created.length === 6, "sex pass i kalendern")
check(created.find((x) => x.name.endsWith("Push")).exercises.length === pushExercises - 1, "anpassningen följer med")

// PT: mallar från en split.
await p.goto(base + "/pt/pass")
await p.waitForSelector("h1:has-text('Passbyggare')")
const ptBefore = (await demo()).templates.filter((t) => t.trainerId === "t1").length
await p.click("[data-testid=new-workout-menu]")
await p.click("[data-testid=new-from-split]")
await p.click("[role=dialog] [data-testid=split-upper_lower]")
await p.click("[role=dialog] [data-testid=split-create]")
await p.waitForSelector("text=4 mallar skapade")
check((await demo()).templates.filter((t) => t.trainerId === "t1").length - ptBefore === 4, "PT: Upper/Lower blir fyra mallar")

// --------------------------------------------------- 5. kalorimätaren ---
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=activity-card]")
check((await p.locator("[data-testid=activity-kcal]").innerText()).includes("382"), "förbränt i dag: 382 kcal (Strava-löpningen)")
check((await p.locator("[data-testid=activity-list]").innerText()).includes("Morgonlöpning"), "dagens pass listas")
check((await p.locator("[data-testid=energy-burned]").innerText()).includes("382"), "kostdagboken visar förbränt (382 kcal)")
await p.locator("[data-testid=activity-card]").scrollIntoViewIfNeeded()
await p.screenshot({ path: `${out}/v32-kalorimatare.png` })

// ------------------------------------------------------- 6. rensad profil ---
await p.goto(base + "/klient/profil")
await p.waitForSelector("[data-testid=profile-goals]")
check((await p.locator("#profile-focus").count()) === 0 && (await p.locator("text=Vad vill du utveckla").count()) === 0, "ingen fritext om mål i profilen")
check((await p.locator("text=/intressen och mål/i").count()) === 0 && (await p.locator("[data-testid=choose-interests]").count()) === 0, "den gamla intro-delen är borta")
await p.goto(base + "/klient/intro")
await p.click("[data-testid=intro-next]") // steg 1 (namn) förifyllt
await p.fill("#goal-weightKg", "")
await p.fill("#goal-weightKg", "75")
await p.fill("#goal-heightCm", "175")
await p.fill("#goal-age", "30")
await p.click('[role=radio]:has-text("Man")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=activity-picker] [role=radio]:has-text("Medel")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=goal-picker] button:has-text("Bodybuilding")')
await p.click('[data-testid=goal-picker] button:has-text("Viktnedgång")')
await p.click("[data-testid=intro-next]")
await p.click("[data-testid=intro-next]")
// v34: sista steget – användaravtalet (obligatoriskt).
await p.waitForSelector("[data-testid=agreement-step]")
await p.click("[data-testid=accept-agreement]")
await p.click("[data-testid=intro-next]")
await p.waitForURL(base + "/klient")
await p.goto(base + "/klient/profil")
await p.waitForSelector("[data-testid=goal-pills]")
const pills = await p.locator("[data-testid=goal-pills] li").allInnerTexts()
check(pills.join("|") === "Viktnedgång|Bodybuilding", `profilen visar bara valda mål som piller: ${pills.join(", ")}`)
await p.screenshot({ path: `${out}/v32-profil.png`, fullPage: true })
check(await noOverflow(), "profilen: ingen horisontell overflow")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
