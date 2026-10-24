// E2E för v13 i demoläge: förhandsgranska bokat pass, egna pass, PT:ns
// klarmarkering, program kopplat i kalendern, klientens profilbild, borttagen
// 1RM-ruta, flyttbar kameraruta, kostrekommendation, delad "Dagens kost" och
// köksmått (dl/msk/tsk).
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v13-pass-profil-kost.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera", "microphone"] })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
p.on("dialog", (d) => void d.accept())
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const patchDemo = (fn) =>
  p.evaluate((src) => {
    const s = JSON.parse(localStorage["coavira:demo:v5"])
    s.data = new Function("d", `return (${src})(d)`)(s.data)
    localStorage["coavira:demo:v5"] = JSON.stringify(s)
  }, fn.toString())
const overlayGone = () => p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })

// ------------------------------------- 1. förhandsgranska ett bokat pass ---
await p.goto(base + "/klient/kalender")
await p.waitForSelector("text=Mina pass")
await p.click('[role=tab]:has-text("Lista") >> visible=true')
const preview = p.locator("[data-testid=program-preview] >> visible=true").filter({ hasText: "Teknik knäböj" }).first()
await preview.waitFor()
check((await preview.innerText()).includes("× 5"), "kalendern visar övningarna i det bokade passet")
await p.screenshot({ path: `${out}/v13-kalender-program.png`, fullPage: true })
await preview.locator('a:has-text("Förhandsgranska passet")').click()
await p.waitForURL(/\/klient\/pass\/w-c1-next/)
await p.waitForSelector("[data-testid=workout-preview]")
check(await p.locator('button[aria-label="Bocka av set 1"] >> nth=0').isDisabled(), "förhandsvisningen går inte att logga i före passdagen")
await p.screenshot({ path: `${out}/v13-forhandsvisning.png`, fullPage: true })
await p.click('button:has-text("Starta ändå nu")')
check(!(await p.locator('button[aria-label="Bocka av set 1"] >> nth=0').isDisabled()), "klienten kan starta passet tidigare om hen vill")

// ---------------------------------------------------------- 2. eget pass ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-name", "Eget benpass")
await p.fill("#own-search", "knäböj")
await p.locator('ul[aria-label="Övningar att välja"] button').first().click()
check((await p.locator('ol[aria-label="Övningar i passet"] li').count()) === 1, "övning tillagd i det egna passet")
await p.click('[role=dialog] button:has-text("Starta passet")')
await p.waitForURL(/\/klient\/pass\//)
await p.waitForSelector("text=Eget benpass")
check(await p.locator("text=· Eget pass").isVisible(), "passet är märkt som eget pass")
await p.click('button[aria-label="Bocka av set 1"] >> nth=0')
await p.click('button:has-text("Avsluta")')
await p.click('button:has-text("Spara pass")')
await p.waitForURL(base + "/klient")
const own = (await demo()).workouts.find((w) => w.name === "Eget benpass")
check(own?.byClient === true && own.status === "completed", "eget pass sparat och avslutat")
const balanceOk = await p.evaluate(() => {
  const d = JSON.parse(localStorage["coavira:demo:v5"]).data
  return !d.workouts.some((w) => w.byClient && w.trainerId)
})
check(balanceOk, "egna pass har ingen PT (räknas inte som betalda pass)")

// --------------------------------------------- 3. profilbild och 1RM-ruta ---
await p.goto(base + "/klient/profil")
await p.waitForSelector("text=Personuppgifter")
// En riktig (liten) PNG laddas upp – i demoläget sparas den som data-URL.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64")
await p.setInputFiles("input[type=file]", { name: "sara.png", mimeType: "image/png", buffer: png })
await p.waitForFunction(() => document.querySelector("img[src^='data:image']"))
await p.click('button:has-text("Spara profilen")')
await p.waitForSelector("text=Profilen är sparad")
const avatar = (await demo()).clients.find((c) => c.id === "c1").avatarUrl
check(avatar?.startsWith("data:image"), "klientens profilbild sparas")
await p.goto(base + "/klient/framsteg")
await p.waitForSelector("text=Dina mål")
check((await p.locator("text=Knäböj 1RM").count()) === 0, "den gamla fasta 1RM-rutan är borta")

// ------------------------------------------------ 4. kostrekommendation ---
await patchDemo((d) => ({ ...d, purchases: d.purchases.map((x) => ({ ...x, includesNutrition: false })) }))
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=nutrition-lock]")
check((await p.locator("[data-testid=nutrition-recommended]").first().innerText()).includes("din PT Elin"), "rekommenderar i första hand nuvarande PT som erbjuder kost")
await patchDemo((d) => ({ ...d, trainers: d.trainers.map((t) => (t.id === "t1" ? { ...t, offersNutrition: false } : t)) }))
await p.reload()
await p.waitForSelector("[data-testid=nutrition-lock]")
const rec = p.locator("[data-testid=nutrition-recommended]").first()
check((await rec.innerText()).includes("Rekommenderad för kostcoaching") && (await rec.innerText()).includes("Nora Ek"), "annars rekommenderas en PT som säljer kostcoaching")
await p.screenshot({ path: `${out}/v13-kostrekommendation.png`, fullPage: true })
await p.click('a:has-text("Se andra PT:s som erbjuder kostschema")')
await p.waitForURL(/\/klient\/hitta\?inriktning=kost/)
await p.waitForSelector('[role=radiogroup][aria-label=Erbjuder] button[aria-checked=true]:has-text("Kost")')
ok("länken visar en filtrerad lista över kost-PT:er")
await patchDemo((d) => ({
  ...d,
  trainers: d.trainers.map((t) => (t.id === "t1" ? { ...t, offersNutrition: true } : t)),
  purchases: d.purchases.map((x) => (x.id === "pu-c1-legacy" ? { ...x, includesNutrition: true } : x)),
}))

