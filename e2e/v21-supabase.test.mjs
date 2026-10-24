// E2E för v21 i Supabase-läge: köp i iPhone-appen via App Store/RevenueCat.
//  - RevenueCats webhook (lösenord, TEST, anonyma köp, Plus, Boost, återbetalning)
//  - /api/revenuecat/sync direkt efter ett köp (bara det egna kontot)
//  - köpvyn i iOS-appen (pris, automatisk förnyelse, villkor, Återställ köp) och
//    Stripe på webben
// Kräver mock-supabase, mock-stripe och mock-revenuecat (:54600) och servern startad med
//   REVENUECAT_SECRET_KEY=sk_test_rc REVENUECAT_WEBHOOK_SECRET=whsec_rc REVENUECAT_API_BASE=http://localhost:54600
// och bygget med NEXT_PUBLIC_REVENUECAT_IOS_KEY=appl_test.
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const rc = "http://localhost:54600"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))
const getLog = async () => (await fetch(`${mock}/__log`)).json()
await fetch(`${mock}/__reset`)
await fetch(`${mock}/__reset_v21`)
await fetch(`${rc}/__reset`)

const T1 = "11111111-0000-4000-8000-000000000001"
const C1 = "22222222-0000-4000-8000-000000000001"
const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString()
const hook = (event, auth = "whsec_rc") =>
  fetch(`${base}/api/revenuecat/webhook`, { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ api_version: "1.0", event }) })
const setSubscriber = (id, sub) => fetch(`${rc}/__set/${id}`, { method: "POST", body: JSON.stringify(sub) })
const calls = async (fn) => (await getLog()).filter((e) => e.table === fn)

// ------------------------------------------------------------- webhook ---
check((await hook({ type: "TEST" }, "fel")).status === 401, "webhook med fel lösenord avvisas")
check((await hook({ type: "TEST" })).status === 200, "RevenueCats testhändelse godkänns")
check((await hook({ type: "TEST" }, "Bearer whsec_rc")).status === 200, "lösenordet fungerar även som Bearer")

