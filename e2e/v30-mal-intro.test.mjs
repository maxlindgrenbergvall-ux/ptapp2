// E2E för v30 i demoläge: intro-flödet (mått → aktivitet → mål → plan),
// aggressivitetsreglaget räknar om kalorimålet och grafen i realtid, två
// linjer vid flera mål, Profil → Mål, dagsmålet i kostdagboken, PT:ns vy och
// friskrivningen – på mobil (390 px) utan horisontell overflow.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v30-mal-intro.test.mjs [skärmdumpsmapp]
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
const DISCLAIMER = "Obs: Alla uppskattningar, kaloriberäkningar och grafer baseras på genomsnittliga formler."

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const kcal = async () => Number((await p.locator("[data-testid=goal-kcal]").innerText()).replace(/\D/g, ""))

// ---------------------------------------------- 1. välkomststeget → intro ---
await p.goto(base + "/valkommen")
await p.locator("#consent").check().catch(() => p.click("label[for=consent]"))
await p.click('button:has-text("Kom igång")')
await p.waitForURL(/\/klient\/intro$/)
await p.waitForSelector("[data-testid=goal-intro]")
ok("efter välkomststeget kommer klienten till intro-flödet")
check((await p.locator("nav[aria-label=Huvudmeny]").count()) === 0, "intro-flödet tar hela skärmen (ingen bottenmeny)")
// v31: steg 1 (namn och profilbild) först – förifyllt från profilen.
await p.waitForSelector("[data-testid=profile-step]")
await p.click("[data-testid=intro-next]")
await p.waitForSelector("text=Dina mått")
check((await p.locator("[data-testid=goal-disclaimer]").innerText()).includes(DISCLAIMER), "friskrivningen syns längst ned i intro-flödet")

// ------------------------------------------------------------ 2. mått ---
await p.click("[data-testid=intro-next]")
check((await p.locator("[role=alert]").count()) >= 3, "tomma fält stoppas med tydliga fel")
await p.fill("#goal-weightKg", "")
await p.fill("#goal-weightKg", "82,5")
await p.fill("#goal-heightCm", "178")
await p.fill("#goal-age", "31")
await p.click('[role=radio]:has-text("Man")')
await p.screenshot({ path: `${out}/v30-intro-1-matt.png` })
check(await noOverflow(), "steg 1: ingen horisontell overflow")
await p.click("[data-testid=intro-next]")

// ------------------------------------------------------- 3. aktivitet ---
await p.waitForSelector("text=Hur aktiv är du?")
await p.click('[data-testid=activity-picker] [role=radio]:has-text("Medel")')
await p.screenshot({ path: `${out}/v30-intro-2-aktivitet.png` })
await p.click("[data-testid=intro-next]")

// --------------------------------------------------------------- 4. mål ---
await p.waitForSelector("text=Vad vill du uppnå?")
await p.click('[data-testid=goal-picker] button:has-text("Viktnedgång")')
check((await p.locator('[data-testid=goal-picker] button[aria-pressed=true]').count()) === 1, "ett mål valt")
await p.screenshot({ path: `${out}/v30-intro-3-mal.png` })
await p.click("[data-testid=intro-next]")

