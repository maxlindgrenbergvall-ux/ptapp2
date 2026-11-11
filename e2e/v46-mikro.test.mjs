// E2E för v46 i demoläge (mobil 390 px, touch, mörkt läge): mikroanimationer och
// tomma lägen i appen. Kontrollerar att rörelserna faktiskt sker (mellanlägen),
// att de landar på rätt slutvärde och att "minska rörelse" stänger av dem.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v46-mikro.test.mjs
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
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" }

// ------------------------------------------------------------ 1. palett ---
const ctx = await browser.newContext(mobile)
const p = watch(await ctx.newPage())
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=water-tracker]")
const theme = await p.evaluate(() => ({
  bg: getComputedStyle(document.body).backgroundColor,
  text: getComputedStyle(document.body).color,
  accent: getComputedStyle(document.querySelector("[data-testid=next-workout]")).backgroundColor,
}))
check(theme.bg === "rgb(19, 25, 22)" && theme.text === "rgb(249, 251, 248)" && theme.accent === "rgb(132, 204, 22)", `mörkt läge: #131916 / #f9fbf8 / #84cc16 (${theme.bg}, ${theme.text}, ${theme.accent})`)

// ------------------------------------------------------------ 2. vatten ---
const water = p.locator("[data-testid=water-tracker]")
await water.scrollIntoViewIfNeeded()
/** Hur långt ned fyllningen i varje glas ligger (px): 0 = fullt, glasets höjd = tomt. */
const offsets = () => water.locator("button[data-level] span").evaluateAll((els) => els.map((e) => Math.round(new DOMMatrix(getComputedStyle(e).transform).m42)))
const empty = (await offsets())[0]
check(empty > 20, `tomma glas: fyllningen ligger under glaset (${empty} px)`)
await water.locator("button[aria-label='Lägg till en flaska, 500 ml']").click()
await p.waitForTimeout(160)
const mid = await offsets()
check(mid[0] > 0 && mid[0] < empty && mid[1] > mid[0], `vattnet hälls: glas 1 är på väg upp och glas 2 ligger efter (${mid[0]} och ${mid[1]} px)`)
await p.waitForTimeout(1300)
const done = await offsets()
check(done[0] === 0 && done[1] === 0 && done[2] === empty, `två glas fulla, resten tomma (${done.slice(0, 3).join(", ")})`)
check(/0,5\s*l/.test(await water.innerText()), "litrarna landar på 0,5 l")
const glasses = await water.locator("button[data-level]").count()
await water.locator("button[data-level]").nth(glasses - 1).click()
await water.locator("[data-testid=water-goal-reached]").waitFor()
check((await water.locator(".ring-burst").count()) === 1, "målet nått: kvitto med bock och ring")
check(await p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data.waterLogs.some((w) => w.ml === 2500)), "vattnet sparas som förut (2 500 ml)")

// ------------------------------------------------- 3. pass: set och kvitto ---
await p.evaluate(() => window.scrollTo(0, 0))
await p.locator("a:has-text('Starta passet')").first().click()
await p.waitForURL(/\/klient\/pass\//)
const next = p.locator("li[data-next]")
await next.first().waitFor()
check((await next.count()) === 1 && (await next.first().locator("span").first().innerText()).trim() === "1", "setet på tur är markerat (set 1)")
await next.first().locator("button[aria-label^='Bocka av set']").click()
await p.waitForTimeout(80)
check((await p.locator("li .ring-burst").count()) === 1 && (await p.locator("li .check-draw").count()) === 1, "avbockat set: bocken ritas och knappen får en ring")
await p.waitForTimeout(700)
check((await next.first().locator("span").first().innerText()).trim() === "2", "markeringen flyttar till nästa set (set 2)")
await p.locator("button:has-text('Avsluta')").first().click()
await p.click("button:has-text('Lagom tungt')")
check((await p.locator("button[aria-pressed=true]:has-text('Lagom tungt')").count()) === 1, "vald snabbkommentar är markerad")
await p.click("button:has-text('Spara pass')")
await p.locator("[data-testid=workout-saved]").waitFor()
check(/Snyggt jobbat!/.test(await p.locator("[data-testid=workout-saved]").innerText()), "kvitto när passet är sparat")
await p.waitForURL(base + "/klient", { timeout: 5000 })
ok("appen går vidare till startsidan av sig själv efter kvittot")
check(await p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data.workouts.some((w) => w.status === "completed" && w.clientComment === "Lagom tungt")), "passet och kommentaren sparas som förut")

