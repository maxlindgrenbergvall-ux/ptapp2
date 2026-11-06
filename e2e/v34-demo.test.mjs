// E2E för v34 i demoläge (mobil 390 px):
//   1. användaravtalet i intro-flödet (obligatoriskt, ett godkännande) + nyhetsbrev (valfritt) + Inställningar,
//   2. den dynamiska viktkurvan (uppmätt förbränning och träningsfrekvens),
//   3. drag-and-drop av övningar under passet (mus/touch och tangentbord), raka set, "Som förra passet", ta bort set,
//   4. drag-and-drop och redigering av set/reps/startvikt i splitbyggaren,
//   5. /avtal – hela avtalet på en sida.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v34-demo.test.mjs [skärmdumpsmapp]
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

/** Dra ett handtag till ett annat element med musen (pekare – samma väg som touch i appen). */
async function drag(handle, target) {
  const a = await handle.boundingBox()
  const b = await target.boundingBox()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 })
  await p.mouse.move(a.x + a.width / 2, b.y + b.height / 2 + 4, { steps: 12 })
  await p.waitForTimeout(150)
  await p.mouse.up()
  await p.waitForTimeout(250)
}

// ------------------------------------------------ 1. användaravtalet ---
await p.goto(base + "/klient/intro")
await p.waitForSelector("[data-testid=profile-step]")
await p.click("[data-testid=intro-next]")
await p.fill("#goal-weightKg", "")
await p.fill("#goal-weightKg", "84")
await p.fill("#goal-heightCm", "180")
await p.fill("#goal-age", "32")
await p.click('[role=radio]:has-text("Man")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=activity-picker] [role=radio]:has-text("Medel")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=goal-picker] button:has-text("Viktnedgång")')
await p.click("[data-testid=intro-next]")
await p.waitForSelector("[data-testid=goal-results]")
await p.fill("#goal-target", "78")
await p.click("[data-testid=intro-next]")
await p.waitForSelector("[data-testid=agreement-step]")
check((await p.locator("[data-testid=goal-intro] h1").innerText()).includes("avtalet"), "sista steget i intro-flödet är avtalet")
const parts = await p.locator('[aria-label="Avtalet består av"] li').allInnerTexts()
check(parts.length === 2 && /Användarvillkor/.test(parts[0]) && /Integritetspolicy/.test(parts[1]), "ett avtal: användarvillkor + integritetspolicy")
check((await p.locator("[data-testid=agreement-step] [role=checkbox]").count()) === 2, "en bock för avtalet, en för nyhetsbrevet")
check((await p.getAttribute("[data-testid=marketing-consent]", "aria-checked")) === "false", "nyhetsbrevet är inte förkryssat")
await p.click("[data-testid=intro-next]")
check(await p.locator("#accept-agreement-error").isVisible(), "det går inte att gå vidare utan att godkänna")
check(new URL(p.url()).pathname === "/klient/intro", "stannar på avtalssteget")
await p.screenshot({ path: `${out}/v34-avtal-fel.png`, fullPage: true })
await p.click("[data-testid=accept-agreement]")
await p.click("[data-testid=marketing-consent]")
check(await noOverflow(), "avtalssteget: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v34-avtal.png`, fullPage: true })
await p.click("[data-testid=intro-next]")
await p.waitForURL(base + "/klient")
check(await p.evaluate(() => Boolean(localStorage["coavira:demo:agreement"]) && localStorage["coavira:demo:marketing"] === "1"), "avtal och nyhetsbrev sparas (demo)")
check((await demo()).goalProfiles.some((g) => g.clientId === "c1" && g.targetWeightKg === 78), "målen sparas efter avtalet")
// Redan godkänt: steget visas inte igen när intro-flödet görs om.
await p.goto(base + "/klient/intro")
await p.waitForSelector("[data-testid=profile-step]")
check((await p.locator("text=/Steg 1 av 5/").count()) === 1, "godkänt avtal: intro-flödet har fem steg igen")
// Inställningar: nyhetsbrevet kan stängas av.
await p.goto(base + "/klient/installningar")
await p.waitForSelector("[data-testid=marketing-settings]")
await p.waitForFunction(() => document.querySelector("[data-testid=marketing-toggle]")?.getAttribute("aria-checked") === "true")
ok("Inställningar visar valt nyhetsbrev")
await p.click("[data-testid=marketing-toggle]")
await p.waitForFunction(() => localStorage["coavira:demo:marketing"] === "0")
ok("nyhetsbrevet kan stängas av när som helst")

// -------------------------------------------------- 2. dynamisk viktkurva ---
await p.goto(base + "/klient/profil/mal")
// v41: Mål visar samma rena vy som Framsteg – källraden ersätter den gamla informationsrutan.
await p.waitForSelector("[data-testid=progress-curve] [data-testid=goal-chart][data-adaptive='1']")
ok("uppdaterad prognos ritas i grafen")
const sources = await p.locator("[data-testid=progress-curve] [data-testid=curve-sources]").innerText()
check(/Uppdaterad med/.test(sources) && /Strava/.test(sources), `kurvan bygger på synkad/loggad träning, källan visas (${sources})`)
check(/[\d\s ]+ kcal\/dag/.test(sources), "uppmätt förbränning (kcal/dag)")
check(Number(sources.match(/([\d,]+) pass\/v/)?.[1].replace(",", ".")) > 0, "träningsfrekvensen räknas (pass/vecka)")
check((await p.locator("[data-testid=adaptive-curve], [data-testid=goal-info]").count()) === 0, "inga extra paneler runt grafen")
await p.screenshot({ path: `${out}/v34-viktkurva.png`, fullPage: true })
await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=progress-curve] [data-testid=goal-chart][data-adaptive='1']")
check(/Strava/.test(await p.locator("[data-testid=curve-sources]").innerText()), "samma kurva under Framsteg (källan Strava)")

