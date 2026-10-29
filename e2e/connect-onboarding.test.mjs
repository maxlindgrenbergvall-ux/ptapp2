// E2E (Supabase-läge) för v22: obligatorisk PT-onboarding med Stripe Connect.
//  - spärren: en ny PT kommer bara åt /pt/onboarding tills profil + Stripe är klart
//  - steg 1 (profil) och steg 2 (Stripe Connect Express), retur via /pt/onboarding/callback
//  - "Stripe granskar" (uppgifter inskickade men kort inte aktiverade)
//  - välkomstmeddelandet i PT-portalen
//  - kassan delas: application_fee_amount (serviceavgiften) + transfer_data.destination (PT:ns konto)
//  - webhook account.updated: PT:n kan inte ta betalt när Stripe stänger av kort
// Kräver mock-supabase och mock-stripe (se v16-supabase.test.mjs) och servern med
// STRIPE_SECRET_KEY=sk_test_mock STRIPE_API_BASE=http://localhost:54500 STRIPE_WEBHOOK_SECRET=whsec_test.
import crypto from "node:crypto"
import fs from "node:fs"
import { chromium } from "playwright"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
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
const check = (c, m) => (c ? ok(m) : fail(m))
const APP_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CoaviraApp"
await fetch(`${mock}/__reset`)
await fetch(`${mock}/__reset_v22`)
await fetch(`${stripe}/__reset_connect`)
const stripeLog = async () => (await fetch(`${stripe}/__log`)).json()
// Mock-Stripes logg nollställs inte – räkna det som händer i den här körningen.
const accountsCreated = async () => (await stripeLog()).filter((e) => e.path === "/v1/accounts" && e.method === "POST").length
const accountsBefore = await accountsCreated()
const mockLog = async () => (await fetch(`${mock}/__log`)).json()
const sign = (payload) => {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${crypto.createHmac("sha256", "whsec_test").update(`${t}.${payload}`).digest("hex")}`
}
const hook = (event) => {
  const payload = JSON.stringify({ id: `evt_${Date.now()}`, object: "event", ...event })
  return fetch(`${base}/api/stripe/webhook`, { method: "POST", body: payload, headers: { "stripe-signature": sign(payload) } })
}

async function login(email, path = "/logga-in", ua) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(ua ? { userAgent: ua } : {}) })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
  await p.goto(base + path)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  return { ctx, p }
}

// ------------------------------------------------------------- spärren ---
const { ctx, p } = await login("nypt@test.se", "/logga-in/pt")
await p.waitForURL(/\/pt\/onboarding$/)
ok("ny PT hamnar direkt i onboardingen efter inloggningen")
for (const path of ["/pt", "/pt/klienter", "/pt/kalender", "/pt/profil", "/pt/meddelanden"]) {
  await p.goto(base + path)
  check(new URL(p.url()).pathname === "/pt/onboarding", `${path} → /pt/onboarding (portalen är stängd)`)
}
const boost = await p.request.post(`${base}/api/stripe/boost-checkout`)
check(!boost.ok(), "PT Boost går inte att köpa före onboardingen")
await p.waitForSelector("[data-testid=onboarding-profile]")
check((await p.locator('nav[aria-label="Huvudmeny"]').count()) === 0, "onboardingen visas utan portalens meny")
check(await p.locator("text=Välkommen till Coavira, Nils!").isVisible(), "personlig välkomstrubrik")

// --------------------------------------------------------- steg 1: profil ---
const save = p.getByRole("button", { name: "Spara och fortsätt" })
// Databasen saknar v22 (my_payout_status finns inte): tydligt besked i stället för "kontrollera uppkopplingen".
async function fillProfile() {
  await p.getByRole("button", { name: "Länk" }).click()
  await p.locator('input[placeholder^="https"]').fill("https://cdn.test/nils.jpg")
  await p.locator('input[placeholder^="https"]').press("Enter")
  await p.getByRole("button", { name: "Hyrox" }).click()
}
check(await save.isDisabled(), "steg 1: knappen är låst tills profilen är färdig")
check(/profilbild/.test(await p.locator("[data-testid=onboarding-missing]").innerText()), "steg 1: visar vad som saknas")
await fillProfile()
await p.fill("#onb-bio", "Kort")
check(await save.isDisabled(), "steg 1: presentationen måste vara minst 40 tecken")
await p.fill("#onb-bio", "Jag coachar Hyrox-atleter och nybörjare med fokus på teknik och hållbar progression.")
await p.fill("#onb-name", "Nils Nyström")
check(await save.isEnabled(), "steg 1: färdig profil kan sparas")
await p.route("**/rest/v1/rpc/my_payout_status", (r) =>
  r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST202", message: "Could not find the function public.my_payout_status without parameters in the schema cache" }) })
)
await save.click()
await p.waitForSelector("text=Databasen är inte uppdaterad")
ok("databas utan v22: tydligt besked om migrationen (inte \"kontrollera uppkopplingen\")")
await p.unroute("**/rest/v1/rpc/my_payout_status")
await p.screenshot({ path: `${out}/v22-onboarding-steg1.png`, fullPage: true })
await save.click()
await p.waitForSelector("[data-testid=onboarding-payouts]")
const writes = await mockLog()
check(writes.some((e) => e.table === "profiles" && e.method === "PATCH" && e.body?.full_name === "Nils Nyström"), "namnet sparas i profiles")
check(writes.some((e) => e.table === "trainers" && e.method === "PATCH" && e.body?.avatar_url === "https://cdn.test/nils.jpg" && e.body?.specialties?.includes("hyrox")), "bild, inriktning och presentation sparas i trainers")

// ---------------------------------------------------- steg 2: utbetalningar ---
const payoutsText = await p.locator("[data-testid=onboarding-payouts]").innerText()
check(/5 %/.test(payoutsText) && /10 %/.test(payoutsText) && /dras automatiskt i kassan/.test(payoutsText), "steg 2: serviceavgiften (5/10 %) förklaras")
await p.screenshot({ path: `${out}/v22-onboarding-steg2.png`, fullPage: true })
await p.goto(base + "/pt")
check(new URL(p.url()).pathname === "/pt/onboarding", "profil klar men ingen Stripe: portalen fortfarande stängd")
await p.waitForSelector("[data-testid=onboarding-payouts]")
ok("tillbaka i onboardingen hoppar sidan direkt till steg 2")

await p.getByTestId("connect-payouts").click()
await p.waitForURL(/localhost:54500\/connect\/onboard\/acct_/)
ok("\"Koppla bankkonto\" skickar PT:n till Stripes onboarding")
const acct = new URL(p.url()).pathname.split("/").pop()
const slog = await stripeLog()
const created = slog.filter((e) => e.path === "/v1/accounts" && e.method === "POST").at(-1)
check(created?.form.country === "SE" && created.form["controller[stripe_dashboard][type]"] === "express" && created.form["controller[fees][payer]"] === "application",
  "Stripe-konto: Sverige, Express-översikt, Coavira betalar Stripes avgifter")
check(created?.form["capabilities[card_payments][requested]"] === "true" && created.form["capabilities[transfers][requested]"] === "true", "Stripe-konto: kortbetalningar och överföringar")
check(created?.form["metadata[trainer_id]"] === "11111111-0000-4000-8000-000000000002" && created.idempotencyKey === "connect-account-11111111-0000-4000-8000-000000000002",
  "Stripe-konto: kopplat till PT:n och idempotent (inga dubbletter)")
const link = slog.filter((e) => e.path === "/v1/account_links").at(-1)
check(link?.form.type === "account_onboarding" && link.form.return_url === `${base}/pt/onboarding/callback` && link.form.refresh_url === `${base}/pt/onboarding?stripe=forny`,
  "onboardinglänk: tillbaka till /pt/onboarding/callback (och ny länk om den gått ut)")
check((await mockLog()).some((e) => e.table === "attach_stripe_account" && e.body.p_account === acct), "kontot sparas i databasen (attach_stripe_account)")

// Stripe har tagit emot uppgifterna men inte aktiverat kort än.
await fetch(`${stripe}/__connect/${acct}/submitted`)
await p.click("#tillbaka")
await p.waitForURL(/\/pt\/onboarding/)
await p.waitForSelector("[data-testid=onboarding-waiting]")
ok("uppgifter inskickade men inte godkända: \"Stripe granskar dina uppgifter\"")
await p.goto(base + "/pt/kalender")
check(new URL(p.url()).pathname === "/pt/onboarding", "under granskningen är portalen stängd")
await p.waitForSelector("[data-testid=onboarding-waiting]")
await p.screenshot({ path: `${out}/v22-onboarding-granskas.png`, fullPage: true })

// Stripe godkänner kontot – PT:n kontrollerar igen.
await fetch(`${stripe}/__connect/${acct}/active`)
await p.waitForSelector("[data-testid=onboarding-waiting]")
await p.getByRole("button", { name: "Kontrollera igen" }).click()
await p.waitForURL(/\/pt$/)
const applied = (await mockLog()).filter((e) => e.table === "apply_stripe_account").at(-1)?.body
check(applied?.p_account === acct && applied.p_details === true && applied.p_charges === true, "callback: statusen hämtas från Stripe (inte från länken)")
await p.waitForSelector("text=Välkommen till Coavira, Nils!")
ok("klart: in i PT-portalen med ett välkomstmeddelande")
check(new URL(p.url()).search === "", "välkomstparametern tas bort ur adressen")
await p.screenshot({ path: `${out}/v22-onboarding-valkommen.png` })
await p.goto(base + "/pt/kalender")
check(new URL(p.url()).pathname === "/pt/kalender", "portalen är öppen (ny JWT med pt_ready)")
await p.goto(base + "/pt/onboarding")
await p.waitForSelector("[data-testid=onboarding-done]")
ok("onboardingen visar \"Allt klart\" om PT:n går tillbaka dit")

// Från appen: Stripe skickar tillbaka via /app-retur (lämnar över till appen).
const native = await p.request.post(`${base}/api/stripe/connect/onboard`, { headers: { "user-agent": APP_UA } })
check(native.ok(), "appen: onboardinglänken skapas")
const nativeLink = (await stripeLog()).filter((e) => e.path === "/v1/account_links").at(-1)
check(nativeLink?.form.return_url === `${base}/app-retur/pt/onboarding/callback` && nativeLink.form.account === acct,
  "appen: retur via /app-retur/pt/onboarding/callback, samma Stripe-konto")
check((await accountsCreated()) - accountsBefore === 1, "inget nytt Stripe-konto skapas andra gången")
await ctx.close()

// -------------------------------------------- kassan: delad betalning ---
{
  const { ctx: c, p: k } = await login("sara@test.se")
  await k.waitForURL(/\/klient$/)
  const co = await k.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: "99999999-0000-4000-8000-000000000001", quantity: 1 }] } })
  check(co.ok(), "klienten startar kassan hos en PT med Stripe-konto")
  const form = (await stripeLog()).filter((e) => e.path === "/v1/checkout/sessions").at(-1)?.form ?? {}
  const fee = Number(form["line_items[1][price_data][unit_amount]"])
  check(form["payment_intent_data[transfer_data][destination]"] === "acct_1ElinTest", "split: pengarna går till PT:ns Stripe-konto (transfer_data.destination)")
  check(Number(form["payment_intent_data[application_fee_amount]"]) === fee && fee > 0, `split: Coavira behåller serviceavgiften (application_fee_amount = ${fee / 100} kr)`)
  check(form["payment_intent_data[metadata][trainer_id]"] === "11111111-0000-4000-8000-000000000001", "betalningen märks med PT:n")

  // Stripe stänger av kort för Elin (account.updated) → kassan stängs.
  const off = await hook({ type: "account.updated", data: { object: { id: "acct_1ElinTest", object: "account", details_submitted: true, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: ["external_account"] } } } })
  check(off.status === 200, "webhook account.updated tas emot")
  const appliedOff = (await mockLog()).filter((e) => e.table === "apply_stripe_account").at(-1)?.body
  check(appliedOff?.p_account === "acct_1ElinTest" && appliedOff.p_charges === false && appliedOff.p_due?.[0] === "external_account", "webhooken uppdaterar PT:ns status")
  const blocked = await k.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: "99999999-0000-4000-8000-000000000001", quantity: 1 }] } })
  check(blocked.status() === 409 && /kan inte ta emot betalningar/.test((await blocked.json()).error), "PT utan aktiva kortbetalningar: kassan stängd med tydligt besked")
  await hook({ type: "account.updated", data: { object: { id: "acct_1ElinTest", object: "account", details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] } } } })
  const again = await k.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: "99999999-0000-4000-8000-000000000001", quantity: 1 }] } })
  check(again.ok(), "kort aktiva igen: kassan öppen")
  const bad = await fetch(`${base}/api/stripe/webhook`, { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=00" } })
  check(bad.status === 400, "webhook med fel signatur avvisas")
  await c.close()
}

// PT vars token saknar pt_ready (databasen före v22) låses inte ute.
{
  const { ctx: c, p: g } = await login("gammalpt@test.se", "/logga-in/pt")
  await g.waitForURL(/\/pt$/)
  await g.goto(base + "/pt/kalender")
  check(new URL(g.url()).pathname === "/pt/kalender", "databas före v22 (inget pt_ready): PT-portalen är öppen som förut")
  await c.close()
}

// Elin (färdig PT) påverkas inte av spärren.
{
  const { ctx: c, p: e } = await login("elin@test.se", "/logga-in/pt")
  await e.waitForURL(/\/pt$/)
  ok("färdig PT loggar in direkt i portalen")
  await c.close()
}

await fetch(`${mock}/__reset_v22`)
await fetch(`${stripe}/__reset_connect`)
check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
