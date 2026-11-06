// E2E för v32 i Supabase-läge: Strava-kopplingen (OAuth med state-cookie,
// tokenutbyte på servern, första synken), kalorier (Stravas egna, kilojoule,
// uppskattade), "Synka" och "Koppla från" – mot e2e/mock-supabase.mjs och
// e2e/mock-strava.mjs (STRAVA_API_BASE=http://localhost:54700).
//   (start som e2e/v16-supabase.test.mjs + node e2e/mock-strava.mjs &
//    och STRAVA_CLIENT_ID=123 STRAVA_CLIENT_SECRET=sek STRAVA_API_BASE=http://localhost:54700)
//   BASE_URL=http://localhost:3000 node e2e/v32-supabase.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const strava = "http://localhost:54700"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))
const svc = async () => (await fetch(`${mock}/__svc`)).json()
const stravaLog = async () => (await fetch(`${strava}/__log`)).json()
await fetch(`${mock}/__reset`)
await fetch(`${mock}/__reset_v32`)
await fetch(`${strava}/__reset`)
const C1 = "22222222-0000-4000-8000-000000000001"

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("dialog", (d) => void d.accept())
await p.goto(`${base}/logga-in`)
await p.fill("#email", "sara@test.se")
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForURL(/\/klient$/)
await p.waitForSelector("[data-testid=activity-card]")
check((await p.locator("[data-testid=activity-kcal]").innerText()).trim() === "0kcal" || (await p.locator("[data-testid=activity-kcal]").innerText()).startsWith("0"), "innan kopplingen: 0 kcal")

// CSRF: en callback utan rätt state avvisas.
const forged = await p.request.get(`${base}/api/strava/callback?code=strava-code-1&state=fel&scope=read,activity:read_all`, { maxRedirects: 0 })
check(forged.status() === 307 && /strava=fel/.test(forged.headers().location ?? ""), "callback med fel state avvisas (CSRF)")

// ----------------------------------------------------------- koppla ---
await p.click("[data-testid=strava-connect]")
await p.waitForURL(/\/klient\?strava=ansluten|\/klient$/)
await p.waitForSelector("text=Strava är kopplat")
ok("Strava-inloggningen → tillbaka till startsidan med besked")
let log = await stravaLog()
const auth = log.find((e) => e.path === "/oauth/authorize")
check(auth?.query.scope === "read,activity:read_all" && auth.query.redirect_uri === `${base}/api/strava/callback` && auth.query.state?.length > 20, "OAuth: rätt scope, redirect och state")
const token = log.find((e) => e.path === "/oauth/token")
check(token?.body.grant_type === "authorization_code" && token.body.client_secret === "(satt)" && token.body.client_id === "123", "koden byts mot tokens på servern (client secret lämnar aldrig servern)")
let store = await svc()
check(store.wearable_connections.some((c) => c.user_id === C1 && c.provider === "strava" && c.external_user_id === "424242"), "anslutningen sparas (Stravas atlet-id)")
check(store.wearable_tokens.some((t) => t.user_id === C1 && t.provider === "strava" && t.refresh_token === "rt-1"), "tokens sparas bara på servern")
const acts = store.activity_logs.filter((a) => a.client_id === C1)
check(acts.length === 3, `första synken hämtar aktiviteterna (${acts.length})`)
const run = acts.find((a) => a.external_id === "9001")
const ride = acts.find((a) => a.external_id === "9002")
const walk = acts.find((a) => a.external_id === "9003")
check(run?.kcal === 412 && !run.kcal_estimated, "löpning: Stravas egna kalorier (detaljanrop) 412 kcal")
check(ride?.kcal === 250 && !ride.kcal_estimated, "cykel med effektmätare: kilojoule ≈ kcal (250)")
check(walk?.kcal > 0 && walk.kcal_estimated === true, `promenad utan kalorier: uppskattad (${walk?.kcal} kcal, MET × vikt × tid)`)
check(log.filter((e) => e.path === "/api/v3/activities/:id").length <= 10, "detaljanrop begränsas (Stravas gränser)")

// Kalorimätaren visar dagens löpning.
await p.waitForFunction(() => document.querySelector("[data-testid=activity-kcal]")?.textContent?.includes("412"))
check((await p.locator("[data-testid=activity-list]").innerText()).includes("Morgonlöpning"), "dagens Strava-pass i kalorimätaren")
await p.goto(base + "/klient/kost")
await p.waitForSelector("[data-testid=energy-burned]")
check((await p.locator("[data-testid=energy-burned]").innerText()).includes("412"), "kostdagboken visar förbränt (412 kcal)")
await p.goto(base + "/klient")

// ------------------------------------------------------------- synka ---
await fetch(`${strava}/__reset`)
await p.click("[data-testid=strava-sync]")
await p.waitForSelector("text=Strava är synkat")
log = await stravaLog()
check(log.some((e) => e.path === "/api/v3/athlete/activities" && Number(e.query.after) > 0), "Synka hämtar senaste 30 dagarna")
check(!log.some((e) => e.path === "/api/v3/activities/:id" && e.id === "9001"), "redan hämtade kalorier återanvänds (inga nya detaljanrop)")
store = await svc()
check(store.activity_logs.filter((a) => a.client_id === C1).length === 3, "synken skapar inga dubbletter")

// ------------------------------------------------------- koppla från ---
await p.click('button[aria-label="Koppla från Strava"]')
await p.click('[role=alertdialog] button:has-text("Koppla från"), [role=dialog] button:has-text("Koppla från")')
await p.waitForSelector("[data-testid=strava-connect]")
log = await stravaLog()
check(log.some((e) => e.path === "/oauth/deauthorize" && e.auth), "åtkomsten återkallas hos Strava")
store = await svc()
check(!store.wearable_connections.some((c) => c.user_id === C1 && c.provider === "strava"), "anslutningen raderas")
check(!store.activity_logs.some((a) => a.client_id === C1 && a.source === "strava"), "passen från Strava raderas")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
