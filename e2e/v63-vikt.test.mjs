// E2E för hotfix v63 i demoläge: automatisk viktökning +1,25 kg och direkt
// inmatning av vikten (punkt/komma, tomt fält) med + och − kvar, utan skärmhopp.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v63-vikt.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: "dark" })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))
const KEY = "coavira:demo:v5"

await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  s.data.workouts.push({
    id: "w-v63", clientId: "c1", trainerId: null, byClient: true, date: new Date().toLocaleDateString("sv-SE"), name: "Vikt-pass", status: "planned", logs: [],
    exercises: [{ id: "a", exerciseId: "e-squat", sets: 3, reps: "5", restSec: 90 }],
  })
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/klient/pass/w-v63")
const ex = p.locator("section[data-tracking]").first()
await ex.waitFor()
if (!(await ex.locator("input[aria-label='Vikt set 1 (kg)']").count())) await ex.locator("button[aria-expanded]").first().click()
const kg1 = ex.locator("input[aria-label='Vikt set 1 (kg)']")
await kg1.waitFor()
await p.waitForTimeout(700) // sidövergången

// ------------------------------------------------ 1. +1,25 kg från förra passet ---
const reason = await ex.locator("[data-testid=progression-hint] details p").textContent()
const prev = Number(reason.match(/Förra passet: ([\d,]+) kg/)?.[1].replace(",", "."))
const expected = String(Math.round((prev + 1.25) * 100) / 100).replace(".", ",")
check(Number.isFinite(prev), `förra passets toppset hittas (${prev} kg)`, reason)
check((await kg1.inputValue()) === expected, `vikten förinställd: ${prev} + 1,25 = ${expected} kg`, await kg1.inputValue())
check((await ex.locator("[data-testid=progression-hint]").innerText()).includes("+1,25 kg från förra passet"), "diskret förklaring: +1,25 kg från förra passet")
check((await kg1.getAttribute("data-auto")) !== null && /text-primary/.test(await kg1.getAttribute("class")), "limegrön indikator på den förinställda vikten")
const color = await kg1.evaluate((el) => getComputedStyle(el).color)
check(color === "rgb(132, 204, 22)", `limegrön #84cc16 i mörkt läge (${color})`)
check((await kg1.getAttribute("type")) === "text" && (await kg1.getAttribute("inputmode")) === "decimal" && (await kg1.getAttribute("pattern")) === "[0-9.,]*", 'type="text", inputMode="decimal", pattern="[0-9.,]*"')

// ---------------------------------------- 2. tryck på siffran: allt markeras ---
const row = ex.locator("li").first()
const docBox = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { y: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width) } })
const before = await docBox(row)
const scrollBefore = await p.evaluate(() => scrollY)
await kg1.tap()
await p.waitForTimeout(80)
const sel = await kg1.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length])
check(sel[0] === 0 && sel[1] === sel[2] && sel[2] > 0, "tryck på vikten markerar hela värdet (skriv direkt utan att sudda)", sel)
await p.keyboard.type("62,5")
check((await kg1.inputValue()) === "62,5", "skriv 62,5 direkt (komma)")
check((await docBox(row)).y === before.y && (await docBox(row)).h === before.h, "raden står still medan man skriver", [before, await docBox(row)])
await p.keyboard.press("Enter")
check((await kg1.inputValue()) === "62,5" && (await kg1.getAttribute("data-auto")) === null, "egen vikt sparas och den limegröna markeringen försvinner")

// Punkt fungerar också (Android/iOS med engelskt tangentbord).
const kg2 = ex.locator("input[aria-label='Vikt set 2 (kg)']")
await kg2.tap()
await p.keyboard.type("70.5")
await p.keyboard.press("Enter")
check((await kg2.inputValue()) === "70,5", "skriv 70.5 (punkt) → 70,5")
await kg2.tap()
await p.keyboard.type("1,2,3")
check((await kg2.inputValue()) === "1,23", "bara ett decimaltecken", await kg2.inputValue())
await p.keyboard.press("Enter")

// ------------------------------------------------- 3. radering = helt blankt ---
const kg3 = ex.locator("input[aria-label='Vikt set 3 (kg)']")
await kg3.tap()
await p.keyboard.press("Backspace")
check((await kg3.inputValue()) === "", "raderad vikt = tomt fält")
await p.keyboard.press("Enter")
await p.waitForTimeout(100)
check((await kg3.inputValue()) === "", "fortfarande tomt efter att fältet lämnats – aldrig 0 eller 1", await kg3.inputValue())

// ------------------------------------------------------ 4. + och − finns kvar ---
await ex.getByRole("button", { name: "Öka Vikt set 1" }).tap()
check((await kg1.inputValue()) === "65", "+ ökar 2,5 kg (62,5 → 65)", await kg1.inputValue())
await ex.getByRole("button", { name: "Minska Vikt set 1" }).tap()
check((await kg1.inputValue()) === "62,5", "− minskar 2,5 kg (65 → 62,5)")
await ex.getByRole("button", { name: "Öka Vikt set 3" }).tap()
check((await kg3.inputValue()) === "2,5", "+ på ett tomt fält börjar från 0", await kg3.inputValue())

// ------------------------------------------------ 5. bocka av: vikten sparas ---
await ex.getByRole("button", { name: "Bocka av set 1" }).tap()
await p.waitForTimeout(200)
const log = await p.evaluate((k) => JSON.parse(localStorage[k]).data.workouts.find((w) => w.id === "w-v63").logs.find((l) => l.setIndex === 0), KEY)
check(log?.done && log.kg === 62.5, "avbockat set sparas med 62,5 kg", log)
check((await docBox(row)).h === before.h && (await p.evaluate(() => scrollY)) === scrollBefore, "ingen layoutförskjutning eller scrollhopp under hela flödet", [before, await docBox(row)])
check(!/\b1RM\b|one.rep.max/i.test(await p.locator("main").innerText()), "ingen 1RM i passet")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
