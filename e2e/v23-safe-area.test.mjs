// E2E (demoläget) för v23: stängknappar och safe area på mobilen.
//  - dialoger och sidopaneler håller sig under statusfältet/notchen
//  - alla stängknappar är minst 44 × 44 px och har bakgrund
//  - sitemap.xml: 200, application/xml; charset=utf-8, börjar exakt med XML-deklarationen
// Statusfältet simuleras med --safe-area-inset-top (som Capacitor sätter i appen).
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v23-safe-area.test.mjs [skärmdumpsmapp]
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
const TOP = 59 // iPhone med Dynamic Island
const BOTTOM = 34

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await ctx.addInitScript(([top, bottom]) => {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.style.setProperty("--safe-area-inset-top", `${top}px`)
    document.documentElement.style.setProperty("--safe-area-inset-bottom", `${bottom}px`)
  })
}, [TOP, BOTTOM])
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))

/** Stängknappen: under statusfältet, minst 44 × 44, rund med bakgrund. */
const checkClose = async (loc, name) => {
  await loc.waitFor()
  const box = await loc.boundingBox()
  const bg = await loc.evaluate((el) => getComputedStyle(el).backgroundColor)
  check(box.y >= TOP, `${name}: stängknappen ligger under statusfältet (y = ${Math.round(box.y)} ≥ ${TOP})`)
  check(box.width >= 44 && box.height >= 44, `${name}: stängknappen är minst 44 × 44 px (${Math.round(box.width)} × ${Math.round(box.height)})`)
  check(bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent", `${name}: stängknappen har bakgrund (${bg})`)
}

// -------------------------------------------------------------- varukorg (sidopanel) ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
await p.click('button[aria-label^="Varukorg"]')
const cart = p.locator("[data-testid=cart]")
await cart.waitFor()
await p.waitForTimeout(600)
const cartPad = await cart.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
check(cartPad === TOP, `varukorgen börjar under statusfältet (padding-top ${cartPad}px)`)
await checkClose(cart.getByRole("button", { name: "Stäng varukorgen" }), "varukorgen")
await p.screenshot({ path: `${out}/v23-varukorg.png` })
await cart.getByRole("button", { name: "Stäng varukorgen" }).click()
await cart.waitFor({ state: "detached" })
ok("varukorgen stängs")

// -------------------------------------------------------------- dialog ---
await p.goto(base + "/klient/hitta/t1")
await p.click('button:has-text("Boka")')
await p.waitForSelector("text=Välj en ledig tid")
const dialog = p.locator("[data-slot=dialog-content]")
await p.waitForTimeout(500)
const dbox = await dialog.boundingBox()
check(dbox.y >= TOP && dbox.y + dbox.height <= 844 - BOTTOM, `dialogen ryms mellan statusfältet och hemindikatorn (${Math.round(dbox.y)}–${Math.round(dbox.y + dbox.height)})`)
const close = dialog.locator("[data-slot=dialog-close]")
await checkClose(close, "dialogen")
check((await close.getAttribute("aria-label")) === "Stäng", "dialogens stängknapp heter Stäng för skärmläsare")
await p.screenshot({ path: `${out}/v23-dialog.png` })
await close.click()
await dialog.waitFor({ state: "detached" })
ok("dialogen stängs med krysset")

// ------------------------------------------- lång dialog (rullar i stället för att gå upp i statusfältet) ---
await p.setViewportSize({ width: 375, height: 600 })
await p.goto(base + "/klient/hitta/t1")
await p.click('button:has-text("Boka")')
await p.waitForSelector("text=Välj en ledig tid")
await p.waitForTimeout(500)
const small = await dialog.boundingBox()
check(small.y >= TOP && small.y + small.height <= 600 - BOTTOM + 1, `liten skärm: dialogen stannar inom den säkra ytan (${Math.round(small.y)}–${Math.round(small.y + small.height)})`)
await checkClose(dialog.locator("[data-slot=dialog-close]"), "liten skärm")
await p.keyboard.press("Escape")

// ------------------------------------------------------- PT-menyn (vänster sidopanel) ---
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(base + "/pt")
await p.waitForSelector("text=Klienter")
{
  await p.click('button[aria-label="Öppna meny"]')
  const sheet = p.locator("[data-slot=sheet-content]")
  await sheet.waitFor()
  await p.waitForTimeout(600)
  check((await sheet.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))) === TOP, "PT-menyn börjar under statusfältet")
  const sc = sheet.locator('button[aria-label="Stäng"]')
  if (await sc.count()) await checkClose(sc, "PT-menyn")
  await p.screenshot({ path: `${out}/v23-pt-meny.png` })
}

// ------------------------------------------------------------ sitemap ---
const sm = await fetch(base + "/sitemap.xml", { redirect: "manual", headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", host: "coavira.fit" } })
const xml = await sm.text()
check(sm.status === 200, "sitemap.xml: 200 utan omdirigering")
check(sm.headers.get("content-type") === "application/xml; charset=utf-8", "sitemap.xml: Content-Type application/xml; charset=utf-8")
check(sm.headers.get("cache-control") === "public, max-age=86400, s-maxage=86400", `sitemap.xml: Cache-Control (${sm.headers.get("cache-control")})`)
check(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset'), "sitemap.xml börjar exakt med XML-deklarationen (inga mellanslag eller tomma rader före)")
const robots = await (await fetch(base + "/robots.txt")).text()
check(/^Sitemap: https:\/\/coavira\.fit\/sitemap\.xml$/m.test(robots), "robots.txt: Sitemap: https://coavira.fit/sitemap.xml")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
