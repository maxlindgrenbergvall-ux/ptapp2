// E2E för v52 i demoläge (mobil 390 px, mörkt läge):
//   1. Upplägg (f.d. splits) med flyttbara vilodagar
//   2. Strava är borta
//   3. bottenmenyn i PT-appen
//   4. små belöningar (vatten, måltid)
//   5. grön bock + historikmodal för avklarade pass
//   6. klickbara KPI-kort på PT-översikten
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v52-navigering.test.mjs
import { chromium } from "playwright"

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
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
  return p
}
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" })
const p = watch(await ctx.newPage())
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const split = async () => (await demo()).activeSplits.find((s) => s.clientId === "c1")
const dayNames = (s) => s.days.map((d) => (d.rest ? "Vila" : d.name)).join(",")

// ----------------------------------------------- 1. upplägg + vilodagar ---
await p.goto(base + "/klient/schema")
await p.waitForSelector("[data-testid=active-split]")
check((await p.locator("h1").innerText()).trim() === "Upplägg", "sidan heter Upplägg")
// Uppläggens egennamn (4-split, Bro split) får finnas kvar – men inte "splits" som begrepp.
check(!/\bsplits\b|egen split|träningssplit|schema och splits/i.test(await p.locator("main").innerText()), "begreppet splits syns inte för klienten")
const before = await split()
const onTurn = before.days[before.nextDay].name
await p.click("[data-testid=active-add-rest]")
await p.waitForSelector("[data-testid=active-rest-day]")
let s = await split()
check(s.days.at(-1).rest === true && s.days.length === before.days.length + 1, `vilodag tillagd sist (${dayNames(s)})`)
// Flytta vilodagen uppåt med tangentbordet (pil upp på handtaget) – samma som drag-and-drop.
const handle = p.locator("[data-testid=active-rest-day]").locator("xpath=ancestor::li[1]").locator("button").first()
await handle.focus()
await p.keyboard.press("ArrowUp")
await p.waitForTimeout(250)
s = await split()
check(s.days.at(-2).rest === true, `vilodagen flyttad ett steg upp (${dayNames(s)})`)
check(s.days[s.nextDay].name === onTurn, `samma pass står på tur efter flytten (${onTurn})`)
// Dra vilodagen överst med pekaren.
const from = await handle.boundingBox()
const first = await p.locator("[data-testid=active-day]").first().boundingBox()
await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
await p.mouse.down()
await p.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 4 })
await p.mouse.move(first.x + 20, first.y + 4, { steps: 10 })
await p.mouse.up()
await p.waitForTimeout(500)
s = await split()
check(s.days[0].rest === true, `vilodagen dragen överst (${dayNames(s)})`)
check(s.days[s.nextDay].name === onTurn, "passet på tur följer med vid drag-and-drop")
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=next-workout-day]")
check((await p.locator("[data-testid=next-workout-day]").innerText()).trim() === onTurn, "Nästa pass hoppar över vilodagen")
await p.goto(base + "/klient/schema")
await p.click("[data-testid=active-rest-day] button[aria-label='Ta bort vilodagen']")
await p.waitForTimeout(200)
s = await split()
check(!s.days.some((d) => d.rest) && s.days[s.nextDay].name === onTurn, "vilodagen kan tas bort")

// Biblioteket: färdiga upplägg läggs ut med vilodagar som kan flyttas.
await p.click("[data-testid=change-split]")
await p.waitForSelector("[data-testid=split-library]")
check(/tips att utgå från/.test(await p.locator("[data-testid=split-library]").innerText()), "uppläggen presenteras som tips att utgå från")
check((await p.locator("[data-testid=split-ppl]").innerText()).includes("Testa"), "kortet bjuder in till att testa")
await p.click("[data-testid=split-ppl]")
await p.waitForSelector("[data-testid=split-editor]")
check((await p.locator("[data-testid=split-day]").count()) === 3 && (await p.locator("[data-testid=split-rest-day]").count()) === 4, "PPL: 3 pass och 4 vilodagar i en vecka")
check((await p.locator("[data-testid=add-rest-day]").isDisabled()) === true, "högst sju dagar – ingen fler vilodag")
await p.locator("[data-testid=split-rest-day] button[aria-label='Ta bort vilodagen']").first().click()
check((await p.locator("[data-testid=split-rest-day]").count()) === 3, "vilodag borttagen i redigeraren")
const restHandle = p.locator("[data-testid=split-rest-day]").first().locator("button").first()
await restHandle.focus()
await p.keyboard.press("ArrowUp")
await p.waitForTimeout(250)
check(/3 pass i rotation · 3 vilodagar/.test(await p.locator("[data-testid=split-summary]").innerText()), "sammanfattningen räknar pass och vilodagar")
await p.click("[data-testid=split-create]")
await p.waitForURL(base + "/klient")
s = await split()
// Push · [Vila borttagen] · Pull · Vila · Legs · Vila · Vila → vilodagen efter Pull flyttad ett steg upp.
check(dayNames(s) === "Push,Vila,Pull,Legs,Vila,Vila", `upplägget sparat med vilodagarna i sin ordning (${dayNames(s)})`)
check((await p.locator("[data-testid=next-workout-day]").innerText()).trim() === "Push", "första passet står på tur")

