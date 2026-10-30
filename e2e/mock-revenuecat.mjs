// Låtsas-RevenueCat för e2e: GET /v1/subscribers/:id med den hemliga nyckeln.
// Testerna sätter kundens köp med POST /__set/:id och läser anropen via /__log.
// Servern pekas hit med REVENUECAT_API_BASE=http://localhost:54600.
import http from "node:http"

const subscribers = {}
const log = []
const read = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)) })

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const body = await read(req)
  const send = (status, json) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(json))
  }
  if (url.pathname === "/__log") return send(200, log)
  if (url.pathname === "/__reset") { log.length = 0; for (const k of Object.keys(subscribers)) delete subscribers[k]; return send(200, {}) }
  if (url.pathname.startsWith("/__set/")) { subscribers[decodeURIComponent(url.pathname.slice(7))] = JSON.parse(body || "{}"); return send(200, {}) }
  const m = url.pathname.match(/^\/v1\/subscribers\/(.+)$/)
  if (m && req.method === "GET") {
    if (req.headers.authorization !== "Bearer sk_test_rc") return send(401, { message: "Invalid API key" })
    const id = decodeURIComponent(m[1])
    log.push({ method: "GET", id })
    return send(200, { subscriber: subscribers[id] ?? { subscriptions: {}, non_subscriptions: {}, entitlements: {} } })
  }
  // v23: kontoradering tar bort kunden.
  if (m && req.method === "DELETE") {
    if (req.headers.authorization !== "Bearer sk_test_rc") return send(401, { message: "Invalid API key" })
    const id = decodeURIComponent(m[1])
    log.push({ method: "DELETE", id })
    delete subscribers[id]
    return send(200, { app_user_id: id, deleted: true })
  }
  send(404, { message: `mock: ${req.method} ${url.pathname}` })
}).listen(54600, () => console.log("mock revenuecat on :54600"))
