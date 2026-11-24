// E2E för v51 i demoläge (mobil 390 px, mörkt läge):
//   1. klickbara dagar i veckoremsan + planering framåt (pass och kost)
//   2. PT:ns hemsida och Instagram (redigering, validering, badges)
//   3. diagrammen (rundade staplar, rena axlar) och Framsteg utan 1RM
//   4. sammanfattning med personlig kommentar efter passet
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v51-plattform.test.mjs
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
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const today = iso(new Date())
const plus = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

// ------------------------------------------------- 1. veckoremsan ---
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=week-strip]")
const days = p.locator("[data-testid=week-strip] button")
check((await days.count()) === 7, "sju klickbara dagar")
check((await p.locator(`[data-testid=week-strip] button[data-date="${today}"]`).getAttribute("aria-pressed")) === "true", "idag är vald från början")
check((await p.locator(`[data-testid=week-strip] button[aria-current=date]`).getAttribute("data-date")) === today, "idag är markerad (aria-current)")
const pressedBg = await p.locator(`[data-testid=week-strip] button[aria-pressed=true]`).evaluate((el) => getComputedStyle(el).backgroundColor)
check(/132,\s*204,\s*22|oklch|lab/.test(pressedBg) || pressedBg !== "rgba(0, 0, 0, 0)", `vald dag är fylld (${pressedBg})`)

// Planera på onsdagen i nästa vecka (alltid i framtiden, oavsett veckodag).
// Första lediga dagen från onsdag i nästa vecka (seed-datans pass beror på veckodagen).
const busyDays = new Set((await demo()).workouts.filter((w) => w.clientId === "c1").map((w) => w.date))
let ahead = 7 - ((new Date().getDay() + 6) % 7) + 2
while (busyDays.has(plus(ahead)) && ahead < 13 - ((new Date().getDay() + 6) % 7)) ahead++
const target = plus(ahead)
await p.click("button[aria-label='Nästa vecka']")
await p.waitForSelector(`[data-testid=week-strip] button[data-date="${target}"]`)
check((await p.locator("[data-testid=week-label]").innerText()) === "Nästa vecka", "pilen bläddrar till nästa vecka")
await p.click(`[data-testid=week-strip] button[data-date="${target}"]`)
await p.waitForSelector(`[data-testid=day-plan][data-date="${target}"]`)
check((await p.locator(`[data-testid=week-strip] button[data-date="${target}"]`).getAttribute("aria-pressed")) === "true", "vald dag markeras")
check((await p.locator("[data-testid=today-view]").count()) === 0, "vyn växlar till den valda dagen")
check(await p.locator("[data-testid=day-empty]").isVisible(), "tom dag: 'Inget planerat än'")
if (ahead > 7) check(await p.locator("[data-testid=food-out-of-range]").isVisible(), "kost längre fram än en vecka förklaras")
else check(await p.locator(`[data-testid=nutrition-shortcut][data-date="${target}"]`).isVisible(), "kost kan planeras samma dag")

await p.click("[data-testid=plan-workout]")
await p.waitForSelector("[role=dialog] >> text=Planera pass")
const option = p.locator("[role=dialog] ul[aria-label='Pass i upplägget'] button, [role=dialog] ul[aria-label='Sparade mallar'] button").first()
const optionName = (await option.locator("span span").first().innerText()).trim()
await option.click()
await p.waitForSelector(`[data-testid=day-plan][data-date="${target}"] [data-testid=day-workout]`)
const planned = (await demo()).workouts.filter((w) => w.date === target && w.clientId === "c1")
check(planned.length === 1 && planned[0].status === "planned" && planned[0].byClient, `passet (${optionName}) planerat på ${target}`)
check(planned[0]?.exercises.length > 0 && new Set(planned[0].exercises.map((e) => e.id)).size === planned[0].exercises.length, "övningarna kopierades med egna id")
check((await p.locator(`[data-testid=week-strip] button[data-date="${target}"] [data-testid=plan-dot]`).count()) === 1, "limegrön prick på dagen med planering")