// ------------------------------------------------------- 2. Strava ---
check((await p.locator("[data-testid=strava-connect], [data-testid=strava-sync]").count()) === 0, "ingen Strava-knapp på startsidan")
check(!/strava/i.test(await p.locator("body").innerText()), "Strava nämns inte på startsidan")
await p.goto(base + "/klient/anslutningar")
await p.waitForSelector("h1")
check(!/strava/i.test(await p.locator("body").innerText()), "Strava nämns inte under Anslutningar")
check(/Apple H|Health Connect|Google Fit/.test(await p.locator("body").innerText()), "Apple Hälsa / Health Connect finns kvar")
for (const path of ["/api/strava/connect", "/api/strava/sync", "/api/strava/callback"]) {
  const res = await p.request.fetch(base + path, { method: path.endsWith("sync") ? "POST" : "GET", maxRedirects: 0 })
  check(res.status() === 404, `${path} finns inte längre (404)`)
}
const d0 = await demo()
check(!d0.activities.some((a) => a.source === "strava") && !d0.wearables.some((w) => w.provider === "strava"), "ingen Strava-data i appens tillstånd")

// ------------------------------------------- 4. belöningar: vatten ---
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=water-tracker]")
const glasses = p.locator("[data-testid=water-tracker] [role=group] button")
await glasses.last().click() // fyll upp till målet
await p.waitForSelector("[data-sonner-toast] >> text=Vattenmålet i hamn")
check((await p.locator("[data-sonner-toast] [data-reward=water]").count()) === 1, "vattenmålet: belöning med ikon")
const txt = await p.locator("[data-sonner-toast]").first().innerText()
check(!/!|🔥|💪/.test(txt), `saklig text (${txt.replace(/\n/g, " · ")})`)
await p.click('button[aria-label="Ta bort ett glas"]')
await glasses.last().click()
await p.waitForTimeout(600)
check((await p.locator("[data-sonner-toast] >> text=Vattenmålet i hamn").count()) <= 1, "vattenmålet firas bara en gång per dag")

// ------------------------------------------- 4. belöningar: måltid ---
await p.goto(base + "/klient/kost")
await p.waitForSelector("main")
const meal = p.locator("main ul button[aria-pressed=false]").first()
if (await meal.count()) {
  await meal.click()
  await p.waitForSelector("[data-sonner-toast] [data-reward=meal], [data-sonner-toast] [data-reward=meals_done]")
  check(/avbockad|Alla måltider klara/.test(await p.locator("[data-sonner-toast]").first().innerText()), "avbockad måltid ger en liten belöning")
} else ok("(inget kostschema i demon att bocka av)")

// --------------------------- 5. grön bock + historik (översikt, kalender) ---
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=week-strip]")
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const today = iso(new Date())
const data = await demo()
// Ett avklarat eget pass (utan bokning) i kalendern: avsluta dagens pass först.
const w = data.workouts.find((x) => x.clientId === "c1" && x.date === today && x.status !== "completed")
await p.goto(`${base}/klient/pass/${w.id}`)
await p.waitForSelector('button[aria-label^="Bocka av set"]')
for (let i = 0; i < 3; i++) await p.locator('button[aria-label^="Bocka av set"]').first().click()
await p.click('button:has-text("Avsluta")')
await p.click('button:has-text("Spara pass")')
await p.waitForSelector("[data-testid=workout-saved]")
await p.click("[data-testid=summary-done]")
await p.waitForURL(base + "/klient")
await p.waitForSelector("[data-testid=done-badge]")
ok("översikten: avklarat pass har grön bock (Klart)")
check((await p.locator(`[data-testid=week-strip] button[data-date="${today}"] svg`).count()) >= 1, "veckoremsan: bock på dagen")
await p.click("[data-testid=open-history]")
await p.waitForSelector("[data-testid=workout-history]")
const sets = await p.locator("[data-testid=history-set]").allInnerTexts()
check(sets.length === 3, `historiken visar de tre genomförda seten (${sets.map((t) => t.replace(/\s+/g, " ")).join(" | ")})`)
check(sets.every((t) => /kg\s*×\s*\d+|\d+\s*reps/.test(t)), "varje set visar vikt × reps")
check((await p.locator("[data-testid=history-exercise]").count()) === w.exercises.length, "alla övningar i passet listas")
check(/Öppna hela passet/.test(await p.locator("[data-testid=workout-history]").innerText()), "länk till hela passet")
await p.keyboard.press("Escape")
await p.goto(base + "/klient/kalender")
await p.waitForSelector("text=Mina pass")
const calDone = await p.locator("[data-testid=cal-done]").count()
check(calDone >= 1, `kalendern: grön bock på dagar med avklarade pass (${calDone})`)
const linked = (await demo()).events.some((e) => e.workoutId === w.id)
if (linked) {
  await p.waitForSelector("[data-testid=program-done]")
  await p.click("[data-testid=program-history]")
} else {
  await p.click("[data-testid=cal-completed]")
}
await p.waitForSelector("[data-testid=workout-history]")
ok("kalendern: ett tryck på det avklarade passet öppnar historiken")
await p.keyboard.press("Escape")

