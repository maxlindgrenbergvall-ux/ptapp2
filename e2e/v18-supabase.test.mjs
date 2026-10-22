// E2E för v18 i Supabase-läge mot e2e/mock-supabase.mjs och e2e/mock-stripe.mjs:
// koden och Plus kommer från my_account(), inbjudningar från referrals, inlösen
// via redeem_referral (i välkomststeget och i inbjudningsvyn), köp av Coavira
// Plus via Stripe (metadata kind = plus), bekräftelse efter retur och webhook.
//   (start som e2e/v16-supabase.test.mjs)
//   BASE_URL=http://localhost:3000 node e2e/v18-supabase.test.mjs
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
await fetch(`${mock}/__reset_v18`)

const C1 = "22222222-0000-4000-8000-000000000001"
const PLUS = "dddddddd-0000-4000-8000-000000000001"

async function login(email, home = /\/(klient|pt)$/) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/logga-in${email.startsWith("elin") ? "/pt" : ""}`)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(home)
  await p.waitForLoadState("networkidle")
  return { ctx, p }
}

// ------------------------------------------- 1. Sara: lås, kod och köp ---
{
  const { ctx, p } = await login("sara@test.se")
  await p.waitForSelector("[data-testid=plus-lock][data-feature=sleep]")
  ok("utan Plus (my_account) är sömntrackingen låst")
  await p.goto(`${base}/klient/inbjudningar`)
  await p.waitForSelector("[data-testid=referral-code]")
  check((await p.locator("[data-testid=referral-code]").innerText()).trim() === "SARA7KQ2", "koden kommer från my_account()")
  check(/1\s*Inbjudna/.test(await p.locator("[data-testid=referral-stats]").innerText()), "inbjudningarna kommer från referrals")
  check((await p.locator("[data-testid=redeem-card]").count()) === 0, "äldre konto kan inte lösa in en kod")

  // Köp Plus → Stripe (priset och längden kommer från databasen, inte webbläsaren).
  await p.goto(`${base}/klient/plus`)
  await p.click("button:has-text('Skaffa Coavira Plus')")
  await p.waitForURL(/localhost:54500\/pay\/cs_plus_1/)
  ok("klienten skickas till Stripe Checkout")
  const created = (await (await fetch(`${stripe}/__log`)).json()).filter((e) => e.method === "POST").at(-1)
  const form = created?.form ?? {}
  check(form["metadata[kind]"] === "plus" && form["metadata[plus_purchase_id]"] === PLUS && form["metadata[user_id]"] === C1, "metadata: kind = plus, köpet och användaren")
  check(form["line_items[0][price_data][unit_amount]"] === "4900" && form.client_reference_id === PLUS, "Stripe: planens pris (49 kr) kopplat till köpet")
  check(form.success_url === `${base}/klient/plus?plus=klar&session_id={CHECKOUT_SESSION_ID}`, "retur till Plus-sidan")
  check(created?.idempotencyKey === `plus-${PLUS}`, "idempotent mot Stripe")
  let log = await getLog()
  check(log.some((e) => e.table === "attach_plus_session" && e.body.p_session === "cs_plus_1"), "köpet kopplas till sessionen")

  await p.goto(`${base}/klient/plus?plus=klar&session_id=cs_plus_1`)
  await p.waitForSelector("text=Välkommen till Coavira Plus!", { timeout: 15000 })
  log = await getLog()
  const paid = log.find((e) => e.table === "mark_plus_paid")
  check(paid?.body.p_purchase === PLUS && paid.body.p_amount_sek === 49 && paid.body.p_payment_intent === "pi_plus_1", "verify markerar Plus betalt (49 kr)")
  await p.waitForSelector("text=Du har Coavira Plus")
  check(new URL(p.url()).search === "", "retur-parametrarna tas bort ur adressen")
  await p.goto(`${base}/klient`)
  await p.waitForLoadState("networkidle")
  check((await p.locator("[data-testid=plus-lock]").count()) === 0, "låsen försvinner när Plus är betalt")

  // En PT kan inte köpa Plus; utloggade inte heller.
  await ctx.close()
}
{
  const { ctx, p } = await login("elin@test.se")
  const r = await p.request.post(`${base}/api/stripe/plus-checkout`)
  check(r.status() === 400 && /klientkonton/.test((await r.json()).error), "PT:er kan inte köpa Plus")
  await p.goto(`${base}/pt/inbjudningar`)
  await p.waitForSelector("[data-testid=referral-code]")
  check((await p.locator("[data-testid=referral-code]").innerText()).trim() === "ELNA2PT7", "PT:n ser sin kod")
  await ctx.close()
}
check((await fetch(`${base}/api/stripe/plus-checkout`, { method: "POST" })).status === 401, "Plus-köp kräver inloggning")

// -------------------------------- 2. Nova: inbjudningslänk → välkomststeget ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/ref/SARA7KQ2`)
  await p.waitForSelector("[data-testid=referral-banner]")
  await p.goto(`${base}/logga-in`)
  await p.fill("#email", "ny@test.se")
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(`${base}/valkommen`)
  await p.waitForSelector("#referral")
  check((await p.inputValue("#referral")) === "SARA7KQ2", "koden från länken är förifylld i välkomststeget")
  await p.fill("#phone", "0701234567")
  await p.click("#consent")
  await p.click("button[type=submit]")
  await p.waitForURL(`${base}/klient`)
  await p.waitForLoadState("networkidle")
  const log = await getLog()
  check(log.some((e) => e.table === "redeem_referral" && e.body.p_code === "SARA7KQ2"), "koden löses in med redeem_referral efter registreringen")
  check(log.findIndex((e) => e.table === "complete_onboarding") < log.findIndex((e) => e.table === "redeem_referral"), "inlösen sker efter att kontot fått sin roll")
  check(!(await p.evaluate(() => localStorage["coavira:ref"])), "den sparade koden rensas")
  check((await p.locator("[data-testid=plus-lock]").count()) === 0, "nya klienten har Plus direkt (1 månad)")
  await ctx.close()
}

// --------------------------------------------------------- 3. Webhook ---
{
  await fetch(`${mock}/__reset`)
  const sign = (payload, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", "whsec_test").update(`${t}.${payload}`).digest("hex")}`
  const completed = JSON.stringify({
    id: "evt_plus",
    type: "checkout.session.completed",
    data: { object: { id: "cs_plus_1", payment_status: "paid", amount_total: 4900, client_reference_id: PLUS, payment_intent: "pi_plus_1", metadata: { kind: "plus", plus_purchase_id: PLUS, user_id: C1, plus_days: "30" } } },
  })
  const r = await fetch(`${base}/api/stripe/webhook`, { method: "POST", body: completed, headers: { "stripe-signature": sign(completed) } })
  let log = await getLog()
  check(r.status === 200 && log.some((e) => e.table === "mark_plus_paid" && e.body.p_purchase === PLUS && e.body.p_amount_sek === 49), "webhook markerar Plus betalt")
  check(!log.some((e) => e.table === "mark_checkout_paid" || e.table === "mark_boost_paid"), "Plus blandas inte ihop med kassor eller boost")
  const refunded = JSON.stringify({ id: "evt_refund", type: "charge.refunded", data: { object: { id: "ch_1", refunded: true, payment_intent: "pi_plus_1" } } })
  await fetch(`${base}/api/stripe/webhook`, { method: "POST", body: refunded, headers: { "stripe-signature": sign(refunded) } })
  log = await getLog()
  check(log.some((e) => e.table === "mark_plus_refunded" && e.body.p_payment_intent === "pi_plus_1"), "återbetalning tar bort Plus-tiden")
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
