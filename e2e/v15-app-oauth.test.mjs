// E2E: Apple/Google-inloggning i mobilappen (Supabase-läge mot e2e/mock-supabase.mjs).
// Leverantören öppnas i systemets webbläsare (Capacitor Browser), och appen tar
// emot com.coavira.app://auth/callback?code=… och växlar koden på /auth/callback
// i sin egen WebView, där PKCE-nyckeln finns.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npm run build && npm start
//   BASE_URL=http://localhost:3000 node e2e/v15-app-oauth.test.mjs
import { chromium } from "playwright"

import { APP_UA, installNativeFake } from "./native-fake.mjs"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))

// ------------------------------------------------------------- i appen ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: APP_UA })
await ctx.addInitScript(installNativeFake)
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
const leftApp = []
p.on("request", (r) => r.isNavigationRequest() && r.frame() === p.mainFrame() && !r.url().startsWith(base) && leftApp.push(r.url()))

// Appen börjar på landningssidans adress men skickas till inloggningen (proxy.ts).
await p.goto(base + "/")
await p.waitForURL(base + "/kom-igang")
await p.waitForSelector("text=Fortsätt med Google")
await p.waitForFunction(() => window.__native.count("App", "addListener") > 0)
await p.click("text=Fortsätt med Google")
await p.waitForFunction(() => window.__native.count("Browser", "open") === 1)
const opened = new URL(await p.evaluate(() => window.__native.calls.find((c) => c.plugin === "Browser" && c.method === "open").options.url))
check(opened.pathname === "/auth/v1/authorize" && opened.searchParams.get("provider") === "google", "Google öppnas i systemets webbläsare, inte i appen")
check(opened.searchParams.get("redirect_to")?.startsWith("com.coavira.app://auth/callback?next="), `tillbaka till appen via ${opened.searchParams.get("redirect_to")}`)
check(opened.searchParams.get("code_challenge_method")?.toLowerCase() === "s256", "PKCE används")
check(leftApp.length === 0, "appens WebView lämnar inte Coavira")
const verifier = await p.evaluate(() => document.cookie.split("; ").some((c) => /code-verifier=/.test(c)))
check(verifier, "PKCE-nyckeln ligger kvar i appens WebView")

// Leverantören skickar tillbaka användaren till appen.
const callback = p.waitForRequest((r) => r.url().startsWith(`${base}/auth/callback?`))
await p.evaluate(() => window.__native.emit("App", "appUrlOpen", { url: "com.coavira.app://auth/callback?next=%2Fdashboard&code=abc123" }))
const req = await callback
const cb = new URL(req.url())
check(cb.searchParams.get("code") === "abc123" && cb.searchParams.get("next") === "/dashboard", "koden växlas på /auth/callback i appen")
await p.waitForLoadState("networkidle")
const closed = await p.evaluate(() => sessionStorage.getItem("fake:browser-closed"))
check(closed === "1", "inloggningsfönstret stängs när appen tar över")
ok(`efter inloggningen: ${new URL(p.url()).pathname}`)
await ctx.close()

// --------------------------------------------- vanlig webbläsare (webben) ---
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } })
const w = await ctx2.newPage()
await w.route("http://localhost:54321/auth/v1/authorize**", (route) => route.fulfill({ status: 200, body: "leverantör" }))
await w.goto(base + "/kom-igang")
await w.click("text=Fortsätt med Google")
await w.waitForURL(/\/auth\/v1\/authorize/)
const webUrl = new URL(w.url())
check(webUrl.searchParams.get("redirect_to")?.startsWith(`${base}/auth/callback`), "webben loggar in som förut (omdirigering i samma flik)")
await ctx2.close()

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
