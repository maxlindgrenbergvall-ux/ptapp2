// E2E för v16 i demoläge: varukorgen (lägg till, flera PT:er, ta bort,
// mersälj, kassa per PT, sparas vid omladdning) och PT Boost (köp och
// förlängning i PT-portalen, "Utvald" först i Hitta PT, på profilen och i klockan).
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v16-varukorg-boost.test.mjs [skärmdumpsmapp]
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
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const cartCount = async () => Number((await p.locator("[data-testid=cart-count]").innerText().catch(() => "0")).trim() || 0)
const sek = (n) => `${n.toLocaleString("sv-SE").replace(/ /g, " ")} kr`
const norm = (s) => s.replace(/\s+/g, " ").trim()
// Serviceavgift 10 % för plattformsklienter (Sara hittade David och den andra PT:n i appen), hela kronor
// (som databasen och src/lib/payments/fees.ts).
const fee = (subtotal) => Math.floor((subtotal * 10 + 50) / 100)

// ------------------------------------------------- 1. Hitta PT: utvald först ---
await p.goto(base + "/klient/hitta")
await p.waitForSelector("text=Hitta din PT")
const cards = p.locator("main ul > li a")
await cards.first().waitFor()
check((await cards.first().locator("h2").innerText()).includes("David Ek"), "den boostade PT:n (David) visas först")
check(await cards.first().locator("[data-testid=boosted-badge]").isVisible(), "kortet har märket Utvald")
check((await p.locator("[data-testid=boosted-badge]").count()) === 1, "bara boostade PT:er är märkta")
check(await p.locator("text=Utvalda PT:er är betalda placeringar").isVisible(), "betald placering är tydligt märkt")
await p.screenshot({ path: `${out}/v16-hitta-utvald.png` })
// Klienten väljer själv en annan sortering → boosten styr inte ordningen.
await p.click('[aria-label=Sortering]')
await p.click('role=option >> text="Lägst pris"')
const prices = await cards.locator(".tabular").first().allInnerTexts()
const d0 = await demo()
const cheapest = d0.trainers.filter((t) => t.isPublished).sort((a, b) => a.pricePerSession - b.pricePerSession)[0]
check((await cards.first().locator("h2").innerText()).includes(cheapest.name), `vald sortering (lägst pris) gäller före boost (${prices[0]})`)

// ------------------------------------------------------ 2. Varukorgen ---
await p.goto(base + "/klient/hitta/t6")
await p.waitForSelector("text=David Ek")
check(await p.locator("[data-testid=boosted-badge]").first().isVisible(), "PT-profilen visar Utvald")
const davidServices = d0.services.filter((s) => s.trainerId === "t6" && s.active)
check(davidServices.length >= 2, `David har minst två tjänster (${davidServices.length})`)
await p.click(`button[aria-label="Lägg ${davidServices[0].title} i varukorgen"]`)
await p.waitForSelector("text=ligger i varukorgen")
check((await cartCount()) === 1, "räknaren på varukorgen visar 1")
check(await p.locator(`button[aria-label^="${davidServices[0].title} ligger i varukorgen"]`).isVisible(), "tjänsten visas som I varukorgen")
await p.click(`button[aria-label="Lägg ${davidServices[1].title} i varukorgen"]`)
await p.waitForFunction(() => document.querySelector("[data-testid=cart-count]")?.textContent === "2")

// En annan PT: tjänster från flera PT:er i samma varukorg.
const other = d0.trainers.find((t) => t.id !== "t6" && t.isPublished && d0.services.some((s) => s.trainerId === t.id && s.active && s.kind === "single") && !["t1", "t2"].includes(t.id))
const otherSingle = d0.services.find((s) => s.trainerId === other.id && s.kind === "single")
await p.goto(base + `/klient/hitta/${other.id}`)
await p.waitForSelector(`text=${other.name}`)
await p.click(`button[aria-label="Lägg ${otherSingle.title} i varukorgen"]`)
await p.waitForFunction(() => document.querySelector("[data-testid=cart-count]")?.textContent === "3")
ok(`tjänst från ${other.name} lagd i samma varukorg`)

// Varukorgen sparas (demo: localStorage; Supabase: cart_items) – även efter omladdning.
await p.reload()
await p.waitForSelector("[data-testid=cart-count]")
check((await cartCount()) === 3, "varukorgen finns kvar efter omladdning")
check((await demo()).cart.length === 3, "varukorgen är sparad i appens data")

