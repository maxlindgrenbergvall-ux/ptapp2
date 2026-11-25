// E2E (Supabase-läge) för v80: "Välkommen tillbaka" – enheten minns kontot.
//  - inloggning sparar förnamn, e-post och inloggningssätt (ingen token) i en cookie
//  - Kom igång och Logga in visar då inloggningsrutan direkt, med e-posten ifylld
//  - Apple/Google-konton får bara sin egen knapp; "Byt konto" glömmer kontot
// Kräver mock-supabase (se v16-supabase.test.mjs).
//   BASE_URL=http://localhost:3000 node e2e/v80-valkommen-tillbaka.test.mjs [skärmbildsmapp]
import fs from "node:fs"
import { chromium } from "playwright"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))
await fetch(`${mock}/__reset`)

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "sv-SE", colorScheme: "dark", deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(e.message))
const settled = () => p.waitForSelector("[data-testid=boot-splash]", { state: "detached", timeout: 8000 }).catch(() => {}).then(() => p.waitForTimeout(600))
const known = async () => (await ctx.cookies()).find((c) => c.name === "coavira_known")
/** Utloggad men med enhetens minne kvar (som efter en utloggning eller en utgången session). */
const signOutKeepMemory = async () => {
  const keep = await known()
  await ctx.clearCookies()
  if (keep) await ctx.addCookies([keep])
}

// ------------------------------------------------------- första gången ---
await p.goto(base + "/kom-igang")
await p.locator("[data-testid=start-slideshow]").waitFor()
check((await p.locator("[data-testid=welcome-back]").count()) === 0, "ny enhet: vanliga startsidan med bildspelet")

// --------------------------------------------- inloggning sparar minnet ---
await p.goto(base + "/logga-in")
await p.fill("#email", "sara@test.se")
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForURL(/\/klient/)
await p.waitForFunction(() => document.cookie.includes("coavira_known"), null, { timeout: 10000 }).catch(() => {})
const c = await known()
const saved = c ? JSON.parse(decodeURIComponent(c.value)) : null
check(saved?.email === "sara@test.se" && saved.name === "Sara" && saved.method === "password" && saved.role === "client", "enheten minns förnamn, e-post och inloggningssätt", saved)
check(c && !/token|eyJ|hemligt/i.test(decodeURIComponent(c.value)), "inga tokens eller lösenord i minnet")
check(c && c.expires > Date.now() / 1000 + 300 * 24 * 3600, "minnet ligger kvar länge (400 dagar)")

// ------------------------------------------------- välkommen tillbaka ---
await signOutKeepMemory()
await p.goto(base + "/kom-igang")
await p.locator("[data-testid=welcome-back]").waitFor({ state: "attached" })
await settled()
check((await p.locator("h1:visible").innerText()) === "Välkommen tillbaka, Sara", "Kom igång: \"Välkommen tillbaka, Sara\" direkt")
check((await p.inputValue("#email")) === "sara@test.se", "e-posten är ifylld")
check((await p.locator("[data-testid=start-slideshow]").count()) === 0, "inget bildspel – inloggningsrutan direkt")
check((await p.locator("button:has-text('Fortsätt med Apple')").count()) === 0, "e-postkonto: inga Apple/Google-knappar")
await p.screenshot({ path: `${out}/v80-valkommen-tillbaka.png` })
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForURL(/\/klient/)
ok("lösenordet räcker – in i appen")

// Logga in-sidan (t.ex. när sessionen gått ut) visar samma sak.
await signOutKeepMemory()
await p.goto(base + "/logga-in")
await p.locator("[data-testid=welcome-back]").waitFor({ state: "attached" })
check((await p.inputValue("#email")) === "sara@test.se", "Logga in: e-posten är ifylld")

// Google-konto: bara Google-knappen först.
await ctx.addCookies([{ name: "coavira_known", value: encodeURIComponent(JSON.stringify({ name: "Ida", email: "ida@test.se", method: "google", role: "client" })), url: base }])
await p.goto(base + "/kom-igang")
await p.locator("[data-testid=welcome-back]").waitFor({ state: "attached" })
check(
  (await p.locator("button:has-text('Fortsätt med Google')").count()) === 1 && (await p.locator("button:has-text('Fortsätt med Apple')").count()) === 0,
  "Google-konto: bara \"Fortsätt med Google\""
)
await settled()
await p.screenshot({ path: `${out}/v80-valkommen-google.png` })

// Byt konto: minnet glöms och startsidan visas.
await p.click("[data-testid=switch-account]")
await p.locator("[data-testid=start-slideshow]").waitFor()
check(!(await known()), "\"Byt konto\" glömmer kontot")
await p.reload()
await p.locator("[data-testid=start-slideshow]").waitFor()
ok("efter Byt konto: vanliga startsidan även efter omladdning")

// Trasigt värde ignoreras.
await ctx.addCookies([{ name: "coavira_known", value: "inte-json", url: base }])
await p.goto(base + "/kom-igang")
await p.locator("[data-testid=start-slideshow]").waitFor()
ok("ogiltigt minne ignoreras")

check(errors.length === 0, `inga sidfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