const anon = await hook({ id: "e0", type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc", product_id: "coavira_plus_monthly" })
check(anon.status === 200 && (await anon.json()).ignored === "anonym", "anonyma köp (före inloggning) ignoreras")

// Sara köper Plus (månad) i appen.
await setSubscriber(C1, {
  subscriptions: { coavira_plus_monthly: { expires_date: inDays(30), unsubscribe_detected_at: null, billing_issues_detected_at: null, store: "app_store" } },
  non_subscriptions: {},
})
let r = await hook({ id: "e1", type: "INITIAL_PURCHASE", app_user_id: C1, product_id: "coavira_plus_monthly", environment: "SANDBOX" })
check(r.status === 200, "köp av Plus tas emot (även sandbox – TestFlight och Apples granskning)")
let plus = (await calls("apply_store_plus")).at(-1)?.body
check(plus?.p_user === C1 && plus.p_product === "coavira_plus_monthly" && plus.p_renews === true && Date.parse(plus.p_until) > Date.now() + 29 * 86_400_000,
  "Plus sätts från RevenueCat: månad, förnyas, 30 dagar")
const rcLog = await (await fetch(`${rc}/__log`)).json()
check(rcLog.some((e) => e.id === C1), "servern hämtar kundens köp från RevenueCat med den hemliga nyckeln")

// Uppsägning: gäller periodens ut men förnyas inte.
await setSubscriber(C1, { subscriptions: { coavira_plus_monthly: { expires_date: inDays(30), unsubscribe_detected_at: inDays(0), billing_issues_detected_at: null } } })
await hook({ id: "e2", type: "CANCELLATION", app_user_id: C1, product_id: "coavira_plus_monthly" })
plus = (await calls("apply_store_plus")).at(-1)?.body
check(plus?.p_renews === false && plus.p_until !== null, "uppsagd prenumeration gäller perioden ut men förnyas inte")

// Byte till år.
await setSubscriber(C1, {
  subscriptions: {
    coavira_plus_monthly: { expires_date: inDays(-1), unsubscribe_detected_at: inDays(-2) },
    coavira_plus_yearly: { expires_date: inDays(365), unsubscribe_detected_at: null },
  },
})
await hook({ id: "e3", type: "PRODUCT_CHANGE", app_user_id: C1, product_id: "coavira_plus_yearly" })
plus = (await calls("apply_store_plus")).at(-1)?.body
check(plus?.p_product === "coavira_plus_yearly" && Date.parse(plus.p_until) > Date.now() + 360 * 86_400_000, "byte till årsprenumeration")

// Återbetalning hos Apple: Plus från butiken tas bort.
await setSubscriber(C1, { subscriptions: { coavira_plus_yearly: { expires_date: inDays(365), refunded_at: inDays(0) } } })
await hook({ id: "e4", type: "CANCELLATION", app_user_id: C1, product_id: "coavira_plus_yearly" })
plus = (await calls("apply_store_plus")).at(-1)?.body
check(plus?.p_until === null && plus.p_renews === false, "återbetald prenumeration tas bort")

// Elin köper PT Boost (engångsköp) – och samma köp synkas igen.
await setSubscriber(T1, { non_subscriptions: { coavira_pt_boost_7d: [{ id: "rc-1", store_transaction_id: "2000000111", store: "app_store" }] } })
await hook({ id: "e5", type: "NON_RENEWING_PURCHASE", app_user_id: T1, product_id: "coavira_pt_boost_7d", transaction_id: "2000000111" })
const boost = (await calls("apply_store_boost")).at(-1)?.body
check(boost?.p_user === T1 && boost.p_transaction === "2000000111" && boost.p_days === 7 && boost.p_product === "coavira_pt_boost_7d",
  "Boost köpt i appen: 7 dagar, med butikens transaktions-id (räknas en gång i databasen)")
await hook({ id: "e6", type: "CANCELLATION", app_user_id: T1, product_id: "coavira_pt_boost_7d", transaction_id: "2000000111" })
check((await calls("revoke_store_boost")).at(-1)?.body.p_transaction === "2000000111", "återbetald boost dras av")

// ---------------------------------------------------------------- sync ---
check((await fetch(`${base}/api/revenuecat/sync`, { method: "POST" })).status === 401, "synk kräver inloggning")
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/logga-in`)
  await p.fill("#email", "sara@test.se")
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(/\/klient$/)
  await setSubscriber(C1, { subscriptions: { coavira_plus_monthly: { expires_date: inDays(30), unsubscribe_detected_at: null } } })
  await fetch(`${mock}/__reset`)
  const s = await p.request.post(`${base}/api/revenuecat/sync`)
  check(s.ok() && (await s.json()).renews === true, "appen synkar direkt efter köpet (utan att vänta på webhooken)")
  const synced = (await calls("apply_store_plus")).at(-1)?.body
  check(synced?.p_user === C1, "synken gäller bara det inloggade kontot")

  // Webben: Plus köps med Stripe, ingen App Store-vy.
  await p.goto(`${base}/klient/plus`)
  await p.waitForSelector("button:has-text('Skaffa Coavira Plus'), button:has-text('Förläng Coavira Plus')")
  check((await p.locator("[data-testid=store-plus-offer]").count()) === 0, "webben: Stripe, inte App Store")
  await ctx.close()
}

// ----------------------------------------------------- iPhone-appen ---
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CoaviraApp",
  })
  // Simulerad Capacitor-brygga på iOS (pluginen svarar inte – priserna visas från reserven).
  await ctx.addInitScript(() => {
    window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`ios pageerror: ${e.message}`))
  await p.goto(`${base}/logga-in`)
  await p.fill("#email", "sara@test.se")
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(/\/klient$/)
  await p.goto(`${base}/klient/plus`)
  const offer = p.locator("[data-testid=store-plus-offer]")
  await offer.waitFor()
  const text = (await offer.innerText()).replace(/\s+/g, " ")
  check(/49 kr \/ månad/.test(text) && /499 kr \/ år/.test(text), "iPhone: Plus 49 kr/mån och 499 kr/år via App Store")
  check(/förnyas automatiskt/.test(text) && /24 timmar/.test(text), "iPhone: tydligt att prenumerationen förnyas automatiskt och hur man säger upp")
  check((await offer.locator("a[href='https://coavira.fit/terms']").count()) === 1 && (await offer.locator("a[href='https://coavira.fit/privacy']").count()) === 1,
    "iPhone: länkar till villkor (EULA) och integritetspolicy i köpvyn")
  check(await offer.locator("button:has-text('Återställ köp')").isVisible(), "iPhone: Återställ köp")
  check((await p.locator("button:has-text('Skaffa Coavira Plus')").count()) === 0, "iPhone: ingen Stripe-knapp för Plus")
  await p.screenshot({ path: `${process.argv[2] ?? "e2e/screenshots"}/v21-ios-plus.png`, fullPage: true })
  const blocked = await p.request.post(`${base}/api/stripe/plus-checkout`)
  check(blocked.status() === 403, "iPhone: servern nekar fortfarande Plus via Stripe")
  await ctx.close()
}

await fetch(`${mock}/__reset_v21`) // städa: andra test förväntar sig Elin utan boost
check(errors.filter((e) => !/plugin is not implemented/.test(e)).length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
