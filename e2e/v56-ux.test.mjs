// E2E för v56 i demoläge: flytta pass (Flytta-knapp, dagväljare, Byt plats,
// Ångra, drag-and-drop i veckovyn), kostloggarens måltidsbrickor, receptbanken
// bakom Coavira+ och att sidan inte hoppar när man loggar.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v56-ux.test.mjs [skärmdumpsmapp]
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

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const KEY = "coavira:demo:v5"
const demo = () => p.evaluate((k) => JSON.parse(localStorage[k]).data, KEY)
const patch = async (fn, arg) => {
  await p.evaluate(
    ([k, src, a]) => {
      const s = JSON.parse(localStorage[k])
      new Function("d", "a", src)(s.data, a)
      localStorage[k] = JSON.stringify(s)
    },
    [KEY, fn, arg]
  )
  await p.reload()
}
const iso = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString("sv-SE")
}
const D = { today: iso(0), d1: iso(1), d2: iso(2), d3: iso(3) }
const workout = async (id) => (await demo()).workouts.find((w) => w.id === id)

// Veckovyn visar bara den aktuella veckan – välj dagar som ligger i samma vecka som idag när det går.
const mondayOffset = (new Date().getDay() + 6) % 7
const inWeek = (o) => o + mondayOffset <= 6
// Två lediga dagar framåt i veckan (för drag-and-drop), annars hoppas den delen över.
const dragFrom = inWeek(1) ? 1 : null
const dragTo = inWeek(2) ? 2 : null

// ------------------------------------------------------------ förberedelser ---
await p.goto(base + "/klient")
await p.waitForSelector("main h1, main h2")
// Tre egna pass: idag (C), imorgon (A) och om tre dagar (B). Andra ofärdiga pass de närmaste dagarna tas bort så att dagarna är lediga.
await patch(
  `const base = d.workouts.find((w) => w.clientId === "c1" && w.exercises.length > 0)
   const days = [a.d1, a.d2, a.d3]
   d.workouts = d.workouts.filter((w) => !(w.clientId === "c1" && days.includes(w.date) && w.status !== "completed"))
   d.workouts = d.workouts.filter((w) => !(w.clientId === "c1" && w.date === a.today && w.byClient))
   const mk = (id, name, date) => ({ ...base, id, name, date, status: "planned", logs: [], trainerId: null, byClient: true, eventId: undefined, startedAt: undefined, completedAt: undefined, verifiedAt: undefined })
   d.workouts.push(mk("w-v56-a", "Eget A", a.d1), mk("w-v56-b", "Eget B", a.d3), mk("w-v56-c", "Eget C", a.today))`,
  D
)

// ------------------------------------------------- 1. Flytta från startsidan ---
await p.waitForSelector("[data-testid=day-workout]:has-text('Eget C')")
const cardC = p.locator("[data-testid=day-workout]:has-text('Eget C')")
check((await cardC.locator("[data-testid=move-workout]").count()) === 1, "startsidan: Flytta-knappen finns på ett eget pass")
const ptCard = p.locator("[data-testid=day-workout]:not(:has-text('Eget C'))")
if ((await ptCard.count()) > 0) check((await ptCard.first().locator("[data-testid=move-workout]").count()) === 0, "startsidan: PT:ns pass har ingen Flytta-knapp")
await cardC.locator("[data-testid=move-workout]").click()
const sheet = p.locator("[data-testid=move-sheet]")
await sheet.waitFor()
check((await sheet.locator("[role=option]").count()) === 14, "dagväljaren visar 14 dagar")
check(await sheet.locator(`[role=option][data-date="${D.today}"]`).isDisabled(), "passets nuvarande dag är markerad och går inte att välja")
check((await sheet.locator(`[role=option][data-date="${D.d1}"] .bg-primary`).count()) === 1, "dagar som redan har ett pass har en prick")
await p.screenshot({ path: `${out}/v56-flytta-blad.png` })
await sheet.locator(`[role=option][data-date="${D.d2}"]`).click()
await sheet.waitFor({ state: "hidden" })
await p.waitForSelector("[data-sonner-toast]:has-text('Eget C flyttat')")
check((await workout("w-v56-c")).date === D.d2, "ett tryck flyttar passet direkt (optimistiskt, sparat)")
check((await p.locator("[data-testid=day-workout]:has-text('Eget C')").count()) === 0, "passet försvinner från dagens kort utan omladdning")
await p.click("[data-sonner-toast] button:has-text('Ångra')")
await p.waitForSelector("[data-testid=day-workout]:has-text('Eget C')")
check((await workout("w-v56-c")).date === D.today, "Ångra i toasten flyttar tillbaka")

