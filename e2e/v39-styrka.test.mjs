// E2E för v39 i demoläge (mobil 390 px): inga uppskattade maxlyft (1RM) någonstans –
// styrkan visas som faktiska lyft (tyngsta set, vikt × reps).
//   BASE_URL=http://localhost:3000 node e2e/v39-styrka.test.mjs [skärmdumpsmapp]
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
const FORBIDDEN = /\b(e?1RM|one rep max|epley|brzycki)\b|relativ styrka|× kv\b|uppskattat max/i

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
const text = () => p.evaluate(() => document.body.innerText)
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
const pages = [
  ["/klient/framsteg", "[data-testid=kpi-lifts]"],
  ["/klient/framsteg/ovning/e-squat", "h1"],
  ["/klient/profil", "#profile-name"],
  ["/klient/profil/mal", "[data-testid=goal-settings], [data-testid=goals-empty]"],
  ["/pt/klienter/c1", "text=Styrkeutveckling"],
]
for (const [path, sel] of pages) {
  await p.goto(base + path)
  await p.waitForSelector(sel)
  await p.waitForTimeout(800)
  const t = await text()
  const hit = t.match(FORBIDDEN)
  check(!hit, `${path}: inga 1RM-element${hit ? ` (hittade "${hit[0]}")` : ""}`)
  check(await noOverflow(), `${path}: ingen horisontell overflow`)
}

await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=kpi-lifts]")
const lifts = await p.locator("[data-testid=kpi-lifts]").innerText()
check(/Styrka/.test(lifts) && /\d+(,\d+)? kg × \d+/.test(lifts), "Framsteg: styrkan som tyngsta set (kg × reps)")
check(/Tyngsta set per pass/.test(await text()), "Framsteg: styrkegrafen visar tyngsta set per pass")
await p.locator("[data-testid=kpi-lifts]").screenshot({ path: `${out}/v39-styrka.png` })

await p.goto(base + "/klient/framsteg/ovning/e-squat")
await p.waitForSelector("h1")
const hist = await text()
check(/Personbästa/.test(hist) && /\d+(,\d+)? kg × \d+/.test(hist), "övningshistorik: personbästa som vikt × reps")
check(/Tyngsta set per tillfälle/.test(hist) && /Tyngsta set \d/.test(hist), "övningshistorik: kurva och lista över tyngsta set")
await p.screenshot({ path: `${out}/v39-historik.png`, fullPage: true })

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
