// E2E för v81 i demoläge: en PT som inte är aktiverad (Stripe + minst ett paket)
// syns inte i Hitta PT; friskvårdsfiltret kräver verifierade portalavtal.
// (Checklistan, låsta inbjudningar och portalverifieringen testas i v76 och v75,
// den tysta passtimern i v73.)
//   BASE_URL=http://localhost:3000 node e2e/v81-aktivering.test.mjs [skärmbildsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))
const KEY = "coavira:demo:v5"

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
const names = () => p.locator("ul > li a[href^='/klient/hitta/']").evaluateAll((as) => as.map((a) => a.textContent ?? ""))

await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
await p.goto(base + "/klient/hitta")
await p.waitForSelector("h1:has-text('Hitta din PT')")
const before = await names()
check(before.some((n) => n.includes("Ahmed Rashid")), "aktiverad PT syns i Hitta PT")

// Ahmed tappar aktiveringen (t.ex. sista paketet pausat eller Stripe avstängt).
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  s.data.trainers.find((t) => t.name === "Ahmed Rashid").isPtActivated = false
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/klient/hitta")
await p.waitForSelector("h1:has-text('Hitta din PT')")
const after = await names()
check(!after.some((n) => n.includes("Ahmed Rashid")) && after.length === before.length - 1, "ej aktiverad PT döljs i Hitta PT")

// Friskvårdsfiltret: bara verifierade portalavtal.
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  const t = s.data.trainers.find((x) => x.name === "Elin Söderberg")
  t.wellnessVerificationStatus = "pending"
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/klient/hitta")
await p.waitForSelector("h1:has-text('Hitta din PT')")
check((await p.locator("[data-testid=wellness-badge]").count()) === 0, "portalavtal som granskas: ingen badge")
await p.click("[data-testid=filter-wellness]")
check(!(await names()).some((n) => n.includes("Elin Söderberg")), "och inte med i friskvårdsfiltret")

check(errors.length === 0, `inga sidfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
