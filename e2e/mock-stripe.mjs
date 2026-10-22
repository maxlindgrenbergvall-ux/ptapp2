// Låtsas-Stripe för e2e: skapa/hämta Checkout-sessioner och en "betalsida".
// Servern pekas hit med STRIPE_API_BASE=http://localhost:54500.
import http from "node:http"

const CO_NEW = "aaaaaaaa-0000-4000-8000-000000000002"
const BOOST = "cccccccc-0000-4000-8000-000000000001"
const log = []
const read = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)) })

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const body = await read(req)
  const send = (status, json, type = "application/json") => {
    res.writeHead(status, { "content-type": type })
    res.end(type === "application/json" ? JSON.stringify(json) : json)
  }
  if (url.pathname === "/__log") return send(200, log)
  if (url.pathname.startsWith("/pay/")) return send(200, "<!doctype html><title>Stripe Checkout (mock)</title><h1>Betala med kort</h1>", "text/html")
  if (req.headers.authorization !== "Bearer sk_test_mock") return send(401, { error: { message: "Invalid API Key" } })
  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const form = Object.fromEntries(new URLSearchParams(body))
    log.push({ method: "POST", path: url.pathname, form, idempotencyKey: req.headers["idempotency-key"] })
    const id = form["metadata[kind]"] === "boost" ? "cs_boost_1" : "cs_test_1"
    return send(200, { id, url: `http://localhost:54500/pay/${id}`, status: "open", payment_status: "unpaid", amount_total: null })
  }
  if (req.method === "GET" && url.pathname === "/v1/checkout/sessions/cs_test_1") {
    log.push({ method: "GET", path: url.pathname })
    // 800 kr + serviceavgift 7 % (56 kr) = 856 kr.
    return send(200, { id: "cs_test_1", status: "complete", payment_status: "paid", amount_total: 85600, currency: "sek", client_reference_id: CO_NEW, payment_intent: "pi_test_1" })
  }
  // v16: PT Boost, 199 kr.
  if (req.method === "GET" && url.pathname === "/v1/checkout/sessions/cs_boost_1") {
    log.push({ method: "GET", path: url.pathname })
    return send(200, { id: "cs_boost_1", status: "complete", payment_status: "paid", amount_total: 19900, currency: "sek", client_reference_id: BOOST, payment_intent: "pi_boost_1", metadata: { kind: "boost", boost_id: BOOST, trainer_id: "11111111-0000-4000-8000-000000000001", boost_duration_days: "7" } })
  }
  send(404, { error: { message: `mock: ${req.method} ${url.pathname}` } })
}).listen(54500, () => console.log("mock stripe on :54500"))
