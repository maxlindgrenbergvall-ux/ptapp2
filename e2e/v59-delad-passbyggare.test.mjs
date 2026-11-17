// E2E för v59 i demoläge: PT:ns passbyggare är exakt samma komponent som
// klientens ("Upplägg / Tips"). Skillnaden är bara valet längst ned: tilldela
// till klient eller spara som PT-mall. Ingen 1RM, blanka fält och inga hopp.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v59-delad-passbyggare.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const KEY = "coavira:demo:v5"
const demo = () => p.evaluate((k) => JSON.parse(localStorage[k]).data, KEY)
const patch = async (fn) => {
  await p.evaluate(
    ([k, src]) => {
      const s = JSON.parse(localStorage[k])
      new Function("d", src)(s.data)
      localStorage[k] = JSON.stringify(s)
    },
    [KEY, fn]
  )
  await p.reload()
}

/** Byggarens struktur (utan rollens val längst ned): test-id:n i ordning. */
const structure = () =>
  p.evaluate(() => {
    const root = document.querySelector("[data-testid=split-library], [data-testid=split-editor]")
    return [...root.querySelectorAll("[data-testid]")].map((e) => e.dataset.testid).filter((id) => !/^(pt-|assign-|split-assign|split-create|split-plan$|my-template|open-template)/.test(id))
  })
const pick = async (day, query, name) => {
  await day.locator("[data-testid=split-add-exercise]").click()
  const dlg = p.locator("[data-testid=exercise-picker-dialog]")
  await dlg.waitFor()
  await dlg.getByRole("textbox").first().fill(query)
  await dlg.locator("button", { hasText: name }).first().click()
  await dlg.waitFor({ state: "detached" })
}

// --------------------------------------- 1. samma byggare för båda rollerna ---
await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
await p.goto(base + "/klient/schema")
await p.waitForSelector("[data-testid=split-library], [data-testid=change-split]")
if (await p.locator("[data-testid=change-split]").count()) await p.click("[data-testid=change-split]")
await p.waitForSelector("[data-testid=split-library]")
const clientLib = await structure()
await p.click("[data-testid=split-hyrox_prep]")
await p.waitForSelector("[data-testid=split-editor]")
const clientEditor = await structure()
check(await p.locator("[data-testid=split-create]").isVisible(), "klient: Använd upplägget längst ned")
check((await p.locator("[data-testid=pt-actions]").count()) === 0, "klienten ser inte PT:ns tilldelning")

await p.goto(base + "/pt/pass")
await p.waitForSelector("[data-testid=pt-workout-builder] [data-testid=split-library]")
check((await p.locator("main h1").first().innerText()) === "Passbyggare", "PT: Passbyggare")
const ptLib = await structure()
check(JSON.stringify(ptLib) === JSON.stringify(clientLib), `uppläggsbiblioteket är identiskt (${ptLib.length} delar)`, { ptLib: ptLib.slice(0, 12), clientLib: clientLib.slice(0, 12) })
check(await p.locator("[data-testid=plan-category]").isVisible(), "PT: pill-raden Alla/Styrka/Löpning/Hyrox högst upp")
check((await p.locator("[data-testid=my-templates] [data-testid=my-template]").count()) >= 1, "PT: Mina mallar i samma bibliotek")
await p.click("[data-testid=split-hyrox_prep]")
await p.waitForSelector("[data-testid=split-editor]")
const ptEditor = await structure()
check(JSON.stringify(ptEditor) === JSON.stringify(clientEditor), `byggaren är identisk för PT och klient (${ptEditor.length} delar)`, { ptEditor: ptEditor.slice(0, 20), clientEditor: clientEditor.slice(0, 20) })
check((await p.locator("[data-testid=add-rest-day]").count()) === 1 && (await p.locator("[data-testid=split-rest-day]").count()) >= 1, "PT: flyttbara vilodagar")
check((await p.locator("[data-testid=days-per-week] [role=radio]").count()) === 5 && (await p.locator("input[type=date]").count()) === 0, "PT: dagar per vecka, inga datumfält")
check((await p.locator("[data-testid=block-header]").count()) === 2, "PT: blocken i Hyrox Race Prep (Block A och B)")
check(await p.locator("[data-testid=pt-actions]").isVisible(), "PT: Tilldela till klient / Spara som PT-mall längst ned")
check((await p.locator("text=/1RM|1 RM|e1RM/").count()) === 0, "ingen 1RM någonstans i byggaren")
await p.screenshot({ path: `${out}/v59-pt-byggare.png`, fullPage: true })

