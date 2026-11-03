// E2E för v35 i demoläge: tidsbaserad hälsning på hemskärmen (falsk klocka)
// och Framsteg med bara målkorten (inga intressen).
//   BASE_URL=http://localhost:3000 node e2e/v35-demo.test.mjs [skärmdumpsmapp]
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

// ------------------------------------------------ 1. hälsningen ---
for (const [time, want] of [
  ["07:15", /^God morgon Sara$/],
  ["13:00", /^Hej Sara!$/],
  ["21:40", /^God kväll Sara$/],
]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Stockholm" })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.clock.setFixedTime(new Date(`2026-11-03T${time}:00+01:00`))
  await p.goto(base + "/klient")
  await p.waitForSelector("[data-testid=home-greeting]")
  const text = (await p.locator("[data-testid=home-greeting]").innerText()).trim()
  check(want.test(text), `kl. ${time}: "${text}"`)
  if (time === "07:15") await p.screenshot({ path: `${out}/v35-god-morgon.png` })
  await ctx.close()
}
// Klockan passerar 18:00 medan appen är öppen → hälsningen byter utan omladdning.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Stockholm" })
  const p = await ctx.newPage()
  await p.clock.install({ time: new Date("2026-11-03T17:59:00+01:00") })
  await p.goto(base + "/klient")
  await p.waitForSelector("[data-testid=home-greeting]")
  check((await p.locator("[data-testid=home-greeting]").innerText()).startsWith("Hej"), "17:59 → Hej")
  await p.clock.runFor(90_000)
  await p.waitForFunction(() => document.querySelector("[data-testid=home-greeting]")?.textContent?.startsWith("God kväll"))
  ok("18:00 → God kväll utan omladdning")
  await ctx.close()
}

// ------------------------------------------------ 2. Framsteg: bara mål ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=goal-overview-empty]")
ok("utan mål: en genväg till att välja mål")
check((await p.locator("[data-testid=choose-interests], [data-testid=metrics-grid]").count()) === 0 && (await p.getByText("Ändra mätpunkter").count()) === 0, "inga intresse-element")
// Ge demoklienten mål (som efter intro-flödet) och ladda om.
await p.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:demo:v5"])
  const mira = s.data.goalProfiles[0]
  const start = new Date(Date.now() - 42 * 86400000).toISOString().slice(0, 10)
  s.data.goalProfiles.push({ ...mira, clientId: "c1", goals: ["weight_loss", "recomp", "bodybuilding"], startWeightKg: 84, currentWeightKg: 84, targetWeightKg: 78, startedAt: start })
  localStorage["coavira:demo:v5"] = JSON.stringify(s)
})
await p.reload()
await p.waitForSelector("[data-testid=goal-overview]")
const goals = await p.locator("[data-testid=goal-overview] > li").evaluateAll((els) => els.map((e) => e.getAttribute("data-goal")))
check(goals.join(",") === "weight_loss,bodybuilding,recomp", `ett kort per valt mål (${goals})`)
check((await p.locator('[data-testid=goal-overview] [data-goal=weight_loss] [role=progressbar]').count()) === 1, "viktnedgång: förlopp mot målvikten")
check(/kg kvar till 78 kg|Målvikten/.test(await p.locator("[data-testid=goal-overview] [data-goal=weight_loss]").innerText()), "viktnedgång: kvar till målvikten")
check(/pass\/v/.test(await p.locator("[data-testid=goal-overview] [data-goal=bodybuilding] [data-testid=goal-card-value]").innerText()), "bodybuilding: pass per vecka")
check((await p.locator("[data-testid=choose-interests], [data-testid=metrics-grid]").count()) === 0, "fortfarande inga intressen")
check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "ingen horisontell overflow")
await p.locator("[data-testid=goal-overview]").screenshot({ path: `${out}/v35-framsteg-mal.png` })

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
