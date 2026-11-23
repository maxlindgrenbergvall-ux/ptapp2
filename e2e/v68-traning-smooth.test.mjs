// E2E för v68 i demoläge: träningsloggen rör sig med samma fjäder som vattenglaset
// och kostloggen. Övningarna fälls ut och ihop mjukt, passets progress glider,
// raden och siffrorna studsar, vilotimern töms mjukt och set fälls in och ut.
// Dessutom: vattenmålet är högst 3 l, och sökfältet i Kost läggs ovanför tangentbordet.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v68-traning-smooth.test.mjs [skärmbildsmapp]
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
const KEY = "coavira:demo:v5"

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))

await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  s.data.workouts.push({
    id: "w-v68", clientId: "c1", trainerId: null, byClient: true, date: new Date().toLocaleDateString("sv-SE"), name: "Smooth-pass", status: "planned", logs: [],
    exercises: [
      { id: "a", exerciseId: "e-squat", sets: 2, reps: "5", restSec: 60 },
      { id: "b", exerciseId: "e-deadlift", sets: 2, reps: "5", restSec: 60 },
    ],
  })
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/klient/pass/w-v68")
const a = p.locator("#exercise-a")
const b = p.locator("#exercise-b")
await a.locator("input[aria-label='Vikt set 1 (kg)']").waitFor()
await p.waitForTimeout(700)

// ------------------------------------------------------------- progress ---
const progress = p.locator("[data-testid=workout-progress]")
check((await progress.getAttribute("role")) === "progressbar" && (await progress.getAttribute("aria-valuemax")) === "4", "passets progress är en progressbar (0 av 4 set)")

