// E2E för v26 i demoläge: Coaviras färdiga receptbibliotek (inga externa
// anrop), flikar per träningsmål, receptet i en pop-up med bild, makrobadges,
// skalbara ingredienser och steg, favoriter, "Logga i kostdagboken" och att
// skapa ett eget recept från scratch med egna makron.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v26-receptbibliotek.test.mjs [skärmdumpsmapp]
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

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
// Inga externa anrop: allt ska komma från appen själv.
const external = []
p.on("request", (r) => {
  const u = new URL(r.url())
  // Matfotona (v28) hämtas från Pexels bildserver – inga andra externa anrop.
  if (!["localhost", "127.0.0.1", "images.pexels.com"].includes(u.hostname) && u.protocol.startsWith("http")) external.push(r.url())
})
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const toast = (text) => p.waitForSelector(`[data-sonner-toast] >> text=${text}`)
const sheet = "[data-testid=recipe-sheet]"
const cards = () => p.locator("[data-testid=recipe-card]")

// ---------------------------------------------------- 1. biblioteket ---
await p.goto(base + "/klient/recept")
await p.waitForSelector("text=Kycklingbowl med jasminris och broccoli")
const total = await cards().count()
check(total >= 41, `biblioteket är färdigfyllt (${total} recept inkl. ett eget)`)
check((await p.locator("[data-testid=recipe-card] [data-testid=recipe-image]").count()) >= 41, "alla recept har en bildyta (foto eller reservbild)")
for (const [tab, min] of [["high_protein", 8], ["weight_loss", 8], ["pre_workout", 8], ["post_workout", 8], ["quick_easy", 8]]) {
  await p.click(`[data-testid=tab-${tab}]`)
  check((await cards().count()) >= min, `fliken ${tab}: ${await cards().count()} recept`)
}
await p.click("[data-testid=tab-quick_easy]")
const minutes = await p.locator("[data-testid=recipe-card]").allInnerTexts()
check(minutes.every((t) => { const m = t.match(/(\d+) min/); return !m || Number(m[1]) <= 20 }), "Snabbt & enkelt: alla ≤ 20 min")
await p.click("[data-testid=tab-all]")
await p.fill('input[aria-label="Sök recept"]', "lax")
check((await cards().count()) === 2, "sök: 2 laxrecept")
await p.fill('input[aria-label="Sök recept"]', "")
await p.screenshot({ path: `${out}/v26-bibliotek.png`, fullPage: false })

// --------------------------------------------- 2. receptet i en pop-up ---
await p.locator("[data-testid=recipe-card] button", { hasText: "Kycklingbowl med jasminris" }).click()
await p.waitForSelector(`${sheet} [data-testid=recipe-detail]`)
check(await p.locator(`${sheet} [data-testid=recipe-image]`).first().isVisible(), "pop-upen visar en stor bild (eller reservbild)")
const badges = await p.innerText(`${sheet} [data-testid=macro-badges]`)
check(/533/.test(badges) && /44 g/.test(badges) && /61 g/.test(badges) && /11 g/.test(badges), "makron per portion som badges (533 kcal, 44/61/11 g)")
check((await p.locator(`${sheet} [data-testid=step-list] li`).count()) === 5, "fem numrerade steg")
const chicken = () => p.locator(`${sheet} [data-testid=ingredient-list] li`, { hasText: "Kycklingfilé" }).innerText()
check((await chicken()).includes("600 g"), "600 g kyckling för 4 portioner")
await p.click(`${sheet} button[aria-label="Färre portioner"]`)
await p.click(`${sheet} button[aria-label="Färre portioner"]`)
check((await p.innerText(`${sheet} [data-testid=servings-shown]`)).includes("2 portioner") && (await chicken()).includes("300 g"), "ingredienserna skalas (2 portioner → 300 g)")
const rice = await p.locator(`${sheet} [data-testid=ingredient-list] li`, { hasText: "Jasminris" }).innerText()
check(rice.includes("140 g"), "metriska mått (140 g ris för 2 portioner)")
check((await p.locator(`${sheet} button:has-text("Ändra")`).count()) === 0, "bibliotekets recept kan inte ändras")
await p.screenshot({ path: `${out}/v26-popup.png`, fullPage: false })

// Favorit i pop-upen.
const star = p.locator(`${sheet} [data-testid=favorite-button]`)
await star.click()
check((await star.getAttribute("aria-pressed")) === "true", "stjärnan fylls direkt i pop-upen")
const libId = (await demo()).favoriteRecipes.find((id) => id !== "rc-c1-oats")
check(Boolean(libId), "biblioteksreceptet sparas som favorit")