// ------------------------------------------------------------- 4. kost ---
await p.click("nav[aria-label=Huvudmeny] a:has-text('Kost')")
const meter = p.locator("[data-testid=kcal-meter]").first()
await meter.waitFor()
await p.waitForTimeout(1200)
const kcal = () => meter.locator("span").first().innerText().then((t) => Number(t.replace(/\s/g, "")))
const before = await kcal()
const mealBtn = p.locator("ul[aria-label=Måltider] button[aria-pressed=false]").first()
await mealBtn.click()
await p.waitForTimeout(120)
const during = await kcal()
await p.waitForTimeout(1200)
const after = await kcal()
check(after > before && during > before && during < after, `kalorierna räknar mjukt upp när en måltid bockas av (${before} → ${during} → ${after})`)
const bar = await meter.locator("[role=progressbar]").evaluate((el) => ({ fill: Number(el.dataset.fill), transition: getComputedStyle(el.firstElementChild).transitionProperty }))
check(bar.fill > 0 && /transform/.test(bar.transition) && !/width/.test(bar.transition), `stapeln fylls med transform, inte width (${bar.fill} %, ${bar.transition})`)
// En dag utan loggat: tomt läge som pekar på hur man loggar.
await p.click("button[aria-label='Föregående dag']")
await p.click("button[aria-label='Föregående dag']")
await p.click("button[aria-label='Föregående dag']")
check((await p.locator("[data-testid=food-log-empty]").count()) === 1 && /Inget loggat den här dagen/.test(await p.locator("[data-testid=food-log-empty]").innerText()), "tomt läge i matloggen en dag utan poster")

// --------------------------------------------------------- 5. inkorgen ---
await p.goto(base + "/klient/chatt")
await p.waitForSelector("[data-testid=chat-inbox]")
// Läs alla olästa (öppna varje tråd) och gå tillbaka.
for (let i = 0; i < 5; i++) {
  await p.click("button[aria-pressed]:has-text('Olästa')")
  const rows = p.locator("[data-testid=inbox-row]")
  if (!(await rows.count())) break
  await rows.first().click()
  await p.waitForSelector("[data-testid=conversation]")
  if (i === 0) check(/page-push/.test(await p.locator("[data-testid=conversation]").getAttribute("class")), "konversationen glider in som en egen vy")
  await p.click("[aria-label='Tillbaka till inkorgen']")
  await p.waitForSelector("[data-testid=chat-inbox]")
}
const emptyInbox = p.locator("[data-testid=chat-inbox] >> text=Inga olästa meddelanden.")
await emptyInbox.waitFor()
await p.click("button:has-text('Visa alla konversationer')")
check((await p.locator("[data-testid=inbox-row]").count()) > 0, "tomt läge i inkorgen: \"Visa alla konversationer\" leder tillbaka")
await ctx.close()

// ------------------------------------------------- 6. minska rörelse ---
const rc = await browser.newContext({ ...mobile, reducedMotion: "reduce" })
const r = watch(await rc.newPage())
await r.goto(base + "/klient")
const rw = r.locator("[data-testid=water-tracker]")
await rw.scrollIntoViewIfNeeded()
await rw.locator("button[aria-label='Lägg till ett glas, 250 ml']").click()
await r.waitForTimeout(120)
const instant = await rw.locator("button[data-level] span").first().evaluate((e) => Math.round(new DOMMatrix(getComputedStyle(e).transform).m42))
check(instant === 0 && /0,3\s*l|0,25\s*l/.test(await rw.innerText()), `med "minska rörelse" fylls glaset och talet direkt (${instant} px)`)
await rc.close()

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
