// E2E för v11 i demoläge: tjänster och köp med mersälj av kost, kostlås,
// passgräns för PT:n, kostbyggaren (styck, gram-buggen, recept), certifikat,
// sifferfält utan inledande nolla och knapparna i klientvyn på mobil.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v11-tjanster.test.mjs [skärmdumpsmapp]
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
p.on("console", (m) => m.type() === "error" && errors.push(`${p.url()} console: ${m.text()}`))
p.on("dialog", (d) => void d.accept())
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v4"]).data)
const patchDemo = (fn) =>
  p.evaluate((src) => {
    const s = JSON.parse(localStorage["coavira:demo:v4"])
    s.data = new Function("d", `return (${src})(d)`)(s.data)
    localStorage["coavira:demo:v4"] = JSON.stringify(s)
  }, fn.toString())
const overlayGone = () => p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })

// ------------------------------------------------- 1. kostlås + mersälj ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens kost")
// Sara har köpt kost i demodatan – ta bort den så att låset och mersäljet syns.
await patchDemo((d) => ({ ...d, purchases: d.purchases.map((x) => ({ ...x, includesNutrition: false })) }))
await p.reload()
await p.waitForSelector("[data-testid=nutrition-lock]")
check(await p.locator("text=Kostråd ingår inte i ditt paket").isVisible(), "kostråden är låsta utan köpt kostcoaching")
check((await p.locator("[data-testid=nutrition-lock] li").count()) >= 1, "låset visar PT:ns kosttjänster att köpa")
await p.screenshot({ path: `${out}/v11-kostlas.png`, fullPage: true })

await p.goto(base + "/klient/hitta/t1")
await p.waitForSelector("#services-title")
const before = (await demo()).purchases.filter((x) => x.status === "paid").length
await p.click('button[aria-label="Välj Enstaka pass"]')
const upsell = p.locator("[data-testid=nutrition-upsell]")
await upsell.waitFor()
check(
  (await upsell.locator("h2").innerText()).trim() === "Kosten är det som syns på riktigt – vill du lägga till kostcoaching av Elin?",
  "mersälj: frågan om kostcoaching med PT:ns förnamn"
)
await p.screenshot({ path: `${out}/v11-mersalj.png` })
await upsell.locator("button", { hasText: "Ja, lägg till kostcoaching" }).click()
const total = (await p.locator("[data-testid=checkout-total]").innerText()).replace(/\s/g, " ")
const subtotal = (await p.locator("[data-testid=checkout-total-subtotal]").innerText()).replace(/\s/g, " ")
const fee = (await p.locator("[data-testid=checkout-total-fee]").innerText()).replace(/\s/g, " ")
check(/2\s040 kr/.test(subtotal), `varukorgen: pass + kost, deltotal (${subtotal})`)
check(/^143 kr$/.test(fee.trim()), `serviceavgift 7 % (${fee})`)
check(/2\s183 kr/.test(total), `totalt att betala inklusive avgift (${total})`)
await p.click('[role=dialog] button:has-text("Betala")')
await p.waitForSelector("text=Betalningen är klar")
await overlayGone()
const after = await demo()
check(after.purchases.filter((x) => x.status === "paid").length === before + 2, "två betalda köp (pass + kost)")
check(after.purchases.some((x) => x.includesNutrition && x.status === "paid"), "kostcoaching är köpt")
check((await p.locator("[data-testid=session-balance]").innerText()).includes("pass kvar"), "klienten ser hur många pass som är kvar")

await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens kost")
check((await p.locator("[data-testid=nutrition-lock]").count()) === 0, "kostschemat är upplåst efter köpet")

// "Nej tack" ger bara passet.
await patchDemo((d) => ({ ...d, purchases: d.purchases.map((x) => ({ ...x, includesNutrition: false })) }))
await p.goto(base + "/klient/hitta/t1")
await p.click('button[aria-label="Välj Träningsprogram 5 pass"]')
await upsell.waitFor()
await upsell.locator("button", { hasText: "Nej tack" }).click()
check((await p.locator('[aria-label="Varukorg"] li').count()) === 2, "nej tack: bara paketet i varukorgen (+ total)")
await p.keyboard.press("Escape")
await overlayGone()

