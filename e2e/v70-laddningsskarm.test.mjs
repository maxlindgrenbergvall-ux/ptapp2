// E2E för v70 i demoläge: laddningsskärmen där Coaviras logga (C:et) snurrar
// medan appen laddar, landar rakt när den är redo och tonas bort.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v70-laddningsskarm.test.mjs [skärmbildsmapp]
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

// ------------------------------------------------- i serverns HTML ---
const html = await (await fetch(base + "/klient")).text()
check(html.includes('data-testid="boot-splash"') && html.includes("boot-splash-spin"), "laddningsskärmen finns redan i serverns HTML (ingen vit skärm)")

// ------------------------------- långsamt nät: loggan snurrar före JS ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))
// Första besöket: demodatan skapas, sedan laddas sidan om med fördröjda skript.
await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
// Bara skripten fördröjs: CSS:en blockerar renderingen och kommer först i verkligheten också.
await p.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (route) => {
  await new Promise((r) => setTimeout(r, 1500))
  await route.continue().catch(() => {})
})
// Loggans vinkel (0–360) ur den beräknade transformen.
const read = () =>
  p.evaluate(() => {
    const el = document.querySelector("[data-testid=boot-splash]")
    if (!el) return null
    const m = getComputedStyle(el.querySelector("[data-testid=boot-splash-logo]")).transform.match(/matrix\(([^)]+)\)/)
    const [a, b] = m ? m[1].split(",").map(Number) : [1, 0]
    return { deg: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, ready: el.dataset.ready === "true", done: el.dataset.done === "true", pe: el.style.pointerEvents }
  })
const nav = p.goto(base + "/klient", { waitUntil: "commit" })
await p.waitForSelector("[data-testid=boot-splash]")
await p.waitForTimeout(250)
const early = await read()
await p.waitForTimeout(300)
const later = await read()
check(early && later && Math.abs(later.deg - early.deg) > 20, `C:et snurrar redan medan appen laddas (${early?.deg.toFixed(0)}° → ${later?.deg.toFixed(0)}°)`)
check((await p.locator("[data-testid=boot-splash] circle").count()) === 1, "ingen ring runt loggan (bara punkten i C:et är en cirkel)")
await p.screenshot({ path: `${out}/v70-laddningsskarm.png` })

// Storleken: loggan som i native-startbilden (synlig bredd 11,2 % av 844 px ≈ 95 px).
const logo = await p.locator("[data-testid=boot-splash-logo]").evaluate((el) => el.offsetWidth)
check(Math.abs(logo * (16.1 / 24) - 0.112 * 844) < 4, `loggan har native-startbildens storlek (${(logo * (16.1 / 24)).toFixed(0)} px synlig bredd)`)
const bg = await p.locator("[data-testid=boot-splash]").evaluate((el) => getComputedStyle(el).backgroundColor)
check(bg === "rgb(11, 15, 13)", `samma mörka bakgrund som native-startbilden (${bg})`)

// Följ loggan tills skärmen tonas bort: den snurrar bara framåt, utan hopp, och landar rakt.
const samples = []
let readyAt = null
for (let i = 0; i < 240; i++) {
  const s = await read()
  if (!s) break
  samples.push(s)
  if (s.ready && readyAt === null) readyAt = samples.length - 1
  await p.waitForTimeout(20)
}
await nav
const steps = samples.slice(1).map((s, i) => (s.deg - samples[i].deg + 360) % 360)
const jump = Math.max(...steps.filter((d) => d < 300))
const backwards = steps.some((d) => d > 300 && d < 359)
check(!backwards && jump < 70, `loggan snurrar bara framåt, utan hopp när React tar över (största steg ${jump.toFixed(0)}°)`)
const landed = samples.filter((s) => s.done)
check(landed.length > 0 && landed.every((s) => s.deg < 0.5 || s.deg > 359.5), `loggan landar rakt innan skärmen tonas bort (${landed[0]?.deg.toFixed(1)}°)`)
check(readyAt !== null && samples[readyAt].pe === "none", "när appen är redo släpps tryck igenom direkt")
check((await p.locator("[data-testid=boot-splash]").count()) === 0, "laddningsskärmen tas bort helt")
check(await p.locator("nav a:has-text('Kost')").isVisible(), "appen syns under")
await p.unrouteAll({ behavior: "ignoreErrors" })

// ------------------------------------------- navigering inne i appen ---
await p.locator("nav a:has-text('Kost')").click()
await p.waitForURL(base + "/klient/kost")
await p.waitForTimeout(100)
check((await p.locator("[data-testid=boot-splash]").count()) === 0, "ingen laddningsskärm vid byte av flik i appen")

// -------------------------------------------------------- PT-appen ---
await p.goto(base + "/pt")
await p.waitForSelector("[data-testid=pt-bottom-nav]")
await p.waitForSelector("[data-testid=boot-splash]", { state: "detached", timeout: 5000 })
ok("PT-appen får samma laddningsskärm och den försvinner")

// --------------------------------------------------- minska rörelse ---
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
const q = await rm.newPage()
await q.goto(base + "/klient")
await q.waitForSelector("nav a:has-text('Kost')")
await q.waitForTimeout(150)
check((await q.locator("[data-testid=boot-splash]").count()) === 0, "minska rörelse: laddningsskärmen försvinner direkt när appen är redo")
await rm.close()

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
