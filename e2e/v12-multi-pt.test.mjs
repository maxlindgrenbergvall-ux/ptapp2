// E2E för v12 i demoläge: logomenyn, flera PT:er (chatt per PT, lämna PT),
// ett aktivt kostschema, PT-utbud (kost-PT), intressen → mätpunkter i
// Framsteg, nya samtalsbrickor och samtalsläget.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v12-multi-pt.test.mjs [skärmdumpsmapp]
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
p.on("console", (m) => m.type() === "error" && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v4"]).data)
const patchDemo = (fn) =>
  p.evaluate((src) => {
    const s = JSON.parse(localStorage["coavira:demo:v4"])
    s.data = new Function("d", `return (${src})(d)`)(s.data)
    localStorage["coavira:demo:v4"] = JSON.stringify(s)
  }, fn.toString())
const overlayGone = () => p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })

// ---------------------------------------------------------- 1. logomenyn ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens kost")
await p.click('button[aria-label="Coavira-menyn"]')
const items = (await p.locator("[role=menuitem]").allInnerTexts()).map((t) => t.split("\n")[0].trim())
for (const label of ["Inställningar", "Profilinställningar", "Min data och sekretess", "Anslutningar"]) {
  check(items.includes(label), `logomenyn innehåller ${label}`)
}
await p.screenshot({ path: `${out}/v12-logomeny.png` })
const pages = [
  ["Inställningar", "/klient/installningar", "Inställningar"],
  ["Min data och sekretess", "/klient/sekretess", "Ladda ner min data"],
  ["Anslutningar", "/klient/anslutningar", "Fitbit"],
  ["Profilinställningar", "/klient/profil", "Intressen och mål"],
]
await p.keyboard.press("Escape")
for (const [label, path, text] of pages) {
  await p.waitForSelector("[role=menu]", { state: "detached" })
  await p.click('button[aria-label="Coavira-menyn"]')
  await p.click(`[role=menuitem]:has-text("${label}")`)
  await p.waitForURL(base + path)
  await p.waitForSelector(`text=${text} >> visible=true`)
  ok(`logomenyn → ${label}`)
}

// ---------------------------------------- 2. intressen styr Framsteg ---
await p.click('[role=group][aria-label=Intressen] button:has-text("Cykling")')
check((await p.locator("[data-testid=metric-preview]").innerText()).includes("Bästa tid på milen"), "profilen förhandsvisar mätpunkterna för Cykling")
await p.fill("#profile-focus", "Under 15 minuter på milen")
await p.click('button:has-text("Spara profilen")')
await p.waitForSelector("text=Profilen är sparad")
check((await demo()).clients.find((c) => c.id === "c1").interests.includes("cykling"), "intresset sparas på profilen")
await p.screenshot({ path: `${out}/v12-profil.png`, fullPage: true })

await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=metrics-grid]")
check(await p.locator('section[aria-label="Cykling"] >> text=Bästa tid på milen').isVisible(), "Framsteg visar Bästa tid på milen för Cykling")
check(await p.locator('section[aria-label="Styrkelyft"] >> text=Knäböj, uppsk. 1RM').isVisible(), "Framsteg visar 1RM för Styrkelyft")
check((await p.locator("[data-testid=metric-hyrox_total]").innerText()).includes("1:33:30"), "Hyrox-tid från loggen (1:33:30)")
check(await p.locator("text=Under 15 minuter på milen").isVisible(), "målet visas i Framsteg")
await p.click('button[aria-label="Logga Bästa tid på milen"]')
await p.fill("#metric-value", "18:30")
await p.click('[role=dialog] button[type=submit]')
await p.waitForSelector("text=/Bästa tid på milen: 18:30 sparat/")
await overlayGone()
check((await p.locator("[data-testid=metric-cykling_10km]").innerText()).includes("18:30"), "loggad tid visas på mätpunkten")
await p.screenshot({ path: `${out}/v12-framsteg.png`, fullPage: true })

// ------------------------------------- 3. flera PT:er och chatt per PT ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Dina PT:er")
check(await p.locator("text=Elin Söderberg").first().isVisible(), "Elin finns bland Dina PT:er")
check(await p.locator("text=Ahmed Rashid").first().isVisible(), "Ahmed finns bland Dina PT:er (två PT:er samtidigt)")

