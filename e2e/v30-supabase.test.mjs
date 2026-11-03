// E2E för v30 i Supabase-läge mot e2e/mock-supabase.mjs: intro-flödet sparar
// mål, mått, takt och kalorimål i client_goals (med klientens id) och loggar
// vikten i weight_entries.
//   (start som e2e/v16-supabase.test.mjs)
//   BASE_URL=http://localhost:3000 node e2e/v30-supabase.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))
const getLog = async () => (await fetch(`${mock}/__log`)).json()
const C1 = "22222222-0000-4000-8000-000000000001"

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await p.goto(`${base}/logga-in`)
await p.fill("#email", "sara@test.se")
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForURL(/\/klient$/)
await p.waitForLoadState("networkidle")
check(await p.locator("[data-testid=goal-intro-banner]").isVisible(), "utan mål visas kortet Sätt upp dina mål")
const reads = (await getLog()).length
void reads
await fetch(`${mock}/__reset`)

await p.click("[data-testid=goal-intro-banner]")
await p.waitForURL(/\/klient\/intro$/)
// v31: steg 1 (namn och profilbild) först – förifyllt.
await p.waitForSelector("[data-testid=profile-step]")
await p.waitForFunction(() => document.querySelector("#profile-firstName")?.value)
await p.click("[data-testid=intro-next]")
await p.waitForSelector("text=Dina mått")
await p.fill("#goal-weightKg", "")
await p.fill("#goal-weightKg", "64")
await p.fill("#goal-heightCm", "167")
await p.fill("#goal-age", "29")
await p.click('[role=radio]:has-text("Kvinna")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=activity-picker] [role=radio]:has-text("Lätt aktiv")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=goal-picker] button:has-text("Kondition")')
await p.click('[data-testid=goal-picker] button:has-text("Styrkeökning")')
await p.click("[data-testid=intro-next]")
await p.waitForSelector("[data-testid=goal-results]")
check((await p.locator("[data-testid=rate-slider]").count()) === 0, "kondition + styrka = energibalans (inget reglage)")
check((await p.locator("[data-testid=goal-chart]").getAttribute("data-series")) === "leanDelta", "styrka: muskelmassa i grafen")
const kcal = Number((await p.locator("[data-testid=goal-kcal]").innerText()).replace(/\D/g, ""))
// 10×64 + 6,25×167 − 5×29 − 161 = 1 377,75 × 1,375 = 1 894 → 1 890 kcal.
check(Math.abs(kcal - 1890) <= 10, `kalorimål ${kcal} kcal (BMR 1 378 × 1,375)`)
await p.click("[data-testid=intro-next]")
await p.waitForURL(/\/klient$/)
await p.waitForTimeout(800)
const log = await getLog()
const row = log.find((e) => e.table === "client_goals" && e.method === "POST")
check(row?.body.client_id === C1, "målen sparas i client_goals på klientens eget id")
check(row?.body.goals?.join() === "strength,endurance" && row.body.sex === "female" && row.body.height_cm === 167 && row.body.activity_level === "light", "mål, kön, längd och aktivitet sparas")
check(row?.body.birth_year === new Date().getFullYear() - 29, "åldern sparas som födelseår")
check(row?.body.weekly_change_kg === 0 && Math.abs(row.body.target_kcal - kcal) < 1 && row.body.target_protein_g > 0, "takt och kalorimål (ögonblicksbild) sparas")
check(/resolution=merge-duplicates/.test(row?.prefer ?? ""), "upsert (en rad per klient)")
check(log.some((e) => e.table === "weight_entries" && Number(e.body?.kg) === 64), "vikten loggas i weight_entries")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