// Ta bort det planerade passet igen.
await p.click(`[data-testid=day-workout] button[aria-label^="Ta bort"]`)
await p.waitForSelector("[data-testid=day-empty]")
check(!(await demo()).workouts.some((w) => w.date === target && w.clientId === "c1"), "planerat pass kan tas bort")

// Kost i förväg: i morgon (inom kostens vecka).
await p.click("button[aria-label='Föregående vecka']")
const tomorrow = plus(1)
const tomorrowInWeek = await p.locator(`[data-testid=week-strip] button[data-date="${tomorrow}"]`).count()
if (!tomorrowInWeek) await p.click("button[aria-label='Nästa vecka']")
await p.click(`[data-testid=week-strip] button[data-date="${tomorrow}"]`)
await p.waitForSelector(`[data-testid=nutrition-shortcut][data-date="${tomorrow}"]`)
check((await p.locator(`[data-testid=nutrition-shortcut]`).getAttribute("href")) === `/klient/kost?datum=${tomorrow}`, "kostgenvägen öppnar Kost på vald dag")
check(/Planera/.test(await p.locator("[data-testid=nutrition-shortcut]").innerText()), "framtida dag: 'Planera'")
await p.click("[data-testid=nutrition-shortcut]")
await p.waitForURL(`${base}/klient/kost?datum=${tomorrow}`)
ok("Kost öppnas på den valda dagen")
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=week-strip]")

// Tangentbord: pil höger flyttar en dag.
await p.locator(`[data-testid=week-strip] button[data-date="${today}"]`).focus()
await p.keyboard.press("ArrowRight")
const after = plus(1)
const moved = await p.locator(`[data-testid=week-strip] button[data-date="${after}"][aria-pressed=true]`).count()
check(moved === 1 || new Date().getDay() === 0, "pil höger väljer nästa dag")
await p.click("[data-testid=back-to-today]").catch(() => {})
await p.waitForSelector("[data-testid=today-view]")
ok("Tillbaka till idag")

// ------------------------------------- 2. PT: hemsida och Instagram ---
await p.goto(base + "/klient/hitta/t1")
await p.waitForSelector("[data-testid=trainer-links]")
const site = p.locator("[data-testid=trainer-website]")
check((await site.getAttribute("href")) === "https://elinsoderberg.example/traning", "hemsidan som länk på profilen")
check((await site.getAttribute("target")) === "_blank" && /noopener/.test(await site.getAttribute("rel")), "öppnas i ny flik med noopener")
check((await p.locator("[data-testid=trainer-instagram]").getAttribute("href")) === "https://www.instagram.com/coavira.elin/", "Instagram som länk")
check(/@coavira\.elin/.test(await p.locator("[data-testid=trainer-instagram]").innerText()), "Instagram-badge visar @namnet")
await p.goto(base + "/klient/profil")
await p.waitForSelector("text=Mina PT:er")
check((await p.locator("[data-testid=trainer-links]").count()) >= 1, "länkarna syns även under Mina PT:er")

await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/profil")
await p.waitForSelector("#website")
await p.fill("#website", "javascript:alert(1)")
await p.locator("#website").blur()
check(/https/.test(await p.locator("#website-hint").innerText()), "osäker länk ger ett tydligt fel")
await p.click("button:has-text('Spara') >> nth=0")
check((await demo()).trainers.find((t) => t.id === "t1").websiteUrl === "https://elinsoderberg.example/traning", "osäker länk sparas inte")
await p.fill("#website", "www.Elin-PT.example/om")
await p.fill("#instagram", "https://instagram.com/elin_pt/")
await p.click("button:has-text('Spara') >> nth=0")
await p.waitForFunction(() => document.querySelector("#instagram")?.value === "elin_pt")
const t1 = (await demo()).trainers.find((t) => t.id === "t1")
check(t1.websiteUrl === "https://www.elin-pt.example/om" && t1.instagram === "elin_pt", "länkarna normaliseras och sparas")
check((await p.locator("[aria-label='Så här ser klienter din profil'] [data-testid=trainer-instagram]").innerText()).includes("@elin_pt"), "förhandsvisningen visar länkarna")
await p.fill("#website", "")
await p.fill("#instagram", "")
await p.click("button:has-text('Spara') >> nth=0")
await p.waitForTimeout(200)
const cleared = (await demo()).trainers.find((t) => t.id === "t1")
check(!cleared.websiteUrl && !cleared.instagram, "tomma fält tar bort länkarna")
await p.setViewportSize({ width: 390, height: 844 })