await p.goto(base + "/klient/chatt")
await p.waitForSelector("[role=tablist][aria-label='Välj PT']")
check(!(await p.locator("text=SkiErg-intervaller").isVisible()), "Elins tråd innehåller inte Ahmeds meddelanden")
await p.click("[role=tab]:has-text('Ahmed')")
await p.waitForSelector("text=SkiErg-intervaller")
ok("Ahmeds tråd visas när han väljs")
await p.fill('textarea[aria-label="Meddelande"]', "Tack, kör imorgon!")
await p.click('button[aria-label="Skicka"]')
await p.waitForSelector("text=Tack, kör imorgon!")
check((await demo()).messages.find((m) => m.body === "Tack, kör imorgon!")?.trainerId === "t2", "meddelandet hamnar i tråden med Ahmed")

// Missat samtal-bricka med Ring upp.
await patchDemo((d) => ({
  ...d,
  messages: [...d.messages, { id: "msg-missed", threadId: "c1", trainerId: "t2", senderId: "t2", body: "📵 Missat videosamtal", sentAt: new Date().toISOString() }],
}))
await p.reload()
await p.click("[role=tab]:has-text('Ahmed')")
const missed = p.locator("[data-testid=call-card][data-missed]").last()
await missed.waitFor()
check((await missed.innerText()).includes("Missat videosamtal"), "missat samtal visas som en tydlig bricka")
check(await missed.locator('button[aria-label="Ring upp Ahmed Rashid"]').isVisible(), "brickan har Ring upp")
await p.screenshot({ path: `${out}/v12-chatt-missat.png` })

// Samtalsläget: nya kontroller med etiketter.
await missed.locator('button[aria-label="Ring upp Ahmed Rashid"]').click()
await p.waitForSelector("text=Ringer…")
await p.waitForSelector("text=Krypterat · direkt mellan er")
check(await p.locator('button[aria-label="Lägg på"]').isVisible(), "samtalsläget har Lägg på-knappen")
check(await p.locator("text=Mikrofon").isVisible(), "kontrollerna har etiketter")
await p.waitForTimeout(400)
await p.screenshot({ path: `${out}/v12-samtal.png` })
await p.click('button[aria-label="Lägg på"]')
await p.waitForSelector("text=Krypterat · direkt mellan er", { state: "detached" })

// ------------------------------------------- 4. kost-PT och PT-utbud ---
await p.goto(base + "/klient/hitta")
await p.click('[role=radiogroup][aria-label=Erbjuder] button:has-text("Kost")')
check(await p.locator("text=Nora Ek").first().isVisible(), "filtret Kost visar kost-PT:n")
check((await p.locator("text=Ahmed Rashid").count()) === 0, "filtret Kost döljer PT:er som bara erbjuder träning")
await p.goto(base + "/klient/hitta/t7")
await p.waitForSelector("text=Nora Ek")
check((await p.locator('button:has-text("Boka")').count()) === 0, "kost-PT:n har ingen bokningsknapp (säljer inga pass)")
check((await p.locator('ul[aria-label="Tjänster hos Nora"] li').count()) === 1, "kost-PT:n säljer bara kostcoaching")
await p.goto(base + "/klient/hitta/t2")
await p.waitForSelector("text=Ahmed Rashid")
check((await p.locator('ul[aria-label="Tjänster hos Ahmed"] >> text=Kostcoaching').count()) === 0, "tränings-PT:n säljer ingen kost")

// Köp kost hos Nora → tredje PT:n.
await p.goto(base + "/klient/hitta/t7")
await p.click('button[aria-label="Välj Kostcoaching"]')
await p.click('[role=dialog] button:has-text("Betala")')
await p.waitForSelector("text=Betalningen är klar")
await overlayGone()
check((await demo()).relationships.filter((r) => r.clientId === "c1" && r.status === "active").length === 3, "klienten har nu tre PT:er")