// Klienten bockar av frukosten → PT:n ser samma "Dagens kost".
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=daily-nutrition] ul[aria-label=Måltider]")
await p.locator("[data-testid=daily-nutrition] ul[aria-label=Måltider] button").first().click()
const mealName = (await p.locator("[data-testid=daily-nutrition] ul[aria-label=Måltider] button").first().innerText()).split("\n")[0]

// ------------------------------------------------- 5. flyttbar kameraruta ---
await p.goto(base + "/klient/chatt")
await p.click('button[aria-label^="Videosamtal med"]')
const pip = p.locator("[data-testid=self-view]")
await pip.waitFor()
const b1 = await pip.boundingBox()
await p.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2)
await p.mouse.down()
await p.mouse.move(80, 160, { steps: 8 })
await p.mouse.up()
const b2 = await pip.boundingBox()
check(Math.abs(b2.x - b1.x) > 100 && Math.abs(b2.y - b1.y) > 100, `kamerarutan kan dras (${Math.round(b1.x)},${Math.round(b1.y)} → ${Math.round(b2.x)},${Math.round(b2.y)})`)
await pip.focus()
await p.keyboard.press("ArrowRight")
const b3 = await pip.boundingBox()
check(b3.x > b2.x, "kamerarutan kan flyttas med piltangenterna")
await p.screenshot({ path: `${out}/v13-samtal-pip.png` })
await p.click('button[aria-label="Lägg på"]')

// ------------------------------------------ 6. PT: Dagens kost och klarmarkera ---
await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/klienter/c1")
await p.waitForSelector("text=Mål och mätpunkter")
await p.click('[role=tab]:has-text("Kost")')
const ptDaily = p.locator("[data-testid=daily-nutrition] >> visible=true")
await ptDaily.waitFor()
check((await ptDaily.locator(`[aria-label="${mealName} – äten"]`).count()) === 1, `PT:n ser att klienten ätit ${mealName} (samma Dagens kost)`)
await p.screenshot({ path: `${out}/v13-pt-dagens-kost.png`, fullPage: true })
check((await p.locator("img[src^='data:image']").count()) >= 1, "PT:n ser klientens profilbild")
await p.goto(base + "/pt")
await p.waitForSelector("[data-testid=recent-purchases]")
check((await p.locator("img[src^='data:image']").count()) >= 2, "profilbilden syns i klientlistan och vid köp")