// ----------------------------------------- 3. logga i kostdagboken ---
await p.click(`${sheet} [data-testid=log-recipe]`)
await p.waitForSelector("[data-testid=log-recipe-dialog]")
await p.click('[data-testid=log-recipe-dialog] [role=radio]:has-text("Lunch")')
await p.click('[data-testid=log-recipe-dialog] [role=radio]:has-text("2")')
check((await p.innerText("[data-testid=log-kcal]")).includes("1066"), "2 portioner → 1066 kcal")
await p.screenshot({ path: `${out}/v26-logga.png` })
await p.click("[data-testid=confirm-log]")
await toast("är loggat")
const entry = (await demo()).foodEntries.find((e) => e.libraryRecipeId === libId)
check(entry && entry.meal === "lunch" && entry.kcal === 1066 && entry.protein === 87.8, "makrona skickas till kostdagboken (lunch, 1066 kcal, 87,8 g protein)")
await p.click('[data-sonner-toast] button:has-text("Visa kostdagboken")')
await p.waitForURL(/\/klient\?datum=/)
const row = p.locator("#dagens-kost li", { hasText: "Kycklingbowl" })
check((await row.innerText()).includes("Lunch") && (await row.innerText()).includes("1066 kcal"), "posten syns under Lunch i Dagens kost")

// ----------------------------------------------------- 4. favoriter ---
await p.goto(base + "/klient/recept")
await p.waitForSelector("text=Kycklingbowl med jasminris och broccoli")
await p.click("[data-testid=filter-favorites]")
check((await cards().count()) === 2, "Mina favoriter: biblioteksreceptet och demons egna favorit")
await p.locator("[data-testid=recipe-card]", { hasText: "Kycklingbowl" }).locator("[data-testid=favorite-button]").click()
await p.waitForTimeout(150)
check((await cards().count()) === 1, "avmarkerad favorit försvinner ur filtret")
await p.click("[data-testid=filter-all]")

// ------------------------------------------- 5. skapa eget från scratch ---
await p.click("[data-testid=new-recipe]")
await p.waitForSelector("[data-testid=recipe-editor]")
await p.fill("#recipe-name", "Mammas proteingryta")
await p.click('[data-testid=save-recipe]')
await toast("Välj minst en kategori")
ok("kategori krävs")
await p.click('[data-testid=recipe-editor] button[aria-pressed]:has-text("Högt protein")')
await p.fill("#recipe-servings", "")
check((await p.inputValue("#recipe-servings")) === "", "portioner kan tömmas")
await p.fill("#recipe-servings", "3")
await p.fill("#recipe-minutes", "25")
for (const [name, amount, unit] of [["Kycklinglår", "500", "g"], ["Krossade tomater", "4", "dl"], ["Gul lök", "1", "st"]]) {
  await p.fill('[data-testid=recipe-editor] input[aria-label="Ingrediens"]', name)
  await p.fill('[data-testid=recipe-editor] input[aria-label="Mängd"]', amount)
  await p.click('[data-testid=recipe-editor] [aria-label="Enhet"]')
  await p.click(`[role=option]:has-text("${unit}") >> nth=0`)
  await p.click('[data-testid=recipe-editor] button[aria-label="Lägg till ingrediens"]')
}
await p.click('[data-testid=save-recipe]')
await toast("Fyll i kalorier")
ok("egna makron krävs när de ska anges själv")
for (const [k, v] of [["kcal", "480"], ["protein", "42"], ["carbs", "18"], ["fat", "24,5"]]) await p.fill(`[data-testid=macro-${k}]`, v)
await p.fill("#recipe-steps", "Bryn kycklingen.\nTillsätt lök och tomater.\nLåt puttra 20 minuter.")
await p.screenshot({ path: `${out}/v26-skapa.png`, fullPage: true })
await p.click('[data-testid=save-recipe]')
await toast("är sparat")
await p.waitForSelector(`${sheet} [data-testid=recipe-detail]`)
const own = (await demo()).recipes.find((r) => r.name === "Mammas proteingryta")
check(own && own.nutrition.kcal === 480 && own.nutrition.fat === 24.5 && own.goalTypes.includes("high_protein") && own.items.length === 3 && own.steps.length === 3, "eget recept sparas med egna makron, kategori, ingredienser och steg")
check(own?.items.find((i) => i.name === "Krossade tomater")?.unit === "dl", "ingredienser i gram/dl")
check((await p.innerText(`${sheet} [data-testid=macro-badges]`)).includes("480"), "det nya receptet öppnas i pop-upen med sina makron")
check((await p.locator(`${sheet} button:has-text("Ändra")`).count()) === 1, "egna recept kan ändras")
await p.keyboard.press("Escape")
await p.click("[data-testid=filter-mine]")
check((await cards().count()) === 2 && (await p.locator("[data-testid=recipe-card]", { hasText: "Mammas proteingryta" }).count()) === 1, "Mina egna visar egna recept")

check(external.length === 0, `inga externa anrop (${external.slice(0, 3).join(", ")})`)
console.log(errors.length ? errors.join("\n") : "ok   inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
