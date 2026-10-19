// E2E för v14 i demoläge: kost-PT-filtret och taggen "Kostschema", logiska
// enheter i kosten (PT och klient), tidsspärr för genomförda pass, krav på
// vikter vid klarmarkering, uppvärmning/nedvarvning och samtalsspärr.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v14-regler.test.mjs [skärmdumpsmapp]
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
p.on("dialog", (d) => void d.accept())
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v4"]).data)
const patchDemo = (fn) =>
  p.evaluate((src) => {
    const s = JSON.parse(localStorage["coavira:demo:v4"])
    s.data = new Function("d", `return (${src})(d)`)(s.data)
    localStorage["coavira:demo:v4"] = JSON.stringify(s)
  }, fn.toString())
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)

// ------------------------------------------------ 1. kost-PT: filter och tagg ---
await p.goto(base + "/klient/hitta")
await p.waitForSelector("text=Hitta din PT")
// Buggen: en PT som kryssat i "Kost" men inte säljer någon kosttjänst dök upp i listan.
await patchDemo((d) => ({ ...d, trainers: d.trainers.map((t) => (t.id === "t2" ? { ...t, offersNutrition: true } : t)) }))
await p.goto(base + "/klient/hitta?inriktning=kost")
await p.waitForSelector('[role=radiogroup][aria-label=Erbjuder] button[aria-checked=true]:has-text("Kostschema")')
const cards = p.locator("main ul > li a")
await cards.first().waitFor()
const names = (await cards.locator("h2").allInnerTexts()).map((t) => t.trim())
const d1 = await demo()
const expected = d1.trainers
  .filter((t) => t.isPublished && t.offersNutrition && d1.services.some((s) => s.trainerId === t.id && s.active && s.includesNutrition))
  .map((t) => t.name)
check(names.length === expected.length && expected.every((n) => names.includes(n)), `filtret Kostschema visar bara PT:er med kosttjänst (${names.join(", ")})`)
check(!names.includes("Ahmed Rashid"), "PT utan kosttjänst syns inte trots ikryssad kost")
check((await cards.locator("[data-testid=nutrition-tag]").count()) === names.length, "varje kort i kostfiltret har taggen Kostschema")
await p.screenshot({ path: `${out}/v14-kostfilter.png`, fullPage: true })
await p.click('[role=radiogroup][aria-label=Erbjuder] button:has-text("Allt")')
await p.waitForFunction((n) => document.querySelectorAll("main ul > li a h2").length > n, names.length)
const ahmedCard = p.locator("main ul > li a", { hasText: "Ahmed Rashid" })
check((await ahmedCard.locator("[data-testid=nutrition-tag]").count()) === 0, "ingen Kostschema-tagg för PT utan kosttjänst i hela listan")

await p.goto(base + "/klient/hitta/t7")
await p.waitForSelector("text=Nora Ek")
check(await p.locator("[data-testid=nutrition-tag]").first().isVisible(), "PT-profilen för en kost-PT visar taggen Kostschema")
await p.screenshot({ path: `${out}/v14-pt-profil-kostschema.png`, fullPage: true })
await p.goto(base + "/klient/hitta/t2")
await p.waitForSelector("text=Ahmed Rashid")
check((await p.locator("[data-testid=nutrition-tag]").count()) === 0, "PT-profilen utan kosttjänst visar ingen Kostschema-tagg")

