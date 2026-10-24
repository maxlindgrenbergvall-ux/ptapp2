// E2E för v20 (lansering) i demoläge: "Radera mitt konto" i Inställningar och
// Profilinställningar (klient och PT), obligatorisk bockruta vid registreringen,
// länkar till coavira.fit/privacy och /terms, 404-sidan, och att digitala köp
// (Coavira Plus, PT Boost) inte erbjuds i iOS-appen.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v20-lansering.test.mjs [skärmdumpsmapp]
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
const PRIVACY = "https://coavira.fit/privacy"
const TERMS = "https://coavira.fit/terms"
const CONSENT = "Jag godkänner användarvillkoren och behandlingen av mina hälsouppgifter för träningsuppföljning i enlighet med Integritetspolicyn."

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|404/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))

// ------------------------------------------------- 1. Registreringen ---
await p.goto(base + "/registrera")
const consent = p.locator("label[for=signup-consent]")
await consent.waitFor()
check((await consent.innerText()).replace(/\s+/g, " ").trim() === CONSENT, "bockrutan har den exakta texten")
check((await consent.locator(`a[href='${TERMS}']`).count()) === 1 && (await consent.locator(`a[href='${PRIVACY}']`).count()) === 1, "bockrutan länkar till villkoren och integritetspolicyn")
check(await p.locator("button:has-text('Fortsätt med Apple')").isDisabled(), "Apple är låst tills villkoren godkänts")
check(await p.locator("button:has-text('Fortsätt med Google')").isDisabled(), "Google är låst tills villkoren godkänts")
await p.fill("#email", "ny@test.se")
await p.fill("#phone", "0701234567")
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForSelector("text=Du behöver godkänna användarvillkoren")
ok("registrering utan bockrutan stoppas")
await p.click("#signup-consent")
check(await p.locator("button:has-text('Fortsätt med Apple')").isEnabled(), "Apple/Google kan användas efter godkännandet")
await p.screenshot({ path: `${out}/v20-registrera.png`, fullPage: true })

await p.goto(base + "/valkommen")
await p.waitForSelector("label[for=consent]")
check((await p.locator("label[for=consent]").innerText()).replace(/\s+/g, " ").trim() === CONSENT, "välkomststeget (alla inloggningssätt) har samma obligatoriska bockruta")
await p.click("button[type=submit]")
await p.waitForSelector("text=Du behöver godkänna användarvillkoren")
ok("välkomststeget kräver bockrutan")

await p.goto(base + "/kom-igang")
check((await p.locator(`a[href='${PRIVACY}']`).count()) >= 1 && (await p.locator(`a[href='${TERMS}']`).count()) >= 1, "startsidan för inloggning länkar till integritetspolicy och villkor")

// /privacy och /terms visar policyn och villkoren.
const priv = await fetch(base + "/privacy", { redirect: "manual" })
check([301, 307, 308].includes(priv.status) && priv.headers.get("location")?.endsWith("/integritet"), `/privacy → /integritet (${priv.status})`)
const terms = await fetch(base + "/terms", { redirect: "manual" })
check([301, 307, 308].includes(terms.status) && terms.headers.get("location")?.endsWith("/villkor"), `/terms → /villkor (${terms.status})`)
await p.goto(base + "/privacy")
check(new URL(p.url()).pathname === "/integritet" && (await p.locator("h1").first().innerText()).length > 0, "integritetspolicyn visas")

// 404 i stället för en blank sida.
const nf = await p.goto(base + "/finns-inte-alls")
check(nf.status() === 404 && (await p.locator("h1:has-text('Sidan finns inte')").isVisible()), "okänd adress ger en tydlig 404-sida")