// ------------------------------------------------- 2. Byt plats i kalendern ---
await p.goto(base + "/klient/kalender")
await p.waitForSelector("button[data-date]")
const pickDay = async (date) => {
  await p.waitForSelector("button[data-date]")
  const btn = p.locator(`button[data-date="${date}"]`)
  if ((await btn.count()) === 0) {
    // Dagen ligger i nästa vecka: bläddra fram.
    await p.click("button[aria-label='Nästa vecka']").catch(() => {})
  }
  await p.locator(`button[data-date="${date}"]`).click()
}
await pickDay(D.d1)
const cardA = p.locator("[data-testid=planned-card]:has-text('Eget A')")
await cardA.waitFor()
await cardA.locator("[data-testid=move-workout]").click()
await sheet.waitFor()
await sheet.locator(`[role=option][data-date="${D.d3}"]`).click()
const choice = p.locator("[data-testid=move-choice]")
await choice.waitFor()
check((await choice.innerText()).includes("Eget B"), "dagen har redan Eget B – bladet frågar vad som ska hända")
check((await p.locator("[data-testid=move-swap]").innerText()).includes("Byt plats med Eget B"), "knappen Byt plats med Eget B")
await p.screenshot({ path: `${out}/v56-byt-plats.png` })
await p.click("[data-testid=move-swap]")
await p.waitForSelector("[data-sonner-toast]:has-text('bytte plats')")
check((await workout("w-v56-a")).date === D.d3 && (await workout("w-v56-b")).date === D.d1, "Byt plats: A och B har bytt dag")
await p.waitForSelector("[data-testid=planned-card]:has-text('Eget B')")
ok("kalendern visar Eget B på dagen direkt")
await p.click("[data-sonner-toast]:has-text('bytte plats') button:has-text('Ångra')")
await p.waitForFunction(() => {
  const ws = JSON.parse(localStorage["coavira:demo:v5"]).data.workouts
  return ws.find((w) => w.id === "w-v56-a").date !== ws.find((w) => w.id === "w-v56-b").date && true
})
check((await workout("w-v56-a")).date === D.d1 && (await workout("w-v56-b")).date === D.d3, "Ångra efter byte: båda tillbaka på sina dagar")

// --------------------------------------------- 3. Drag-and-drop i veckovyn ---
if (dragFrom !== null && dragTo !== null) {
  await p.reload()
  await pickDay(iso(dragFrom))
  const card = p.locator("[data-testid=planned-card]:has-text('Eget A')")
  await card.waitFor()
  const handle = card.locator("[data-testid=drag-workout]")
  const hb = await handle.boundingBox()
  const target = p.locator(`button[data-date="${iso(dragTo)}"]`)
  const tb = await target.boundingBox()
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await p.mouse.down()
  for (let i = 1; i <= 12; i++) await p.mouse.move(hb.x + hb.width / 2 + ((tb.x + tb.width / 2 - hb.x - hb.width / 2) * i) / 12, hb.y + hb.height / 2 + ((tb.y + tb.height / 2 - hb.y - hb.height / 2) * i) / 12)
  await p.waitForTimeout(120)
  check(/ring-2/.test((await target.getAttribute("class")) ?? ""), "dagen man drar över lyser upp (ring)")
  const dragTransform = await card.evaluate((el) => el.style.transform)
  check(/translate3d/.test(dragTransform), "kortet följer fingret med transform (GPU)")
  await p.screenshot({ path: `${out}/v56-dra.png` })
  await p.mouse.up()
  await p.waitForSelector("[data-sonner-toast]:has-text('Eget A flyttat')")
  check((await workout("w-v56-a")).date === iso(dragTo), "släpp på en dag: passet flyttas dit")
  check((await p.getAttribute(`button[data-date="${iso(dragTo)}"]`, "aria-pressed")) === "true", "kalendern hoppar till dagen passet flyttades till")
} else ok("drag-and-drop hoppas över (veckans sista dagar – inga två lediga dagar kvar i veckan)")