// ------------------------------------------- 2. bokning kräver betalt pass ---
await patchDemo((d) => ({ ...d, purchases: d.purchases.filter((x) => x.clientId !== "c1") }))
await p.goto(base + "/klient/hitta/t1")
await p.click('button:has-text("Boka")')
await p.waitForSelector("text=Köp pass för att boka")
ok("utan betalda pass kan klienten inte boka – tjänsterna visas i stället")
await p.keyboard.press("Escape")
await overlayGone()

// ----------------------------------------------- 3. PT: passgräns (mobil) ---
await p.goto(base + "/pt/klienter/c4")
await p.waitForSelector("[data-testid=client-actions]")
const pause = await p.locator('[data-testid=client-actions] button:has-text("Pausa")').boundingBox()
const sched = await p.locator('[data-testid=client-actions] button:has-text("Schemalägg pass")').boundingBox()
const overlap = !(pause.x + pause.width <= sched.x || sched.x + sched.width <= pause.x || pause.y + pause.height <= sched.y || sched.y + sched.height <= pause.y)
check(!overlap, "mobil: Pausa och Schemalägg pass överlappar inte")
check(pause.x >= 0 && sched.x + sched.width <= 390, "mobil: knapparna ryms i bredden")
await p.screenshot({ path: `${out}/v11-pt-klient-mobil.png`, fullPage: true })

check((await p.locator("text=Betalda pass kvar").count()) === 1, "PT ser klientens betalda pass")
await p.click('[data-testid=client-actions] button:has-text("Schemalägg pass")')
const balanceText = await p.locator("[data-testid=schedule-balance]").innerText()
check(/1 av \d+ betalda pass kvar/.test(balanceText), `saldo i dialogen (${balanceText})`)
await p.click('[role=dialog] button:has-text("Schemalägg") >> nth=-1')
await p.waitForSelector("text=/schemalagt/")
await overlayGone()
await p.click('[data-testid=client-actions] button:has-text("Schemalägg pass")')
await p.waitForSelector("text=/Inga betalda pass kvar/")
check(await p.locator('[role=dialog] button:has-text("Schemalägg") >> nth=-1').isDisabled(), "PT kan inte schemalägga fler pass än klienten betalat för")
await p.keyboard.press("Escape")
await overlayGone()

// ----------------------------------------- 4. kostbyggaren (desktop) ---
await patchDemo((d) => ({
  ...d,
  purchases: [
    ...d.purchases,
    { id: "pu-test-kost", checkoutId: "co-test", clientId: "c1", trainerId: "t1", kind: "nutrition", title: "Kostcoaching", sessions: 0, includesNutrition: true, priceSek: 1190, status: "paid", createdAt: new Date().toISOString() },
  ],
}))
await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/kost")
await p.waitForSelector("text=Dagssumma")
check((await p.locator("[data-testid=builder-lock]").count()) === 0, "Sara har kost – byggaren är upplåst")
const meal = p.locator("ol > li").first()
await meal.locator('input[placeholder="Lägg till livsmedel…"]').fill("ägg")
await p.keyboard.press("Enter")
const egg = meal.locator("li", { hasText: /^Ägg/ }).last()
await egg.waitFor()
check((await egg.locator('[aria-label="Enhet för Ägg"]').innerText()).trim() === "st", "ägg läggs till i styck")
check((await egg.innerText()).includes("≈60 g"), "1 ägg ≈ 60 g")
const amount = egg.locator('input[aria-label="Mängd Ägg"]')
await amount.click()
await p.keyboard.type("3")
check((await egg.innerText()).includes("≈180 g"), "3 ägg ≈ 180 g")
check((await egg.innerText()).includes("252 kcal"), "näringsvärdet räknas från styck (3 ägg = 252 kcal)")
await egg.locator('[aria-label="Enhet för Ägg"]').click()
const units = (await p.locator("[role=option]").allInnerTexts()).map((t) => t.trim())
// v14: bara logiska enheter – ägg i styck eller gram.
check(units.join(",") === "st,g", `enheter för ägg i kostbyggaren: ${units.join(", ")} (st, g)`)

