// E2E för v67 i demoläge: kostloggen rör sig med samma fjäder som vattenglaset.
// Måltidsväljaren glider, snabbval bekräftas med en bock, brickan studsar och
// staplarna glider, en borttagen rad fälls ihop (med Ångra) och en vara från
// sökningen ger en enda toast.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v67-kost-smooth.test.mjs [skärmbildsmapp]
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

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))

await p.goto(base + "/klient/kost")
await p.waitForSelector("[data-testid=meal-tiles]")
await p.waitForTimeout(600)

// --------------------------------------------------------- måltidsväljaren ---
const chips = p.locator("[data-testid=meal-chips]")
const pillX = () => chips.evaluate((el) => el.querySelector("span[aria-hidden]").getBoundingClientRect().left)
const btnX = (label) => chips.locator(`[role=radio]:has-text('${label}')`).evaluate((el) => el.getBoundingClientRect().left)
await chips.locator("[role=radio]:has-text('Frukost')").click()
await p.waitForTimeout(900)
const start = await pillX()
check(Math.abs(start - (await btnX("Frukost"))) < 1.5, "markeringen ligger under Frukost")
await chips.locator("[role=radio]:has-text('Middag')").click()
await p.waitForTimeout(70)
const mid = await pillX()
await p.waitForTimeout(900)
const end = await pillX()
const target = await btnX("Middag")
check(mid > start + 2 && mid < target - 2, `markeringen glider (inte hoppar) till Middag (${start.toFixed(0)} → ${mid.toFixed(0)} → ${end.toFixed(0)})`)
check(Math.abs(end - target) < 1.5, "och landar exakt under knappen")
check((await chips.locator("[role=radio][aria-checked=true]").innerText()) === "Middag", "Middag är vald (aria-checked)")

// ------------------------------------------------ sök → portion → en toast ---
await p.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {})
await p.waitForTimeout(500)
const toastsBefore = await p.locator("[data-sonner-toast]").count()
await p.fill('input[role="combobox"]', "kvarg")
await p.locator("#food-picker-results [role=option]").first().click()
const form = p.locator("form:has(input[aria-label='Mängd i gram'])")
await form.waitFor()
check(/rise-in/.test(await form.getAttribute("class")), "portionsformuläret glider in")
const kcalField = form.locator("div.text-lg")
const k1 = await kcalField.innerText()
await form.locator("input[aria-label='Mängd i gram']").fill("400")
await p.waitForTimeout(80)
const kMid = await kcalField.innerText()
await p.waitForTimeout(500)
const k2 = await kcalField.innerText()
check(k1 !== k2 && kMid !== k2, `kcal i formuläret räknar mjukt (${k1} → ${kMid} → ${k2})`)
await form.locator("button[type=submit]").click()
await p.waitForTimeout(400)
check((await p.locator("[data-sonner-toast]").count()) - toastsBefore === 1, "en enda toast när varan läggs till (inte två)")

// ----------------------------------------------- snabbval, bricka, staplar ---
const dinner = p.locator("[data-testid=meal-tile][data-meal=dinner]")
const tileH = await dinner.evaluate((el) => el.getBoundingClientRect().height)
const kcalOf = async () => Number((await dinner.locator("[data-testid=meal-tile-kcal]").innerText()).replace(/\D/g, "")) || 0
const before = await kcalOf()
const quick = p.locator("[data-testid=quick-add]").first()
if (await quick.count()) {
  await quick.click()
  await p.waitForTimeout(60)
  check((await quick.locator(".check-draw").count()) === 1, "snabbvalet bekräftas med en bock i knappen")
  const scale = await dinner.evaluate((el) => el.style.transform)
  check(/scale\(1\.0/.test(scale), `middagsbrickan studsar till (${scale})`)
  const seg = () => dinner.locator("[aria-hidden] > span").last().evaluate((el) => el.style.transform)
  const segMid = await seg()
  await p.waitForTimeout(1300)
  check((await dinner.evaluate((el) => el.style.transform)) === "", "och lägger sig (ingen transform kvar)")
  check((await quick.locator(".check-draw").count()) === 0, "bocken byts tillbaka till plus")
  const segEnd = await seg()
  check(/scaleX/.test(segEnd) && segMid !== segEnd, `proteinstapeln glider med fjädern (${segMid} → ${segEnd})`)
  check((await kcalOf()) > before, `kcal på brickan ökar (${before} → ${await kcalOf()})`)
  check(Math.abs((await dinner.evaluate((el) => el.getBoundingClientRect().height)) - tileH) < 0.5, "brickan behåller sin höjd")
} else {
  fail("inga snabbval i demodatan")
}
await p.screenshot({ path: `${out}/v67-kost-brickor.png` })

// ------------------------------------------------- ta bort, fäll ihop, ångra ---
const rows = p.locator("[data-testid=food-log] li")
const n = await rows.count()
const first = rows.first()
const name = await first.locator("span.truncate").first().innerText()
const h0 = await first.evaluate((el) => el.getBoundingClientRect().height)
await first.locator("button[aria-label^='Ta bort']").click()
await p.waitForTimeout(220)
const h1 = await first.evaluate((el) => el.getBoundingClientRect().height).catch(() => 0)
check(h1 < h0 && h1 > 0, `raden fälls ihop mjukt (${h0.toFixed(0)} → ${h1.toFixed(0)} px)`)
await p.waitForTimeout(400)
check((await rows.count()) === n - 1, "och tas sedan bort")
const toast = p.locator("[data-sonner-toast]", { hasText: `${name} borttagen` })
await toast.waitFor()
ok("toast med Ångra efter borttagning")
await toast.locator("button:has-text('Ångra')").click()
await p.waitForTimeout(300)
check((await rows.count()) === n, "Ångra lägger tillbaka posten")

// --------------------------------------------------------- byta dag ---
await p.locator("button[aria-label='Föregående dag']").click()
await p.waitForTimeout(300)
await p.locator("button[aria-label='Nästa dag']").click()
await p.waitForTimeout(300)
check((await p.locator("[data-testid=food-log] li.row-flash").count()) === 0, "poster som redan fanns lyser inte till när man byter dag")

// ----------------------------------------------------- minska rörelse ---
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
const q = await rm.newPage()
await q.goto(base + "/klient/kost")
await q.waitForSelector("[data-testid=meal-chips]")
const c2 = q.locator("[data-testid=meal-chips]")
await c2.locator("[role=radio]:has-text('Frukost')").click()
await c2.locator("[role=radio]:has-text('Mellanmål')").click()
await q.waitForTimeout(50)
const px = await c2.evaluate((el) => el.querySelector("span[aria-hidden]").getBoundingClientRect().left)
const bx = await c2.locator("[role=radio]:has-text('Mellanmål')").evaluate((el) => el.getBoundingClientRect().left)
check(Math.abs(px - bx) < 1.5, "minska rörelse: markeringen flyttas direkt")
await rm.close()

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
