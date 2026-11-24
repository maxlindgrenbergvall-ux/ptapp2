// E2E för v75 i demoläge: friskvårdspaket, prisstöd, PT-profilens friskvård och
// företagsuppgifter, badge och filter i Hitta PT, extern friskvårdskund,
// chattens anti-leakage och friskvårdskvittot (PDF).
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v75-friskvard.test.mjs [skärmbildsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))
const KEY = "coavira:demo:v5"
const text = (loc) => loc.innerText().then((t) => t.replace(/\s+/g, " "))

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2, acceptDownloads: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))
const demo = () => p.evaluate((k) => JSON.parse(localStorage[k]).data, KEY)

await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")

// ======================================================== PT: profil ===
await p.goto(base + "/pt/profil")
const settings = p.locator("[data-testid=wellness-settings]")
await settings.waitFor()
await settings.locator("#biz-org").waitFor()
check(await settings.isVisible(), "PT-profilen har en sektion för friskvård")
await settings.locator("[data-testid=portal-acceptsEdenred]").click()
await p.waitForTimeout(200)
check((await demo()).trainers.find((t) => t.id === "t1").acceptsEdenred === true, "\"Tar emot Edenred\" sparas på profilen")

await settings.locator("#biz-name").fill("Elin Söderberg Träning AB")
await settings.locator("#biz-org").fill("559123-4562")
check(await settings.locator("text=Kontrollsiffran stämmer inte").isVisible(), "ogiltigt organisationsnummer underkänns direkt")
check(await settings.locator("[data-testid=save-business]").isDisabled(), "och går inte att spara")
await settings.locator("#biz-org").fill("5591234561")
await settings.locator("#biz-address").fill("Sveavägen 10, 113 50 Stockholm")
await settings.locator("#biz-instructions").fill('Sök på "Elin Söderberg" i ePassi och välj Personlig träning.')
await settings.locator("[data-testid=save-business]").click()
await p.locator("text=Företagsuppgifterna är sparade").waitFor()
const stored = await p.evaluate(() => JSON.parse(localStorage["coavira:demo:business:v1"]).t1)
check(stored.orgNumber === "559123-4561" && stored.companyName === "Elin Söderberg Träning AB", "företagsuppgifterna sparas (organisationsnumret normaliserat)")
await settings.screenshot({ path: `${out}/v75-pt-friskvard.png` })

// =================================================== PT: friskvårdspaket ===
await p.locator("[data-testid=create-wellness-package]").click()
const dialog = p.locator("[role=dialog]")
await dialog.waitFor()
check((await dialog.locator("h2").innerText()) === "Nytt friskvårdspaket", "1-klicksmallen öppnar ett nytt friskvårdspaket")
check((await dialog.locator("#svc-title").inputValue()) === "Friskvårdsupplägg 3 månader – Personlig träning & skräddarsytt kostschema", "mallens titel")
check(/Godkänt|friskvårdsbidrag/.test(await dialog.locator("#svc-desc").inputValue()) && /Coavira\+/.test(await dialog.locator("#svc-desc").inputValue()), "mallens beskrivning")
check((await dialog.locator("#svc-price").inputValue()).replace(/\s/g, "") === "3495", "standardpris 3 495 kr")
check((await dialog.locator("[data-testid=wellness-price-chips] button").allInnerTexts()).map((t) => t.replace(/\s/g, "")).join(",") === "1995kr,2995kr,3995kr,4995kr", "snabbval 1 995 / 2 995 / 3 995 / 4 995 kr")
check(/De flesta arbetsgivare ger 2 000–5 000 kr\/år/.test(await text(dialog.locator("[data-testid=wellness-price-chips]"))), "hjälptext om friskvårdstaken")
const calc = dialog.locator("[data-testid=wellness-calc]")
check(/3 495 kr netto/.test(await text(calc.locator("[data-testid=calc-net-coavira]"))), "kalkyl: PT:n får hela priset via Coavira")
check(/3 146 kr–3 320 kr netto/.test(await text(calc.locator("[data-testid=calc-net-portal]"))), "kalkyl: netto via ePassi efter 5–10 %")
await dialog.locator("[data-testid=wellness-price-chips] button:has-text('3 995')").click()
check(/3 595 kr/.test(await text(calc.locator("[data-testid=calc-tip]"))), "tips: 3 995 kr + avgift passerar 4 000 – föreslår 3 595 kr")
await dialog.locator("#svc-price").fill("3000")
await p.waitForTimeout(100)
check(/3 000 kr netto/.test(await text(calc.locator("[data-testid=calc-net-coavira]"))), "kalkylen uppdateras live när priset skrivs")
await dialog.screenshot({ path: `${out}/v75-paketbyggare.png` })
await dialog.locator("#svc-price").fill("3495")
await dialog.locator("button[type=submit]").click()
await p.locator("text=Tjänsten är tillagd").waitFor()
const svc = (await demo()).services.find((s) => s.isWellnessPackage)
check(svc && svc.kind === "full" && svc.priceSek === 3495 && svc.sessions === 36 && svc.durationWeeks === 12, "friskvårdspaketet sparas (helhet, 36 pass, 12 veckor, 3 495 kr)")
check((await p.locator("ul[aria-label='Mina tjänster'] [data-testid=wellness-package-badge]").count()) === 1, "badgen \"Godkänt för friskvård\" i listan")