// --------------------------------------------------- 3. diagrammen ---
await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=card-fat]")
check((await p.locator("[data-testid=card-fat], [data-testid=card-muscle]").count()) === 2, "Framsteg: två kort")
check(!/1RM|e1RM|one.?rep/i.test(await p.locator("main").innerText()), "Framsteg: ingen 1RM")
await p.goto(base + "/pt/klienter/c1")
await p.waitForSelector("text=Mål och mätpunkter")
await p.click("[role=tab]:has-text('Progress')").catch(() => {})
for (let i = 0; i < 12 && !(await p.locator(".recharts-bar-rectangle path").count()); i++) {
  await p.mouse.wheel(0, 500)
  await p.waitForTimeout(250)
}
await p.waitForSelector(".recharts-bar-rectangle path", { timeout: 8000 })
await p.waitForTimeout(1200) // staplarna växer fram (800 ms) – mät när de landat
const paths = await p.locator(".recharts-bar-rectangle path").evaluateAll((els) => els.map((e) => e.getAttribute("d") ?? ""))
check(paths.some((d) => /A\s*6,6/.test(d)), "staplarna har rundade toppar (6 px)")
check((await p.locator(".recharts-cartesian-axis-line").count()) === 0, "inga axellinjer")
check((await p.locator(".recharts-bar-background-rectangle").count()) > 0, "svagt spår bakom staplarna")

// ----------------------------------------- 4. sammanfattning efter passet ---
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=week-strip]")
const w = (await demo()).workouts.find((x) => x.clientId === "c1" && x.date === today && x.status !== "completed")
await p.goto(`${base}/klient/pass/${w.id}`)
await p.waitForSelector('button[aria-label="Bocka av set 1"]')
const boxes = p.locator('button[aria-label^="Bocka av set"]')
for (let i = 0, n = await boxes.count(); i < n; i++) await p.locator('button[aria-label^="Bocka av set"]').first().click()
await p.click('button:has-text("Avsluta")')
await p.click('button:has-text("Spara pass")')
await p.waitForSelector("[data-testid=workout-saved]")
const headline = await p.locator("[data-testid=summary-headline]").innerText()
const body = await p.locator("[data-testid=summary-body]").innerText()
check(headline.length > 3 && body.length > 10, `kommentar: "${headline}" – ${body}`)
check(!/!/.test(headline + body) && !/🔥|💪|fantastisk|otrolig/i.test(headline + body), "kommentaren är saklig (inga utrop eller superlativ)")
check(await p.locator("[data-testid=summary-week]").isVisible(), "veckans framsteg i sammanfattningen")
// v73: passets tid kommer till när passtimern har gått.
const tileLabels = (await p.locator("[aria-label='Passet i siffror'] dt").allInnerTexts()).join(",").toLowerCase()
check(/^set,volym,rekord(,tid)?$/.test(tileLabels), `set, volym och rekord (och tid) – ${tileLabels}`)
await p.waitForTimeout(1600)
check(p.url().includes("/klient/pass/"), "sammanfattningen stannar kvar (ingen automatisk vidarebefordran)")
await p.click("[data-testid=summary-done]")
await p.waitForURL(base + "/klient")
ok("Klar tar klienten till startsidan")
check((await demo()).workouts.find((x) => x.id === w.id).status === "completed", "passet är sparat")

// Minska rörelse: sammanfattningen syns direkt, utan animation.
const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
const r = watch(await rctx.newPage())
await r.goto(base + "/klient")
await r.waitForSelector("[data-testid=week-strip]")
const dur = await r.locator("[data-testid=week-strip] button").first().evaluate((el) => getComputedStyle(el).transitionDuration)
check(/^0s|^0\.0+1s|1e-05s/.test(dur) || dur === "0s", `minska rörelse: inga övergångar i remsan (${dur})`)
await rctx.close()

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.join(" | ") : ""}`)
await browser.close()
