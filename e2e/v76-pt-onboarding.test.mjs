// E2E för v76 i demoläge: PT-introt – karusellen före kontot, steg 1 (konto,
// företag, portaler, avtal), steg 2 (Stripe, hoppa över), steg 3 (första paketet),
// återupptagning på rätt steg och statusraden i dashboarden.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v76-pt-onboarding.test.mjs [skärmbildsmapp]
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
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))
const noSideScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const stepText = () => p.locator("[data-testid=pt-flow-step]").innerText()
const lead = () => p.locator("main h1 + p").first().innerText()
// Laddningsskärmen (v70) tonas bort efter varje hel sidladdning – vänta in den före skärmbilder.
const settled = () => p.waitForSelector("[data-testid=boot-splash]", { state: "detached", timeout: 8000 }).catch(() => {})

// ------------------------------------------------------ steg 0: karusellen ---
await p.goto(base + "/kom-igang")
check((await p.locator("a[href='/bli-pt']").count()) >= 1, "Kom igång länkar till \"Bli PT på Coavira\"")
await p.goto(base + "/bli-pt")
await p.locator("[data-testid=pt-intro]").waitFor()
check((await p.locator("[data-testid=pt-intro-slide]").count()) === 3, "tre korta kort")
check((await p.locator("[data-testid=pt-intro-slide] h1").allInnerTexts()).join(" | ") === "Fyll ditt schema | Smidiga betalningar & friskvård | Full kontroll på din marginal", "korten har rätt rubriker")
const slideWords = await p.locator("[data-testid=pt-intro-slide] p").allInnerTexts()
check(slideWords.every((s) => words(s) <= 15), `en mening per kort, inga textväggar (${slideWords.map(words).join(", ")} ord)`)
await p.locator("[data-testid=pt-intro-dot]").nth(2).click()
await p.waitForTimeout(700)
check((await p.locator("[data-testid=pt-intro-dot]").nth(2).getAttribute("aria-current")) === "true", "punkterna byter kort")
check(await noSideScroll(), "ingen sidledsrullning på 390 px")
await p.screenshot({ path: `${out}/v76-intro.png` })
check((await p.locator("a[href='/logga-in/pt']").innerText()) === "Logga in", "\"Har du redan ett konto? Logga in\"")
await p.locator("[data-testid=pt-intro-create]").click()

// -------------------------------------------------- steg 1: konto och företag ---
await p.waitForURL(base + "/bli-pt/konto")
await p.locator("[data-testid=pt-signup]").waitFor()
check((await stepText()) === "Steg 1 av 3", "Steg 1 av 3")
check((await p.locator("[role=progressbar]").getAttribute("aria-valuenow")) === "1", "progress bar överst")
check(words(await lead()) < 15, `max en kort hjälpmening (${words(await lead())} ord)`)
await p.locator("[data-testid=pt-flow-next]").click()
check(await p.locator("text=Fyll i förnamn och efternamn").isVisible() && await p.locator("text=Godkänn avtalet för att fortsätta").isVisible(), "tomt formulär: tydliga fel")
await p.fill("#pt-first", "Nora")
await p.fill("#pt-last", "Nilsson")
await p.fill("#pt-email", "nora@exempel.se")
await p.fill("#pt-password", "hemligt123")
await p.fill("#pt-company", "Nora Nilsson Träning")
await p.fill("#pt-org", "559123-4562")
check(await p.locator("text=Kontrollera organisationsnumret").isVisible(), "ogiltigt organisationsnummer underkänns")
await p.fill("#pt-org", "5591234561")
await p.fill("#pt-address", "Torget 2, 411 01 Göteborg")
await p.click("[data-testid=pt-portal-epassi]")
await p.click("[data-testid=pt-portal-edenred]")
check((await p.locator("[data-testid=pt-portal-epassi]").getAttribute("aria-pressed")) === "true", "portalavtal som toggle-chips")
await p.click("[data-testid=pt-terms]")
await p.screenshot({ path: `${out}/v76-steg1.png`, fullPage: true })
await p.locator("[data-testid=pt-flow-next]").click()