// ---------------------------------------------------- stepper och avbockning ---
const kg = a.locator("input[aria-label='Vikt set 1 (kg)']")
const v0 = Number((await kg.inputValue()).replace(",", ".")) || 0
await a.locator("button[aria-label='Öka Vikt set 1']").click()
await p.waitForTimeout(40)
const pop = await kg.evaluate((el) => el.style.scale)
check(pop !== "" && Number(pop) > 1, `siffran studsar vid + (scale ${pop})`)
await p.waitForTimeout(900)
check((await kg.evaluate((el) => el.style.scale)) === "", "och lägger sig")
check(Number((await kg.inputValue()).replace(",", ".")) === v0 + 2.5, "+ ökar vikten med 2,5 kg")
if (!(await a.locator("input[aria-label='Reps set 1 (reps)']").inputValue())) await a.locator("input[aria-label='Reps set 1 (reps)']").fill("5")
const row1 = a.locator("ol > li").first()
await a.locator("button[aria-label='Bocka av set 1']").click()
await p.waitForTimeout(40)
check(Number((await row1.evaluate((el) => el.style.scale)) || 1) > 1, "raden studsar till när setet bockas av")
const fill = () => progress.evaluate((el) => el.firstElementChild.style.transform)
const f1 = await fill()
await p.waitForTimeout(900)
const f2 = await fill()
check(f1 !== f2 && /translate3d\(-75/.test(f2), `progressen glider till 1 av 4 (${f1} → ${f2})`)

// ------------------------------------------------------------- vilotimern ---
const drain = p.locator("[data-testid=rest-drain]")
await drain.waitFor()
const d1 = await drain.evaluate((el) => Number(el.style.transform.match(/[\d.]+/)[0]))
await p.waitForTimeout(500)
const d2 = await drain.evaluate((el) => Number(el.style.transform.match(/[\d.]+/)[0]))
check(d1 <= 1 && d2 < d1, `vilostapeln töms mjukt (${d1.toFixed(3)} → ${d2.toFixed(3)})`)
await p.locator("button:has-text('Hoppa över')").click()

// --------------------------------------------- övningen fälls ihop/ut mjukt ---
if (!(await a.locator("input[aria-label='Reps set 2 (reps)']").inputValue())) await a.locator("input[aria-label='Reps set 2 (reps)']").fill("5")
await a.locator("button[aria-label='Bocka av set 2']").click()
await p.waitForTimeout(80)
check((await a.locator("input[aria-label='Vikt set 1 (kg)']").count()) === 0, "den klara övningens fält försvinner direkt (inga dubbletter)")
const ghost = await a.locator("[data-collapse-ghost] > *").count()
const ghostH = ghost ? await a.locator("[data-collapse-ghost] > *").evaluate((el) => el.getBoundingClientRect().height) : 0
check(ghost === 1 && ghostH > 0 && (await a.locator("[data-collapse-ghost] [inert], [data-collapse-ghost] > [inert]").count()) + 1 >= 1, `en stum kopia fälls ihop i dess ställe (${ghostH.toFixed(0)} px)`)
const bPanel = b.locator("#ex-b")
const hb1 = await bPanel.evaluate((el) => el.getBoundingClientRect().height)
await p.waitForTimeout(500)
const hb2 = await bPanel.evaluate((el) => el.getBoundingClientRect().height)
check(hb1 < hb2, `nästa övning fälls ut mjukt (${hb1.toFixed(0)} → ${hb2.toFixed(0)} px)`)
check((await a.locator("[data-collapse-ghost] > *").count()) === 0, "kopian tas bort när den fällts ihop")
check((await p.locator("input[aria-label='Vikt set 1 (kg)']").count()) === 1, "bara den öppna övningens fält finns kvar")
const skip = p.locator("button:has-text('Hoppa över')")
if (await skip.count()) await skip.click()

// ------------------------------------------------- lägg till/ta bort set ---
await b.locator("[data-testid=add-set]").click()
const fresh = b.locator("ol > li").nth(2)
await fresh.waitFor()
check(/rise-in/.test(await fresh.getAttribute("class")), "ett nytt set glider in")
const h0 = await fresh.evaluate((el) => el.getBoundingClientRect().height)
await b.locator("[data-testid=remove-set]").click()
await p.waitForTimeout(120)
const hMid = await fresh.evaluate((el) => el.getBoundingClientRect().height).catch(() => 0)
check(hMid < h0, `det sista setet fälls ihop innan det tas bort (${h0.toFixed(0)} → ${hMid.toFixed(0)} px)`)
await p.waitForTimeout(400)
check((await b.locator("ol > li").count()) === 2, "och tas sedan bort")
await p.screenshot({ path: `${out}/v68-traningslogg.png` })

// ------------------------------------------------------ minska rörelse ---
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
const q = await rm.newPage()
await q.goto(base + "/klient")
await q.waitForSelector("nav a:has-text('Kost')")
await q.evaluate(([k, w]) => {
  const s = JSON.parse(localStorage[k])
  s.data.workouts.push(w)
  localStorage[k] = JSON.stringify(s)
}, [KEY, await p.evaluate((k) => JSON.parse(localStorage[k]).data.workouts.find((w) => w.id === "w-v68"), KEY)])
await q.goto(base + "/klient/pass/w-v68")
await q.locator("#exercise-b input[aria-label='Vikt set 1 (kg)']").waitFor()
await q.locator("#exercise-b button[aria-label='Öka Vikt set 1']").click()
check((await q.locator("#exercise-b input[aria-label='Vikt set 1 (kg)']").evaluate((el) => el.style.scale)) === "", "minska rörelse: ingen studs")
await q.locator("#exercise-b button[aria-controls=ex-b]").click()
await q.waitForTimeout(30)
check((await q.locator("[data-collapse-ghost] > *").count()) === 0 && (await q.locator("#ex-b").count()) === 0, "minska rörelse: övningen fälls ihop direkt")
await rm.close()

// -------------------------------------------------------- vattenmålet ---
await p.goto(base + "/klient")
const goalText = await p.locator("text=/av [\\d,]+ l/").first().innerText().catch(() => "")
const goalL = Number(goalText.match(/av ([\d,]+) l/)?.[1].replace(",", "."))
check(goalL >= 1.5 && goalL <= 3, `vattenmålet ligger mellan 1,5 och 3 l (${goalText})`)

// ---------------------------------------- Kost: sökfältet ovanför tangentbordet ---
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" })
const k = await phone.newPage()
await k.goto(base + "/klient/kost")
await k.waitForSelector("[data-testid=meal-tiles]")
await k.waitForTimeout(600)
await k.locator("[data-testid=meal-tile][data-meal=dinner] [data-testid=meal-tile-add]").click()
// Tangentbordet tar ungefär halva skärmen: simulera det genom att krympa fönstret.
await k.setViewportSize({ width: 390, height: 420 })
await k.waitForTimeout(900)
const box = await k.locator('input[role="combobox"]').evaluate((el) => el.getBoundingClientRect().top)
check(box < 160, `sökfältet ligger högt upp när tangentbordet är öppet (top ${box.toFixed(0)} px)`)
await k.locator('input[role="combobox"]').fill("kvarg")
await k.waitForTimeout(300)
const firstHit = await k.locator("#food-picker-results [role=option]").first().evaluate((el) => el.getBoundingClientRect().bottom)
check(firstHit < 420, `första träffen syns ovanför tangentbordet (${firstHit.toFixed(0)} px)`)
await phone.close()

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