// ----------------------------------------------- 2. Inställningar (klient) ---
await p.goto(base + "/klient/installningar")
const legal = p.locator("[data-testid=legal-links]")
await legal.waitFor()
check((await legal.locator(`a[href='${PRIVACY}']`).count()) === 1 && (await legal.locator(`a[href='${TERMS}']`).count()) === 1, "Inställningar länkar till integritetspolicy och villkor")
check(await p.locator("[data-testid=delete-account-card] button:has-text('Radera mitt konto')").isVisible(), "Inställningar: Radera mitt konto (klient)")
await p.goto(base + "/klient/profil")
check(await p.locator("[data-testid=delete-account-card] button:has-text('Radera mitt konto')").first().isVisible(), "Profilinställningar: Radera mitt konto (klient)")
await p.goto(base + "/klient/sekretess")
check(await p.locator("[data-testid=delete-account-card]").isVisible(), "Min data och sekretess: Radera mitt konto")

await p.goto(base + "/pt/installningar")
await p.waitForSelector("[data-testid=legal-links]")
check(await p.locator("[data-testid=delete-account-card] button:has-text('Radera mitt konto')").isVisible(), "Inställningar: Radera mitt konto (PT)")
await p.goto(base + "/pt/profil")
await p.waitForSelector("[data-testid=delete-account-card]")
ok("Profilinställningar: Radera mitt konto (PT)")

// Radera (demo): bekräftelse krävs, sedan kontot-raderat-sidan och färsk demodata.
await p.goto(base + "/klient/installningar")
await p.click("[data-testid=delete-account-card] button:has-text('Radera mitt konto')")
const dlg = p.locator("[data-testid=delete-account-dialog]")
await dlg.waitFor()
const submit = dlg.locator("button[type=submit]")
check(await submit.isDisabled(), "radering kräver att man skriver RADERA")
await p.fill("#confirm-delete", "radera")
check(await submit.isEnabled(), "bekräftelsen godtar små bokstäver")
await p.screenshot({ path: `${out}/v20-radera.png` })
await submit.click()
await p.waitForURL("**/konto-raderat")
await p.waitForSelector("text=Ditt konto är raderat")
check(!(await p.evaluate(() => localStorage["coavira:demo:v5"])), "demodatan är borttagen")

// ------------------------------------------------- 3. iOS-appen ---
// Simulerar Capacitor på iOS (webkit-bryggan) och appens user agent.
const ios = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CoaviraApp",
})
await ios.addInitScript(() => {
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
})
const q = await ios.newPage()
q.on("pageerror", (e) => errors.push(`ios ${q.url()} pageerror: ${e.message}`))
await q.goto(base + "/klient/plus")
await q.waitForSelector("[data-testid=plus-page-status]")
check((await q.locator("button:has-text('Skaffa Coavira Plus'), button:has-text('Förläng Coavira Plus')").count()) === 0, "iOS-appen: Coavira Plus säljs inte med Stripe")
check(await q.locator("text=Bjud in en vän & få 1 månad gratis").first().isVisible(), "iOS-appen: Plus via inbjudan finns kvar")
await q.goto(base + "/pt/profil")
const boost = q.locator("[data-testid=boost-card]")
await boost.waitFor()
check((await boost.locator("button:has-text('Boosta'), button:has-text('Förläng')").count()) === 0, "iOS-appen: PT Boost säljs inte med Stripe")
await q.goto(base + "/klient/hitta/t1")
await q.waitForSelector('button[aria-label="Välj Enstaka pass"]')
ok("iOS-appen: PT-pass (fysisk tjänst) kan fortfarande köpas")
const r = await fetch(base + "/api/stripe/plus-checkout", { method: "POST", headers: { "user-agent": "Mozilla/5.0 (iPhone) CoaviraApp" } })
check(r.status === 403, "servern nekar Plus-köp från iOS-appen")
const rb = await fetch(base + "/api/stripe/boost-checkout", { method: "POST", headers: { "user-agent": "Mozilla/5.0 (iPhone) CoaviraApp" } })
check(rb.status === 403, "servern nekar Boost-köp från iOS-appen")
await ios.close()

// Android-appen och webben: köpen finns kvar.
const web = await browser.newPage()
await web.goto(base + "/klient/plus")
await web.waitForSelector("button:has-text('Skaffa Coavira Plus'), button:has-text('Förläng Coavira Plus')")
ok("webben: Coavira Plus kan köpas")
await web.close()

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
