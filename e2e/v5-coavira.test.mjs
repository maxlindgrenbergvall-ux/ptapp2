// E2E för v5 i demoläge: Coavira-branding, systemstyrt färgtema (ingen temaknapp),
// aviseringsmenyn (avbokningar, ombokningar), personliga PT-erbjudanden utifrån
// klientens intressen och dra-och-släpp av preliminära pass med ombokningsflöde.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v5-coavira.test.mjs
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
const watch = (p) => {
  p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
  p.on("console", (m) => m.type() === "error" && errors.push(`${p.url()} console: ${m.text()}`))
  p.on("dialog", (d) => void d.accept())
  return p
}
const bell = (p) => p.locator('button[aria-label^="Aviseringar"] >> visible=true')
const openBell = async (p) => {
  await bell(p).click()
  await p.waitForSelector('[data-slot=popover-content] >> text=Aviseringar')
  await p.waitForTimeout(250) // in-toningen
}
const closeBell = async (p) => {
  await p.keyboard.press("Escape")
  await p.waitForSelector("[data-slot=popover-content]", { state: "detached" })
}
const popover = (p) => p.locator("[data-slot=popover-content]")
const bodyBg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor)
/** Ljushet 0–255 ur en beräknad färg (rgb(), lab() eller oklch()). */
const lightness = (color) => {
  const n = color.match(/[\d.]+/g).map(Number)
  if (color.startsWith("lab")) return n[0] * 2.55
  if (color.startsWith("oklch")) return n[0] <= 1 ? n[0] * 255 : n[0] * 2.55
  return (n[0] + n[1] + n[2]) / 3
}