// ------------------------------------------------ 3. PT: bottenmeny ---
await p.goto(base + "/pt")
await p.waitForSelector("[data-testid=pt-bottom-nav]")
const tabs = p.locator("[data-testid=pt-bottom-nav] a")
check((await tabs.count()) === 5, "fem flikar i bottenmenyn")
check((await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").split(",")[0]))).join(",") === "Översikt,Kalender,Passbyggare,Kostscheman,Meddelanden", "Översikt, Kalender, Passbyggare, Kostscheman, Meddelanden")
const nav = await p.locator("[data-testid=pt-bottom-nav]").boundingBox()
check(Math.abs(nav.y + nav.height - 844) <= 1 && nav.width === 390, "menyn sitter fast längst ner, i full bredd")
check((await p.evaluate(() => document.documentElement.scrollWidth)) <= 390, "ingen sidledsrullning på 390 px")
check((await p.locator("[data-testid=pt-bottom-nav] a[aria-current=page]").getAttribute("href")) === "/pt", "Översikt är markerad")
for (const [label, path] of [["Kalender", "/pt/kalender"], ["Passbyggare", "/pt/pass"], ["Kostscheman", "/pt/kost"], ["Meddelanden", "/pt/meddelanden"]]) {
  await p.locator(`[data-testid=pt-bottom-nav] a[aria-label^="${label}"]`).click()
  await p.waitForURL(base + path)
  await p.waitForSelector(`[data-testid=pt-bottom-nav] a[aria-current=page][href="${path}"]`)
  // Sidans sista innehåll hamnar inte bakom menyn.
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const hidden = await p.evaluate(() => {
    const main = document.querySelector("main")
    const last = main?.lastElementChild
    const navTop = document.querySelector("[data-testid=pt-bottom-nav]").getBoundingClientRect().top
    return last ? last.getBoundingClientRect().bottom > navTop + 1 : false
  })
  check(!hidden, `${label}: fliken öppnas och innehållet skyms inte av menyn`)
}
await p.setViewportSize({ width: 320, height: 640 })
await p.goto(base + "/pt")
await p.waitForSelector("[data-testid=pt-bottom-nav]")
check((await p.evaluate(() => document.documentElement.scrollWidth)) <= 320, "ryms på 320 px")
await p.setViewportSize({ width: 1280, height: 900 })
await p.waitForTimeout(200)
check(!(await p.locator("[data-testid=pt-bottom-nav]").isVisible()), "på dator tar sidomenyn över (ingen bottenmeny)")
await p.setViewportSize({ width: 390, height: 844 })

// ------------------------------------------------ 6. PT: KPI-korten ---
await p.goto(base + "/pt")
await p.waitForSelector("[data-testid=kpi-clients]")
await p.click("[data-testid=kpi-clients]")
await p.waitForSelector("[role=tab][aria-selected=true]:has-text('Aktiva')")
await p.waitForTimeout(700)
const listTop = await p.locator("#klienter").evaluate((el) => el.getBoundingClientRect().top)
check(listTop < 400, `Aktiva klienter: klientlistan visas, filtrerad på aktiva (topp ${Math.round(listTop)} px)`)
check((await p.locator("#klienter a[href^='/pt/klienter/']").count()) >= 1, "snabblänkar till klienterna")
await p.evaluate(() => window.scrollTo(0, 0))
await p.click("[data-testid=kpi-sessions]")
await p.waitForSelector("[data-testid=kpi-upcoming]")
const up = await p.locator("[data-testid=upcoming-row]").count()
check(/Kommande 7 dagar/i.test(await p.locator("[data-testid=kpi-upcoming]").innerText()), "Loggade pass: översikt över kommande 7 dagar")
check(up >= 1, `inbokade pass per dag och klient (${up})`)
check((await p.locator("[data-testid=upcoming-row]").first().getAttribute("href")).startsWith("/pt/klienter/"), "raden leder till klienten")
await p.keyboard.press("Escape")
await p.click("[data-testid=kpi-adherence-tile]")
await p.waitForSelector("[data-testid=kpi-adherence]")
await p.waitForSelector("[data-testid=kpi-adherence] .recharts-area-curve", { timeout: 8000 })
ok("Snittföljsamhet: graf över tid")
check((await p.locator("[data-testid=kpi-adherence] .recharts-cartesian-axis-line").count()) === 0, "rena axlar")
check((await p.locator("[data-testid=adherence-row]").count()) >= 1, "följsamhet per klient under grafen")
await p.click("[data-testid=kpi-adherence] >> text=Visa som tabell")
check((await p.locator("[data-testid=kpi-adherence] table tbody tr").count()) === 12, "tabellvy: 12 veckor")
await p.keyboard.press("Escape")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.join(" | ") : ""}`)
await browser.close()
