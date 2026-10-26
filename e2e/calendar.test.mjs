// E2E för kalendern i demoläge: klienten bokar en ledig tid → väntar på
// bekräftelse → PT:n accepterar → passet är bekräftat hos klienten. Därefter
// blockering, krockskydd, tillgänglighet och månad/vecka/dag-vyerna.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/calendar.test.mjs
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

// Klient och PT delar demodata i samma webbläsarkontext (localStorage).
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && errors.push(`${p.url()} console: ${m.text()}`))

// 1. Klientens kalender från demodatan
await p.goto(base + "/klient/kalender")
await p.waitForSelector("text=Mina pass")
await p.click('[role=tab]:has-text("Lista") >> visible=true')
check(await p.locator("text=Bekräftat").first().isVisible(), "klienten ser sitt bekräftade pass")
const pendingBefore = await p.locator("text=Väntar på bekräftelse från PT").count()
check(pendingBefore >= 1, `seedad förfrågan visas som väntande (${pendingBefore})`)
await p.screenshot({ path: `${out}/klient-kalender.png`, fullPage: true })

// 2. Boka en ledig tid hos Elin
await p.goto(base + "/klient/hitta/t1")
await p.click('button:has-text("Boka")')
await p.waitForSelector("text=Välj en ledig tid")
await p.locator("[role=dialog] [role=grid] button:not([disabled])").first().click()
const slotBtn = p.locator('[role=dialog] [role=radiogroup][aria-label="Välj tid"] button').first()
const slotText = (await slotBtn.innerText()).trim()
await slotBtn.click()
await p.fill("#booking-note", "Vill köra knäböjsteknik")
await p.screenshot({ path: `${out}/klient-boka.png` })
await p.click('button:has-text("Skicka bokningsförfrågan")')
await p.waitForSelector("text=Förfrågan skickad")
ok(`bokningsförfrågan skickad (${slotText})`)

await p.goto(base + "/klient/kalender")
await p.waitForSelector("text=Mina pass")
await p.click('[role=tab]:has-text("Lista") >> visible=true')
check((await p.locator("text=Väntar på bekräftelse från PT").count()) === pendingBefore + 1, "ny förfrågan visas som väntande hos klienten")
check(await p.locator("text=/förfrågningar? väntar/").isVisible(), "banner om väntande förfrågningar")

// 3. Samma tid går inte att boka igen
await p.goto(base + "/klient/hitta/t1")
await p.click('button:has-text("Boka")')
await p.waitForSelector("text=Välj en ledig tid")
await p.locator("[role=dialog] [role=grid] button:not([disabled])").first().click()
const slotsNow = await p.locator('[role=dialog] [role=radiogroup][aria-label="Välj tid"] button').allInnerTexts()
check(!slotsNow.map((s) => s.trim()).includes(slotText), "den förfrågade tiden är inte längre ledig")
await p.keyboard.press("Escape")

// 4. PT:n accepterar i kalendern
await p.setViewportSize({ width: 1440, height: 900 })
await p.goto(base + "/pt/kalender")
await p.waitForSelector("text=Väntande förfrågningar")
// Demodatan har en egen förfrågan från Sara (kl. 17:00 om 8 dagar) – meddelandet skiljer dem åt.
const request = p.locator("section[aria-labelledby=requests-title] li", { hasText: slotText }).filter({ hasText: "Sara Lindqvist" }).filter({ hasText: "Vill köra knäböjsteknik" })
check((await request.count()) === 1, "förfrågan syns i PT:ns panel")
check(await request.locator("text=Vill köra knäböjsteknik").isVisible(), "klientens meddelande syns i förfrågan")
await p.screenshot({ path: `${out}/pt-kalender-vecka.png`, fullPage: true })
await request.locator('button:has-text("Acceptera")').click()
await p.waitForSelector("text=Bokat med Sara Lindqvist")
check((await request.count()) === 0, "förfrågan försvinner från panelen efter accept")

await p.setViewportSize({ width: 390, height: 844 })
await p.goto(base + "/klient/kalender")
await p.waitForSelector("text=Mina pass")
await p.click('[role=tab]:has-text("Lista") >> visible=true')
check((await p.locator("text=Väntar på bekräftelse från PT").count()) === pendingBefore, "klientens förfrågan är inte längre väntande")
const card = p.locator("li, article", { hasText: slotText }).filter({ hasText: "Bekräftat" })
check((await card.count()) >= 1, "passet är bekräftat i klientens kalender")

// 5. Blockera tid och krockskydd
await p.setViewportSize({ width: 1440, height: 900 })
await p.goto(base + "/pt/kalender")
await p.waitForSelector("text=Väntande förfrågningar")
const d = new Date()
d.setDate(d.getDate() + 20)
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

await p.click('button:has-text("Ny händelse")')
await p.click('[role=radiogroup][aria-label="Typ"] button:has-text("Blockera tid")')
await p.fill("#ev-title", "Tandläkare")
await p.fill("#ev-date", date)
await p.fill("#ev-time", "20:00")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Tiden är blockerad")
await p.waitForSelector("[role=dialog]", { state: "detached" })
ok("PT blockerar tid")

await p.click('button:has-text("Ny händelse")')
await p.fill("#ev-title", "Extrapass")
await p.fill("#ev-date", date)
await p.fill("#ev-time", "20:30")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=/Krockar med \"Tandläkare\"/")
ok("manuell bokning som krockar med blockering stoppas")
await p.fill("#ev-time", "18:00")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Passet är inlagt i kalendern")
ok("manuell bokning av klient på ledig tid")

// 6. Vyer
await p.click('[role=tab]:has-text("Dag")')
await p.screenshot({ path: `${out}/pt-kalender-dag.png` })
await p.click('[role=tab]:has-text("Månad")')
await p.waitForTimeout(200)
await p.screenshot({ path: `${out}/pt-kalender-manad.png`, fullPage: true })
// Navigera till månaden med blockeringen och se den
if (d.getMonth() !== new Date().getMonth()) await p.click('button[aria-label="Nästa"]')
check(await p.locator('button[title*="Tandläkare"]').first().isVisible(), "blockeringen syns i månadsvyn")
await p.click('[role=tab]:has-text("Vecka")')

// 7. Tillgänglighet: en ny söndagstid ger fler lediga tider
await p.click('button:has-text("Tillgänglighet")')
const countText = p.locator("[role=dialog] >> text=/lediga tider de kommande/")
await countText.waitFor()
const n0 = Number((await countText.innerText()).match(/\d+/)[0])
await p.click('[role=dialog] button[aria-label="Lägg till tid på söndag"]')
await p.waitForFunction(
  (n) => Number(document.querySelector("[role=dialog]")?.innerText.match(/(\d+)\s*lediga tider/)?.[1]) > n,
  n0
)
ok(`ny tid på söndagar ger fler lediga tider (${n0} → fler)`)
await p.screenshot({ path: `${out}/pt-tillganglighet.png` })
await p.keyboard.press("Escape")

// 8. Mörkt läge och mobil dagvy
const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" })
const pd = await dark.newPage()
pd.on("pageerror", (e) => errors.push(`${pd.url()} pageerror: ${e.message}`))
await pd.goto(base + "/pt/kalender")
await pd.waitForSelector("text=Väntande förfrågningar")
check(await pd.locator('[role=tab][data-state=active]:has-text("Dag")').isVisible(), "mobil börjar i dagvy")
await pd.screenshot({ path: `${out}/pt-kalender-mobil-dark.png`, fullPage: true })

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