// ---------------------------------------------- 5. planen och reglaget ---
await p.waitForSelector("[data-testid=goal-results]")
// Mifflin-St Jeor: 10×82,5 + 6,25×178 − 5×31 + 5 = 1 787,5 → × 1,55 = 2 771 kcal; −0,5 kg/v = −550 kcal.
const std = await kcal()
check(Math.abs(std - 2220) <= 10, `standardtakten −0,5 kg/v ger ${std} kcal (TDEE 2 771 − 550)`)
check((await p.locator("[data-testid=rate-value]").innerText()).includes("−0,5"), "reglaget står på standard (−0,5 kg/vecka)")
check((await p.locator("[data-testid=goal-chart]").getAttribute("data-series")) === "weightDelta", "ett mål: en linje (vikt)")
await p.screenshot({ path: `${out}/v30-intro-4-plan.png`, fullPage: true })
// Dra reglaget till intensiv (−1,0) – kalorimålet sjunker direkt.
const slider = p.locator("#goal-rate")
await slider.focus()
await slider.press("End")
await p.waitForFunction(() => document.querySelector("[data-testid=rate-value]")?.textContent?.includes("−1"))
const intense = await kcal()
check(intense < std, `intensiv −1,0 kg/v: ${intense} kcal (räknas om i realtid)`)
// −1 100 kcal/dag skulle hamna under BMR (1 788 kcal) – golvet slår till och den faktiska takten visas.
const warnings = await p.locator("[data-testid=goal-warnings]").innerText()
check(intense === 1790 && /Underskottet begränsas/.test(warnings) && /Takten blir då ungefär −0,9/.test(warnings), "energigolvet: aldrig under BMR, faktisk takt visas")
await p.click('[data-testid=rate-slider] button:has-text("Skonsam")')
const gentle = await kcal()
check(gentle > std && Math.abs(gentle - std - 275) <= 10, `skonsam −0,25 kg/v: ${gentle} kcal`)
await p.click('[data-testid=rate-slider] button:has-text("Standard")')
// Målvikt → när den nås.
await p.fill("#goal-target", "76")
await p.waitForSelector("[data-testid=goal-reached]")
check(/\d+ veckor/.test(await p.locator("[data-testid=goal-reached]").innerText()), `målvikten nås: "${await p.locator("[data-testid=goal-reached]").innerText()}"`)
check((await p.locator("[data-testid=goal-macros] li").count()) === 3, "makron (protein, kolhydrater, fett) visas")
check(await noOverflow(), "planen: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v30-intro-5-malvikt.png`, fullPage: true })
// Tillbaka och lägg till muskelmassa → två linjer i samma diagram.
await p.click('button[aria-label="Föregående steg"]')
await p.click('[data-testid=goal-picker] button:has-text("Ökad muskelmassa")')
await p.click("[data-testid=intro-next]")
await p.waitForSelector("[data-testid=goal-chart]")
check((await p.locator("[data-testid=goal-chart]").getAttribute("data-series")) === "fatDelta,leanDelta", "viktnedgång + muskelmassa: två linjer (fett och muskler)")
await p.locator("[data-testid=goal-chart]").scrollIntoViewIfNeeded()
await p.waitForFunction(() => document.querySelectorAll("[data-testid=goal-chart] .recharts-line").length > 0)
check((await p.locator("[data-testid=goal-chart] .recharts-line").count()) === 2, "båda linjerna ritas i samma diagram")
check(/fett −.*muskler \+/.test(await p.locator("[data-testid=goal-summary]").innerText()), `sammanfattning: "${await p.locator("[data-testid=goal-summary]").innerText()}"`)
await p.screenshot({ path: `${out}/v30-intro-6-tva-grafer.png`, fullPage: true })
await p.click("[data-testid=intro-next]")
await p.waitForURL(base + "/klient")
let d = await demo()
const saved = d.goalProfiles.find((g) => g.clientId === "c1")
check(saved?.goals.join() === "weight_loss,muscle_gain" && saved.heightCm === 178 && saved.currentWeightKg === 82.5 && saved.targetWeightKg === 76, "målen sparas (mål, mått, målvikt)")
check(saved?.weeklyChangeKg === -0.5 && saved.targets.kcal === 2220, `rekomp: takten −0,5 kg/v ryms i rekompens intervall och behålls (${saved?.targets.kcal} kcal)`)
check(d.clients.find((c) => c.id === "c1").weightLog.at(-1).kg === 82.5, "vikten loggas i viktkurvan")

// ------------------------------------------- 6. dagsmålet i kostdagboken ---
check((await p.locator("[data-testid=goal-intro-banner]").count()) === 0, "påminnelsen om målen försvinner när de är satta")
const own = p.locator("[data-testid=own-nutrition-goal]")
if (await own.count()) {
  check((await own.innerText()).includes(String(saved.targets.kcal).replace(/\B(?=(\d{3})+(?!\d))/g, " ")) || (await own.innerText()).includes(String(saved.targets.kcal)), "kostdagboken använder det beräknade dagsmålet")
} else {
  ok("kostdagboken följer PT:ns kostschema (det går före det egna dagsmålet)")
}

// ------------------------------------------------------ 7. Profil → Mål ---
await p.goto(base + "/klient/profil")
await p.click("[data-testid=profile-goals-link]")
await p.waitForURL(/\/klient\/profil\/mal$/)
await p.waitForSelector("[data-testid=goal-settings]")
check((await p.locator("[data-testid=goal-disclaimer]").innerText()).includes(DISCLAIMER), "friskrivningen finns i Profil → Mål")
const before = await kcal()
await p.fill("#goal-weightKg", "80")
await p.waitForTimeout(100)
check((await kcal()) < before, "ny vikt räknar om kalorimålet direkt")
await p.locator('[data-testid=goal-picker] button:has-text("Ökad muskelmassa")').click()
check((await p.locator("[data-testid=goal-chart]").getAttribute("data-series")) === "weightDelta", "bara viktnedgång kvar: en linje")
await p.click('[data-testid=rate-slider] button:has-text("Intensiv")')
check((await p.locator("text=Osparat").count()) >= 1, "ändringar markeras som osparade")
await p.screenshot({ path: `${out}/v30-profil-mal.png`, fullPage: true })
check(await noOverflow(), "Profil → Mål: ingen horisontell overflow")
await p.click("[data-testid=goals-save]")
await p.waitForSelector("text=Målen är uppdaterade")
d = await demo()
const upd = d.goalProfiles.find((g) => g.clientId === "c1")
check(upd.goals.join() === "weight_loss" && upd.weeklyChangeKg === -1 && upd.currentWeightKg === 80, "uppdaterade mål, vikt och takt sparas")
check(upd.startWeightKg === 80, "nya mål = ny period (startvikt = nuvarande vikt)")
check(d.clients.find((c) => c.id === "c1").weightLog.at(-1).kg === 80, "den nya vikten loggas i viktkurvan")

// --------------------------------------------------------- 8. PT:ns vy ---
await p.goto(base + "/pt/klienter/c3")
await p.waitForSelector("[data-testid=client-goal-summary]")
const summary = await p.locator("[data-testid=client-goal-summary]").innerText()
check(summary.includes("Viktnedgång") && summary.includes("Ökad muskelmassa") && /kcal per dag/.test(summary), "PT:n ser klientens mål och kalorimål")
check((await p.locator("[data-testid=client-goal-summary] [data-testid=goal-chart]").getAttribute("data-series")) === "fatDelta,leanDelta", "PT:n ser samma prognos (två linjer)")
await p.screenshot({ path: `${out}/v30-pt-klientens-mal.png`, fullPage: true })

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
