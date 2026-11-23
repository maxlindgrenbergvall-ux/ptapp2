// E2E för v69 i demoläge: bottenmenyn glider undan medan tangentbordet är uppe
// (textfält i fokus på en pekskärm) och kommer tillbaka när fältet lämnas.
// På en dator med mus står menyn kvar.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v69-meny-tangentbord.test.mjs
import { chromium, devices } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))

const phone = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "dark" })
const p = await phone.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))

const state = (sel) =>
  p.locator(sel).evaluate((el) => ({ hidden: el.dataset.hidden === "true", inert: el.inert, opacity: Number(getComputedStyle(el).opacity), top: el.getBoundingClientRect().top }))

// ---------------------------------------------------------------- klient ---
await p.goto(base + "/klient/kost")
await p.waitForSelector("[data-testid=meal-tiles]")
const nav = "[data-testid=client-bottom-nav]"
const before = await state(nav)
check(!before.hidden && !before.inert && before.opacity === 1, "menyn syns innan man skriver")
await p.locator('input[role="combobox"]').tap()
await p.waitForTimeout(350)
const typing = await state(nav)
check(typing.hidden && typing.inert && typing.opacity === 0 && typing.top > before.top, `menyn glider undan när sökfältet får fokus (opacity ${typing.opacity})`)
await p.locator("[data-testid=meal-tile][data-meal=dinner] [data-testid=meal-tile-add]").tap()
await p.waitForTimeout(350)
check((await state(nav)).hidden, "även via + på en måltidsbricka")
// Mellan två fält: menyn ska inte blinka fram.
await p.locator('input[role="combobox"]').evaluate((el) => el.blur())
await p.waitForTimeout(350)
const after = await state(nav)
check(!after.hidden && !after.inert && after.opacity === 1 && Math.abs(after.top - before.top) < 1, "menyn kommer tillbaka när fältet lämnas")
// Knappar och kryssrutor öppnar inget tangentbord.
await p.locator("[data-testid=meal-chips] [role=radio]").first().tap()
await p.waitForTimeout(250)
check(!(await state(nav)).hidden, "ett tryck på en knapp gömmer inte menyn")

// -------------------------------------------------------------------- PT ---
await p.goto(base + "/pt/meddelanden/c1")
const ptNav = "[data-testid=pt-bottom-nav]"
await p.waitForSelector(ptNav)
const field = p.locator("main textarea").first()
if (await field.count()) {
  await field.tap()
  await p.waitForTimeout(350)
  check((await state(ptNav)).hidden, "PT-appens bottenmeny glider också undan")
  await field.evaluate((el) => el.blur())
  await p.waitForTimeout(350)
  check(!(await state(ptNav)).hidden, "och kommer tillbaka")
} else {
  ok("PT: inget textfält på sidan (hoppar över)")
}
await phone.close()

// ---------------------------------------------------------------- dator ---
const desk = await browser.newContext({ viewport: { width: 390, height: 844 } })
const d = await desk.newPage()
await d.goto(base + "/klient/kost")
await d.waitForSelector("[data-testid=meal-tiles]")
await d.locator('input[role="combobox"]').click()
await d.waitForTimeout(300)
check(!(await d.locator(nav).evaluate((el) => el.dataset.hidden === "true")), "med mus (inget skärmtangentbord) står menyn kvar")
await desk.close()

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