// Ett genomfört pass har varken handtag eller Flytta-knapp.
const completed = (await demo()).workouts.find((w) => w.clientId === "c1" && w.status === "completed" && w.date >= iso(-mondayOffset) && w.date <= D.today)
if (completed) {
  await pickDay(completed.date)
  await p.waitForSelector("[data-testid=cal-completed]")
  check((await p.locator("[data-testid=cal-completed] [data-testid=move-workout], [data-testid=cal-completed] [data-testid=drag-workout]").count()) === 0, "genomförda pass kan inte flyttas")
}

// -------------------------------------------------- 4. Måltidsbrickorna ---
await p.goto(base + "/klient/kost")
await p.waitForSelector("[data-testid=meal-tiles]")
const tiles = p.locator("[data-testid=meal-tile]")
check((await tiles.count()) === 4, "fyra måltidsbrickor visas alltid (även tomma)")
check((await tiles.allInnerTexts()).every((t, i) => t.includes(["Frukost", "Lunch", "Middag", "Mellanmål"][i])), "Frukost, Lunch, Middag, Mellanmål")
const glass = await tiles.first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundImage, blur: getComputedStyle(el).backdropFilter, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) }))
check(/gradient/.test(glass.bg) && /blur/.test(glass.blur) && glass.radius >= 20, "brickorna är mörkt glas med rundade hörn")
const heights = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
check(new Set(heights).size === 1, `brickorna har samma fasta höjd (${heights[0]}px)`)
const dinner = p.locator("[data-testid=meal-tile][data-meal=dinner]")
const dinnerBefore = Number((await dinner.locator("[data-testid=meal-tile-kcal]").innerText()).replace(/\D/g, "")) || 0
const tilesTop = await p.locator("[data-testid=meal-tiles]").evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
await dinner.locator("[data-testid=meal-tile-add]").click()
await p.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Sök livsmedel eller märkesvara")
ok("+ på brickan lägger markören i sökfältet")
check((await p.locator("[data-testid=meal-chips] [aria-checked=true]").innerText()).includes("Middag"), "+ på Middag väljer måltiden Middag")
await p.fill('input[aria-label="Sök livsmedel eller märkesvara"]', "banan")
await p.waitForSelector("#food-picker-results[data-inline] [role=option]")
await p.locator("#food-picker-results [role=option]").first().click()
await p.click("button:has-text('Lägg till')")
await p.waitForSelector("[data-testid=food-log] >> text=Middag")
await p.waitForTimeout(700)
const dinnerAfter = Number((await dinner.locator("[data-testid=meal-tile-kcal]").innerText()).replace(/\D/g, ""))
check(dinnerAfter > dinnerBefore, `Middag-brickan räknar upp (${dinnerBefore} → ${dinnerAfter} kcal)`)
check((await dinner.locator(".ring-burst").count()) === 1, "brickans ikon får en ring när maten läggs till")
const barTransforms = await dinner.locator("[aria-hidden] > span[style]").evaluateAll((els) => els.map((e) => e.style.transform))
check(barTransforms.length === 3 && barTransforms.every((t) => /scaleX/.test(t)), "makrostapeln animeras med transform (scaleX)")
const heightsAfter = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
check(heightsAfter.join() === heights.join(), "brickornas höjd ändras inte när mat läggs till")
check(Math.abs((await p.locator("[data-testid=meal-tiles]").evaluate((el) => el.getBoundingClientRect().top + window.scrollY)) - tilesTop) < 1, "brickorna flyttar sig inte på sidan")
await p.evaluate(() => window.scrollTo(0, 0))
await p.screenshot({ path: `${out}/v56-kostbrickor.png` })
await p.emulateMedia({ colorScheme: "dark" })
await p.screenshot({ path: `${out}/v56-kostbrickor-morkt.png` })
await p.emulateMedia({ colorScheme: "light" })