// ------------------------------------------------- 1. branding och tema ---
const light = watch(await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" })).newPage())
await light.goto(base + "/")
check((await light.title()).includes("Coavira"), `sidtiteln är Coavira (${await light.title()})`)
check(await light.locator("h1:has-text('Coavira')").isVisible(), "startsidan visar Coavira")
check(!(await light.content()).includes("Forma"), "inget kvar av gamla namnet på startsidan")
check((await light.locator('button[aria-label="Växla ljust/mörkt läge"]').count()) === 0, "ingen manuell temaknapp")
const manifest = await (await fetch(base + "/manifest.webmanifest")).json()
check(manifest.name.startsWith("Coavira") && manifest.short_name === "Coavira", "webbappsmanifestet heter Coavira")
check((await fetch(base + "/icon.svg")).ok, "favicon (icon.svg) finns")
check(lightness(await bodyBg(light)) > 200, `ljust systemtema ger ljus bakgrund (${await bodyBg(light)})`)

const darkCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" })
const dark = watch(await darkCtx.newPage())
await dark.goto(base + "/klient")
await dark.waitForSelector("text=Dagens träning")
check(lightness(await bodyBg(dark)) < 60, `mörkt systemtema ger mörk bakgrund (${await bodyBg(dark)})`)
await dark.emulateMedia({ colorScheme: "light" })
await dark.waitForTimeout(100)
check(lightness(await bodyBg(dark)) > 200, "temat byts direkt när systemet byter till ljust")
await dark.emulateMedia({ colorScheme: "dark" })

// ---------------------------------------------- 2. klientens aviseringar ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = watch(await ctx.newPage())
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
check((await bell(p).getAttribute("aria-label")) === "Aviseringar, 3 nya", `klockan visar antal olästa (${await bell(p).getAttribute("aria-label")})`)
await openBell(p)
check(await popover(p).locator("text=Elin avbokade 2 pass").isVisible(), "två avbokningar från samma PT visas som en avisering")
check(await popover(p).locator("text=Elin har flyttat ditt pass").isVisible(), "ombokningsavisering visas")
check(await popover(p).locator("text=Tidigare:").isVisible(), "ombokningen visar den gamla tiden")
check(await popover(p).locator("text=Utforska inriktningar").isVisible(), "inga erbjudanden innan klienten visat intresse")
await p.screenshot({ path: `${out}/v5-klient-aviseringar.png` })
await closeBell(p)
check((await bell(p).getAttribute("aria-label")) === "Aviseringar", "aviseringarna markeras som lästa när menyn stängs")

// ---------------------------------------- 3. personliga PT-erbjudanden ---
await p.goto(base + "/klient/hitta")
await p.click('[role=group][aria-label="Inriktning"] button:has-text("Hyrox")')
await p.waitForTimeout(200)
check((await bell(p).getAttribute("aria-label")) === "Aviseringar, 1 nya", "intresse för Hyrox ger ett nytt erbjudande i klockan")
await openBell(p)
check(await popover(p).locator("text=Hyrox Stockholm – 6 veckor").isVisible(), "Hyrox-erbjudande visas")
check(await popover(p).locator("text=För att du tittat på Hyrox").isVisible(), "erbjudandet förklarar varför det visas")
check(!(await popover(p).locator("text=Muscle-up-workshop").isVisible()), "erbjudanden i andra kategorier visas inte")
await p.screenshot({ path: `${out}/v5-klient-erbjudanden.png` })
await popover(p).locator('button[aria-label="Dölj erbjudandet Hyrox Stockholm – 6 veckor"]').click()
check(!(await popover(p).locator("text=Hyrox Stockholm – 6 veckor").isVisible()), "dolt erbjudande försvinner")
await closeBell(p)

await p.fill('input[aria-label="Sök PT"]', "viktminskning")
await p.waitForTimeout(1600)
await openBell(p)
const vikt = await popover(p).locator("text=/12 veckor mot ditt mål|Kom igång-paket/").count()
check(vikt >= 1, `sökning på en kategori ger erbjudanden i den kategorin (${vikt})`)
await popover(p).getByLabel("Personliga erbjudanden").click()
check(await popover(p).locator("text=Personliga erbjudanden är avstängda").isVisible(), "personliga erbjudanden kan stängas av")
check(await p.evaluate(() => JSON.parse(localStorage["coavira:interests:v1:c1"]).events.length === 0), "avstängning raderar intressehistoriken (bara lokalt)")
await popover(p).getByLabel("Personliga erbjudanden").click()
await closeBell(p)

// -------------------------------- 4. klienten föreslår en ny tid ---
await p.goto(base + "/klient/kalender")
await p.waitForSelector("text=Ny tid – ditt svar behövs")
check(await p.locator("text=/har föreslagit en ny tid/").isVisible(), "banner om tid som väntar på klientens svar")
await p.screenshot({ path: `${out}/v5-klient-ny-tid.png`, fullPage: true })
const movedCard = p.locator("li", { hasText: "Ny tid – ditt svar behövs" })
await movedCard.locator('button:has-text("Föreslå ny tid")').click()
await p.waitForSelector("text=Föreslå en ny tid")
await p.locator("[role=dialog] [role=grid] button:not([disabled])").first().click()
const proposed = (await p.locator('[role=dialog] [role=radiogroup][aria-label="Välj tid"] button').first().innerText()).trim()
await p.locator('[role=dialog] [role=radiogroup][aria-label="Välj tid"] button').first().click()
await p.click('[role=dialog] button:has-text("Skicka förslag")')
await p.waitForSelector("text=Nytt förslag skickat till Elin")
check((await p.locator("text=Ny tid – ditt svar behövs").count()) === 0, `klientens motförslag (${proposed}) väntar nu på PT:n`)

// ------------------------------------------ 5. PT: avisering + dra-och-släpp ---
await p.setViewportSize({ width: 1440, height: 900 })
await p.goto(base + "/pt/kalender")
await p.waitForSelector("text=Väntande förfrågningar")
await openBell(p)
check(await popover(p).locator("text=Sara Lindqvist föreslår en ny tid").isVisible(), "PT:n aviseras om klientens motförslag")
check(await popover(p).locator("text=Jonas Pettersson avbokade ett pass").isVisible(), "PT:n ser klientens avbokning")
await p.screenshot({ path: `${out}/v5-pt-aviseringar.png` })
await closeBell(p)
check(await p.locator("text=Ny tid föreslagen av klienten").isVisible(), "förfrågningspanelen visar att klienten föreslagit ny tid")

// Preliminärt pass till Sara om två dagar kl. 13.
const d = new Date()
d.setDate(d.getDate() + 2)
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
await p.click('button:has-text("Ny händelse")')
await p.fill("#ev-title", "Provpass")
await p.fill("#ev-date", date)
await p.fill("#ev-time", "13:00")
await p.click("text=Preliminärt – klienten bekräftar")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Preliminärt pass skickat")
await p.waitForSelector("[role=dialog]", { state: "detached" })
ok("PT lägger in ett preliminärt pass")
// Blockering 16–17 samma dag (för krocktestet nedan).
await p.click('button:has-text("Ny händelse")')
await p.click('[role=radiogroup][aria-label="Typ"] button:has-text("Blockera tid")')
await p.fill("#ev-title", "Möte")
await p.fill("#ev-date", date)
await p.fill("#ev-time", "16:00")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Tiden är blockerad")
await p.waitForSelector("[role=dialog]", { state: "detached" })

await p.click('[role=tab]:has-text("Dag")')
await p.click('button[aria-label="Nästa"]')
await p.click('button[aria-label="Nästa"]')
const tentative = p.locator('button[aria-label*="Sara Lindqvist, 13:00–14:00"]')
await tentative.waitFor()
check((await tentative.getAttribute("aria-label")).includes("dra för att föreslå en ny tid"), "preliminärt pass är markerat som flyttbart")

// Lås: bekräftat pass går inte att flytta.
const locked = p.locator('button[aria-label*="Bekräftat pass: Sara Lindqvist, 07:00–08:00"]')
const lb = await locked.boundingBox()
await p.mouse.move(lb.x + lb.width / 2, lb.y + 10)
await p.mouse.down()
await p.mouse.move(lb.x + lb.width / 2, lb.y + 140, { steps: 8 })
check((await p.locator('[data-testid="drag-preview"]').count()) === 0, "bekräftat pass får ingen dragförhandsvisning (låst)")
await p.mouse.up()
await p.waitForTimeout(200)
check((await p.locator("text=Föreslå ny tid?").count()) === 0, "bekräftat pass kan inte flyttas med dra-och-släpp")
await p.keyboard.press("Escape")
await p.waitForSelector("[role=dialog]", { state: "detached" }).catch(() => {})

// Dra det preliminära passet två timmar ned (64 px/timme i dagvyn).
const box = await tentative.boundingBox()
await p.mouse.move(box.x + box.width / 2, box.y + 10)
await p.mouse.down()
await p.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 5 })
await p.mouse.move(box.x + box.width / 2, box.y + 10 + 128, { steps: 10 })
await p.waitForSelector('[data-testid="drag-preview"] >> text=15:00–16:00')
await p.screenshot({ path: `${out}/v5-pt-dra.png` })
await p.mouse.up()
await p.waitForSelector("text=Föreslå ny tid?")
check(await p.locator("[role=dialog] >> text=/15:00–16:00/").isVisible(), "släpp ger en bekräftelse med den nya tiden")
await p.click('[role=dialog] button:has-text("Skicka förslag")')
await p.waitForSelector("text=Ny tid föreslagen till Sara Lindqvist")
await p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })
check(await p.locator('button[aria-label*="Sara Lindqvist, 15:00–16:00"]').isVisible(), "passet ligger på den nya tiden")