// ----------------------------------- 2. tilldela upplägget till en klient ---
const actionBox = await p.locator("[data-testid=pt-actions]").boundingBox()
await p.click("[data-testid=pt-action] [data-action=template]")
const actionBox2 = await p.locator("[data-testid=pt-actions]").boundingBox()
check(Math.abs(actionBox.height - actionBox2.height) < 2, "panelen behåller höjden när läget byts", { actionBox, actionBox2 })
await p.click("[data-testid=pt-action] [data-action=assign]")
check(!(await p.locator("[data-testid=split-assign]").isEnabled()), "Tilldela är avstängd tills en klient är vald")
const clientChips = p.locator("[data-testid=assign-clients] [data-client]")
check((await clientChips.count()) >= 1, `PT:ns aktiva klienter att välja (${await clientChips.count()})`)
await p.click("[data-testid=assign-clients] [data-client=c1]")
check((await p.locator("[data-testid=split-assign]").innerText()).includes("Tilldela till 1 klient"), "knappen: Tilldela till 1 klient")
await p.click("[data-testid=days-per-week] [aria-label='4 dagar per vecka']")
await p.click("[data-testid=split-assign]")
await p.waitForSelector("[data-sonner-toast]:has-text('Upplägget är tilldelat')")
let d = await demo()
const assigned = d.activeSplits.find((s) => s.clientId === "c1")
check(assigned?.key === "hyrox_prep" && assigned.assignedBy === "t1" && assigned.daysPerWeek === 4 && assigned.nextDay === 0, "klientens aktiva schema = Hyrox Race Prep, 4 dagar/v, från PT:n", assigned && { key: assigned.key, by: assigned.assignedBy, n: assigned.daysPerWeek })
check(assigned?.days.some((day) => day.rest) && assigned.days[0].exercises.some((e) => e.blockId && e.trackingType === "running"), "vilodagar, block och löpfält följer med")
await p.waitForSelector("[data-testid=split-library]")
ok("byggaren börjar om på uppläggen efter tilldelningen")

// Klienten ser upplägget från sin PT.
await p.goto(base + "/klient/schema")
await p.waitForSelector("[data-testid=active-split]")
check(/^Från /.test(await p.locator("[data-testid=split-owner]").innerText()), "klienten: upplägget märkt Från <PT>", await p.locator("[data-testid=split-owner]").innerText())

// ------------------------------------- 3. spara som PT-mall + egen övning ---
await p.goto(base + "/pt/pass")
await p.waitForSelector("[data-testid=split-library]")
const before = (await demo()).templates.filter((t) => t.trainerId === "t1").length
await p.fill("[data-testid=split-library] input[aria-label='Antal pass']", "1")
await p.click("[data-testid=split-custom]")
const day = p.locator("[data-testid=split-day]").first()
await day.locator("input[aria-label^='Namn på dag']").fill("Ben & motor")
await pick(day, "hip thrust", /Hip Thrust/)
await pick(day, "sled push", /^Sled Push/)
await pick(day, "hyrox 1 km", /Hyrox 1 km/)
const rows = day.locator("[data-testid=split-exercise]")
check((await rows.count()) === 3, "tre övningar i dagen")
// Adaptiva fält: styrka, kondition, löpning.
const labels = async (i) => (await rows.nth(i).locator("label").allInnerTexts()).map((x) => x.split("\n")[0].trim())
check((await labels(0)).join("|") === "Set|Reps|Vikt (kg)", "styrka: Set × Reps × Vikt (kg)", await labels(0))
check((await labels(1)).join("|") === "Varv|Distans (m)|Reps / kal", "Sled Push: Varv × Distans (m) × Reps / kal", await labels(1))
check((await labels(2)).join("|") === "Intervaller|Distans (km)|Tempo (min/km)|Vila (s)", "Hyrox 1 km: Intervaller × Distans × Tempo × Vila", await labels(2))
check((await rows.nth(1).getByLabel(/Distans \(m\)/).inputValue()) === "50", "Sled Push läggs till som 50 m")
// Blanka fält – aldrig 1.
const setField = rows.nth(0).getByLabel(/^Set för/)
const rowH = (await rows.nth(0).boundingBox()).height
await setField.fill("")
await rows.nth(0).getByLabel(/^Startvikt/).fill("")
await rows.nth(2).getByLabel(/Distans \(km\)/).fill("")
await rows.nth(2).getByLabel(/Tempo/).fill("")
await p.mouse.click(5, 5)
check((await setField.inputValue()) === "" && (await rows.nth(0).getByLabel(/^Startvikt/).inputValue()) === "", "styrka: Set och Vikt kan tömmas helt")
check((await rows.nth(2).getByLabel(/Distans \(km\)/).inputValue()) === "" && (await rows.nth(2).getByLabel(/Tempo/).inputValue()) === "", "löpning: Distans och Tempo kan tömmas helt")
check(Math.round((await rows.nth(0).boundingBox()).height) === Math.round(rowH), "raden ändrar inte höjd när fälten töms")
await p.click("[data-testid=pt-action] [data-action=template]")
await p.click("[data-testid=split-create]")
await p.waitForSelector("[data-sonner-toast]:has-text('Fyll i fälten')")
check(((await demo()).templates.filter((t) => t.trainerId === "t1").length) === before, "tomma fält stoppar sparningen (inget fylls i automatiskt)")
check((await setField.inputValue()) === "", "fältet är fortfarande tomt efter försöket")
await setField.fill("4")
await rows.nth(0).getByLabel(/^Startvikt/).fill("80")
await rows.nth(2).getByLabel(/Distans \(km\)/).fill("1")
await rows.nth(2).getByLabel(/Tempo/).fill("4:50")
// Block: löpningen kopplas till Sled Push ovanför, 4 varv.
await rows.nth(2).locator("[data-testid=link-block]").click()
await day.locator("[data-testid=block-header]").waitFor()
await day.locator("[data-testid=block-header]").getByRole("textbox").fill("4")
// Mer: del av passet och instruktioner (samma för klient och PT).
await rows.nth(0).locator("[data-testid=exercise-more]").click()
await rows.nth(0).locator("[data-testid=exercise-more-panel]").waitFor()
await rows.nth(0).getByLabel(/^Instruktioner för/).fill("Paus 1 s i toppen")
// Egen övning direkt i byggaren.
await day.locator("[data-testid=split-create-exercise]").click()
await p.fill("#cx-name", "Släde med rep v59")
await p.fill("#cx-weight", "40")
await p.locator("[role=dialog] button:has-text('Spara och lägg i')").click()
await p.waitForSelector("[data-testid=split-exercise]:has-text('Släde med rep v59')")
await p.screenshot({ path: `${out}/v59-pt-egen-dag.png`, fullPage: true })
await p.click("[data-testid=split-create]")
await p.waitForSelector("[data-sonner-toast]:has-text('Mallen är sparad')")
d = await demo()
const tpl = d.templates.find((t) => t.trainerId === "t1" && t.name.endsWith("Ben & motor"))
check(Boolean(tpl), "PT-mallen sparas i PT:ns bibliotek")
const ex = (id) => tpl?.exercises.find((e) => e.exerciseId === id)
const custom = d.exercises.find((e) => e.name === "Släde med rep v59")
check(ex(tpl?.exercises[0].exerciseId)?.sets === 4 && tpl.exercises[0].targetKg === 80 && tpl.exercises[0].notes === "Paus 1 s i toppen", "styrka: 4 set, 80 kg och instruktionen sparas", tpl?.exercises[0])
check(ex("e-sledpush")?.blockId && ex("e-sledpush").blockId === ex("e-hyrox-run")?.blockId && ex("e-sledpush").sets === 4 && ex("e-hyrox-run").sets === 4, "blocket sparas: samma blockId, 4 varv")
check(ex("e-hyrox-run")?.distanceM === 1000 && ex("e-hyrox-run").paceSecPerKm === 290, "löpningen: 1 km i 4:50/km")
check(custom?.custom?.ownerId === "t1" && ex(custom.id)?.targetKg === 40, "egen övning sparad på PT:n och lagd i mallen (40 kg)")
check(Boolean(tpl) && !/1RM|oneRm|e1rm/i.test(JSON.stringify(tpl)), "ingen 1RM i den sparade mallen")

