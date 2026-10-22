// Prestanda och längd för landningssidan på mobil (390×844, CPU strypt 4×):
// sidhöjd och sektionshöjder, animationer i vila, stilskrivningar per sekund
// (framer-motion-loopar), huvudtrådens belastning i vila och bildrutor vid scroll.
//   BASE_URL=http://localhost:3000 node e2e/landing-perf.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
await p.goto(base + "/", { waitUntil: "networkidle" })
await p.waitForTimeout(1500)

const heights = await p.evaluate(() => {
  const r = { sida: document.documentElement.scrollHeight }
  for (const el of document.querySelectorAll("main > section, main > div > section, footer, #funktioner, #mal, #kommunikation, #priser, #ladda-ned")) {
    const key = el.id || el.tagName.toLowerCase()
    r[key] = Math.round(el.getBoundingClientRect().height)
  }
  return r
})

const m = (x, k) => x?.metrics.find((e) => e.name === k)?.value ?? 0

/** Mät i vila på en position: körande animationer, stilskrivningar/s och huvudtrådens belastning. */
async function idle(y) {
  await p.evaluate((v) => window.scrollTo(0, v), y)
  await p.waitForTimeout(1200)
  const before = await cdp.send("Performance.getMetrics").catch(() => null)
  const writes = await p.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0
        const mo = new MutationObserver((list) => (n += list.length))
        mo.observe(document.body, { attributes: true, attributeFilter: ["style"], subtree: true })
        setTimeout(() => {
          mo.disconnect()
          resolve(n / 2)
        }, 2000)
      })
  )
  const after = await cdp.send("Performance.getMetrics").catch(() => null)
  const busy = before && after ? (m(after, "TaskDuration") - m(before, "TaskDuration")) / (m(after, "Timestamp") - m(before, "Timestamp")) : 0
  const anims = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)
  // Efter inspelet: engångsanimationer (in-toning, chattdemo) är klara, bara ändlösa loopar kostar.
  await p.waitForTimeout(4000)
  const a = await cdp.send("Performance.getMetrics").catch(() => null)
  await p.waitForTimeout(2000)
  const b = await cdp.send("Performance.getMetrics").catch(() => null)
  const settled = a && b ? (m(b, "TaskDuration") - m(a, "TaskDuration")) / (m(b, "Timestamp") - m(a, "Timestamp")) : 0
  return {
    y,
    animationer: anims,
    stilskrivningarPerS: Math.round(writes),
    huvudtradUpptagen: `${Math.round(busy * 100)}%`,
    huvudtradEfterInspel: `${Math.round(settled * 100)}%`,
  }
}
await cdp.send("Performance.enable")
const h = heights.sida
const vila = []
for (const f of [0, 0.25, 0.5, 0.75, 0.95]) vila.push(await idle(Math.round(h * f)))

/** Scrolla genom hela sidan (30 px per bildruta): bildrutetider och vad huvudtråden gör. */
async function scrollRun() {
  const s0 = await cdp.send("Performance.getMetrics")
  const frames = await p.evaluate(
    () =>
      new Promise((resolve) => {
        const times = []
        let last = performance.now()
        const step = () => {
          const now = performance.now()
          times.push(now - last)
          last = now
          window.scrollBy(0, 30)
          if (window.scrollY + innerHeight < document.documentElement.scrollHeight - 2) requestAnimationFrame(step)
          else resolve(times)
        }
        requestAnimationFrame(step)
      })
  )
  const s1 = await cdp.send("Performance.getMetrics")
  const share = (k) => `${Math.round(((m(s1, k) - m(s0, k)) / (m(s1, "Timestamp") - m(s0, "Timestamp"))) * 100)}%`
  const sorted = [...frames].sort((a, b) => a - b)
  return {
    bildrutor: frames.length,
    snitt: `${(frames.reduce((s, x) => s + x, 0) / frames.length).toFixed(1)} ms`,
    p95: `${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)} ms`,
    over33ms: frames.filter((x) => x > 33).length,
    over50ms: frames.filter((x) => x > 50).length,
    andel: { skript: share("ScriptDuration"), stil: share("RecalcStyleDuration"), layout: share("LayoutDuration"), totalt: share("TaskDuration") },
  }
}
// Varm: allt har redan spelats in en gång (samma som tidigare mätningar).
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(800)
const scroll = await scrollRun()
// Kall: nyladdad sida, in-animationerna startar under scrollen (som för en ny besökare).
await p.goto(base + "/", { waitUntil: "networkidle" })
await p.waitForTimeout(1500)
const scrollKall = await scrollRun()
console.log(JSON.stringify({ hojder: heights, vila, scroll, scrollKall }, null, 2))
await browser.close()
