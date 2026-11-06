// E2E för v43 i demoläge (mobil 390 px):
//   1. Tomma fält: set/reps blir tomma (ingen automatisk etta).
//   2. Skapa egen övning direkt i passbyggaren, med vald muskelgrupp.
//   3. Övningsbanken: EZ-Bar Curl, Axelpress i maskin, Hip Thrust i maskin,
//      Bulgarian Split Squats (utan hantlar/skivstång) och Kickbacks.
//   4. Schemat: antal dagar per vecka – inga veckodagar, startdatum eller antal veckor.
//   5. "Nästa pass" på startsidan startar passet som står på tur.
//   BASE_URL=http://localhost:3000 node e2e/v43-passbyggare.test.mjs [skärmdumpsmapp]
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
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const today = new Date().toLocaleDateString("sv-SE")

await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")

// ------------------------------------------------ 5a. Nästa pass (demo) ---
const card = p.locator("[data-testid=next-workout-card]")
await card.waitFor()
check((await p.locator("[data-testid=next-workout]").innerText()).includes("Nästa pass"), "startsidan har en tydlig knapp: Nästa pass")
check((await p.locator("[data-testid=next-workout-day]").innerText()) === "Pull", "demo: Pull står på tur i PPL")
const nb = await p.locator("[data-testid=next-workout]").boundingBox()
check(nb.height >= 52 && nb.width >= 320, `knappen är stor och framträdande (${Math.round(nb.width)}×${Math.round(nb.height)})`)
await p.screenshot({ path: `${out}/v43-nasta-pass.png` })

// --------------------------------------------- 4. schemat: dagar/vecka ---
await p.goto(base + "/klient/schema")
await p.waitForSelector("[data-testid=active-split]")
check((await p.locator("[data-testid=active-split] li", { hasText: "Pull" }).innerText()).includes("På tur"), "schemasidan: Pull är på tur")
await p.click("[data-testid=change-split]")
await p.click("[data-testid=split-ppl]")
await p.waitForSelector("[data-testid=split-editor]")
check((await p.locator("#split-weeks, #split-start, input[type=date], [aria-labelledby=split-weekdays]").count()) === 0, "inga fält för startdatum, antal veckor eller veckodagar")
check((await p.locator("[data-testid=days-per-week] [role=radio]").allInnerTexts()).map((t) => t.split("\n")[0]).join(",") === "2,3,4,5,6", "välj antal dagar per vecka (2–6)")

// ------------------------------------------- 1. tomma fält (ingen etta) ---
const push = p.locator("[data-testid=split-day]").first()
const firstName = (await push.locator("[data-testid=replace-exercise] span.truncate").first().innerText()).trim()
const sets = push.locator(`input[aria-label="Set för ${firstName}"]`)
const reps = push.locator(`input[aria-label="Reps för ${firstName}"]`)
await sets.click()
await sets.press("Backspace")
await p.waitForTimeout(150)
check((await sets.inputValue()) === "", `set: raderad siffra ger ett tomt fält (inte 1) – "${await sets.inputValue()}"`)
await sets.blur()
await p.waitForTimeout(150)
check((await sets.inputValue()) === "", "set: fältet förblir tomt när man lämnar det")
await reps.fill("")
check((await reps.inputValue()) === "", "reps: kan tömmas helt")
await p.click("[data-testid=split-create]")
await p.waitForSelector("text=/Fyll i set och reps/")
check((await sets.getAttribute("aria-invalid")) === "true" && (await reps.getAttribute("aria-invalid")) === "true", "sparas inte – de tomma fälten markeras")
await sets.click()
await p.keyboard.type("4")
check((await sets.inputValue()) === "4", "egna siffror från grunden: 4 (ingen förinställd etta att radera)")
await reps.fill("6–8")

// ------------------------------------ 2. egen övning i passbyggaren ---
await push.locator("[data-testid=split-create-exercise]").click()
const cx = p.getByRole("dialog", { name: "Lägg till egen övning" })
await cx.waitFor()
await cx.locator("#cx-name").fill("Landmine Press på knä")
await cx.locator("[role=radio]", { hasText: "Axlar" }).click()
check(/under Axlar/.test(await cx.innerText()), "muskelgruppen kan väljas (Axlar)")
await cx.locator("[data-testid=custom-exercise-save]").click()
await push.locator("[data-testid=replace-exercise]", { hasText: "Landmine Press på knä" }).waitFor()
await p.waitForFunction(() => JSON.parse(localStorage["coavira:demo:v5"]).data.exercises.some((e) => e.name === "Landmine Press på knä"))
let d = await demo()
const landmine = d.exercises.find((e) => e.name === "Landmine Press på knä")
check(landmine?.custom && landmine.displayGroup === "axlar" && landmine.muscleGroup === "axlar", "sparas i övningsbiblioteket med vald muskelgrupp")
// Via övningslistan: sök, saknas → Skapa egen övning med sökordet.
const legs = p.locator("[data-testid=split-day]").nth(2)
await legs.locator("[data-testid=split-add-exercise]").click()
const picker = p.locator("[data-testid=exercise-picker-dialog]")
await picker.waitFor()
await picker.locator('input[aria-label="Sök övning"]').fill("Sissy squat")
await picker.locator("text=Ingen övning hittades.").waitFor()
await picker.locator("[data-testid=create-custom-exercise]").click()
const cx2 = p.getByRole("dialog", { name: "Lägg till egen övning" })
check((await cx2.locator("#cx-name").inputValue()) === "Sissy squat", "Skapa egen övning i listan: sökordet blir namnet")
await cx2.locator("[role=radio]", { hasText: "Ben" }).click()
await cx2.locator("[data-testid=custom-exercise-save]").click()
await legs.locator("[data-testid=replace-exercise]", { hasText: "Sissy squat" }).waitFor()
ok("egen övning skapad från övningslistan och tillagd i dagen")

