// E2E för v82: statistikpanelen (/admin/analytics) i demoläge och den cookie-fria spårningen.
//   CRM_DEMO=1 npm start   (demobygge utan Supabase)
//   BASE_URL=http://localhost:3000 node e2e/v82-analytics.test.mjs [skärmbildsmapp]
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const shots = process.argv[2]
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m, detail) => (c ? ok(m) : fail(`${m}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`))

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "sv-SE", timezoneId: "Europe/Stockholm" })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`))
// Layoutskiften mäts från första bilden.
await p.addInitScript(() => {
  window.__cls = 0
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
  }).observe({ type: "layout-shift", buffered: true })
})

// ------------------------------------------------------------ 1. sidan ---
await p.goto(`${base}/admin`)
await p.waitForURL(/\/admin\/analytics$/)
check(p.url().endsWith("/admin/analytics"), "/admin leder till statistiken", p.url())
await p.getByTestId("analytics").waitFor()
await p.waitForFunction(() => document.querySelectorAll('[data-testid="kpi-revenue"] [data-value]').length === 1)
check((await p.getByRole("link", { name: "Statistik" }).getAttribute("aria-current")) === "page", "Statistik är första och aktiva fliken")
const nav = await p.locator('nav[aria-label="Admin"] a').allTextContents()
check(nav[0]?.trim() === "Statistik", "Statistik står först i menyn", nav)
const bg = await p.evaluate(() => getComputedStyle(document.querySelector(".admin-dark")).backgroundColor)
check(bg === "rgb(19, 25, 22)", "bakgrunden är #131916", bg)
const card = await p.evaluate(() => getComputedStyle(document.querySelector('[data-testid="kpi-revenue"]')).backgroundColor)
check(card === "rgb(26, 34, 30)", "korten är #1a221e", card)

const value = async (id) => (await p.getByTestId(id).locator("[data-value]").textContent())?.trim()
check(/\d.*kr$/.test(await value("kpi-revenue")), "intäkt denna månad i kronor", await value("kpi-revenue"))
check(/GMV/.test(await p.getByTestId("kpi-revenue").textContent()), "GMV visas som sekundär siffra")
check(/\d.*kr$/.test(await value("kpi-forecast")), "prognos för månaden", await value("kpi-forecast"))
check(/\d/.test(await value("kpi-active-now")), "aktiva nu")
check(/%/.test(await value("kpi-churn")), "churn i procent", await value("kpi-churn"))
check(/%/.test(await value("kpi-conversion")), "konvertering besök → konto", await value("kpi-conversion"))

// Fem grafer (recharts ritar SVG).
await p.waitForFunction(() => document.querySelectorAll(".recharts-surface").length >= 5)
check((await p.locator(".recharts-surface").count()) >= 5, "fem grafer ritas")
check((await p.locator(".recharts-line-curve[stroke-dasharray='5 5']").count()) === 1, "prognosen är streckad")

// Källfiltret ändrar intäkten.
const all = await value("kpi-revenue")
await p.getByTestId("analytics-source").getByRole("radio", { name: "RevenueCat" }).click()
const rc = await value("kpi-revenue")
check(rc !== all, "källfiltret RevenueCat ändrar intäkten", { all, rc })
check((await p.locator(".recharts-line-curve[stroke='#fbbf24']").count()) === 0, "ingen momslinje för RevenueCat")
await p.getByTestId("analytics-source").getByRole("radio", { name: "Stripe" }).click()
check((await p.locator(".recharts-line-curve[stroke='#fbbf24']").count()) === 1, "momsandelen visas för Stripe")

// Moms: månad/kvartal/år, MoR-texten.
const vat = p.getByTestId("vat-card")
check(/omvänd skattskyldighet/.test(await vat.textContent()), "RevenueCat märkt MoR – omvänd skattskyldighet")
const vMonth = await p.getByTestId("vat-out").textContent()
await p.getByTestId("vat-period").getByRole("radio", { name: "Kvartal" }).click()
const vQuarter = await p.getByTestId("vat-out").textContent()
check(vMonth !== vQuarter, "momsperioden byts", { vMonth, vQuarter })

// Perioden styr besöksgrafen.
await p.getByTestId("analytics-period").getByRole("radio", { name: "7 d" }).click()
await p.waitForFunction(() => /7 dagar/.test(document.body.textContent))
check(/4 steg|Besökare/.test(await p.getByTestId("funnel").textContent()), "tratten visas")
check(/Coavira\+/.test(await p.getByTestId("funnel").textContent()), "tratten slutar i Coavira+")

const cls = await p.evaluate(() => window.__cls)
check(cls < 0.05, "inga layoutskiften (CLS < 0,05)", cls)
await p.getByTestId("analytics-period").getByRole("radio", { name: "30 d" }).click()
await p.getByTestId("analytics-source").getByRole("radio", { name: "Alla" }).click()
await p.getByTestId("vat-period").getByRole("radio", { name: "Månad" }).click()
if (shots) {
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${shots}/v82-statistik.png`, fullPage: true })
}

// ------------------------------------------------------- 2. mobil ---
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "sv-SE" })
const mp = await m.newPage()
await mp.goto(`${base}/admin/analytics`)
await mp.waitForFunction(() => document.querySelectorAll(".recharts-surface").length >= 5)
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check(overflow <= 0, "ingen horisontell scroll på mobil", overflow)
if (shots) await mp.screenshot({ path: `${shots}/v82-statistik-mobil.png`, fullPage: true })

// ------------------------------------------------- 3. spårningen ---
const track = await p.request.post(`${base}/api/track/pageview`, { data: { event: "pageview", path: "/" } })
check(track.status() === 204, "pageview svarar 204", track.status())
const bad = await p.request.post(`${base}/api/track/pageview`, { data: "inte json" })
check(bad.status() === 204, "trasig kropp svarar också 204 (inget sparas)")
const lp = await ctx.newPage()
// sendBeacon-kroppen syns inte i Playwright: läs den i sidan (sparas i sessionStorage, överlever navigeringen).
await lp.addInitScript(() => {
  const orig = navigator.sendBeacon.bind(navigator)
  navigator.sendBeacon = (url, body) => {
    if (body instanceof Blob)
      void body.text().then((t) => sessionStorage.setItem("beacons", JSON.stringify([...JSON.parse(sessionStorage.getItem("beacons") ?? "[]"), t])))
    return orig(url, body)
  }
})
const readBeacons = async () => JSON.parse((await lp.evaluate(() => sessionStorage.getItem("beacons"))) ?? "[]")
let beacons = []
await lp.goto(`${base}/?utm_source=instagram`)
await lp.waitForTimeout(800)
beacons = await readBeacons()
check(beacons.some((b) => /"pageview"/.test(b ?? "") && /instagram/.test(b ?? "")), "landningssidan skickar en sidvisning med UTM", beacons)
const cookies = await ctx.cookies(base)
check(!cookies.some((c) => /track|visitor|_ga/i.test(c.name)), "ingen spårningscookie", cookies.map((c) => c.name))
await lp.locator('a[href="/bli-pt"]').first().click({ noWaitAfter: true }).catch(() => {})
await lp.waitForTimeout(800)
beacons = await readBeacons()
check(beacons.some((b) => /cta_signup/.test(b ?? "")), "klick på Bli PT räknas som Skapa konto", beacons)

check(errors.length === 0, "inga fel i konsolen", errors)
await browser.close()
