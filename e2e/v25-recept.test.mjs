// E2E för v25 i demoläge: hämta recept från webben (JSON-LD/microdata),
// amerikanska mått → metriska, makron per portion, träningsmålskategorier,
// detaljvy med skalbara ingredienser och steg, favoriter och loggning i
// kostdagboken med datum, måltid och portioner.
//   node e2e/mock-recipes.mjs &
//   npm run build && RECIPE_IMPORT_TEST_ORIGIN=http://localhost:54700 npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v25-recept.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const site = "http://localhost:54700"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))
const api = async (url) => {
  const res = await fetch(`${base}/api/recipes/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) })
  return { status: res.status, body: await res.json() }
}

// ----------------------------------------------- 1. import-API:t ---
{
  const { status, body } = await api(`${site}/us-chicken-bowl`)
  check(status === 200, "JSON-LD-recept i @graph hämtas")
  const r = body.recipe
  const item = (s) => r.items.find((i) => i.original.includes(s))
  check(r.name === "High-Protein Chicken & Rice Bowl", "namnet avkodas (&amp; → &)")
  check(item("cups uncooked white rice").unit === "g" && item("cups uncooked white rice").grams === 277, "1 1/2 cups ris → 277 g (fast ingrediens i gram)")
  check(item("1 lb").unit === "g" && item("1 lb").grams === 454, "1 lb kyckling → 454 g")
  check(item("tbsp olive oil").unit === "ml" && item("tbsp olive oil").qty === 30, "2 tbsp olja → 30 ml (vätska i ml)")
  check(item("cup low-sodium").unit === "dl" && item("cup low-sodium").qty === 2.4, "1 cup buljong → 2,4 dl (vätska i dl)")
  check(r.convertedUnits === 6, "alla sex amerikanska mått räknades om")
  check(r.nutrition.kcal === 520 && r.nutrition.protein === 45 && r.nutrition.carbs === 55 && r.nutrition.fat === 12 && r.macrosSource === "site", "makron per portion från sidan (520 kcal, 45/55/12 g)")
  check(r.servings === 4 && r.totalMinutes === 25, "4 portioner och 25 min (prep + cook)")
  check(r.imageUrl === `${site}/img/bowl.svg`, "relativ bildadress blir absolut")
  check(r.steps.length === 3 && r.steps[1].includes("205 °C") && r.steps[1].includes("23×33 cm"), "steg ur HowToSection; 400 °F → 205 °C och 9x13-inch → 23×33 cm")
  check(r.goalTypes.includes("high_protein") && r.goalTypes.includes("post_workout"), "kategorier: Högt protein och Efter passet")
}
{
  const { status, body } = await api(`${site}/svensk-gryta`)
  const r = body.recipe
  check(status === 200 && r.macrosSource === "estimated" && r.nutrition.kcal > 200, `svenskt recept utan näringsvärden: makron uppskattas (${r?.nutrition.kcal} kcal/portion)`)
  check(r.items.find((i) => i.original.startsWith("2 dl")).unit === "dl", "metriska mått (dl) behålls")
  check(r.items.find((i) => i.original.includes("burk")).grams === 400, "1 burk krossade tomater (400 g) → 400 g")
  check(r.goalTypes.includes("quick_easy"), "15 min → Snabbt & enkelt")
}
{
  const { status, body } = await api(`${site}/microdata`)
  check(status === 200 && body.recipe.nutrition.kcal === 410 && body.recipe.steps.length === 2, "HTML-microdata (itemprop) läses som reserv")
}
{
  const { status, body } = await api(`${site}/no-macros`)
  check(status === 422 && body.reason === "no_macros", "recept utan makron hämtas inte (422)")
  check((await api(`${site}/no-recipe`)).status === 422, "sida utan recept → 422")
  check((await api(`${site}/redirect-internal`)).status === 400, "SSRF: omdirigering till intern adress stoppas")
  check((await api("http://169.254.169.254/latest/meta-data/")).status === 400, "SSRF: molnets metadata-adress stoppas")
  check((await api("http://localhost/")).status === 400, "SSRF: localhost stoppas")
  check((await api("file:///etc/passwd")).status === 400, "bara http(s)")
  const cross = await fetch(`${base}/api/recipes/import`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" })
  check(cross.status === 403, "CSRF: anrop från en annan sajt nekas")
}

// ------------------------------------------------- 2. importera i UI:t ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const toast = (text) => p.waitForSelector(`[data-sonner-toast] >> text=${text}`)

await p.goto(base + "/klient/recept")
await p.waitForSelector("text=Overnight oats med bär")
await p.click("[data-testid=import-recipe]")
await p.fill("#recipe-url", `${site}/no-macros`)
await p.click('[data-testid=recipe-import-dialog] button[type=submit]')
await p.waitForSelector("[data-testid=import-error]")
check((await p.innerText("[data-testid=import-error]")).includes("saknar näringsvärden"), "UI: tydligt fel när receptet saknar makron")
await p.fill("#recipe-url", `${site}/us-chicken-bowl`)
await p.click('[data-testid=recipe-import-dialog] button[type=submit]')
await p.waitForSelector("[data-testid=import-preview]")
check((await p.innerText("[data-testid=import-kcal]")).includes("520 kcal"), "förhandsgranskning med kcal per portion")
check((await p.innerText("[data-testid=import-ingredients]")).includes("1 lb boneless"), "originalmåttet visas bredvid det omräknade")
await p.screenshot({ path: `${out}/v25-import.png` })
await p.click("[data-testid=save-import]")
await p.waitForURL(/\/klient\/recept\/[^/]+$/)
await p.waitForSelector("[data-testid=recipe-detail]")
ok("receptet sparas och detaljvyn öppnas")

// ------------------------------------------------------ 3. detaljvyn ---
const id = p.url().split("/").pop()
const saved = (await demo()).recipes.find((r) => r.id === id)
check(saved?.imageUrl === `${site}/img/bowl.svg` && saved.goalTypes.includes("high_protein") && saved.steps.length === 3 && saved.macrosSource === "site", "bild, kategorier, steg och makrokälla sparas")
check(await p.locator("[data-testid=recipe-detail] img").first().isVisible(), "stor bild överst")
check((await p.innerText("[data-testid=recipe-time]")).includes("25 min"), "tillagningstid")
const badges = await p.innerText("[data-testid=macro-badges]")
check(badges.includes("520") && badges.includes("45") && badges.includes("55") && badges.includes("12"), "makron per portion som badges")
check((await p.locator("[data-testid=step-list] li").count()) === 3, "numrerade steg")
const chicken = () => p.locator("[data-testid=ingredient-list] li", { hasText: "chicken breast" }).innerText()
check((await chicken()).includes("455 g"), "454 g kyckling för 4 portioner")
await p.click('button[aria-label="Fler portioner"]')
check((await p.innerText("[data-testid=servings-shown]")).includes("5 portioner") && (await chicken()).includes("570 g"), "ingredienserna skalas med portionerna (5 portioner → 570 g)")
await p.screenshot({ path: `${out}/v25-detalj.png`, fullPage: true })

// ------------------------------------------------------- 4. favoriter ---
await p.click("[data-testid=recipe-detail] [data-testid=favorite-button]")
check((await p.getAttribute("[data-testid=recipe-detail] [data-testid=favorite-button]", "aria-pressed")) === "true", "stjärnan fylls direkt (optimistiskt)")
check((await demo()).favoriteRecipes.includes(id), "favoriten sparas")
await p.goto(base + "/klient/recept")
await p.click("[data-testid=filter-favorites]")
check((await p.locator("[data-testid=recipe-card]").count()) === 2, "Mina favoriter visar de stjärnmarkerade (2)")
await p.locator("[data-testid=recipe-card]", { hasText: "Overnight oats" }).locator("[data-testid=favorite-button]").click()
await p.waitForTimeout(150)
check((await p.locator("[data-testid=recipe-card]").count()) === 1, "avmarkerad favorit försvinner ur filtret")
await p.click("[data-testid=filter-weight_loss]")
check((await p.locator("[data-testid=recipe-card]", { hasText: "Chicken" }).count()) === 0, "kategorifilter: Kalorisnålt visar inte bowlen (520 kcal)")
await p.click("[data-testid=filter-high_protein]")
check((await p.locator("[data-testid=recipe-card]", { hasText: "Chicken" }).count()) === 1, "kategorifilter: Högt protein")
await p.click("[data-testid=filter-all]")
await p.screenshot({ path: `${out}/v25-lista.png`, fullPage: true })

// ------------------------------------------- 5. logga i kostdagboken ---
await p.goto(`${base}/klient/recept/${id}`)
await p.click("[data-testid=log-recipe]")
await p.waitForSelector("[data-testid=log-recipe-dialog]")
await p.click('[data-testid=log-recipe-dialog] [role=radio]:has-text("Middag")')
await p.click('[data-testid=log-recipe-dialog] [role=radio]:has-text("1,5")')
check((await p.innerText("[data-testid=log-kcal]")).includes("780"), "1,5 portioner → 780 kcal")
const yesterday = await p.evaluate(() => {
  const d = new Date(Date.now() - 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})
await p.fill("#log-date", yesterday)
await p.screenshot({ path: `${out}/v25-logga.png` })
await p.click("[data-testid=confirm-log]")
await toast("är loggat")
const entry = (await demo()).foodEntries.find((e) => e.recipeId === id)
check(entry && entry.date === yesterday && entry.meal === "dinner" && entry.kcal === 780 && entry.protein === 67.5, "sparas i kostdagboken: datum, middag, 780 kcal, 67,5 g protein")
await p.click('[data-sonner-toast] button:has-text("Visa kostdagboken")')
await p.waitForURL(new RegExp(`/klient\\?datum=${yesterday}`))
await p.waitForSelector("[data-testid=nutrition-date]")
check(!(await p.innerText("[data-testid=nutrition-date]")).includes("Idag"), "länken öppnar kostdagboken på rätt dag")
const row = p.locator("#dagens-kost li", { hasText: "High-Protein Chicken" })
check((await row.innerText()).includes("Middag") && (await row.innerText()).includes("780 kcal"), "posten visas under Middag")
await p.screenshot({ path: `${out}/v25-kostdagbok.png`, fullPage: true })

// Ta bort receptet: favoriten försvinner, loggad mat finns kvar.
await p.goto(`${base}/klient/recept/${id}`)
p.once("dialog", (d) => void d.accept())
await p.click('[data-testid=recipe-detail] button:has-text("Ta bort")')
await p.locator('[role=alertdialog] button:has-text("Ta bort"), [role=dialog] button:has-text("Ta bort")').last().click()
await p.waitForURL("**/klient/recept")
const after = await demo()
check(!after.recipes.some((r) => r.id === id) && !after.favoriteRecipes.includes(id), "receptet och favoriten tas bort")
check(after.foodEntries.some((e) => e.name.startsWith("High-Protein Chicken") && !e.recipeId), "loggad mat finns kvar (utan koppling)")

console.log(errors.length ? errors.join("\n") : "ok   inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