await p.click('button[aria-label^="Varukorg"]')
const cart = p.locator("[data-testid=cart]")
await cart.waitFor()
const groups = cart.locator("section[aria-label^='Varukorg hos']")
check((await groups.count()) === 2, "varukorgen är grupperad per PT")
check(await cart.locator("text=du betalar en PT i taget").isVisible(), "förklarar att man betalar en PT i taget")
const davidGroup = cart.locator("section[aria-label='Varukorg hos David Ek']")
const davidTotal = davidServices[0].priceSek + davidServices[1].priceSek
check(norm(await davidGroup.locator("[data-testid=cart-total-subtotal]").innerText()) === sek(davidTotal), `deltotal per PT (${sek(davidTotal)})`)
check(norm(await davidGroup.locator("[data-testid=cart-total-fee]").innerText()) === sek(fee(davidTotal)), `serviceavgift 10 % (${sek(fee(davidTotal))})`)
check(norm(await davidGroup.locator("[data-testid=cart-total]").innerText()) === sek(davidTotal + fee(davidTotal)), `totalt att betala (${sek(davidTotal + fee(davidTotal))})`)
check(/Serviceavgift \(10 %\)/.test(await davidGroup.innerText()) && /Totalt att betala/.test(await davidGroup.innerText()), "avgiften redovisas som egen rad")

// v17: antal enstaka pass direkt i varukorgen.
const single = davidServices.find((x) => x.kind === "single")
const pkg = davidServices.find((x) => x.kind !== "single")
const singleRow = davidGroup.locator("li", { hasText: single.title })
check(await davidGroup.locator(`button[aria-label="Minska antal ${single.title}"]`).isDisabled(), "minus är avstängt vid 1 pass")
check((await davidGroup.locator(`[aria-label="Antal ${pkg.title}"]`).count()) === 0, "paket har inget antal att välja")
await davidGroup.locator(`button[aria-label="Öka antal ${single.title}"]`).click()
await davidGroup.locator(`button[aria-label="Öka antal ${single.title}"]`).click()
await p.waitForFunction(() => [...document.querySelectorAll("[data-testid=cart-quantity]")].some((e) => e.textContent === "3"))
check(norm(await singleRow.locator("[data-testid=cart-line-total]").innerText()) === sek(single.priceSek * 3), `3 pass: radpriset uppdateras (${sek(single.priceSek * 3)})`)
const sub3 = single.priceSek * 3 + pkg.priceSek
check(norm(await davidGroup.locator("[data-testid=cart-total]").innerText()) === sek(sub3 + fee(sub3)), `totalen räknas om med avgift (${sek(sub3 + fee(sub3))})`)
check((await demo()).cart.find((c) => c.serviceId === single.id)?.quantity === 3, "antalet sparas i varukorgen")
await davidGroup.locator(`button[aria-label="Minska antal ${single.title}"]`).click()
await p.waitForFunction(() => [...document.querySelectorAll("[data-testid=cart-quantity]")].some((e) => e.textContent === "2"))
ok("minus minskar antalet")
await p.screenshot({ path: `${out}/v16-varukorg.png` })

// Mersälj i varukorgen om PT:n säljer kost och klienten inte redan har den.
const otherNutrition = d0.services.find((s) => s.trainerId === other.id && s.kind === "nutrition" && s.active)
const otherGroup = cart.locator(`section[aria-label='Varukorg hos ${other.name}']`)
if (otherNutrition) {
  check(await otherGroup.locator(`button[aria-label="Lägg ${otherNutrition.title} i varukorgen"]`).isVisible(), "varukorgen föreslår PT:ns kostcoaching")
}

// Ta bort en tjänst.
await davidGroup.locator(`button[aria-label="Ta bort ${davidServices[1].title} ur varukorgen"]`).click()
await p.waitForFunction(() => document.querySelector("[data-testid=cart-count]")?.textContent === "2")
const left = davidServices[0].kind === "single" ? davidServices[0].priceSek * 2 : davidServices[0].priceSek
check(norm(await davidGroup.locator("[data-testid=cart-total-subtotal]").innerText()) === sek(left), "borttagen tjänst försvinner ur summan")

// Kassan för en PT: demoläget simulerar betalningen; den PT:ns rader töms, den andra ligger kvar.
await otherGroup.locator("button:has-text('Till kassan')").click()
await p.waitForSelector("text=Betalningen är klar")
await p.waitForFunction(() => document.querySelector("[data-testid=cart-count]")?.textContent === "1")
const d1 = await demo()
check(d1.purchases.some((x) => x.serviceId === otherSingle.id && x.status === "paid"), `köpet hos ${other.name} är betalt`)
check(d1.cart.length === 1 && d1.cart[0].serviceId === davidServices[0].id, "betald tjänst togs bort ur varukorgen, resten ligger kvar")
check((await groups.count()) === 1, "bara Davids grupp är kvar i varukorgen")
// Kassan hos David med 2 enstaka pass: köpet får antal, pass och pris × 2.
if (davidServices[0].kind === "single") {
  await davidGroup.locator("button:has-text('Till kassan')").click()
  await p.waitForFunction(() => !document.querySelector("[data-testid=cart-count]"))
  const bought = (await demo()).purchases.find((x) => x.serviceId === davidServices[0].id && x.status === "paid")
  check(bought?.quantity === 2 && bought.sessions === 2 && bought.priceSek === davidServices[0].priceSek * 2, "köp med antal: 2 pass, 2 × priset")
}
await cart.locator("button[aria-label='Stäng varukorgen']").click()