// ------------------------------------------- 5. ett aktivt kostschema ---
await patchDemo((d) => ({
  ...d,
  nutritionPlans: [
    ...d.nutritionPlans,
    { id: "np-t7", trainerId: "t7", clientId: "c1", name: "Noras kostschema", targets: { kcal: 2100, protein: 130, carbs: 230, fat: 70 }, meals: [], active: false },
  ],
}))
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=plan-chooser]")
ok("med scheman från två PT:er väljer klienten vilket som gäller")
await p.click("#active-plan")
await p.click('[role=option]:has-text("Noras kostschema")')
await p.waitForSelector("text=Noras kostschema gäller nu")
const plans = (await demo()).nutritionPlans.filter((x) => x.clientId === "c1")
check(plans.filter((x) => x.active !== false).length === 1, "bara ett aktivt kostschema")
check(plans.find((x) => x.active !== false)?.trainerId === "t7", "det valda schemat gäller")
await p.screenshot({ path: `${out}/v12-kostval.png`, fullPage: true })

// --------------------------------------------------------- 6. lämna PT ---
await p.goto(base + "/klient/profil")
await p.click('button:has-text("Lämna Ahmed")')
await p.waitForSelector("text=Lämna Ahmed Rashid?")
await p.click('[role=dialog] button:has-text("Lämna Ahmed")')
await p.waitForSelector("text=Du har lämnat Ahmed Rashid")
await overlayGone()
check((await demo()).relationships.find((r) => r.clientId === "c1" && r.trainerId === "t2")?.status === "ended", "relationen med Ahmed är avslutad")
await p.goto(base + "/klient")
await p.waitForSelector("text=Dina PT:er")
check((await p.locator("text=Ahmed Rashid").count()) === 0, "Ahmed syns inte längre bland PT:erna")

// --------------------------------------------------- 7. PT-sidan ---
await p.setViewportSize({ width: 1280, height: 900 })
await p.goto(base + "/pt/klienter/c1")
await p.waitForSelector("text=Mål och mätpunkter")
check(await p.locator('ul[aria-label=Intressen] >> text=Cykling').first().isVisible(), "PT:n ser klientens intressen")
check(await p.locator('[data-testid=metrics-grid] >> text=Bästa tid på milen').first().isVisible(), "PT:n ser klientens mätpunkter")
await p.goto(base + "/pt/profil")
await p.waitForSelector("text=Vad erbjuder du?")
await p.click('[role=group][aria-label=Utbud] button:has-text("Träning")')
await p.click('[role=group][aria-label=Utbud] button:has-text("Kost")')
await p.waitForSelector("text=Du behöver erbjuda träning, kost eller båda")
ok("en PT måste erbjuda träning eller kost")
await p.click('button:has-text("Spara") >> nth=0')
await p.waitForSelector("text=Profilen är sparad")
const t1 = (await demo()).trainers.find((t) => t.id === "t1")
check(t1.offersTraining === false && t1.offersNutrition === true, "PT:n kan bli ren kost-PT")
check((await demo()).services.filter((x) => x.trainerId === "t1" && x.active && x.sessions > 0).length === 0, "tjänster med pass pausas för en kost-PT")
await p.click('button:has-text("Ny tjänst")')
check((await p.locator('[role=radiogroup][aria-label="Typ av tjänst"] button').allInnerTexts()).every((t) => t.includes("Kost")), "kost-PT:n kan bara skapa kosttjänster")
await p.keyboard.press("Escape")

// PT-menyn
await p.click('button[aria-label="Coavira-menyn"] >> visible=true')
await p.click('[role=menuitem]:has-text("Anslutningar")')
await p.waitForURL(base + "/pt/anslutningar")
await p.waitForSelector("text=Synka kalender >> visible=true")
ok("PT:ns logomeny → Anslutningar (kalendersynk)")

// Mobil: inga sidor scrollar i sidled
await p.setViewportSize({ width: 360, height: 780 })
for (const path of ["/klient/installningar", "/klient/profil", "/klient/sekretess", "/klient/anslutningar", "/klient/chatt", "/klient/framsteg"]) {
  await p.goto(base + path)
  await p.waitForTimeout(500)
  const w = await p.evaluate(() => document.documentElement.scrollWidth)
  check(w <= 361, `mobil: ${path} ryms i bredden (${w}px)`)
}

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
