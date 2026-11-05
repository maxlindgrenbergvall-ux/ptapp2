// E2E för v24 i demoläge: chatten i headern, Recept-fliken, ren Dagens kost
// utan betalvägg, gratis nyckeltal (tyngsta set per lyft, veckovolym),
// engelska övningsnamn, tömbara sifferfält, rep-mål per set, ordning på
// övningar och redigering av ett genomfört pass.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v24-loggning.test.mjs [skärmdumpsmapp]
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
const patchDemo = (fn) =>
  p.evaluate((src) => {
    const s = JSON.parse(localStorage["coavira:demo:v5"])
    s.data = new Function("d", `return (${src})(d)`)(s.data)
    localStorage["coavira:demo:v5"] = JSON.stringify(s)
  }, fn.toString())
const toast = (text) => p.waitForSelector(`[data-sonner-toast] >> text=${text}`)

// -------------------------------------------- 1. header och bottenmeny ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
check(await p.locator("header [data-testid=header-chat]").isVisible(), "chatten ligger uppe till höger i headern")
check(await p.locator('header a[aria-label="Profilinställningar"]').isVisible(), "profilen ligger bredvid varukorgen")
const nav = p.locator('nav[aria-label="Huvudmeny"]')
check((await nav.locator("text=Recept").count()) === 1 && (await nav.locator("text=Chatt").count()) === 0, "Recept har ersatt Chatt i bottenmenyn")
await p.click("header [data-testid=header-chat]")
await p.waitForURL("**/klient/chatt")
ok("chattikonen öppnar chatten")
await p.screenshot({ path: `${out}/v24-header.png` })

// ------------------------------------------------------------ 2. recept ---
// (Receptbiblioteket testas i detalj i v26-receptbibliotek.)
await nav.locator("text=Recept").click()
await p.waitForURL("**/klient/recept")
await p.waitForSelector("text=Overnight oats med bär")
check(/355 kcal/.test(await p.locator("[data-testid=recipe-card]", { hasText: "Overnight oats med bär" }).innerText()), "makron räknas per portion (710 kcal / 2 portioner)")
await p.locator("[data-testid=recipe-card] button", { hasText: "Overnight oats med bär" }).click()
await p.click("[data-testid=log-recipe]")
await p.click("[data-testid=confirm-log]")
await toast("är loggat")
check((await demo()).foodEntries.some((e) => e.name.startsWith("Overnight oats med bär") && e.kcal === 355), "en portion loggas i Dagens kost")
await p.keyboard.press("Escape")
await p.screenshot({ path: `${out}/v24-recept.png`, fullPage: true })

// ---------------------------------- 3. Dagens kost utan betalvägg + Plus ---
await patchDemo((d) => ({
  ...d,
  purchases: d.purchases.map((x) => ({ ...x, includesNutrition: false })),
  accounts: { ...d.accounts, c1: { ...d.accounts.c1, plusUntil: undefined, plusLifetime: false } },
}))
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=day-summary]")
check((await p.locator("[data-testid=nutrition-lock]").count()) === 0, "ingen stor kostbetalvägg på startsidan")
check(await p.locator("[data-testid=nutrition-coaching-hint]").isVisible(), "kostcoaching erbjuds med en diskret länk")
const sleepLock = p.locator("[data-testid=plus-lock][data-feature=sleep]")
check((await sleepLock.boundingBox()).height < 80, "sömnlåset är en diskret rad, ingen suddig betalvägg")
await p.screenshot({ path: `${out}/v24-idag-utan-betalvagg.png`, fullPage: true })

// ------------------------------------------------ 4. nyckeltal (gratis) ---
await p.goto(base + "/klient/framsteg")
// v40: Framsteg har bara korten och kurvan – lyften visas i övningshistoriken (engelska namn, vikt × reps).
await p.waitForSelector("[data-testid=progress-cards]")
check((await p.locator("[data-testid=kpi-lifts], [data-testid=kpi-volume]").count()) === 0, "inga lyft-KPI:er eller veckovolym i Framsteg (v40)")
check((await p.locator("[data-testid=plus-lock][data-feature=charts]").count()) === 0, "framstegen är gratis utan Plus")
await p.goto(base + "/klient/framsteg/ovning/e-squat")
await p.waitForSelector("h1:has-text('Back Squat')")
check(/\d+(,\d+)? kg × \d+/.test(await p.locator("main").innerText()), "faktiska lyft: vikt × reps (inga uppskattade värden)")
await p.screenshot({ path: `${out}/v24-framsteg.png`, fullPage: true })

