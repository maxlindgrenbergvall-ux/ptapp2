// E2E för v40 i demoläge (mobil 390 px): Framsteg visar bara två kort
// (Viktnedgång / Tappat fett och Ökad muskelmassa) och en stor viktkurva under.
//   BASE_URL=http://localhost:3000 node e2e/v40-framsteg.test.mjs [skärmdumpsmapp]
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

await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
// Demoklienten med mål (viktnedgång), som efter intro-flödet.
await p.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:demo:v5"])
  s.data.goalProfiles = s.data.goalProfiles.filter((g) => g.clientId !== "c1")
  const mira = s.data.goalProfiles[0]
  const start = new Date(Date.now() - 42 * 86400000).toISOString().slice(0, 10)
  s.data.goalProfiles.push({ ...mira, clientId: "c1", goals: ["weight_loss"], startWeightKg: 84, currentWeightKg: 84, targetWeightKg: 78, weeklyChangeKg: -0.5, startedAt: start })
  localStorage["coavira:demo:v5"] = JSON.stringify(s)
})

// ------------------------------------------- 1. bara två kort + grafen ---
await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=progress-curve] .recharts-line")
const main = p.locator("main")
check((await p.locator("[data-testid=progress-cards] > div").count()) === 2, "exakt två kort")
check((await p.locator("[data-testid=card-fat]").innerText()).includes("Viktnedgång"), "kort 1: Viktnedgång")
check((await p.locator("[data-testid=card-muscle]").innerText()).includes("Ökad muskelmassa"), "kort 2: Ökad muskelmassa")
check(/[+−±]\d/.test(await p.locator("[data-testid=card-muscle-value]").innerText()), "muskelmassa: ett beräknat värde i kg")
const t = await main.innerText()
check(!/\b(e?1RM)\b|Veckovolym|Styrkeutveckling|Träningsfrekvens|Senaste passen|Genomförda pass|Veckor i rad|Dina mål/i.test(t), "inga andra kort/widgets (1RM, veckovolym, styrkeutveckling …)")
check((await p.locator("[data-testid=kpi-lifts], [data-testid=kpi-volume], [data-testid=goal-overview], [data-testid=goal-info]").count()) === 0, "de gamla komponenterna finns inte kvar")
// Grafen direkt under korten, stor och i full bredd.
const cards = await p.locator("[data-testid=progress-cards]").boundingBox()
const curve = await p.locator("[data-testid=progress-curve]").boundingBox()
const chart = await p.locator("[data-testid=progress-curve] [data-testid=goal-chart]").boundingBox()
check(curve.y > cards.y + cards.height && curve.y - (cards.y + cards.height) < 30, "grafen ligger direkt under korten")
check(chart.height >= 260 && chart.width >= 330, `stor graf (${Math.round(chart.width)}×${Math.round(chart.height)} px)`)
check((await p.locator("[data-testid=progress-curve] .recharts-line").count()) >= 3, "plan, uppdaterad kurva och vägningar i samma graf")
check(/Följer planen|Uppdaterad med/.test(await p.locator("[data-testid=curve-sources]").innerText()), "källraden under grafen (Apple Hälsa/Health Connect/Strava)")
// Inga lådor inuti grafsektionen utöver själva grafen.
check((await p.locator("[data-testid=progress-curve] .rounded-xl, [data-testid=progress-curve] .rounded-2xl").count()) === 0, "inga extra boxar runt eller under grafen")
check(await noOverflow(), "ingen horisontell overflow (390 px)")
await p.screenshot({ path: `${out}/v40-framsteg.png`, fullPage: true })

// ------------------------------------------- 2. logga vikt från grafen ---
await p.click("[data-testid=log-weight]")
const dlg = p.getByRole("dialog", { name: "Dagens vikt" })
await dlg.getByLabel("Dagens vikt i kg").fill("82,4")
await dlg.getByRole("button", { name: "Spara" }).click()
await p.waitForSelector("text=Vikten är sparad")
const today = new Date().toLocaleDateString("sv-SE")
check((await demo()).clients.find((c) => c.id === "c1").weightLog.some((e) => e.date === today && e.kg === 82.4), "vikten sparas")
await p.waitForFunction(() => /−1,6 kg/.test(document.querySelector("[data-testid=card-fat-value]")?.textContent ?? ""))
check(/kvar till 78 kg/.test(await p.locator("[data-testid=card-fat]").innerText()), "kortet uppdateras: −1,6 kg, kvar till målvikten")

// ------------------------------ 3. annat mål: Tappat fett i stället ---
await p.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:demo:v5"])
  s.data.goalProfiles = s.data.goalProfiles.map((g) => (g.clientId === "c1" ? { ...g, goals: ["muscle_gain"], weeklyChangeKg: 0.25, targetWeightKg: 90 } : g))
  localStorage["coavira:demo:v5"] = JSON.stringify(s)
})
await p.reload()
await p.waitForSelector("[data-testid=card-fat]")
check((await p.locator("[data-testid=card-fat]").innerText()).includes("Tappat fett"), "muskelmål: första kortet blir Tappat fett")
check((await p.locator("[data-testid=progress-cards] > div").count()) === 2, "fortfarande två kort")

// ------------------------- 4. övningshistoriken nås från passet ---
const d = await demo()
const done = new Set(d.workouts.filter((w) => w.clientId === "c1" && w.status === "completed").flatMap((w) => w.exercises.map((e) => e.exerciseId)))
const w = d.workouts.find((x) => x.clientId === "c1" && x.status !== "completed" && x.exercises.some((e) => done.has(e.exerciseId)))
await p.goto(`${base}/klient/pass/${w.id}`)
const link = p.locator("[data-testid=exercise-history-link]").first()
// Fäll ut övningarna (i passet) tills en med tidigare tillfällen visar länken.
await p.waitForSelector("main button[aria-controls][aria-expanded]")
for (const t of await p.locator("main button[aria-controls][aria-expanded=false]").all()) {
  if (await link.isVisible().catch(() => false)) break
  await t.click()
}
await link.waitFor()
await link.click()
await p.waitForURL(/\/klient\/framsteg\/ovning\//)
await p.waitForSelector("text=Historik")
ok("Historik vid övningen öppnar övningshistoriken")
await p.getByRole("button", { name: "Tillbaka" }).click()
await p.waitForURL(new RegExp(`/klient/pass/${w.id}`))
ok("Tillbaka leder till passet")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