// Krock: dra in i blockeringen 16–17 ger röd förhandsvisning och ingen flytt.
const moved = p.locator('button[aria-label*="Sara Lindqvist, 15:00–16:00"]')
const mb = await moved.boundingBox()
await p.mouse.move(mb.x + mb.width / 3, mb.y + 20, { steps: 3 })
await p.mouse.down()
await p.mouse.move(mb.x + mb.width / 3, mb.y + 20 + 32, { steps: 4 })
await p.waitForSelector('[data-testid="drag-preview"] >> text=krockar')
ok("krock visas i förhandsvisningen")
await p.mouse.up()
await p.waitForTimeout(200)
check((await p.locator("text=Föreslå ny tid?").count()) === 0, "släpp på en krockande tid flyttar inte passet")

// -------------------------------- 6. klienten accepterar i aviseringsmenyn ---
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
await openBell(p)
const item = popover(p).locator("li", { hasText: "Elin har flyttat ditt pass" }).filter({ hasText: "15:00–16:00" })
check((await item.count()) === 1, "klienten får en ombokningsavisering med den nya tiden")
await item.locator('button:has-text("Acceptera")').click()
await p.waitForSelector("text=Tiden är accepterad")
await closeBell(p)

await p.goto(base + "/klient/kalender")
await p.waitForSelector("text=Mina pass")
const accepted = p.locator("li", { hasText: "15:00–16:00" }).filter({ hasText: "Bekräftat" })
check((await accepted.count()) === 1, "accepterad tid är bekräftad i klientens kalender")
// Avboka ett bekräftat pass → PT:n aviseras.
await p.locator("li", { hasText: "Teknik knäböj" }).filter({ hasText: "Bekräftat" }).first().locator('button:has-text("Avboka")').click()
await p.waitForSelector("text=Passet är avbokat")

