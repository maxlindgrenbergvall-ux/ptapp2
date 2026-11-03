// E2E för v37 (mobilstädning) i demoläge på en liten telefon (360 px):
//   - inga sidor flödar ut i sidled,
//   - passet: vikten syns hela i fältet, "Varför?" visar förklaringen, "Förra" fyller i,
//     Vila finns kvar i passet, "Ta bort passet" ligger längst ned (eget pass),
//   - profilen samlar träningsinställningarna (vilotid i en dialog, hälsosynk, schema, nyhetsbrev),
//   - inga funktioner borta: Logga eget pass, Schema och splits, Inställningar → Träning.
//   BASE_URL=http://localhost:3000 node e2e/v37-mobil.test.mjs [skärmdumpsmapp]
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

const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

// ------------------------------------------------- inga sidor flödar ut ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
for (const path of ["/klient", "/klient/framsteg", "/klient/kost", "/klient/profil", "/klient/installningar", "/klient/kalender", "/klient/schema", "/klient/anslutningar"]) {
  await p.goto(base + path)
  await p.waitForTimeout(700)
  check(await noOverflow(), `${path}: ingen horisontell overflow på 360 px`)
}

// -------------------------------------------------------------- hemmet ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
check(await p.locator('button:has-text("Logga eget pass")').isVisible(), "Logga eget pass finns kvar")
check(await p.locator("[data-testid=open-schedule]").isVisible(), "Schema och splits finns kvar (bredvid)")
const [a, b] = await Promise.all([p.locator('button:has-text("Logga eget pass")').boundingBox(), p.locator("[data-testid=open-schedule]").boundingBox()])
check(Math.abs(a.y - b.y) < 4, "genvägarna ligger på samma rad")

// --------------------------------------------------------------- passet ---
const today = await p.evaluate(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})
const w = (await demo()).workouts.find((x) => x.clientId === "c1" && x.date === today && x.status !== "completed")
await p.goto(`${base}/klient/pass/${w.id}`)
await p.waitForSelector('input[aria-label="Vikt set 1 (kg)"]')
const fits = await p.locator('input[aria-label="Vikt set 1 (kg)"]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
check(fits, `vikten (${await p.inputValue('input[aria-label="Vikt set 1 (kg)"]')} kg) syns hela i fältet`)
check(await p.locator("[data-testid=rest-settings-button]").isVisible(), "Vila (vilotid) finns kvar i passet")
check((await p.locator('header button[aria-label="Ta bort passet"]').count()) === 0, "sidhuvudet är avlastat (ingen papperskorg)")
if (await p.locator("[data-testid=progression-hint]").count()) {
  const reason = p.locator("[data-testid=progression-hint] details p")
  check(!(await reason.isVisible()), "förklaringen till målet är dold tills man vill se den")
  await p.locator("[data-testid=progression-hint] summary").click()
  check(await reason.isVisible(), "Varför? visar förklaringen")
}
check((await p.locator("[data-testid=exercise-brief]").count()) >= 1, "mål, anteckning och förra gången i en samlad ruta")
await p.screenshot({ path: `${out}/v37-pass.png`, fullPage: true })

// Eget pass: Ta bort passet ligger längst ned och fungerar.
await p.goto(base + "/klient")
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-name", "Testpass v37")
await p.fill("#own-search", "knäböj")
await p.locator('ul[aria-label="Övningar att välja"] button').first().click()
await p.click('[role=dialog] button:has-text("Starta passet")')
await p.waitForURL(/\/klient\/pass\//)
await p.waitForSelector('button[aria-label="Ta bort passet"]')
check((await p.locator('header button[aria-label="Ta bort passet"]').count()) === 0, "eget pass: Ta bort ligger inte i sidhuvudet")
await p.click('button[aria-label="Ta bort passet"]')
await p.click('[role=alertdialog] button:has-text("Ta bort"), [role=dialog] button:has-text("Ta bort")')
await p.waitForURL(base + "/klient")
check(!(await demo()).workouts.some((x) => x.name === "Testpass v37"), "eget pass kan fortfarande tas bort")

// --------------------------------------------- profilen som inställningsnav ---
await p.goto(base + "/klient/profil")
await p.waitForSelector("[data-testid=profile-training]")
for (const label of ["Vilotid mellan set", "Hälsosynk och anslutningar", "Träningsschema och splits", "Nyhetsbrev och erbjudanden", "Alla inställningar"]) {
  check(await p.locator(`[data-testid=profile-training] >> text=${label}`).isVisible(), `profilen → Träning: ${label}`)
}
check(await p.locator("[data-testid=profile-goals] [data-testid=goal-pills], [data-testid=profile-goals] >> text=Du har inte valt").first().isVisible(), "Mina mål i ett kort")
check((await p.locator("[data-testid=profile-goals-link]").count()) === 1, "en genväg till Mål (ingen dubblett)")
await p.click("[data-testid=profile-rest]")
await p.waitForSelector("[data-testid=rest-settings]")
await p.click('[data-testid=rest-settings] [role=radio]:has-text("Alltid min vilotid")')
await p.click('[data-testid=rest-settings] [role=radio]:text-is("2 min")')
await p.keyboard.press("Escape")
check((await p.locator("[data-testid=profile-rest]").innerText()).includes("2 min"), "vilotiden ändras i profilen (2 min)")
check(await p.evaluate(() => JSON.parse(localStorage["coavira:rest:v1"] ?? "{}").seconds === 120), "och gäller för passen")
await p.screenshot({ path: `${out}/v37-profil.png`, fullPage: true })
check((await p.locator("[data-testid=delete-account-card]").count()) === 1, "Radera konto finns kvar i profilen")

// ------------------------------------------------------- inställningar ---
await p.goto(base + "/klient/installningar")
await p.waitForSelector("text=Preferenser")
check(await p.locator('a[href="/klient/profil#traning"]').isVisible(), "Inställningar → Träning leder till profilen")
check(await p.locator("text=Visa personliga erbjudanden").isVisible(), "personliga erbjudanden finns kvar")
check(await p.locator("[data-testid=marketing-toggle]").isVisible(), "nyhetsbrevet finns kvar")
await p.screenshot({ path: `${out}/v37-installningar.png`, fullPage: true })

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