// ---------------------------------- 3. pass: drag-and-drop och raka set ---
await p.goto(base + "/klient")
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-name", "DnD-pass")
for (const q of ["conventional deadlift", "bench press", "hip thrust"]) {
  await p.fill("#own-search", q)
  await p.locator('ul[aria-label="Övningar att välja"] button').first().click()
}
await p.click('[role=dialog] button:has-text("Starta passet")')
await p.waitForURL(/\/klient\/pass\//)
await p.waitForSelector("[data-testid=drag-handle]")
const order = async () => (await demo()).workouts.find((w) => w.name === "DnD-pass").exercises.map((e) => e.exerciseId)
const start = await order()
check(start.length === 3 && (await p.locator("[data-testid=drag-handle]").count()) === 3, "varje övning har ett draghandtag")
// Mus/touch: dra den sista överst.
const handles = p.locator("[data-testid=drag-handle]")
await drag(handles.nth(2), p.locator("[data-sortable-id]").first())
let now = await order()
check(now[0] === start[2] && now.length === 3, `dra och släpp: sista övningen ligger nu först (${now.join(", ")})`)
// Tangentbord: fokusera handtaget och tryck pil ned.
await handles.nth(0).focus()
await p.keyboard.press("ArrowDown")
await p.waitForTimeout(300)
now = await order()
check(now[1] === start[2], `tangentbord: övningen flyttades ett steg ned (${now.join(", ")})`)
await p.screenshot({ path: `${out}/v34-dnd-pass.png`, fullPage: true })

// Raka set: alla set får samma mål (ingen stegring mellan seten).
const deadliftCard = p.locator("section", { has: p.locator("text=Conventional Deadlift") }).first()
if ((await p.locator('input[aria-label="Vikt set 1 (kg)"]').count()) === 0) await deadliftCard.locator("button[aria-expanded]").first().click()
await p.waitForSelector('input[aria-label="Vikt set 1 (kg)"]')
const kg = async (n) => Number((await p.locator(`input[aria-label="Vikt set ${n} (kg)"]`).first().inputValue()).replace(",", "."))
check((await kg(1)) > 0 && (await kg(1)) === (await kg(3)), `raka set: set 1 = set 3 = ${await kg(1)} kg (ingen automatisk stegring)`)
// Egen vikt på set 1 följer med till set 2 när set 1 bockas av.
await p.fill('input[aria-label="Vikt set 1 (kg)"]', "100")
await p.locator('input[aria-label="Vikt set 1 (kg)"]').blur()
await p.click('button[aria-label="Bocka av set 1"]')
if (await p.locator("[role=timer]").count()) await p.click('[role=timer] button:has-text("Hoppa över")')
check((await kg(2)) === 100, "egen startvikt (100 kg) följer med till nästa set")
// Som förra passet: set för set ur historiken.
if (await p.locator("[data-testid=fill-last-session]").count()) {
  await p.locator("[data-testid=fill-last-session]").first().click()
  ok("Som förra passet fyller i seten ur historiken")
}
// Ta bort set (eget pass).
const setsBefore = (await demo()).workouts.find((w) => w.name === "DnD-pass").exercises.find((e) => e.exerciseId === "e-deadlift").sets
await p.locator("[data-testid=remove-set]").first().click()
const setsAfter = (await demo()).workouts.find((w) => w.name === "DnD-pass").exercises.find((e) => e.exerciseId === "e-deadlift").sets
check(setsAfter === setsBefore - 1, `ta bort set: ${setsBefore} → ${setsAfter}`)
check(await noOverflow(), "passvyn: ingen horisontell overflow")

// ------------------------------------- 4. splitbyggaren: dra och redigera ---
await p.goto(base + "/klient/schema")
// v43: demoklienten har ett aktivt schema – byt för att komma till splitbiblioteket.
await p.waitForSelector("[data-testid=active-split], [data-testid=split-library]")
if (await p.locator("[data-testid=change-split]").isVisible()) await p.click("[data-testid=change-split]")
await p.click("[data-testid=split-ppl]")
await p.waitForSelector("[data-testid=split-editor]")
const push = p.locator("[data-testid=split-day]").first()
const names = async () => push.locator("[data-testid=split-exercise] span.truncate").allInnerTexts()
const before = await names()
// Hela Push-dagen i bild (dragningen sker med skärmkoordinater).
await push.evaluate((el) => el.scrollIntoView({ block: "start" }))
await drag(push.locator("[data-testid=drag-handle]").nth(before.length - 1), push.locator("[data-sortable-id]").first())
const after = await names()
check(after[0] === before.at(-1), `split: sista övningen i Push dras överst (${after[0]})`)
await push.locator(`input[aria-label="Set för ${after[0]}"]`).fill("5")
await push.locator(`input[aria-label="Reps för ${after[0]}"]`).fill("5–7")
await push.locator(`input[aria-label="Startvikt (kg) för ${after[0]}"]`).fill("40")
await p.screenshot({ path: `${out}/v34-split-redigera.png`, fullPage: true })
await p.click("[data-testid=split-create]")
await p.waitForURL(/\/klient$/)
const created = (await demo()).activeSplits.find((s) => s.clientId === "c1").days[0]
const first = created?.exercises[0]
check(first && first.sets === 5 && first.reps === "5–7" && first.targetKg === 40, `ordning, set, reps och startvikt följer med (${first?.sets} × ${first?.reps}, ${first?.targetKg} kg)`)
check(created?.exercises.every((e) => !("_key" in e) && !("id" in e)), "inga interna fält i schemat")

// ----------------------------------------------------------- 5. /avtal ---
await p.goto(base + "/avtal")
check((await p.locator("[data-testid^=agreement-part-]").count()) === 2, "/avtal: klientens avtal i två delar")
await p.goto(base + "/avtal/pt")
check((await p.locator("[data-testid^=agreement-part-]").count()) === 3, "/avtal/pt: PT-avtalet och GDPR som del 3")
check(await noOverflow(), "/avtal: ingen horisontell overflow")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
