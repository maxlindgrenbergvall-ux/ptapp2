// E2E för svenska livsmedel (v9) i demoläge mot e2e/mock-openfoodfacts.mjs:
// varumärkessök (Barebells, Nocco …), svenska varor först, drycker i ml,
// UPC/EAN-varianter vid skanning och egen produkt direkt från sökningen.
//
//   node e2e/mock-openfoodfacts.mjs &
//   OPENFOODFACTS_BASE_URL=http://localhost:54400 npm start
//   BASE_URL=http://localhost:3000 node e2e/v9-livsmedel.test.mjs
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const off = process.env.OFF_MOCK_URL ?? "http://localhost:54400"
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))
const errors = []
const offLog = async () => (await fetch(`${off}/__log`)).json()
await fetch(`${off}/__reset`)

// ------------------------------------------------------------------ API ---
const api = async (path) => {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, body: await res.json() }
}

let r = await api("/api/food/search?q=barebells")
check(r.body.products?.[0]?.brand === "Barebells", "sök: Barebells hittas via varumärket")
let log = await offLog()
const brandCall = log.find((e) => e.path === "/cgi/search.pl" && Object.values(e.query).includes("barebells"))
check(brandCall && Object.values(brandCall.query).includes("sweden"), "sök: varumärkesfilter + svenska marknaden skickas till Open Food Facts")
check(brandCall?.query.lc === "sv" && brandCall?.query.cc === "se", "sök: svenska namn (lc=sv, cc=se)")
check(log.every((e) => e.ua?.startsWith("Coavira/")), "anropen har User-Agent enligt Open Food Facts riktlinjer")

r = await api("/api/food/search?q=coca%20cola")
const names = (r.body.products ?? []).map((p) => p.name)
check(names[0] === "Coca-Cola Zero" && names.includes("Cola Classic (import)"), `sök: svensk vara före import (${names.join(", ")})`)

r = await api("/api/food/search?q=nocco")
const nocco = r.body.products?.[0]
check(nocco?.unit === "ml" && nocco?.servingG === 330, `dryck: per 100 ml och burk 330 ml (från "33 cl") (${nocco?.unit}, ${nocco?.servingG})`)
check(r.body.products?.[0]?.soldInSweden === true, "svensk marknad markeras")

r = await api("/api/food/barcode/7350000000016")
check(r.status === 200 && r.body.name === "Protein Bar Cookies & Cream" && r.body.servingG === 55 && r.body.unit === "g", "skanning: Barebells-bar 55 g")
r = await api("/api/food/barcode/036000291452")
check(r.status === 200 && r.body.barcode === "036000291452", "skanning: UPC-A (12 siffror) hittar produkt lagrad som EAN-13")
r = await api("/api/food/barcode/7350000000030")
check(r.status === 200 && r.body.per100.kcal === 0 && r.body.unit === "ml", "energi i kJ räknas om och nollkalorisk dryck godtas")
r = await api("/api/food/barcode/7310000000010")
check(r.status === 404, "okänd streckkod → 404 (användaren kan lägga till själv)")

// ------------------------------------------------------------------- UI ---
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const m = await ctx.newPage()
m.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await m.goto(`${base}/klient`)
await m.waitForSelector("text=Övrigt / extra")
const search = m.locator('input[aria-label="Sök livsmedel eller märkesvara"]')

// Snabbval för populära varumärken
await search.focus()
await m.waitForSelector("text=Populära varumärken")
check(await m.locator('button:has-text("Barebells")').isVisible() && await m.locator('button:has-text("Nocco")').isVisible(), "snabbval: Barebells och Nocco")
await m.screenshot({ path: `${out}/v9-snabbval.png` })
await m.click('button:has-text("Nocco")')
await m.waitForSelector('role=group[name="Märkesvaror"] >> text=BCAA Caribbean', { timeout: 8000 })
check(await m.locator('role=group[name="Märkesvaror"] >> text=kcal/100 ml').first().isVisible(), "dryck visas per 100 ml i träfflistan")
await m.screenshot({ path: `${out}/v9-nocco.png` })
await m.click('role=group[name="Märkesvaror"] >> text=BCAA Caribbean')
await m.waitForSelector('input[aria-label="Mängd i milliliter"]')
check((await m.inputValue('input[aria-label="Mängd i milliliter"]')) === "330", "portion: 1 burk 330 ml förifylld")
check(await m.locator('button:has-text("1 förpackning (330 ml)")').isVisible(), "snabbval för förpackningen i ml")
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=BCAA Caribbean (Nocco) >> xpath=.. >> text=· 330 ml")
ok("Nocco loggad som 330 ml")

await search.fill("barebells")
await m.waitForSelector('role=group[name="Märkesvaror"] >> text=Protein Bar Cookies & Cream', { timeout: 8000 })
await m.click('role=group[name="Märkesvaror"] >> text=Protein Bar Cookies & Cream')
check((await m.inputValue('input[aria-label="Mängd i gram"]')) === "55", "Barebells-bar: portion 55 g förifylld")
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=Protein Bar Cookies & Cream (Barebells)")
ok("Barebells loggad")

// Egen produkt direkt från sökningen (dryck)
await search.fill("Hemmagjord smoothie")
await m.click("text=Hittar du inte varan? Lägg till egen produkt")
check((await m.inputValue('input[aria-label="Namn"]')) === "Hemmagjord smoothie", "egen produkt: namnet förifylls från sökningen")
await m.click('role=radio >> text=Dryck (per 100 ml)')
await m.fill("#cp-kcal", "64")
await m.fill("#cp-protein", "2")
await m.fill("#cp-carbs", "12")
await m.fill('input[aria-label="Streckkod"]', "123")
await m.click('button:has-text("Spara produkt")')
await m.waitForSelector("text=Streckkoden verkar inte stämma")
ok("egen produkt: felaktig streckkod stoppas")
await m.fill('input[aria-label="Streckkod"]', "")
await m.click('button:has-text("Spara produkt")')
await m.waitForSelector('input[aria-label="Mängd i milliliter"]')
await m.fill('input[aria-label="Mängd i milliliter"]', "250")
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=Hemmagjord smoothie >> xpath=.. >> text=· 250 ml")
ok("egen dryck sparad och loggad i ml")
await search.fill("smoothie")
check((await m.locator('role=group[name="Mina produkter"] >> text=Hemmagjord smoothie').count()) === 1, "egen produkt hittas under Mina produkter")
await m.keyboard.press("Escape")
await m.screenshot({ path: `${out}/v9-kost.png`, fullPage: true })

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