// ---------------------------------------------------- 2. logiska enheter ---
await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/kost")
await p.waitForSelector("text=Dagssumma")
const meal = p.locator("ol > li").first()
const addFood = async (q, name) => {
  await meal.locator('input[placeholder="Lägg till livsmedel…"]').fill(q)
  await p.keyboard.press("Enter")
  const row = meal.locator("li", { hasText: new RegExp(`^${name.replace(/[()%]/g, "\\$&")}`) }).last()
  await row.waitFor()
  return row
}
const optionsFor = async (row, name) => {
  const trigger = row.locator(`[aria-label="Enhet för ${name}"]`)
  if ((await trigger.getAttribute("role")) !== "combobox") return [(await trigger.innerText()).trim()]
  await trigger.click()
  const units = (await p.locator("[role=option]").allInnerTexts()).map((t) => t.trim())
  await p.keyboard.press("Escape")
  return units
}
const milk = await addFood("mjölk 3", "Mjölk 3 %")
check((await milk.locator('[aria-label="Enhet för Mjölk 3 %"]').innerText()).trim() === "dl", "mjölk läggs till i dl")
check((await optionsFor(milk, "Mjölk 3 %")).join(",") === "dl,ml", "vätskor: bara dl och ml")
const chicken = await addFood("kycklingfilé", "Kycklingfilé")
check((await optionsFor(chicken, "Kycklingfilé")).join(",") === "g", "kött/fågel: bara gram")
const rice = await addFood("jasminris (kokt)", "Jasminris (kokt)")
check((await optionsFor(rice, "Jasminris (kokt)")).join(",") === "g,dl", "ris: gram eller dl")
const oil = await addFood("olivolja", "Olivolja")
check((await optionsFor(oil, "Olivolja")).includes("ml") && (await optionsFor(oil, "Olivolja")).includes("dl"), "olja: volymenheter (msk, tsk, ml, dl)")
await p.screenshot({ path: `${out}/v14-enheter-pt.png`, fullPage: true })

// Klienten: samma regler i matloggen.
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
await p.fill('input[aria-label="Sök livsmedel eller märkesvara"]', "mellanmjölk")
await p.click('role=option >> text="Mellanmjölk 1,5 %"')
const unitRadios = p.locator('[role=radiogroup][aria-label=Enhet] [role=radio]')
check((await unitRadios.allInnerTexts()).map((t) => t.trim()).join(",") === "ml,dl", "klient: mjölk i ml eller dl")
await unitRadios.filter({ hasText: "dl" }).click()
await p.fill('input[aria-label="Mängd i dl"]', "2")
await p.click('form >> button:has-text("Lägg till")')
await p.waitForSelector("text=Mellanmjölk 1,5 % >> xpath=.. >> text=· 200 ml")
ok("klient: 2 dl mjölk loggas som 200 ml")
await p.fill('input[aria-label="Sök livsmedel eller märkesvara"]', "kycklingfilé")
await p.click('role=option >> text="Kycklingfilé"')
check((await p.locator("[role=radiogroup][aria-label=Enhet]").count()) === 0 && (await p.locator('input[aria-label="Mängd i gram"]').isVisible()), "klient: kyckling bara i gram")
await p.click('button[aria-label="Tillbaka till sökningen"]')

// ------------------------------------------------- 3. tidsspärr för pass ---
await patchDemo((d) => ({
  ...d,
  workouts: d.workouts.map((w) =>
    w.id === "w-c1-next"
      ? { ...w, exercises: w.exercises.map((e, i, all) => ({ ...e, section: i === 0 ? "warmup" : i === all.length - 1 ? "cooldown" : undefined })) }
      : w
  ),
}))
await p.goto(base + "/klient/pass/w-c1-next")
await p.waitForSelector("[data-testid=workout-preview]")
// 5. uppvärmning/nedvarvning grupperas i passvyn
for (const label of ["Uppvärmning", "Huvudpass", "Nedvarvning"]) check(await p.locator(`section[aria-label="${label}"] h2`).isVisible(), `passvyn visar delen ${label}`)
await p.click('button:has-text("Starta ändå nu")')
await p.click('button[aria-label="Bocka av set 1"] >> nth=0')
check(await p.locator("[data-testid=workout-not-started]").isVisible(), "klienten kan logga set i förväg men ser att passet inte kan avslutas än")
check(await p.locator('header button:has-text("Avsluta")').isDisabled(), "Avsluta är spärrat före passets tid")
await p.screenshot({ path: `${out}/v14-tidsparr-klient.png`, fullPage: true })
const early = (await demo()).workouts.find((w) => w.id === "w-c1-next")
check(early.status !== "completed", "passet är inte genomfört eller borta i förtid")

await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/klienter/c1/pass/w-c1-next")
await p.waitForSelector("[data-testid=workout-not-started]")
check(await p.locator('header button:has-text("Klarmarkera")').isDisabled(), "PT:n kan inte klarmarkera ett pass som inte ägt rum")
await p.screenshot({ path: `${out}/v14-tidsparr-pt.png`, fullPage: true })

