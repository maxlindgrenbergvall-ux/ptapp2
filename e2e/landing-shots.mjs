// Skärmdumpar av landningssidan för granskning: helsida och varje sektion i
// flera bredder. Sidan scrollas igenom först så att alla scroll-animationer körts.
//   BASE_URL=http://localhost:3000 node e2e/landing-shots.mjs <mapp>
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots/landing"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const report = []
for (const [name, width, height, mobile] of [
  ["mobil-360", 360, 780, true],
  ["mobil-390", 390, 844, true],
  ["surfplatta-768", 768, 1024, true],
  ["desktop-1440", 1440, 900, false],
]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  await p.goto(base + "/", { waitUntil: "networkidle" })
  await p.waitForTimeout(1200)
  await p.screenshot({ path: `${out}/${name}-forsta-vyn.png` })
  // Scrolla igenom sidan så att whileInView-animationer körs.
  const total = await p.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < total; y += Math.round(height * 0.6)) {
    await p.evaluate((v) => window.scrollTo(0, v), y)
    await p.waitForTimeout(250)
  }
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(800)
  const overflow = await p.evaluate(() => {
    const w = document.documentElement.clientWidth
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.right > w + 1 || r.left < -1) && getComputedStyle(el).position !== "fixed"
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(el.getBoundingClientRect().left)}→${Math.round(el.getBoundingClientRect().right)})`)
    return { scroll: document.documentElement.scrollWidth > w, wide }
  })
  await p.screenshot({ path: `${out}/${name}-helsida.png`, fullPage: true })
  for (const id of ["funktioner", "mal", "kommunikation", "priser", "ladda-ned"]) {
    const el = p.locator(`#${id}`)
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded()
      await p.waitForTimeout(900)
      await el.screenshot({ path: `${out}/${name}-${id}.png` })
    }
  }
  report.push({ name, horizontalScroll: overflow.scroll, overflowingElements: overflow.wide, errors })
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(report, null, 2))
