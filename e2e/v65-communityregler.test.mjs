// E2E för v65 i demoläge: communityreglerna i avtalet och vid registreringen,
// länken i Inställningar och rapportknappen i chatten.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v65-communityregler.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))

// ------------------------------------------------------ communityreglerna ---
await p.goto(base + "/communityregler")
const rules = await p.locator("main, body").first().innerText()
check(/Communityregler/.test(rules) && /Det här är inte tillåtet/.test(rules), "/communityregler visar reglerna")
check(/Sexuellt innehåll/.test(rules) && /Trakasserier/.test(rules), "förbjudet innehåll listas")
check(/tillfällig avstängning/.test(rules) && /överklaga beslutet inom sex månader/.test(rules), "åtgärder, avstängning och rätt att överklaga beskrivs")
check(/Version 2026-12/.test(rules), "version 2026-12")

await p.goto(base + "/avtal")
check((await p.locator("[data-testid=agreement-part-community]").count()) === 1, "communityreglerna är en del av klientavtalet (/avtal)")
await p.goto(base + "/avtal/pt")
check((await p.locator("[data-testid=agreement-part-community]").count()) === 1 && /Del 4: PT-avtal/.test(await p.locator("body").innerText()), "och av PT-avtalet (/avtal/pt), PT-delen blir del 4")
await p.goto(base + "/villkor")
check((await p.locator("a[href='/communityregler']").count()) >= 1, "användarvillkoren hänvisar till communityreglerna")

// ------------------------------------------------------------ registrering ---
await p.goto(base + "/registrera")
const consent = p.locator("label[for=signup-consent]")
await consent.waitFor()
check(/användarvillkoren, communityreglerna och behandlingen av mina hälsouppgifter/.test(await consent.innerText()), "samtycket vid registreringen omfattar communityreglerna")
check((await consent.locator("a[href='/communityregler']").count()) === 1, "länk till communityreglerna i samtycket")

// --------------------------------------------------------------- appen ---
await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
check((await p.locator("[data-testid=agreement-update]").count()) === 0, "demoläget visar ingen avtalsdialog")
await p.goto(base + "/klient/installningar")
await p.waitForTimeout(500)
const legal = p.locator("[data-testid=legal-links]")
if (await legal.count()) check((await legal.locator("a:has-text('Communityregler')").count()) === 1, "länk till communityreglerna i Inställningar")

// ------------------------------------------------------ rapportera i chatten ---
await p.goto(base + "/klient/chatt/t1")
await p.waitForSelector("textarea")
const reportButtons = p.locator("[data-testid=report-message]")
const n = await reportButtons.count()
const theirs = await p.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:demo:v5"]).data
  return s.messages.filter((m) => m.threadId === "c1" && m.trainerId === "t1" && m.senderId !== "c1" && !/^\[call/.test(m.body ?? "")).length
})
check(n > 0, `rapportknapp på PT:ns meddelanden (${n})`)
// Egna meddelanden har ingen rapportknapp: skicka ett och räkna igen.
await p.fill("textarea", "Mitt eget meddelande")
await p.keyboard.press("Enter")
await p.waitForTimeout(300)
check((await reportButtons.count()) === n, "egna meddelanden kan inte rapporteras", { before: n, after: await reportButtons.count(), theirs })
await reportButtons.first().click()
const dialog = p.locator("[data-testid=report-dialog]")
await dialog.waitFor()
check((await dialog.locator("[role=radio]").count()) === 8, "åtta kategorier att välja mellan")
check(await dialog.locator("[data-testid=send-report]").isDisabled(), "kategori krävs innan rapporten kan skickas")
await dialog.locator("[role=radio]:has-text('Trakasserier')").click()
await dialog.locator("textarea").fill("Testrapport")
await dialog.locator("[data-testid=send-report]").click()
await p.locator("text=Tack för din rapport").waitFor()
ok("rapporten skickas och bekräftas")
check((await dialog.count()) === 0, "dialogen stängs")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
