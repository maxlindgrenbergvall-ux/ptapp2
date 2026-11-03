// Mock av Stravas OAuth och API (v32) på :54700. Används med
// STRAVA_API_BASE=http://localhost:54700 STRAVA_CLIENT_ID=… STRAVA_CLIENT_SECRET=….
//   GET  /oauth/authorize   → skickar direkt tillbaka med ?code=…&state=…&scope=…
//   POST /oauth/token       → tokens (authorization_code / refresh_token)
//   GET  /api/v3/athlete/activities, /api/v3/activities/:id
//   POST /oauth/deauthorize
//   GET  /__log, /__reset
import http from "node:http"

const log = []
const today = new Date()
const iso = (d, h) => {
  const x = new Date(d)
  x.setUTCHours(h, 0, 0, 0)
  return x.toISOString().replace(".000", "")
}
const local = (d, h) => iso(d, h) // lokal tid som Strava skickar den (utan zon)
const yesterday = new Date(today.getTime() - 86_400_000)
const ACTIVITIES = [
  // Löpning utan kalorier i listan – hämtas från detaljanropet (412 kcal).
  { id: 9001, name: "Morgonlöpning", sport_type: "Run", type: "Run", start_date: iso(today, 6), start_date_local: local(today, 7), elapsed_time: 2000, moving_time: 1900, distance: 5400 },
  // Cykel med effektmätare: kilojoule ≈ kcal (250).
  { id: 9002, name: "Pendling", sport_type: "Ride", type: "Ride", start_date: iso(yesterday, 7), start_date_local: local(yesterday, 8), elapsed_time: 1600, moving_time: 1500, distance: 9100, kilojoules: 250 },
  // Promenad utan kalorier någonstans → uppskattas (MET).
  { id: 9003, name: "Kvällspromenad", sport_type: "Walk", type: "Walk", start_date: iso(yesterday, 18), start_date_local: local(yesterday, 19), elapsed_time: 2400, moving_time: 2400, distance: 3000 },
]
const DETAIL_KCAL = { 9001: 412 }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:54700")
  let body = ""
  for await (const chunk of req) body += chunk
  const send = (status, json) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(json))
  }
  if (url.pathname === "/__log") return send(200, log)
  if (url.pathname === "/__reset") {
    log.length = 0
    return send(200, {})
  }
  if (url.pathname === "/oauth/authorize") {
    log.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) })
    const back = new URL(url.searchParams.get("redirect_uri"))
    back.searchParams.set("state", url.searchParams.get("state") ?? "")
    back.searchParams.set("code", "strava-code-1")
    back.searchParams.set("scope", "read,activity:read_all")
    res.writeHead(302, { location: back.toString() })
    return res.end()
  }
  if (url.pathname === "/oauth/token" && req.method === "POST") {
    const p = JSON.parse(body || "{}")
    log.push({ path: url.pathname, body: { ...p, client_secret: p.client_secret ? "(satt)" : null } })
    if (p.grant_type === "authorization_code" && p.code !== "strava-code-1") return send(400, { message: "Bad Request" })
    return send(200, { token_type: "Bearer", access_token: `at-${Date.now()}`, refresh_token: "rt-1", expires_at: Math.floor(Date.now() / 1000) + 6 * 3600, athlete: { id: 424242 } })
  }
  if (url.pathname === "/oauth/deauthorize" && req.method === "POST") {
    log.push({ path: url.pathname, auth: Boolean(req.headers.authorization) })
    return send(200, { access_token: "revoked" })
  }
  if (!req.headers.authorization?.startsWith("Bearer at-")) return send(401, { message: "Authorization Error" })
  if (url.pathname === "/api/v3/athlete/activities") {
    log.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) })
    return send(200, ACTIVITIES)
  }
  const detail = url.pathname.match(/^\/api\/v3\/activities\/(\d+)$/)
  if (detail) {
    log.push({ path: "/api/v3/activities/:id", id: detail[1] })
    const a = ACTIVITIES.find((x) => String(x.id) === detail[1])
    return a ? send(200, { ...a, calories: DETAIL_KCAL[a.id] }) : send(404, {})
  }
  send(404, { message: "Not Found" })
})
server.listen(54700, () => console.log("mock-strava :54700"))
