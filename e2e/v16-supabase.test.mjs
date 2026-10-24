// E2E för v16 i Supabase-läge mot e2e/mock-supabase.mjs och e2e/mock-stripe.mjs:
// varukorgen sparas i cart_items, PT Boost via Stripe Checkout (199 kr, metadata
// trainer_id + boost_duration_days), bekräftelse efter retur, webhook och återbetalning.
//   node e2e/mock-supabase.mjs & node e2e/mock-stripe.mjs &
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npm run build
//   (start med SUPABASE_SERVICE_ROLE_KEY=service-test STRIPE_SECRET_KEY=sk_test_mock STRIPE_API_BASE=http://localhost:54500 STRIPE_WEBHOOK_SECRET=whsec_test)
//   BASE_URL=http://localhost:3000 node e2e/v16-supabase.test.mjs
import { createHmac } from "node:crypto"
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const stripe = "http://localhost:54500"
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

const T1 = "11111111-0000-4000-8000-000000000001"
const C1 = "22222222-0000-4000-8000-000000000001"
const S_SINGLE = "99999999-0000-4000-8000-000000000001"
const S_FOOD = "99999999-0000-4000-8000-000000000002"
const BOOST = "cccccccc-0000-4000-8000-000000000001"

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/logga-in${email.startsWith("elin") ? "/pt" : ""}`)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(/\/(klient|pt)$/)
  // Vänta tills startsidan laddat klart (inloggningen navigerar själv).
  await p.waitForLoadState("networkidle")
  await p.waitForSelector(email.startsWith("elin") ? "text=Sara Test" : "[data-testid=cart-count]")
  return { ctx, p }
}

// ------------------------------------------------------------ varukorg ---
{
  const { ctx, p } = await login("sara@test.se")
  await p.waitForSelector("[data-testid=cart-count]")
  check((await p.locator("[data-testid=cart-count]").innerText()) === "1", "varukorgen laddas från cart_items")
  await p.goto(`${base}/klient/hitta/${T1}`)
  await p.click('button[aria-label="Lägg Kostcoaching i varukorgen"]')
  await p.waitForFunction(() => document.querySelector("[data-testid=cart-count]")?.textContent === "2")
  await p.waitForTimeout(800)
  let log = await getLog()
  const add = log.find((e) => e.table === "cart_items" && e.method === "POST")
  check(add?.body?.client_id === C1 && add.body.service_id === S_FOOD && add.body.trainer_id === T1, "ny tjänst sparas i cart_items")
  check(/on_conflict=client_id%2Cservice_id|on_conflict=client_id,service_id/.test(add?.query ?? "") && /ignore-duplicates/.test(add?.prefer ?? ""), "samma tjänst två gånger ignoreras (upsert)")

  await p.click('button[aria-label^="Varukorg"]')
  // v17: antal enstaka pass sparas i cart_items.
  await p.locator(`button[aria-label="Öka antal Enstaka pass"]`).click()
  await p.waitForFunction(() => [...document.querySelectorAll("[data-testid=cart-quantity]")].some((e) => e.textContent === "2"))
  await p.waitForTimeout(800)
  log = await getLog()
  const patch = log.find((e) => e.table === "cart_items" && e.method === "PATCH")
  check(patch?.body?.quantity === 2 && patch.query.includes(`service_id=eq.${S_SINGLE}`) && patch.query.includes(`client_id=eq.${C1}`), "antalet sparas i cart_items (bara quantity)")
  check(Object.keys(patch?.body ?? {}).join() === "quantity", "bara kolumnen quantity skickas")
  await p.locator(`button[aria-label="Ta bort Enstaka pass ur varukorgen"]`).click()
  await p.waitForFunction(() => document.querySelector("[data-testid=cart-count]")?.textContent === "1")
  await p.waitForTimeout(800)
  log = await getLog()
  const del = log.find((e) => e.table === "cart_items" && e.method === "DELETE")
  check(Boolean(del) && del.query.includes(`client_id=eq.${C1}`) && del.query.includes(`service_id=in.`) && del.query.includes(S_SINGLE), "borttagen tjänst raderas ur cart_items")

  // v17: kassan med antal och serviceavgift (v19: 10 % för plattformsklienter) – Stripe får tjänsten × 2 och avgiften som egen rad.
  const co = await p.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: S_SINGLE, quantity: 2 }] } })
  check(co.ok() && /pay\/cs_test_1/.test((await co.json()).url ?? ""), "kassan med 2 enstaka pass startar")
  log = await getLog()
  const rpcCo = log.filter((e) => e.table === "create_checkout").at(-1)
  check(JSON.stringify(rpcCo?.body) === JSON.stringify({ p_service_ids: [S_SINGLE], p_quantities: [2] }), "databasen får tjänst och antal (inga priser från webbläsaren)")
  const form = (await (await fetch(`${stripe}/__log`)).json()).filter((e) => e.method === "POST").at(-1)?.form ?? {}
  check(form["line_items[0][quantity]"] === "2" && form["line_items[0][price_data][unit_amount]"] === "80000", "Stripe: 2 × 800 kr")
  check(form["line_items[1][price_data][unit_amount]"] === "16000" && form["line_items[1][quantity]"] === "1", "Stripe: serviceavgift 10 % av 1 600 kr = 160 kr")
  const bad = await p.request.post(`${base}/api/checkout`, { data: { items: [] } })
  check(bad.status() === 400, "tom kassa avvisas")

  // En klient kan inte köpa boost.
  const r = await p.request.post(`${base}/api/stripe/boost-checkout`)
  check(r.status() === 400 && /Bara PT:er/.test((await r.json()).error), "klienter kan inte starta ett boostköp")
  await ctx.close()
}

// --------------------------------------------------------------- boost ---
{
  const { ctx, p } = await login("elin@test.se")
  await p.goto(`${base}/pt/profil`)
  const card = p.locator("[data-testid=boost-card]")
  await card.waitFor()
  await card.locator("button:has-text('Boosta i 7 dagar')").click()
  await p.waitForURL(/localhost:54500\/pay\/cs_boost_1/)
  ok("PT:n skickas till Stripe Checkout")
  const created = (await (await fetch(`${stripe}/__log`)).json()).filter((e) => e.method === "POST").at(-1)?.form ?? {}
  check(created["line_items[0][price_data][unit_amount]"] === "19900" && created["line_items[0][price_data][currency]"] === "sek", "Stripe: 19 900 öre (199 kr) i SEK")
  check(created["metadata[trainer_id]"] === T1 && created["metadata[boost_duration_days]"] === "7" && created["metadata[kind]"] === "boost", "metadata: trainer_id och boost_duration_days = 7")
  check(created.mode === "payment" && created.client_reference_id === BOOST, "engångsbetalning kopplad till boostköpet")
  check(created.success_url === `${base}/pt/profil?boost=klar&session_id={CHECKOUT_SESSION_ID}`, "retur till PT-profilen efter betalning")
  const stripeCreate = (await (await fetch(`${stripe}/__log`)).json()).filter((e) => e.method === "POST").at(-1)
  check(stripeCreate?.idempotencyKey === `boost-${BOOST}`, "idempotent mot Stripe (samma boostköp ger samma session)")
  let log = await getLog()
  check(log.some((e) => e.table === "create_boost_checkout") && log.some((e) => e.table === "attach_boost_session" && e.body.p_session === "cs_boost_1"), "boostköpet skapas i databasen och kopplas till sessionen")

  // Tillbaka från Stripe: servern frågar Stripe och markerar boosten betald (utan att vänta på webhooken).
  await p.goto(`${base}/pt/profil?boost=klar&session_id=cs_boost_1`)
  await p.waitForSelector("text=Din profil är boostad!", { timeout: 15000 })
  log = await getLog()
  const paid = log.find((e) => e.table === "mark_boost_paid")
  check(paid?.body.p_boost === BOOST && paid.body.p_amount_sek === 199 && paid.body.p_payment_intent === "pi_boost_1", "verify markerar boosten betald (199 kr)")
  await card.waitFor()
  check((await card.innerText()).includes("7 dagar kvar"), "Boost-kortet visar aktiv boost i 7 dagar")
  check(new URL(p.url()).search === "", "retur-parametrarna tas bort ur adressen")
  await ctx.close()
}

// ------------------------------------------------------------- webhook ---
{
  await fetch(`${mock}/__reset`)
  const sign = (payload, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", "whsec_test").update(`${t}.${payload}`).digest("hex")}`
  const completed = JSON.stringify({
    id: "evt_boost",
    type: "checkout.session.completed",
    data: { object: { id: "cs_boost_1", payment_status: "paid", amount_total: 19900, client_reference_id: BOOST, payment_intent: "pi_boost_1", metadata: { kind: "boost", boost_id: BOOST, trainer_id: T1, boost_duration_days: "7" } } },
  })
  const r = await fetch(`${base}/api/stripe/webhook`, { method: "POST", body: completed, headers: { "stripe-signature": sign(completed) } })
  let log = await getLog()
  check(r.status === 200 && log.some((e) => e.table === "mark_boost_paid" && e.body.p_boost === BOOST && e.body.p_amount_sek === 199), "webhook (checkout.session.completed) markerar boosten betald")
  check(!log.some((e) => e.table === "mark_checkout_paid"), "en boost blandas inte ihop med klienternas kassor")
  const bad = await fetch(`${base}/api/stripe/webhook`, { method: "POST", body: completed, headers: { "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` } })
  check(bad.status === 400, "boost-webhook med fel signatur avvisas")
  const refunded = JSON.stringify({ id: "evt_refund", type: "charge.refunded", data: { object: { id: "ch_1", refunded: true, payment_intent: "pi_boost_1" } } })
  await fetch(`${base}/api/stripe/webhook`, { method: "POST", body: refunded, headers: { "stripe-signature": sign(refunded) } })
  log = await getLog()
  check(log.some((e) => e.table === "mark_boost_refunded" && e.body.p_payment_intent === "pi_boost_1"), "återbetalning kortar boosten")
}

const anon = await fetch(`${base}/api/stripe/boost-checkout`, { method: "POST" })
check(anon.status === 401, "boostköp kräver inloggning")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
