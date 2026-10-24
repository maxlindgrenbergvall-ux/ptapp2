// E2E för v18 i demoläge: Coavira Plus-låsen (sömn, historik > 30 dagar,
// 1RM-grafer, CSV-export), uppgraderingsrutan (frostat glas, texten, två
// knappar), inbjudningsvyn för klient och PT, inlösen av kod, köp av Plus
// (simulerat) och /ref/KOD → registreringen med inbjudningsbanner.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v18-plus-referral.test.mjs [skärmdumpsmapp]
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
const UPGRADE = "Lås upp full historik, sömntracking och djupgående grafer med Coavira Plus."

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
/** Ändra demodatan och ladda om. */
const patch = async (fn) => {
  await p.evaluate((src) => {
    const s = JSON.parse(localStorage["coavira:demo:v5"])
    new Function("d", src)(s.data)
    localStorage["coavira:demo:v5"] = JSON.stringify(s)
  }, fn)
  await p.reload()
}

// --------------------------------------------- 1. Med Plus: inget är låst ---
await p.goto(base + "/klient")
await p.waitForSelector("text=Sömn")
check((await p.locator("[data-testid=plus-lock]").count()) === 0, "Sara har Plus i demon – inga lås på startsidan")
const d0 = await demo()
check(d0.accounts.c1?.referralCode === "SARA7KQ2", "Sara har inbjudningskoden SARA7KQ2")

// ------------------------------------------------- 2. Utan Plus: låsen ---
await patch("d.accounts.c1.plusUntil = undefined; d.accounts.c1.plusLifetime = false")
await p.waitForSelector("[data-testid=plus-lock][data-feature=sleep]")
ok("sömntrackingen är låst utan Plus")
// Gratis: dagens kost och passen är aldrig låsta.
check((await p.locator("[data-testid=plus-lock]").count()) === 1, "bara sömnen är låst på startsidan (kost och pass är gratis)")
await p.screenshot({ path: `${out}/v18-las-somn.png` })

await p.click("[data-testid=plus-lock][data-feature=sleep] > button")
const dialog = p.locator("[data-testid=upgrade-dialog]")
await dialog.waitFor()
check((await dialog.innerText()).includes(UPGRADE), "uppgraderingsrutan visar rätt text")
check(await dialog.locator("text=Bjud in en vän & få 1 månad gratis").isVisible(), "knappen Bjud in en vän & få 1 månad gratis")
check(await dialog.locator("button:has-text('Skaffa Coavira Plus')").isVisible(), "knappen Skaffa Coavira Plus")
const overlayBlur = await p.evaluate(() => [...document.querySelectorAll("[data-slot=dialog-overlay]")].some((el) => /blur/.test(getComputedStyle(el).backdropFilter)))
check(overlayBlur, "bakgrunden är frostat glas (backdrop-filter: blur)")
await p.screenshot({ path: `${out}/v18-uppgradera.png` })
await dialog.locator("text=Bjud in en vän & få 1 månad gratis").click()
await p.waitForURL("**/klient/inbjudningar")
ok("Bjud in-knappen leder till inbjudningsvyn")

// Framsteg: 1RM-grafen och historik äldre än 30 dagar.
await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=plus-lock][data-feature=charts]")
ok("1RM-grafen är låst")
const old = await p.locator("[data-testid=plus-lock][data-feature=history]").count()
check(old >= 1, "pass äldre än 30 dagar är låsta")
await p.screenshot({ path: `${out}/v18-las-framsteg.png`, fullPage: true })

// Export: CSV är låst, GDPR-exporten av all data är alltid gratis.
await p.goto(base + "/klient/sekretess")
await p.waitForSelector("[data-testid=plus-lock][data-feature=export]")
ok("CSV-exporten är låst")
check(await p.locator("button:has-text('Ladda ner (JSON)')").first().isEnabled().catch(() => false), "GDPR-exporten (all data) är fortfarande gratis")

// --------------------------------------------- 3. Inbjudningsvyn (klient) ---
await p.goto(base + "/klient/inbjudningar")
await p.waitForSelector("[data-testid=referral-dashboard]")
check((await p.locator("[data-testid=referral-code]").innerText()).trim() === "SARA7KQ2", "koden visas")
check((await p.locator("[data-testid=referral-link]").innerText()).trim() === "https://coavira.fit/ref/SARA7KQ2", "länken coavira.fit/ref/KOD visas")
const stats = await p.locator("[data-testid=referral-stats]").innerText()
check(/1\s*Inbjudna/.test(stats) && /1\s*Klara/.test(stats) && /1\s*Plusmånader/.test(stats), `statistiken stämmer (${stats.replace(/\s+/g, " ")})`)
check(!(await p.locator("[data-testid=referral-list]").innerText()).includes("Mira"), "inbjudna visas utan namn")
await p.click("button:has-text('Kopiera länk')")
check((await p.evaluate(() => navigator.clipboard.readText())) === "https://coavira.fit/ref/SARA7KQ2", "länken kopieras")
await p.screenshot({ path: `${out}/v18-inbjudningar-klient.png`, fullPage: true })

