// E2E för v27 i demoläge: kompakta receptkort (5+ per skärm), text som aldrig
// kapas fult eller svämmar över, makro-piller, klistrande kategori-chips,
// foton i fast format (object-cover, kvadrat i listan, 16:9 i pop-upen) och
// reservbild när ett foto saknas eller inte går att ladda.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v27-recept-ui.test.mjs [skärmdumpsmapp]
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

for (const width of [320, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
  await p.goto(base + "/klient/recept")
  await p.waitForSelector("[data-testid=recipe-card]")
  const vh = 844
  const heights = await p.locator("[data-testid=recipe-card]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  const maxH = Math.max(...heights)
  const median = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)]
  // Smalaste mobilen (320 px) får bryta pillren på två rader.
  check(maxH <= (width < 360 ? 110 : 100) && median <= (width < 360 ? 106 : 92), `${width}px: korten är kompakta (typiskt ${Math.round(median)} px, högst ${Math.round(maxH)} px)`)
  // Rulla så att listan börjar under filterraden och räkna kort på en skärm.
  await p.evaluate(() => window.scrollTo(0, document.querySelector("[aria-label=Recept]").getBoundingClientRect().top + window.scrollY - 150))
  await p.waitForTimeout(200)
  const onScreen = await p.locator("[data-testid=recipe-card]").evaluateAll((els, h) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= h - 64 }).length, vh)
  check(onScreen >= 5, `${width}px: ${onScreen} recept på en skärm`)
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px: ingen horisontell overflow`)
  // Titlar: högst två rader, inom kortet och inte under stjärnan.
  const titles = await p.locator("[data-testid=recipe-card]").evaluateAll((cards) =>
    cards.map((c) => {
      const t = c.querySelector(".line-clamp-2").getBoundingClientRect()
      const star = c.querySelector("[data-testid=favorite-button]").getBoundingClientRect()
      const card = c.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(c.querySelector(".line-clamp-2")).lineHeight)
      // Titelns text (utan stjärnans reserverade plats) får inte gå in under stjärnan.
      const pad = parseFloat(getComputedStyle(c.querySelector(".line-clamp-2")).paddingRight)
      return { inside: t.right <= card.right + 0.5 && t.left >= card.left, clearOfStar: t.right - pad <= star.left + 1, lines: Math.round(t.height / lh) }
    })
  )
  check(titles.every((t) => t.inside && t.clearOfStar), `${width}px: titlarna ligger inom kortet och täcks inte av stjärnan`)
  check(titles.every((t) => t.lines <= 2), `${width}px: titlar högst två rader`)
  const pills = await p.locator("[data-testid=recipe-card]").first().locator("[data-testid=macro-pills] > span").count()
  check(pills >= 4, `${width}px: makro-piller (kcal, protein, kolhydrater, fett${pills > 4 ? ", tid" : ""})`)
  // Kategori-chipsen ligger kvar överst när listan rullas.
  await p.evaluate(() => window.scrollTo(0, 2000))
  await p.waitForTimeout(200)
  const filtersTop = await p.locator("[data-testid=recipe-filters]").evaluate((e) => e.getBoundingClientRect().top)
  check(filtersTop >= 0 && filtersTop < 120, `${width}px: kategori-chipsen klistrar sig överst (${Math.round(filtersTop)} px)`)
  await p.click("[data-testid=tab-quick_easy]")
  check((await p.getAttribute("[data-testid=tab-quick_easy]", "aria-selected")) === "true" && (await p.locator("[data-testid=recipe-card]").count()) >= 8, `${width}px: byte av kategori direkt, utan sidladdning`)
  await p.click("[data-testid=tab-all]")
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.screenshot({ path: `${out}/v27-lista-${width}.png` })
  await ctx.close()
}

// ------------------------------------------------- foton och reservbild ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
await p.goto(base + "/klient/recept")
await p.waitForSelector("[data-testid=recipe-card]")
// Ett foto (lokal bild i stället för Supabase Storage) och ett trasigt.
await p.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:demo:v5"])
  s.data.recipes = s.data.recipes.map((r) => (r.id === "rc-c1-oats" ? { ...r, imageUrl: "/og-image.png" } : r))
  s.data.recipes.push({ ...s.data.recipes.find((r) => r.id === "rc-c1-oats"), id: "rc-trasig", name: "Recept med trasig bild", imageUrl: "/finns-inte.jpg" })
  localStorage["coavira:demo:v5"] = JSON.stringify(s)
})
await p.reload()
await p.waitForSelector("text=Recept med trasig bild")
const photo = p.locator("[data-testid=recipe-card]", { hasText: "Overnight oats med bär" }).locator("img")
await photo.waitFor()
await p.waitForFunction(() => [...document.querySelectorAll("[data-testid=recipe-card] img")].some((i) => i.complete && i.naturalWidth > 0))
const fit = await photo.evaluate((img) => {
  const box = img.parentElement.getBoundingClientRect()
  return { fit: getComputedStyle(img).objectFit, square: Math.abs(box.width - box.height) < 1, fills: img.getBoundingClientRect().width === box.width }
})
check(fit.fit === "cover" && fit.square && fit.fills, "foto i listan: kvadratiskt och object-fit: cover (dras aldrig ut)")
const broken = p.locator("[data-testid=recipe-card]", { hasText: "Recept med trasig bild" })
await p.waitForTimeout(500)
check((await broken.locator("img").count()) === 0 && (await broken.locator("[data-testid=recipe-image] svg").count()) === 1, "trasig bildlänk → minimalistisk reservbild")
await p.locator("[data-testid=recipe-card] button", { hasText: "Overnight oats med bär" }).click()
const hero = p.locator("[data-testid=recipe-sheet] [data-testid=recipe-image]").first()
await hero.waitFor()
const ratio = await hero.evaluate((e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height)
check(Math.abs(ratio - 16 / 9) < 0.02, `pop-upens bild i 16:9 (${ratio.toFixed(2)})`)
// Pop-upen rullar inuti sig själv, sidan bakom står still.
const before = await p.evaluate(() => window.scrollY)
const scrolled = await p.locator("[data-testid=recipe-sheet]").evaluate((e) => {
  e.scrollTop = 400
  return e.scrollTop
})
check(scrolled > 0 && (await p.evaluate(() => window.scrollY)) === before, "pop-upen rullar för sig själv (sidan bakom står still)")
check(await p.locator("[data-testid=recipe-sheet]").evaluate((e) => getComputedStyle(e).overscrollBehaviorY === "contain"), "overscroll-contain: ingen rullning läcker till sidan")
check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "pop-upen ger ingen horisontell overflow")
await p.locator("[data-testid=recipe-sheet]").evaluate((e) => (e.scrollTop = 0))
await p.screenshot({ path: `${out}/v27-popup.png` })

console.log(errors.length ? errors.join("\n") : "ok   inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