await p.setViewportSize({ width: 1440, height: 900 })
await p.goto(base + "/pt/kalender")
await p.waitForSelector("text=Väntande förfrågningar")
await openBell(p)
check(await popover(p).locator("text=Sara Lindqvist accepterade den nya tiden").isVisible(), "PT:n aviseras när klienten accepterar")
check(await popover(p).locator("text=Sara Lindqvist avbokade ett pass").isVisible(), "PT:n aviseras direkt när klienten avbokar")
await closeBell(p)
// Dagvyn två dagar fram (veckovyn visar bara innevarande vecka, t.ex. på en söndag).
await p.click('[role=tab]:has-text("Dag")')
await p.click('button[aria-label="Nästa"]')
await p.click('button[aria-label="Nästa"]')
const locked2 = p.locator('button[aria-label*="Bekräftat pass: Sara Lindqvist, 15:00–16:00"]')
await locked2.waitFor()
check((await locked2.count()) === 1 && !(await locked2.getAttribute("aria-label")).includes("dra för att"), "accepterat pass är låst")

// ------------------------------------------------- 7. PT skapar erbjudande ---
await p.goto(base + "/pt/profil")
await p.click('button:has-text("Nytt erbjudande")')
await p.fill("#offer-title", "Höstkampanj styrka")
await p.click('[aria-label="Pristyp"]')
await p.click('[role=option]:has-text("Rabatt i %")')
await p.fill("#offer-amount", "10")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Erbjudandet är publicerat")
check(await p.locator("text=Höstkampanj styrka").first().isVisible(), "PT:n kan skapa erbjudanden per inriktning")

// ----------------------------------------- 7b. inga gratispass (v6) ---
await p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })
await p.click('button:has-text("Nytt erbjudande")')
await p.fill("#offer-title", "Gratis provpass")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Erbjudanden kan inte vara gratis")
await p.fill("#offer-title", "Provpaket")
await p.click('[aria-label="Pristyp"]')
await p.click('[role=option]:has-text("Rabatt i %")')
await p.fill("#offer-amount", "100")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Rabatten ska vara 1–99 %")
ok("gratispass (gratis i texten eller 100 % rabatt) kan inte skapas")
await p.keyboard.press("Escape")
check(!(await p.evaluate(() => JSON.stringify(JSON.parse(localStorage["coavira:demo:v1"]).data.offers))).match(/gratis/i), "inga gratiserbjudanden i datan")

// ------------------------------- 7c. startsidan: inloggning/registrering (v6) ---
const fresh = watch(await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage())
await fresh.goto(base + "/")
check(await fresh.locator("text=Fortsätt med Apple").isVisible() && await fresh.locator("text=Fortsätt med Google").isVisible(), "startsidan har Apple och Google")
check((await fresh.locator("text=Jag är PT").count()) === 0, "startsidan har inget PT/klient-val")
await fresh.click("text=Registrera dig")
await fresh.fill("#email", "demo@test.se"); await fresh.fill("#phone", "0701234567"); await fresh.fill("#password", "hemligt123")
await fresh.click('button[type=submit]')
await fresh.waitForURL(base + "/valkommen")
check((await fresh.locator("text=Jag är PT >> visible=true").count()) === 0, "välkomststeget har inget PT-val (v7)")
await fresh.click("#consent")
await fresh.click('button[type=submit]')
await fresh.waitForURL(base + "/klient")
ok("demo: registrering → välkomststeget → klientkonto")
await fresh.goto(base + "/")
await fresh.click("text=PT-inloggning")
await fresh.waitForURL(base + "/logga-in/pt")
await fresh.waitForSelector("h1:has-text('PT-inloggning')")
await fresh.waitForTimeout(300)
// (Next behåller föregående sida dold vid klientnavigering, därför bara synliga element.)
check((await fresh.locator("text=/Fortsätt med|Registrera dig/ >> visible=true").count()) === 0, "PT-inloggningen har bara e-post och lösenord")
await fresh.fill("#email", "elin@test.se"); await fresh.fill("#password", "hemligt123"); await fresh.click('button[type=submit]')
await fresh.waitForURL(base + "/pt")
ok("demo: PT loggar in via PT-inloggningen")
await fresh.screenshot({ path: `${out}/v7-demo-pt.png` })

// ------------------------------------------------------- 8. mörkt läge ---
await dark.goto(base + "/klient")
await dark.waitForSelector("text=Dagens träning")
await openBell(dark)
await dark.screenshot({ path: `${out}/v5-klient-aviseringar-dark.png` })
await closeBell(dark)

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