// --------------------------------- 5. loggning: tomma fält och ordning ---
const today = await p.evaluate(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})
const todays = (await demo()).workouts.find((w) => w.clientId === "c1" && w.date === today && w.status !== "completed" && w.exercises.length > 1)
if (!todays) fail("dagens pass saknas i demodatan")
else {
  // Pyramid på första övningen: 12/10/8.
  await patchDemo(`(d) => ({ ...d, workouts: d.workouts.map((w) => w.id === "${todays.id}" ? { ...w, exercises: w.exercises.map((e, i) => i === 0 ? { ...e, sets: 3, setReps: ["12", "10", "8"] } : e) } : w) })`)
  await p.goto(`${base}/klient/pass/${todays.id}`)
  await p.waitForSelector("text=Avsluta")
  check(await p.locator("text=/3 × 12\\/10\\/8/").first().isVisible(), "rep-mål per set visas (3 × 12/10/8)")
  const reps2 = p.locator('input[aria-label="Reps set 2 (reps)"]').first()
  check((await reps2.inputValue()) === "10", "set 2 föreslås med sitt eget mål (10 reps)")
  const reps1 = p.locator('input[aria-label="Reps set 1 (reps)"]').first()
  await reps1.fill("")
  await p.waitForTimeout(150)
  check((await reps1.inputValue()) === "", "reps-fältet kan tömmas helt utan att hoppa tillbaka")
  await p.locator('button[aria-label="Bocka av set 1"]').first().click()
  await toast("Fyll i reps")
  check((await reps1.getAttribute("aria-invalid")) === "true", "valideringen sker när setet sparas")
  await reps1.fill("11")
  await p.locator('button[aria-label="Bocka av set 1"]').first().click()
  await p.waitForTimeout(200)
  const logged = (await demo()).workouts.find((w) => w.id === todays.id).logs.find((l) => l.setIndex === 0 && l.workoutExerciseId === todays.exercises[0].id)
  check(logged?.reps === 11 && logged.done, "valfritt värde (11) sparas")

  const before = (await demo()).workouts.find((w) => w.id === todays.id).exercises.map((e) => e.id)
  // v34: drag-and-drop via handtaget (här med tangentbordet: pil ned).
  await p.locator("[data-testid=drag-handle]").first().focus()
  await p.keyboard.press("ArrowDown")
  await p.waitForTimeout(300)
  const after = (await demo()).workouts.find((w) => w.id === todays.id).exercises.map((e) => e.id)
  check(after[0] === before[1] && after[1] === before[0], `handtaget flyttar övningen (ny ordning sparas): ${before.join(",")} → ${after.join(",")}`)
  await p.screenshot({ path: `${out}/v24-logger.png`, fullPage: true })
}

// ------------------------------------- 6. redigera ett genomfört pass ---
const done = (await demo()).workouts.find((w) => w.clientId === "c1" && w.status === "completed" && !w.verifiedAt && w.logs.some((l) => l.done && l.kg > 0))
if (!done) fail("genomfört pass saknas i demodatan")
else {
  await p.goto(`${base}/klient/pass/${done.id}`)
  await p.click("[data-testid=edit-workout]")
  await p.waitForSelector("[data-testid=workout-editor]")
  const kg = p.locator('[data-testid=workout-editor] input[aria-label^="Vikt set 1,"]').first()
  await kg.fill("")
  await p.click('[data-testid=workout-editor] button:has-text("Spara")')
  await toast("Fyll i vikt")
  ok("tom vikt i ett genomfört set stoppas när passet sparas")
  await kg.fill("102,5")
  await p.locator('[data-testid=workout-editor] textarea').fill("Rättat i efterhand")
  await p.click('[data-testid=workout-editor] button:has-text("Spara")')
  await toast("Passet är uppdaterat")
  const edited = (await demo()).workouts.find((w) => w.id === done.id)
  check(edited.logs.some((l) => l.kg === 102.5) && edited.clientComment === "Rättat i efterhand", "ändringarna sparas (edit_completed_workout)")
  check(edited.status === "completed", "passet är fortfarande genomfört")
}

// Klarmarkerat av PT:n = låst.
const verified = (await demo()).workouts.find((w) => w.clientId === "c1" && w.verifiedAt)
if (verified) {
  await p.goto(`${base}/klient/pass/${verified.id}`)
  await p.waitForSelector("[data-testid=workout-verified]")
  check((await p.locator("[data-testid=edit-workout]").count()) === 0, "ett klarmarkerat pass kan inte redigeras")
}

// ---------------------------------------- 7. passbyggaren (PT) ---
const d = await browser.newPage({ viewport: { width: 1280, height: 900 } })
d.on("pageerror", (e) => errors.push(`${d.url()} pageerror: ${e.message}`))
await d.goto(base + "/pt/pass")
await d.waitForSelector("text=Övningsbank >> visible=true")
const sets = d.locator('label:has-text("Set") input').first()
await sets.fill("")
await d.waitForTimeout(150)
check((await sets.inputValue()) === "", "Set-fältet i passbyggaren kan tömmas")
await d.getByRole("button", { name: "Spara", exact: true }).first().click()
await d.waitForSelector("[data-sonner-toast] >> text=Fyll i antal set")
ok("tomt Set-fält stoppas först när mallen sparas")
await sets.fill("4")
await d.locator('button:has-text("Olika reps per set")').first().click()
const perSet = d.locator('ol[aria-label^="Rep-mål per set"] input')
check((await perSet.count()) === 4, "ett rep-mål per set (4 set)")
await perSet.nth(0).fill("12")
await perSet.nth(1).fill("10")
await perSet.nth(2).fill("8")
await perSet.nth(3).fill("6")
await d.locator('button[aria-label^="Flytta ned"]').first().click()
await d.getByRole("button", { name: "Spara", exact: true }).first().click()
await d.waitForSelector("[data-sonner-toast] >> text=Mallen är sparad")
const tpl = (await d.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)).templates.find((t) => t.exercises.some((e) => e.setReps?.join("/") === "12/10/8/6"))
check(Boolean(tpl), "mallen sparas med rep-mål per set (12/10/8/6)")
check(tpl && tpl.exercises[1].setReps?.join("/") === "12/10/8/6", "pilen flyttade övningen ett steg ned")
check(await d.locator("text=Romanian Deadlift >> visible=true").first().isVisible().catch(() => false) || (await d.locator("text=Back Squat >> visible=true").count()) > 0, "passbyggaren visar engelska övningsnamn")
await d.fill('input[aria-label="Sök övning"] >> visible=true', "knäböj")
check((await d.locator('button:has-text("Back Squat") >> visible=true').count()) >= 1, "svenska sökord hittar engelska namn (knäböj → Back Squat)")
await d.screenshot({ path: `${out}/v24-passbyggare.png`, fullPage: true })

console.log(errors.length ? errors.join("\n") : "ok   inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