// Gram-buggen: 0 g och sedan 150 g ska ge värden igen.
await p.click('[role=option]:has-text("g") >> nth=0')
await amount.click()
await p.keyboard.type("0")
check((await egg.innerText()).includes("0 kcal"), "0 g ger 0 kcal")
await amount.click()
await p.keyboard.type("150")
check((await amount.inputValue()) === "150", `ingen inledande nolla i gramfältet ("${await amount.inputValue()}")`)
check((await egg.innerText()).includes("210 kcal"), `${(await egg.innerText()).replace(/\n/g, " ")}: värdena kommer tillbaka när gram ändras (150 g = 210 kcal)`)

// Recept: spara måltiden och lägg in den i en annan måltid.
await meal.locator('button:has-text("Spara som recept")').click()
await p.fill("#recipe-name", "Äggfrukost")
await p.click('[role=dialog] button:has-text("Spara recept")')
await p.waitForSelector('text=Receptet "Äggfrukost" är sparat')
await overlayGone()
check(await p.locator('section[aria-labelledby=recipes-title] >> text=Äggfrukost').isVisible(), "receptet finns i biblioteket")
const lunch = p.locator("ol > li").nth(1)
await lunch.locator('[aria-label^="Lägg till recept i"]').click()
await p.click('[role=option]:has-text("Äggfrukost")')
await p.waitForSelector("text=/Äggfrukost tillagt/")
check((await lunch.locator('input[aria-label="Mängd Ägg"]').count()) >= 1, "receptet läggs in i klientens måltid")
await p.click('button:has-text("Spara") >> nth=0')
await p.waitForSelector("text=Kostschemat är sparat")
await p.screenshot({ path: `${out}/v11-kostbyggare.png`, fullPage: true })

// Klient utan köpt kost: låst.
await p.click('[aria-label="Klient"]')
await p.click('[role=option]:has-text("Jonas")')
await p.waitForSelector("[data-testid=builder-lock]")
check(await p.locator('button:has-text("Spara") >> nth=0').isDisabled(), "kostschema kan inte sparas utan köpt kostcoaching")

// ------------------------------------- 5. PT-profil: tjänster och siffror ---
await p.goto(base + "/pt/profil")
await p.waitForSelector("text=Tjänster och priser")
check(
  (await p.locator("[data-testid=cert-info]").innerText()).includes("certifiering@coavira.fit"),
  "certifikat: hänvisning till manuell verifiering"
)
check((await p.locator("#cert").count()) === 0, "certifikat kan inte läggas till av PT:n")
const price = p.locator("#price")
await price.click()
await p.keyboard.type("0")
await p.keyboard.type("1")
check((await price.inputValue()) === "1", `pris: ingen inledande nolla ("${await price.inputValue()}")`)

await p.click('button:has-text("Ny tjänst")')
await p.click('[role=radiogroup][aria-label="Typ av tjänst"] button:has-text("Träningsprogram")')
await p.locator("#svc-sessions").fill("6")
await p.locator("#svc-price").fill("4500")
await p.fill("#svc-title", "Sexpack")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=Tjänsten är tillagd")
await overlayGone()
check(await p.locator('ul[aria-label="Mina tjänster"] >> text=Sexpack').isVisible(), "PT kan lägga till ett program med 6 pass")
check(await p.locator('ul[aria-label="Mina tjänster"] >> text=4 500 kr').isVisible(), "priset visas utan inledande nolla")
await p.click('button:has-text("Ny tjänst")')
await p.locator("#svc-price").fill("0")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=/Priset måste vara minst 1 kr/")
ok("tjänster kan inte vara gratis")
await p.keyboard.press("Escape")
await p.screenshot({ path: `${out}/v11-pt-profil.png`, fullPage: true })

// ------------------------------------------------- 6. /dashboard (demo) ---
await p.goto(base + "/dashboard")
await p.waitForURL((u) => new URL(u).pathname === "/")
ok("/dashboard leder vidare (demoläge: startsidan)")

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