// Nytt konto: kan lösa in en väns kod.
await patch("d.accounts.c1.canRedeem = true")
await p.waitForSelector("[data-testid=redeem-card]")
await p.fill("[aria-label=Inbjudningskod]", "sara7kq2")
await p.click("button:has-text('Lös in')")
await p.waitForSelector("text=Du kan inte använda din egen kod.")
ok("den egna koden avvisas")
await p.fill("[aria-label=Inbjudningskod]", "pt7ekn4s")
await p.click("button:has-text('Lös in')")
await p.waitForSelector("text=Du har fått 1 månad Coavira Plus")
await p.waitForSelector("[data-testid=referral-received]")
const d1 = await demo()
check(d1.accounts.c1.plusUntil && Date.parse(d1.accounts.c1.plusUntil) > Date.now() + 29 * 86_400_000, "inlöst kod ger 30 dagar Plus")
check((await p.locator("[data-testid=redeem-card]").count()) === 0, "koden kan bara lösas in en gång")
await p.goto(base + "/klient")
await p.waitForSelector("text=Sömn")
check((await p.locator("[data-testid=plus-lock]").count()) === 0, "låsen försvinner med Plus")

// ------------------------------------------------- 4. Köp Plus (demo) ---
await patch("d.accounts.c1.plusUntil = undefined")
await p.goto(base + "/klient/plus")
await p.waitForSelector("text=Gratisversionen")
check((await p.locator("[data-testid=plus-page-status]").innerText()).includes(UPGRADE), "Plus-sidan visar uppgraderingstexten")
await p.click("button:has-text('Skaffa Coavira Plus')")
await p.waitForSelector("text=Du har Coavira Plus")
ok("köp i demoläget aktiverar Plus")
await p.goto(base + "/klient/plus?plus=avbrutet")
await p.waitForSelector("text=Köpet avbröts")
ok("avbrutet köp visar besked")

// Menyn
await p.click("[aria-label='Coavira-menyn']:visible")
check(await p.locator("role=menuitem >> text=Bjud in & tjäna").isVisible(), "menyn har Bjud in & tjäna")
check(await p.locator("role=menuitem >> text=Coavira Plus").isVisible(), "menyn har Coavira Plus")
await p.keyboard.press("Escape")

// --------------------------------------------------- 5. PT-portalen ---
await p.goto(base + "/pt/inbjudningar")
await p.waitForSelector("[data-testid=referral-dashboard]")
check((await p.locator("[data-testid=referral-code]").innerText()).trim() === "PT7EKN4S", "PT:n har en egen kod")
check(await p.locator("[data-testid=boost-reward-info]").isVisible(), "PT-vyn förklarar Boost-belöningen")
check((await p.locator("[data-testid=referral-link]").count()) === 0, "PT:er delar koden (ansökan sker via e-post)")
check((await p.locator("a[href^='mailto:?subject=']").getAttribute("href")).includes("PT7EKN4S"), "e-postinbjudan innehåller koden")
check((await p.locator("[data-testid=plus-lock]").count()) === 0, "PT:er har inga Plus-lås")
await p.screenshot({ path: `${out}/v18-inbjudningar-pt.png`, fullPage: true })
await p.goto(base + "/pt")
await p.click("[aria-label='Coavira-menyn']:visible")
check(await p.locator("role=menuitem >> text=Bjud in & tjäna").isVisible(), "PT-menyn har Bjud in & tjäna")
check((await p.locator("role=menuitem >> text=Coavira Plus").count()) === 0, "PT-menyn har inte Coavira Plus")
await p.keyboard.press("Escape")

// ---------------------------------------------- 6. Inbjudningslänken ---
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } })
const q = await fresh.newPage()
q.on("pageerror", (e) => errors.push(`${q.url()} pageerror: ${e.message}`))
await q.goto(base + "/ref/sara7kq2")
await q.waitForURL("**/kom-igang?ref=SARA7KQ2")
await q.waitForSelector("[data-testid=referral-banner]")
check((await q.locator("[data-testid=referral-banner]").innerText()).includes("SARA7KQ2"), "/ref/KOD leder till registreringen med inbjudningsbanner")
check((await q.evaluate(() => JSON.parse(localStorage["coavira:ref"]).code)) === "SARA7KQ2", "koden sparas tills kontot skapats")
await q.goto(base + "/registrera")
await q.waitForSelector("[data-testid=referral-banner]")
ok("bannern visas även på Registrera (sparad kod)")
await q.screenshot({ path: `${out}/v18-ref-registrera.png` })
await q.goto(base + "/ref/ogiltig!")
await q.waitForURL((u) => u.pathname === "/kom-igang" && !u.search)
ok("ogiltig kod följer inte med")
await fresh.close()

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