// ------------------------------------------------ 3. övningsbanken ---
await legs.locator("[data-testid=split-add-exercise]").click()
await picker.waitFor()
const search = picker.locator('input[aria-label="Sök övning"]')
const expect = [
  ["EZ-Bar Curl", "Biceps"],
  ["Axelpress i maskin", "Axlar"],
  ["Hip Thrust i maskin", "Säte"],
  ["Bulgarian Split Squats", "Ben"],
  ["Kickbacks", "Triceps"],
  ["Landmine Press på knä", "Axlar"],
]
for (const [name, group] of expect) {
  await search.fill(name)
  const row = picker.locator("ul[aria-label] li button", { hasText: name }).first()
  await row.waitFor()
  const text = await row.innerText()
  check(text.split("\n")[0].trim() === name && text.includes(group), `${name} finns, under ${group}`)
}
await search.fill("Bulgarian")
const bss = await picker.locator("ul[aria-label] li button", { hasText: "Bulgarian Split Squats" }).innerText()
check(!/hantel|hantlar|skivstång/i.test(bss) && (await picker.locator("ul[aria-label] li button", { hasText: "Bulgarian" }).count()) === 1, `Bulgarian Split Squats utan hantlar/skivstång (${bss.replace(/\n/g, " · ")})`)
await search.fill("")
await picker.locator("[data-group=sate] h3 button").click()
check((await picker.locator("[data-group=sate] li", { hasText: "Hip Thrust i maskin" }).count()) === 1, "muskelgruppslistan: Hip Thrust i maskin under Säte")
await p.keyboard.press("Escape")
check(await noOverflow(), "passbyggaren: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v43-passbyggare.png`, fullPage: true })

// Spara schemat: 4 dagar i veckan.
await p.click("[data-testid=days-per-week] [aria-label='4 dagar per vecka']")
await p.click("[data-testid=split-create]")
await p.waitForURL(/\/klient$/)
d = await demo()
const split = d.activeSplits.find((s) => s.clientId === "c1")
check(split.daysPerWeek === 4 && split.nextDay === 0, "schemat sparas med 4 dagar/vecka, Push på tur")
check(split.days[0].exercises[0].sets === 4 && split.days[0].exercises[0].reps === "6–8", "de egna siffrorna följer med (4 × 6–8)")
check(split.days[0].exercises.some((e) => e.exerciseId === landmine.id), "egna övningen ligger i schemat")

// -------------------------------------------------- 5b. Nästa pass ---
await p.waitForSelector("[data-testid=next-workout-day]:has-text('Push')")
check(/0 av 4 pass denna vecka|\d av 4 pass denna vecka/.test(await p.locator("[data-testid=week-progress]").innerText()), "veckans pass mot målet 4 dagar/vecka")
const workoutsBefore = (await demo()).workouts.length
await p.click("[data-testid=next-workout]")
await p.waitForURL(/\/klient\/pass\//)
const wid = p.url().split("/").at(-1)
d = await demo()
const started = d.workouts.find((w) => w.id === wid)
check(started?.name === "PPL: Push" && started.date === today && d.workouts.length === workoutsBefore + 1, `Nästa pass skapar och öppnar dagens pass (${started?.name})`)
check(started.exercises.some((e) => e.exerciseId === landmine.id), "passet innehåller schemats övningar")
check(d.activeSplits.find((s) => s.clientId === "c1").nextDay === 1, "Pull står nu på tur")
// Tillbaka utan att bli klar: samma pass öppnas igen (inget nytt).
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=next-workout-card] >> text=Påbörjat pass")
await p.click("[data-testid=next-workout]")
await p.waitForURL(new RegExp(`/klient/pass/${wid}$`))
check((await demo()).workouts.length === workoutsBefore + 1, "påbörjat pass öppnas igen – inget dubbelpass")
// Klart → nästa dag.
await p.evaluate((id) => {
  const s = JSON.parse(localStorage["coavira:demo:v5"])
  s.data.workouts = s.data.workouts.map((w) => (w.id === id ? { ...w, status: "completed", completedAt: new Date().toISOString() } : w))
  localStorage["coavira:demo:v5"] = JSON.stringify(s)
}, wid)
await p.goto(base + "/klient")
await p.reload()
await p.waitForSelector("[data-testid=next-workout-day]:has-text('Pull')")
ok("när passet är klart står Pull på tur")
check(/[1-9] av 4 pass denna vecka/.test(await p.locator("[data-testid=week-progress]").innerText()), "veckans pass räknas upp")
check(await noOverflow(), "startsidan: ingen horisontell overflow")

// ------------------------------- 1b. eget pass: tomt set-fält också ---
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-search", "knäböj")
await p.locator('ul[aria-label="Övningar att välja"] button').first().click()
const ownSets = p.locator('[role=dialog] input[aria-label="Set"]').first()
await ownSets.click()
await ownSets.press("Backspace")
await ownSets.blur()
check((await ownSets.inputValue()) === "", "eget pass: set-fältet blir tomt (ingen etta)")
await p.keyboard.press("Escape")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