const todays = (await demo()).workouts.find((w) => w.clientId === "c1" && !w.byClient && w.date === new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
await p.goto(`${base}/pt/klienter/c1/pass/${todays.id}`)
await p.waitForSelector("text=Kontrollera vad som faktiskt gjordes")
await p.click('button[aria-label="Bocka av set 1"] >> nth=0')
await p.click('button[aria-label="Bocka av set 2"] >> nth=0')
await p.click('button:has-text("Klarmarkera")')
await p.waitForSelector("text=Klarmarkera passet")
check((await p.locator('ul[aria-label="Genomfört"]').innerText()).includes("2/"), "kontrollfönstret sammanfattar genomförda set")
await p.fill('textarea[aria-label="Kommentar om passet"]', "Bra djup i böjen, höj 2,5 kg nästa gång.")
await p.screenshot({ path: `${out}/v13-klarmarkera.png` })
await p.click('button:has-text("Bekräfta genomfört")')
await p.waitForURL(base + "/pt/klienter/c1")
const verified = (await demo()).workouts.find((w) => w.id === todays.id)
check(verified.verifiedAt && verified.status === "completed" && verified.trainerComment.includes("höj 2,5 kg"), "passet är klarmarkerat med PT:ns kommentar")

// Koppla program till ett bokat pass i kalendern.
await p.goto(base + "/pt/kalender")
await p.waitForSelector("text=Idag och imorgon")
await p.locator("button", { hasText: "Jonas Pettersson" }).last().click()
await p.waitForSelector("[data-testid=attach-program]")
await p.click('[aria-label="Träningsprogram"]')
await p.click('[role=option]:has-text("Underkropp A")')
await p.click('[data-testid=attach-program] button:has-text("Koppla")')
await p.waitForSelector("text=Underkropp A är kopplat till passet")
const ev = (await demo()).events.find((e) => e.id === "ev-c2")
const linked = (await demo()).workouts.find((w) => w.id === ev.workoutId)
check(linked?.eventId === "ev-c2" && linked.name === "Underkropp A", "programmet är kopplat till det bokade passet")
await p.keyboard.press("Escape")
await overlayGone()

// Klienten ser klarmarkeringen.
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(`${base}/klient/pass/${todays.id}`)
await p.waitForSelector("[data-testid=workout-verified]")
check((await p.locator("[data-testid=workout-verified]").innerText()).includes("Klarmarkerat av Elin"), "klienten ser att PT:n klarmarkerat passet")

// ----------------------------------------------------------- 7. köksmått ---
await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/kost")
await p.waitForSelector("text=Dagssumma")
const meal = p.locator("ol > li").first()
await meal.locator('input[placeholder="Lägg till livsmedel…"]').fill("havregryn")
await p.keyboard.press("Enter")
const oats = meal.locator("li", { hasText: /^Havregryn/ }).last()
await oats.waitFor()
await oats.locator('[aria-label="Enhet för Havregryn"]').click()
await p.click('[role=option]:has-text("dl")')
const amount = oats.locator('input[aria-label="Mängd Havregryn"]')
await amount.click()
await p.keyboard.type("1")
check((await oats.innerText()).includes("≈35 g"), "1 dl havregryn ≈ 35 g")
await oats.locator('[aria-label="Enhet för Havregryn"]').click()
// v14: gryn anges bara i gram eller dl (inte msk/tsk).
const oatUnits = (await p.locator("[role=option]").allInnerTexts()).map((t) => t.trim())
check(oatUnits.join(",") === "g,dl", `havregryn: bara g och dl (${oatUnits.join(", ")})`)
await p.keyboard.press("Escape")
await p.screenshot({ path: `${out}/v13-kokmatt.png`, fullPage: true })

// Mobil: inga sidor i sidled
await p.setViewportSize({ width: 360, height: 780 })
for (const path of ["/klient", "/klient/kalender", `/klient/pass/w-c1-next`, "/klient/profil"]) {
  await p.goto(base + path)
  await p.waitForTimeout(500)
  const w = await p.evaluate(() => document.documentElement.scrollWidth)
  check(w <= 361, `mobil: ${path} ryms i bredden (${w}px)`)
}

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