// ============================================= PT: extern friskvårdskund ===
await p.goto(base + "/pt/klienter/c1")
const pay = p.locator("[data-testid=client-payment-source]")
await pay.waitFor()
check(/Din egen klient/.test(await pay.innerText()), "Sara kom via PT:ns inbjudningslänk (egen klient)")
await pay.locator("[data-testid=toggle-external-wellness]").click()
await p.locator("text=Klienten betalar via ditt friskvårdsavtal").waitFor()
check(/0 % avgift/.test(await pay.locator("[data-testid=payment-source-status]").innerText()), "egen klient blir extern friskvårdskund direkt (0 % avgift)")
check((await demo()).relationships.find((r) => r.clientId === "c1" && r.trainerId === "t1").paymentSource === "external_wellness", "betalningskällan sparas på relationen")
await pay.locator("[data-testid=toggle-external-wellness]").click()
await p.waitForTimeout(200)

// En klient från appen utan köp: först ett köp i appen.
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  s.data.relationships = s.data.relationships.filter((r) => !(r.clientId === "c4" && r.trainerId === "t1"))
  s.data.relationships.push({ trainerId: "t1", clientId: "c4", status: "active", goal: "", startDate: new Date().toISOString().slice(0, 10), acquisition: "PLATFORM_CLIENT" })
  s.data.purchases = s.data.purchases.filter((x) => !(x.clientId === "c4" && x.trainerId === "t1"))
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/pt/klienter/c4")
await p.locator("[data-testid=client-payment-source]").waitFor()
check(/Hittade dig i Coavira/.test(await p.locator("[data-testid=client-payment-source]").innerText()), "klient från marknadsplatsen")
check(await p.locator("[data-testid=toggle-external-wellness]").isDisabled(), "kan inte bli extern friskvårdskund före första köpet i appen")

// =========================================================== Hitta PT ===
await p.goto(base + "/klient/hitta")
await p.waitForSelector("h1:has-text('Hitta din PT')")
const elin = p.locator("li", { hasText: "Elin Söderberg" }).first()
check(/Friskvård \/ ePassi, Benifex, Edenred/.test(await text(elin.locator("[data-testid=wellness-badge]"))), "badge \"Friskvård / ePassi …\" på profilkortet")
const all = await p.locator("ul > li a[href^='/klient/hitta/']").count()
await p.click("[data-testid=filter-wellness]")
const filtered = await p.locator("ul > li a[href^='/klient/hitta/']").count()
const withBadge = await p.locator("ul > li [data-testid=wellness-badge]").count()
check(filtered >= 1 && filtered < all && filtered === withBadge, `filtret Friskvård visar bara PT:er med friskvård (${filtered} av ${all})`)
await p.screenshot({ path: `${out}/v75-hitta-pt.png` })

// ================================================ köp och kvitto (klient) ===
await p.goto(base + "/klient/hitta/t1")
await p.waitForSelector("#services-title")
const card = p.locator("li", { hasText: "Friskvårdsupplägg 3 månader" }).first()
check((await card.locator("[data-testid=wellness-package-badge]").count()) === 1, "paketet har badgen \"Godkänt för friskvård\" i tjänstemenyn")
await card.locator("button[aria-label^='Välj Friskvårdsupplägg']").click()
await p.locator("[data-testid=wellness-checkout-nudge]").waitFor()
check(/Har du friskvårdsbidrag via Benifex, Edenred eller din arbetsgivare\?/.test(await p.locator("[data-testid=wellness-checkout-nudge]").innerText()), "friskvårdsrutan i kassan")
const plusBefore = (await demo()).account
await p.click('[role=dialog] button:has-text("Betala")')
await p.waitForSelector("text=Betalningen är klar")
await p.waitForTimeout(400)
void plusBefore