// ------------------------------------------ 4. vikter krävs vid klarmarkering ---
const d2 = await demo()
const todays = d2.workouts.find((w) => w.clientId === "c1" && !w.byClient && w.date === localToday())
const firstEx = d2.exercises.find((x) => x.id === todays.exercises[0].exerciseId)
check(/skivstång|hantl|maskin|kabel|kettlebell/i.test(firstEx.equipment), `första övningen görs med vikt (${firstEx.name}, ${firstEx.equipment})`)
await p.goto(`${base}/pt/klienter/c1/pass/${todays.id}`)
await p.waitForSelector("text=Kontrollera vad som faktiskt gjordes")
const kg1 = p.locator('input[aria-label="Vikt set 1 (kg)"]').first()
await kg1.click()
await p.keyboard.press("Control+A")
await p.keyboard.type("0")
await p.keyboard.press("Enter")
await p.click('button[aria-label="Bocka av set 1"] >> nth=0')
await p.click('header button:has-text("Klarmarkera")')
await p.waitForSelector("text=Klarmarkera passet")
check(await p.locator("[data-testid=weights-missing]").first().isVisible(), "kontrollfönstret visar att vikt saknas")
check(await p.locator('button:has-text("Bekräfta genomfört")').isDisabled(), "passet kan inte klarmarkeras med tomma vikter")
await p.screenshot({ path: `${out}/v14-vikter-saknas.png` })
await p.click('button:has-text("Fortsätt rätta")')
await p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })
await kg1.click()
await p.keyboard.press("Control+A")
await p.keyboard.type("82,5")
await p.keyboard.press("Enter")
await p.click('header button:has-text("Klarmarkera")')
await p.waitForSelector("text=Klarmarkera passet")
check((await p.locator("[data-testid=weights-missing]").count()) === 0, "inga saknade vikter när de fyllts i")
await p.click('button:has-text("Bekräfta genomfört")')
await p.waitForURL(base + "/pt/klienter/c1")
const verified = (await demo()).workouts.find((w) => w.id === todays.id)
check(verified.verifiedAt && verified.logs.some((l) => l.done && l.kg === 82.5), "passet klarmarkerat med ifyllda vikter")

// -------------------------------------- 5. uppvärmning/nedvarvning i passbyggaren ---
await p.goto(base + "/pt/pass")
await p.waitForSelector("text=Spara")
const del = p.locator('[aria-label^="Del av passet för"]')
await del.last().click()
await p.click('[role=option]:has-text("Uppvärmning")')
await p.click('button:has-text("Spara")')
await p.waitForSelector("text=Mallen är sparad")
const tpl = (await demo()).templates.find((t) => t.exercises.some((e) => e.section === "warmup"))
check(tpl && tpl.exercises[0].section === "warmup", "uppvärmningen sparas först i mallen")
await p.screenshot({ path: `${out}/v14-passbyggare-delar.png`, fullPage: true })

// --------------------------------------------- 6. samtal kräver köp/bokning ---
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(base + "/klient/chatt")
await p.waitForSelector('button[aria-label^="Videosamtal med"]')
ok("betalande klient kan ringa sin PT")
await patchDemo((d) => ({
  ...d,
  purchases: d.purchases.filter((x) => !(x.clientId === "c1" && x.trainerId === "t1")),
  events: d.events.map((e) => (e.clientId === "c1" && e.trainerId === "t1" && e.status !== "cancelled" ? { ...e, status: "pending" } : e)),
}))
await p.goto(base + "/klient/chatt")
await p.waitForSelector("[data-testid=call-locked]")
check((await p.locator('button[aria-label^="Videosamtal med"]').count()) === 0, "utan köp eller bokat pass finns inga ring-knappar")
await p.click("[data-testid=call-locked]")
await p.waitForSelector("text=Samtal låses upp när du köpt en tjänst eller bokat ett pass med Elin")
ok("låset förklarar hur samtal låses upp")
await p.screenshot({ path: `${out}/v14-samtal-last.png`, fullPage: true })

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