// Mallen öppnas i samma byggare och uppdateras (ingen dubblett).
await p.waitForSelector("[data-testid=split-library]")
await p.locator("[data-testid=my-template]:has-text('Ben & motor') [data-testid=open-template]").click()
await p.waitForSelector("[data-testid=split-editor]")
const first = p.locator("[data-testid=split-exercise]").first()
await first.getByLabel(/^Set för/).fill("5")
await p.click("[data-testid=pt-action] [data-action=template]")
await p.click("[data-testid=split-create]")
await p.waitForSelector("[data-sonner-toast]:has-text('Mallen är uppdaterad')")
d = await demo()
check(d.templates.filter((t) => t.name.endsWith("Ben & motor")).length === 1 && d.templates.find((t) => t.name.endsWith("Ben & motor")).exercises[0].sets === 5, "öppnad mall uppdateras på plats (5 set)")

// ------------------------------------------------- 4. språk i byggaren ---
await p.goto(base + "/pt/installningar/app")
await p.click("[data-testid=language-picker] [data-locale=es]")
await p.goto(base + "/pt/pass")
await p.waitForSelector("[data-testid=split-library]")
check((await p.locator("main h1").first().innerText()) === "Creador de entrenos", "spanska: Creador de entrenos")
await p.click("[data-testid=split-hyrox_prep]")
check((await p.locator("[data-testid=pt-action]").innerText()).includes("Asignar a cliente"), "spanska: Asignar a cliente / Guardar como plantilla")
check((await p.locator("[data-testid=split-exercise][data-tracking=running] label").first().innerText()).startsWith("Distancia") || (await p.locator("[data-testid=split-exercise][data-tracking=running]").first().innerText()).includes("Ritmo (min/km)"), "spanska: Distancia / Ritmo (min/km)")
await p.screenshot({ path: `${out}/v59-pt-byggare-es.png` })
await p.goto(base + "/pt/installningar/app")
await p.click("[data-testid=language-picker] [data-locale=sv]")

// ------------------------------- 5. PT utan aktiva klienter: tydligt besked ---
await patch(`d.relationships = d.relationships.map((r) => (r.trainerId === "t1" ? { ...r, status: "paused" } : r))`)
await p.goto(base + "/pt/pass")
await p.click("[data-testid=split-run_5k]")
await p.waitForSelector("[data-testid=pt-actions]")
check((await p.locator("[data-testid=pt-actions]").innerText()).includes("inga aktiva klienter"), "utan aktiva klienter: ingen tilldelning, ett tydligt besked")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
