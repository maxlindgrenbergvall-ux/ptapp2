// E2E i demoläge: klickar igenom klientappen och PT-panelen och tar skärmdumpar.
// Kör mot en server UTAN Supabase-variabler:  npm run build && npm start
//   BASE_URL=http://localhost:3000 node e2e/demo-mode.test.mjs
import { chromium } from "playwright"
const out = process.argv[2] ?? "e2e/screenshots"
await import("node:fs").then((fs) => fs.mkdirSync(out, { recursive: true }))
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
async function page(viewport, scheme = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
  p.on("console", (m) => m.type() === "error" && errors.push(`${p.url()} console: ${m.text()}`))
  return p
}
const base = process.env.BASE_URL ?? "http://localhost:3000"
const m = await page({ width: 390, height: 844 })
await m.goto(base + "/klient"); await m.waitForSelector("text=Dagens träning")
await m.screenshot({ path: `${out}/klient-idag.png`, fullPage: true })
// Starta passet och logga två set med ett tryck var
await m.click("text=Starta passet"); await m.waitForSelector("text=Avsluta")
await m.click('button[aria-label="Bocka av set 1"]')
await m.click('button[aria-label="Bocka av set 2"]')
await m.screenshot({ path: `${out}/klient-logg.png` })
await m.click("text=Avsluta"); await m.click("text=Lagom tungt"); await m.click("text=Spara pass")
await m.waitForURL(base + "/klient"); await m.waitForSelector("text=Klart")
await m.goto(base + "/klient/hitta"); await m.click('button:has-text("Hyrox")')
await m.screenshot({ path: `${out}/klient-hitta.png`, fullPage: true })
await m.goto(base + "/klient/hitta/t1"); await m.click('button:has-text("Boka")')
await m.waitForSelector("text=Dagar med lediga tider")
await m.screenshot({ path: `${out}/klient-boka.png` })
await m.keyboard.press("Escape")
await m.goto(base + "/klient/framsteg"); await m.waitForSelector("text=Styrka"); await m.waitForTimeout(2200)
await m.screenshot({ path: `${out}/klient-framsteg.png`, fullPage: true })
const md = await page({ width: 390, height: 844 }, "dark")
await md.goto(base + "/klient"); await md.waitForSelector("text=Dagens träning")
await md.screenshot({ path: `${out}/klient-idag-dark.png` })

const d = await page({ width: 1440, height: 900 })
await d.goto(base + "/pt"); await d.waitForSelector("text=Klienter")
await d.screenshot({ path: `${out}/pt-oversikt.png`, fullPage: true })
await d.goto(base + "/pt/klienter/c1"); await d.waitForSelector("text=Styrkeutveckling"); await d.waitForTimeout(2200)
await d.screenshot({ path: `${out}/pt-klient.png`, fullPage: true })
await d.goto(base + "/pt/pass"); await d.waitForSelector("text=Övningsbank >> visible=true")
await d.locator("button:has-text(\"Wall balls\") >> visible=true").click()
await d.screenshot({ path: `${out}/pt-pass.png`, fullPage: true })
await d.goto(base + "/pt/kost"); await d.waitForSelector("text=Dagssumma")
await d.screenshot({ path: `${out}/pt-kost.png`, fullPage: true })
const dd = await page({ width: 1440, height: 900 }, "dark")
await dd.goto(base + "/pt/meddelanden"); await dd.click('button:has-text("Sara Lindqvist")'); await dd.waitForTimeout(300)
await dd.screenshot({ path: `${out}/pt-meddelanden-dark.png` })
console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