await p.goto(base + "/klient/profil")
const payments = p.locator("[data-testid=payments-receipts]")
await payments.waitFor()
const row = payments.locator("[data-testid=payment-row]", { hasText: "Friskvårdsupplägg" }).first()
check((await row.count()) === 1 && /Friskvård/.test(await row.innerText()), "Profil → Betalningar & kvitton listar köpet")
await row.locator("[data-testid=receipt-download]").click()
const rd = p.locator("[data-testid=receipt-dialog]")
await rd.locator("[data-testid=receipt-summary]").waitFor()
const summary = await text(rd.locator("[data-testid=receipt-summary]"))
check(/CV-\d{4}-\d{6}/.test(summary) && /559123-4561/.test(summary) && /Elin Söderberg Träning AB/.test(summary), `kvittot: nummer, säljare och organisationsnummer (${summary})`)
check(/3 670 kr/.test(summary), "beloppet inkl. 5 % serviceavgift (egen klient)")
await rd.locator("#receipt-pnr").fill("850101-0114")
check(await rd.locator("text=Personnumret ser inte rätt ut").isVisible(), "felaktigt personnummer underkänns")
check(await rd.locator("[data-testid=receipt-save]").isDisabled(), "och blockerar nedladdningen")
await rd.locator("#receipt-pnr").fill("19850101-0113")
await rd.screenshot({ path: `${out}/v75-kvitto-dialog.png` })
const [download] = await Promise.all([p.waitForEvent("download"), rd.locator("[data-testid=receipt-save]").click()])
const file = await download.path()
const bytes = fs.readFileSync(file)
check(/^friskvardskvitto-CV-\d{4}-\d{6}\.pdf$/.test(download.suggestedFilename()), `PDF-filen laddas ner (${download.suggestedFilename()})`)
check(bytes.subarray(0, 5).toString("latin1") === "%PDF-" && bytes.length > 1500, "filen är en riktig PDF")
fs.copyFileSync(file, `${out}/v75-kvitto.pdf`)
check(await p.evaluate(() => !JSON.stringify(localStorage).includes("19850101")), "personnumret sparas inte i appen")

// ===================================================== chatt före köp ===
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  s.data.relationships = s.data.relationships.filter((r) => !(r.clientId === "c1" && r.trainerId === "t3"))
  s.data.relationships.push({ trainerId: "t3", clientId: "c1", status: "active", goal: "", startDate: new Date().toISOString().slice(0, 10), acquisition: "PLATFORM_CLIENT" })
  s.data.purchases = s.data.purchases.filter((x) => !(x.clientId === "c1" && x.trainerId === "t3"))
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/klient/chatt/t3")
await p.waitForSelector("textarea")
await p.fill("textarea", "Kan jag swisha dig på 070-123 45 67 istället?")
await p.locator("[data-testid=offplatform-warning]").waitFor()
check(/först efter första köpet/.test(await p.locator("[data-testid=offplatform-warning]").innerText()), "före första köpet: varning om Swish och telefonnummer")
check(await p.locator("button[aria-label=Skicka]").isDisabled(), "och meddelandet kan inte skickas")
const sentBefore = (await demo()).messages.length
await p.keyboard.press("Enter")
await p.waitForTimeout(200)
check((await demo()).messages.length === sentBefore, "Enter skickar inte heller")
check((await p.locator("[data-testid=chat-wellness-card]").count()) === 0, "PT:ns länkar och instruktioner döljs före första köpet")
await p.fill("textarea", "Hej! Vilket paket passar för friskvård?")
check((await p.locator("[data-testid=offplatform-warning]").count()) === 0 && !(await p.locator("button[aria-label=Skicka]").isDisabled()), "vanliga frågor går fram")

// Efter köp (Elin): länkar och friskvårdsinstruktioner i chatten.
await p.goto(base + "/klient/chatt/t1")
await p.locator("[data-testid=chat-wellness-card]").waitFor()
check(/Sök på "Elin Söderberg" i ePassi/.test(await p.locator("[data-testid=wellness-instructions]").innerText()), "efter köpet: PT:ns instruktioner för friskvårdsportalen")
check((await p.locator("[data-testid=chat-wellness-card] a[href*='instagram']").count()) === 1, "och PT:ns Instagram")
await p.fill("textarea", "Kan jag betala nästa period via ePassi?")
check((await p.locator("[data-testid=offplatform-warning]").count()) === 0, "efter första köpet får man prata om friskvårdsbetalning")
await p.screenshot({ path: `${out}/v75-chatt.png` })

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
