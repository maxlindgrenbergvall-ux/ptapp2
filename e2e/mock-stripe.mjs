// Låtsas-Stripe för e2e: skapa/hämta Checkout-sessioner och en "betalsida".
// v22: Stripe Connect – konton, onboardinglänkar och en "onboardingsida".
// Servern pekas hit med STRIPE_API_BASE=http://localhost:54500.
import http from "node:http"

const CO_NEW = "aaaaaaaa-0000-4000-8000-000000000002"
const BOOST = "cccccccc-0000-4000-8000-000000000001"
const PLUS = "dddddddd-0000-4000-8000-000000000001"
const log = []
// v22: Connect-konton. Elins är godkänt; nya konton är tomma tills onboardingsidan besökts.
const accounts = {}
const links = {}
const account = (id) => ({ id, object: "account", ...accounts[id] })
function resetConnect() {
  for (const k of Object.keys(accounts)) delete accounts[k]
  accounts.acct_1ElinTest = { details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] } }
}
resetConnect()
const read = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)) })

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const body = await read(req)
  const send = (status, json, type = "application/json") => {
    res.writeHead(status, { "content-type": type })
    res.end(type === "application/json" ? JSON.stringify(json) : json)
  }
  if (url.pathname === "/__log") return send(200, log)
  if (url.pathname === "/__reset_connect") { resetConnect(); return send(200, {}) }
  // Steg i testet: Stripe har godkänt kontot (eller bara tagit emot uppgifterna).
  if (url.pathname.startsWith("/__connect/")) {
    const [, , id, state] = url.pathname.split("/")
    accounts[id] = state === "submitted"
      ? { details_submitted: true, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: ["individual.verification.document"] } }
      : { details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] } }
    return send(200, account(id))
  }
  // "Stripes onboarding": PT:n fyller i uppgifterna och skickas tillbaka till return_url.
  if (url.pathname.startsWith("/connect/onboard/")) {
    const id = url.pathname.split("/").pop()
    accounts[id] = { details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] } }
    return send(200, `<!doctype html><title>Stripe Connect (mock)</title><h1>Verifiera dig</h1><a id="tillbaka" href="${links[id]?.return_url ?? "/"}">Tillbaka till Coavira</a>`, "text/html")
  }
  if (url.pathname.startsWith("/pay/")) return send(200, "<!doctype html><title>Stripe Checkout (mock)</title><h1>Betala med kort</h1>", "text/html")
  if (req.headers.authorization !== "Bearer sk_test_mock") return send(401, { error: { message: "Invalid API Key" } })
  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const form = Object.fromEntries(new URLSearchParams(body))
    log.push({ method: "POST", path: url.pathname, form, idempotencyKey: req.headers["idempotency-key"] })
    const id = form["metadata[kind]"] === "boost" ? "cs_boost_1" : form["metadata[kind]"] === "plus" ? "cs_plus_1" : "cs_test_1"
    return send(200, { id, url: `http://localhost:54500/pay/${id}`, status: "open", payment_status: "unpaid", amount_total: null })
  }
  if (req.method === "GET" && url.pathname === "/v1/checkout/sessions/cs_test_1") {
    log.push({ method: "GET", path: url.pathname })
    // 800 kr + serviceavgift 10 % (80 kr, plattformsklient) = 880 kr.
    return send(200, { id: "cs_test_1", status: "complete", payment_status: "paid", amount_total: 88000, currency: "sek", client_reference_id: CO_NEW, payment_intent: "pi_test_1" })
  }
  // v16: PT Boost, 199 kr.
  if (req.method === "GET" && url.pathname === "/v1/checkout/sessions/cs_boost_1") {
    log.push({ method: "GET", path: url.pathname })
    return send(200, { id: "cs_boost_1", status: "complete", payment_status: "paid", amount_total: 19900, currency: "sek", client_reference_id: BOOST, payment_intent: "pi_boost_1", metadata: { kind: "boost", boost_id: BOOST, trainer_id: "11111111-0000-4000-8000-000000000001", boost_duration_days: "7" } })
  }
  // v18: Coavira Plus, 49 kr (testplan) för 30 dagar.
  if (req.method === "GET" && url.pathname === "/v1/checkout/sessions/cs_plus_1") {
    log.push({ method: "GET", path: url.pathname })
    return send(200, { id: "cs_plus_1", status: "complete", payment_status: "paid", amount_total: 4900, currency: "sek", client_reference_id: PLUS, payment_intent: "pi_plus_1", metadata: { kind: "plus", plus_purchase_id: PLUS, user_id: "22222222-0000-4000-8000-000000000001", plus_days: "30" } })
  }
  // v22: Connect.
  if (req.method === "POST" && url.pathname === "/v1/accounts") {
    const form = Object.fromEntries(new URLSearchParams(body))
    log.push({ method: "POST", path: url.pathname, form, idempotencyKey: req.headers["idempotency-key"] })
    const id = `acct_1Test${String(form["metadata[trainer_id]"] ?? "x").slice(-6)}`
    accounts[id] ??= { details_submitted: false, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: ["external_account", "individual.dob.day"] } }
    return send(200, account(id))
  }
  if (req.method === "GET" && url.pathname.startsWith("/v1/accounts/")) {
    const id = url.pathname.split("/").pop()
    log.push({ method: "GET", path: url.pathname })
    return accounts[id] ? send(200, account(id)) : send(404, { error: { type: "invalid_request_error", message: `No such account: '${id}'` } })
  }
  if (req.method === "POST" && url.pathname === "/v1/account_links") {
    const form = Object.fromEntries(new URLSearchParams(body))
    log.push({ method: "POST", path: url.pathname, form })
    links[form.account] = form
    return send(200, { object: "account_link", url: `http://localhost:54500/connect/onboard/${form.account}`, expires_at: Math.floor(Date.now() / 1000) + 300 })
  }
  send(404, { error: { message: `mock: ${req.method} ${url.pathname}` } })
}).listen(54500, () => console.log("mock stripe on :54500"))