// ---------------------------------------------------- steg 2: utbetalningar ---
await p.waitForURL(base + "/pt/onboarding")
await p.locator("[data-testid=pt-onboarding-payouts]").waitFor()
check((await stepText()) === "Steg 2 av 3", "steg 2 efter kontot")
const biz = await p.evaluate(() => JSON.parse(localStorage["coavira:demo:business:v1"]).t1)
check(biz.companyName === "Nora Nilsson Träning" && biz.orgNumber === "559123-4561", "företagsuppgifterna sparas i steg 1")
check((await p.locator("h1").innerText()) === "Aktivera utbetalningar", "rubrik: Aktivera utbetalningar")
check((await p.locator("[data-testid=pt-onboarding-payouts] li").allInnerTexts()).join(" | ") === "Direktutbetalning till bankkonto | Kort & Apple Pay | Automatiska PDF-friskvårdskvitton", "tre korta punkter")
check(await p.locator("[data-testid=connect-payouts]").isVisible() && (await p.locator("[data-testid=connect-payouts]").innerText()).includes("Koppla Stripe-konto"), "primärknapp: Koppla Stripe-konto")
await settled()
await p.screenshot({ path: `${out}/v76-steg2.png` })
// Tillbaka: steg 1 med uppgifterna kvar.
await p.click("[data-testid=pt-flow-back]")
await p.locator("[data-testid=pt-onboarding-account]").waitFor()
check((await p.locator("#pt-first").inputValue()) === "Nora" && (await p.locator("#pt-company").inputValue()) === "Nora Nilsson Träning", "tillbaka: inget går förlorat")
await p.locator("[data-testid=pt-flow-next]").click()
await p.locator("[data-testid=pt-onboarding-payouts]").waitFor()
await p.click("[data-testid=skip-payouts]")

// ------------------------------------------------------ steg 3: första paketet ---
await p.locator("[data-testid=pt-onboarding-package]").waitFor()
check((await stepText()) === "Steg 3 av 3", "\"Hoppa över så länge\" går vidare till steg 3")
await p.reload()
await p.locator("[data-testid=pt-onboarding-package]").waitFor()
ok("appen stängd mitt i flödet: återupptas på steg 3")
check(await p.locator("[data-testid=save-first-package]").isDisabled(), "inget paket än: knappen väntar")
await p.click("[data-testid=first-wellness-template]")
check((await p.locator("#first-title").inputValue()) === "Friskvårdsupplägg 3 månader – Personlig träning & skräddarsytt kostschema", "1-klicksgenvägen fyller i friskvårdspaketet")
check((await p.locator("#first-price").inputValue()).replace(/\s/g, "") === "3495", "pris 3 495 kr")
check((await p.locator("[data-testid=first-price-chips] button").allInnerTexts()).map((x) => x.replace(/\s/g, "")).join(",") === "1995kr,2995kr,3995kr,4995kr", "snabbval för friskvårdstak")
check(words(await p.locator("text=Ligg strax under arbetsgivarens bidragstak").innerText()) < 15, "en kort hjälprad under chipsen")
const calc = (await p.locator("[data-testid=first-calc]").innerText()).replace(/\s+/g, " ")
check(/Du får 3 495 kr netto/.test(calc) && /Klienten betalar 3 845 kr/.test(calc), `kompakt kalkyl (${calc})`)
await p.click("[data-testid=first-price-chips] button:has-text('3 995')")
check(/3 595 kr/.test((await p.locator("[data-testid=first-calc-tip]").innerText()).replace(/\s+/g, " ")), "prisförslag när klientens kostnad passerar tusentalet")
await p.click("[data-testid=first-wellness-template]")
await settled()
await p.screenshot({ path: `${out}/v76-steg3.png` })
await p.click("[data-testid=save-first-package]")
await p.waitForURL(/\/pt(\?|$)/)
await p.locator("text=Välkommen till Coavira").waitFor()
ok("\"Spara paket & gå till dashboard\" öppnar dashboarden")
const svc = await p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data.services.find((s) => s.trainerId === "t1" && s.isWellnessPackage))
check(svc && svc.priceSek === 3495 && svc.kind === "full", "friskvårdspaketet sparas (is_wellness_package)")
const state = await p.evaluate(() => JSON.parse(localStorage["coavira:demo:pt-onboarding:v1"]))
check(state.completed === true, "introt markeras som klart")

// ------------------------------------------------- dashboarden: statusraden ---
const row = p.locator("[data-testid=pt-status-row]")
await row.waitFor()
check((await row.getAttribute("data-status")) === "statusStripe" && /Slutför din Stripe-koppling/.test(await row.innerText()), "överhoppat Stripe-steg: en kompakt statusrad högst upp")
check((await p.locator("aside >> text=Publicera den").count()) === 0, "inga långa onboardingtexter i menyn")
await settled()
await p.screenshot({ path: `${out}/v76-dashboard.png` })
await p.goto(base + "/pt/onboarding")
await p.waitForURL(/\/pt(\?|$)/)
ok("ett klart intro skickar vidare till dashboarden")

// "Skapa paket senare" avslutar också introt.
await p.evaluate(() => localStorage.setItem("coavira:demo:pt-onboarding:v1", JSON.stringify({ step: 3, completed: false, payouts: true })))
await p.goto(base + "/pt/onboarding")
await p.locator("[data-testid=pt-onboarding-package]").waitFor()
await p.click("[data-testid=package-later]")
await p.waitForURL(/\/pt(\?|$)/)
check((await p.evaluate(() => JSON.parse(localStorage["coavira:demo:pt-onboarding:v1"]).completed)) === true, "\"Skapa paket senare\" avslutar introt")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