// --------------------------------------------- 5. Vatten utan hopp ---
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=water-tracker]")
await p.locator("[data-testid=water-tracker]").scrollIntoViewIfNeeded()
const probe = async () =>
  p.evaluate(() => {
    const w = document.querySelector("[data-testid=water-tracker]")
    const next = w.nextElementSibling ?? w.parentElement.nextElementSibling
    return { y: window.scrollY, top: Math.round(w.getBoundingClientRect().top), h: Math.round(w.getBoundingClientRect().height), next: next ? Math.round(next.getBoundingClientRect().top) : null }
  })
const w0 = await probe()
const glassBtn = p.locator("[data-testid=water-tracker] button[aria-label='Lägg till ett glas, 250 ml']")
await glassBtn.click()
await p.waitForTimeout(500)
const w1 = await probe()
check(w1.y === w0.y && w1.top === w0.top, "vattenloggning: ingen scroll-reset eller förskjutning")
check(w1.h === w0.h && w1.next === w0.next, "vattenloggning: vattenrutan och det under har kvar sin plats")

// ------------------------------------------- 6. Receptbanken och Coavira+ ---
await p.goto(base + "/klient/recept")
await p.waitForSelector("[data-testid=recipe-card]")
check((await p.locator("[data-testid=recipes-plus-banner]").count()) === 0, "med Plus: ingen spärr")
check((await p.locator("[data-testid=recipe-card][data-locked]").count()) === 0, "med Plus: inga låsta recept")
await p.locator("[data-testid=recipe-card] button").first().click()
await p.waitForSelector("[data-testid=recipe-detail]")
ok("med Plus: receptet öppnas")
await p.keyboard.press("Escape")

await patch(
  `d.accounts.c1.plusUntil = undefined; d.accounts.c1.plusLifetime = false
   const lib = { id: "r-v56-own", trainerId: "c1", name: "Mitt eget v56-recept", servings: 1, items: [{ name: "Havregryn", grams: 60, kcal: 220, protein: 8, carbs: 36, fat: 4 }], steps: [], goalTypes: [] }
   d.recipes = [...(d.recipes ?? []), lib]`
)
await p.waitForSelector("[data-testid=recipes-plus-banner]")
check((await p.locator("[data-testid=recipes-plus-banner]").innerText()).includes("Receptbanken ingår i Coavira+"), "utan Plus: banner med uppgradering")
const locked = await p.locator("[data-testid=recipe-card][data-locked]").count()
check(locked > 0, `utan Plus: receptbankens recept är låsta (${locked} st)`)
const own = p.locator("[data-testid=recipe-card]:has-text('Mitt eget v56-recept')")
check((await own.count()) === 1 && (await own.getAttribute("data-locked")) === null, "egna recept är alltid öppna")
const blur = await p.locator("[data-testid=recipe-card][data-locked] img, [data-testid=recipe-card][data-locked] [class*=blur]").first().evaluate((el) => getComputedStyle(el).filter)
check(/blur/.test(blur), "låsta recept visas suddiga")
await p.screenshot({ path: `${out}/v56-recept-las.png` })
await p.locator("[data-testid=recipe-card][data-locked] button").first().click()
const dialog = p.locator("[data-testid=upgrade-dialog]")
await dialog.waitFor()
check((await dialog.innerText()).includes("Du försökte öppna: Receptbanken"), "ett låst recept öppnar uppgraderingsrutan")
check((await p.locator("[data-testid=recipe-detail]").count()) === 0, "receptet i sig öppnas inte")
await p.screenshot({ path: `${out}/v56-recept-uppgradera.png` })
await p.keyboard.press("Escape")
await own.locator("button").first().click()
await p.waitForSelector("[data-testid=recipe-detail]:has-text('Mitt eget v56-recept')")
ok("utan Plus: eget recept öppnas")
await p.keyboard.press("Escape")
await p.click("[data-testid=recipes-unlock]")
await dialog.waitFor()
await dialog.locator("button:has-text('Skaffa Coavira Plus')").click()
await p.waitForFunction(() => !document.querySelector("[data-testid=recipes-plus-banner]"))
check((await p.locator("[data-testid=recipe-card][data-locked]").count()) === 0, "efter köp (demo): receptbanken är upplåst direkt")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