// Tom varukorg.
// (Köpet hos David ovan tas också bort: en PT man redan tränar med rekommenderas inte i klockan.)
await p.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:demo:v5"])
  s.data.cart = []
  s.data.purchases = s.data.purchases.filter((x) => x.trainerId !== "t6")
  s.data.relationships = s.data.relationships.filter((r) => r.trainerId !== "t6")
  localStorage["coavira:demo:v5"] = JSON.stringify(s)
})
await p.reload()
await p.click('button[aria-label^="Varukorg"]')
check(await p.locator("[data-testid=cart] >> text=Varukorgen är tom").isVisible(), "tom varukorg visar en länk till Hitta PT")
await p.keyboard.press("Escape")

// ------------------------------------------------- 3. Klockan: utvald PT ---
// Klienten har tittat på styrkelyft (Davids inriktning) och har personliga erbjudanden på.
await p.evaluate(() => {
  const now = Date.now()
  localStorage["coavira:interests:v1:c1"] = JSON.stringify({
    enabled: true,
    events: [
      { c: "styrkelyft", w: 3, t: now - 1000 },
      { c: "styrkelyft", w: 3, t: now - 2000 },
    ],
    dismissed: [],
    seen: [],
  })
})
await p.reload()
const bell = p.locator('button[aria-label^="Aviseringar"]')
await bell.waitFor()
const label = await bell.getAttribute("aria-label")
await bell.click()
const featured = p.locator("[data-testid=featured-trainer]")
await featured.first().waitFor({ timeout: 5000 }).catch(() => {})
check((await featured.count()) === 1 && (await featured.first().innerText()).includes("David Ek"), "klockan rekommenderar den utvalda PT:n inom klientens intresse")
check((await featured.first().innerText()).includes("Annons"), "rekommendationen är märkt som annons")
check(/nya/.test(label ?? ""), `rekommendationen räknas som ny i klockan (${label})`)
await p.screenshot({ path: `${out}/v16-klockan.png` })
await featured.first().locator('button[aria-label="Dölj David Ek"]').click()
check((await featured.count()) === 0, "rekommendationen kan döljas")
await p.keyboard.press("Escape")
// Avstängda personliga erbjudanden → inga rekommendationer.
await p.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:interests:v1:c1"])
  localStorage["coavira:interests:v1:c1"] = JSON.stringify({ ...s, enabled: false, dismissed: [] })
})
await p.reload()
await p.locator('button[aria-label^="Aviseringar"]').click()
check((await p.locator("[data-testid=featured-trainer]").count()) === 0, "inga rekommendationer när personliga erbjudanden är avstängda")
await p.keyboard.press("Escape")

// -------------------------------------------------- 4. PT Boost (PT-portalen) ---
await p.goto(base + "/pt/profil")
const card = p.locator("[data-testid=boost-card]")
await card.waitFor()
check((await card.innerText()).includes("199 kr"), "Boost-kortet visar priset 199 kr")
await card.locator("button:has-text('Boosta i 7 dagar')").click()
await p.waitForSelector("text=Din profil är boostad!")
const t1 = (await demo()).trainers.find((t) => t.id === "t1")
const days = (Date.parse(t1.boostedUntil) - Date.now()) / 86_400_000
check(days > 6.9 && days <= 7, `boosten gäller 7 dagar (${days.toFixed(2)})`)
check((await card.innerText()).includes("7 dagar kvar") && (await card.locator("[data-testid=boosted-badge]").isVisible()), "kortet visar aktiv boost och dagar kvar")
await card.locator("button:has-text('Förläng 7 dagar')").click()
await p.waitForSelector("text=Boosten är förlängd")
check((await card.innerText()).includes("14 dagar kvar"), "förlängning läggs efter pågående boost (14 dagar)")
await p.screenshot({ path: `${out}/v16-boost-pt.png` })

// Klienten ser nu Elin som utvald.
await p.goto(base + "/klient/hitta")
await cards.first().waitFor()
const boostedNames = await p.locator("main ul > li a:has([data-testid=boosted-badge]) h2").allInnerTexts()
check(boostedNames.length === 2 && boostedNames.some((n) => n.includes("Elin")), `Elin är utvald efter köpet (${boostedNames.map(norm).join(", ")})`)
const firstTwo = (await cards.locator("h2").allInnerTexts()).slice(0, 2).map(norm)
check(firstTwo.every((n) => boostedNames.map(norm).includes(n)), "båda utvalda PT:er visas först")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
