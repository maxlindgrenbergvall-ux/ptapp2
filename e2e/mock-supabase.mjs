// Låtsas-Supabase för e2e-test: auth (lösenord, user, refresh, logout) och REST
// med fasta fixtures per användare. Alla skrivningar loggas och kan hämtas via /__log.
import http from "node:http"

const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const TODAY = iso(today)
const T1 = "11111111-0000-4000-8000-000000000001"
const C1 = "22222222-0000-4000-8000-000000000001"
const W1 = "33333333-0000-4000-8000-000000000001"
const N1 = "77777777-0000-4000-8000-000000000001"

const users = {
  "sara@test.se": { id: C1, email: "sara@test.se", password: "hemligt123", user_metadata: { role: "client", full_name: "Sara Test" }, app_metadata: { role: "client" } },
  "elin@test.se": { id: T1, email: "elin@test.se", password: "hemligt123", user_metadata: { role: "trainer", full_name: "Elin Test" }, app_metadata: { role: "trainer" } },
  // v6: nytt konto (t.ex. via Google) som inte valt kontotyp än.
  "ny@test.se": { id: N1, email: "ny@test.se", password: "hemligt123", user_metadata: { name: "Nova Ny" }, app_metadata: {} },
  // v8: PT-konto vars session (simulerat) kommer från Google – ska loggas ut.
  "pt-google@test.se": { id: "11111111-0000-4000-8000-000000000009", email: "pt-google@test.se", password: "hemligt123", user_metadata: { role: "trainer", full_name: "PT Google" }, app_metadata: { role: "trainer" }, amr: [{ method: "oauth", timestamp: 1 }] },
  // v7: försökte registrera sig som PT via user_metadata – räknas inte.
  "fejk@test.se": { id: "77777777-0000-4000-8000-000000000002", email: "fejk@test.se", password: "hemligt123", user_metadata: { role: "trainer", name: "Fejk" }, app_metadata: {} },
}
const byId = Object.fromEntries(Object.values(users).map((u) => [u.id, u]))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const token = (u) =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, user_metadata: u.user_metadata, app_metadata: u.app_metadata, amr: u.amr ?? [{ method: "password", timestamp: 1 }], exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), session_id: "s1" })}.c2ln`
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, user_metadata: u.user_metadata, app_metadata: u.app_metadata, created_at: "2026-01-01T00:00:00Z" })
const session = (u) => ({ access_token: token(u), refresh_token: `r-${u.id}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userJson(u) })

const exercises = [
  { id: "e-squat", name: "Knäböj", muscle_group: "ben", equipment: "Skivstång", video_url: null },
  { id: "e-bench", name: "Bänkpress", muscle_group: "bröst", equipment: "Skivstång", video_url: null },
]
const workout = {
  id: W1, client_id: C1, trainer_id: T1, template_id: null, name: "Testpass", date: TODAY, status: "planned",
  completed_at: null, client_comment: null,
  exercises: [{ id: "we-1", exerciseId: "e-squat", sets: 3, reps: "5", restSec: 0, targetKg: 60 }],
  set_logs: [],
}
const trainerRow = {
  id: T1, city: "Stockholm", specialties: ["styrkelyft"], bio: "Testbio", years_experience: 5, price_per_session: 800,
  offers_remote: true, is_published: true, profile: { full_name: "Elin Test" },
  reviews: [],
}
// Kalender: ett bekräftat pass om två dagar kl. 07 och lediga tider från RPC:n.
const at = (days, h) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.toISOString() }
const EV1 = "44444444-0000-4000-8000-000000000001"
const eventRow = {
  id: EV1, trainer_id: T1, client_id: C1, kind: "session", status: "confirmed", title: "PT-pass",
  start_time: at(2, 7), end_time: at(2, 8), mode: "onsite", location: "Gymmet", notes: null,
  workout_id: null, created_by: T1, cancelled_by: null, awaiting: null, previous_start: null, previous_end: null,
}
// Ett preliminärt pass som PT:n flyttat: klienten ska svara (v5).
const EV2 = "44444444-0000-4000-8000-000000000002"
const movedRow = {
  ...eventRow, id: EV2, status: "pending", title: "Marklyft", start_time: at(5, 9), end_time: at(5, 10),
  awaiting: "client", previous_start: at(4, 9), previous_end: at(4, 10),
}
const notificationRows = [{
  id: "55555555-0000-4000-8000-000000000001", user_id: C1, actor_id: T1, kind: "event_rescheduled", event_id: EV2,
  payload: { actor_name: "Elin Test", title: "Marklyft", start: movedRow.start_time, end: movedRow.end_time, previous_start: movedRow.previous_start, previous_end: movedRow.previous_end },
  read_at: null, created_at: new Date(Date.now() - 600e3).toISOString(),
}]
const offerRows = [{
  id: "66666666-0000-4000-8000-000000000001", trainer_id: T1, category: "styrkelyft", title: "Teknikpaket", description: "Tre pass",
  price_sek: 1900, discount_percent: null, valid_until: null, active: true, created_at: `${TODAY}T08:00:00Z`,
}]
const slots = [3, 4].flatMap((d) => [8, 9].map((h) => ({ start_time: at(d, h), end_time: at(d, h + 1) })))
const FEED_TOKEN = "ab".repeat(32)
const rpc = {
  calendar_feed_token: FEED_TOKEN,
  available_slots: slots,
  next_available_slots: [{ trainer_id: T1, start_time: slots[0].start_time }],
}

function fixtures(uid, table) {
  const client = uid === C1
  switch (table) {
    case "profiles": {
      const meta = byId[uid].user_metadata
      return [{ id: uid, role: byId[uid].app_metadata.role ?? null, full_name: meta.full_name ?? meta.name }]
    }
    case "exercises": return exercises
    case "scheduled_workouts": return [workout]
    case "messages": return []
    case "calendar_events": return [eventRow, movedRow]
    case "notifications": return client ? notificationRows : []
    case "trainer_offers": return offerRows
    case "availability_rules": return client ? [] : [{ id: "r1", trainer_id: T1, weekday: 1, date: null, start_local: "08:00:00", end_local: "10:00:00", slot_minutes: 60 }]
    case "nutrition_plans": return []
    case "trainers": return [trainerRow]
    case "coaching_relationships":
      return [{ trainer_id: T1, client_id: C1, status: "active", goal: "Bli stark", started_at: TODAY, created_at: `${TODAY}T08:00:00Z`, client: { full_name: "Sara Test" } }]
    case "weight_entries": return client ? [] : []
    case "meal_checks": return []
    case "workout_templates": return []
    default: return []
  }
}

const log = []
const read = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)) })

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const cors = {
    "access-control-allow-origin": req.headers.origin ?? "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,PUT,OPTIONS",
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "*",
  }
  const send = (status, body, extra = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...cors, ...extra })
    res.end(body === undefined ? "" : JSON.stringify(body))
  }
  if (req.method === "OPTIONS") return send(204)
  const body = await read(req)

  if (url.pathname === "/__log") return send(200, log)
  if (url.pathname === "/__reset") { log.length = 0; return send(200, {}) }

  // ---- auth
  if (url.pathname === "/auth/v1/token") {
    const p = JSON.parse(body || "{}")
    if (url.searchParams.get("grant_type") === "password") {
      const u = users[p.email]
      if (!u || u.password !== p.password) return send(400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" })
      return send(200, session(u))
    }
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const u = byId[String(p.refresh_token).slice(2)]
      return u ? send(200, session(u)) : send(400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" })
    }
  }
  const auth = req.headers.authorization?.split(" ")[1]
  let uid = null
  try { uid = JSON.parse(Buffer.from(auth.split(".")[1], "base64url")).sub } catch {}
  if (url.pathname === "/auth/v1/user") return uid && byId[uid] ? send(200, userJson(byId[uid])) : send(401, { msg: "invalid JWT" })
  if (url.pathname === "/auth/v1/logout") return send(204)
  // "Glömt lösenordet?" / PT väljer lösenord.
  if (url.pathname === "/auth/v1/recover") {
    log.push({ method: "POST", table: "auth.recover", body: JSON.parse(body || "{}"), query: url.search })
    return send(200, {})
  }
  // Registrering: e-postbekräftelse påslagen → användare utan session.
  if (url.pathname === "/auth/v1/signup") {
    const p = JSON.parse(body || "{}")
    log.push({ method: "POST", table: "auth.signup", body: p, query: url.search })
    return send(200, { id: "88888888-0000-4000-8000-000000000001", aud: "authenticated", email: p.email, user_metadata: p.data ?? {}, identities: [{ id: "i1", provider: "email" }], created_at: new Date().toISOString() })
  }

  // ---- kalenderlänk (v10): calendar_feed anropas av servern utan inloggning, med token som nyckel.
  if (url.pathname === "/rest/v1/rpc/calendar_feed") {
    const p = JSON.parse(body || "{}")
    log.push({ method: "RPC", table: "calendar_feed", body: p })
    if (p.p_token !== FEED_TOKEN) return send(200, [])
    return send(200, [{
      id: EV1, title: "PT-pass", start_time: at(2, 7), end_time: at(2, 8), status: "confirmed", kind: "session", mode: "onsite",
      location: "Gymmet", counterpart: "Elin Test", owner_name: "Sara Test", owner_role: "client", updated_at: new Date().toISOString(),
    }])
  }
  // ---- rest
  const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)$/)
  if (m) {
    if (!uid || !byId[uid]) return send(401, { code: "PGRST301", message: "JWT required" })
    const table = m[2]
    if (m[1] && table === "complete_onboarding") {
      const p = JSON.parse(body || "{}")
      log.push({ method: "RPC", table, body: p })
      if (p.p_role !== "client") return send(403, { code: "42501", message: "PT-konton skapas av Coavira och kan inte registreras i appen" })
      Object.assign(byId[uid].user_metadata, { role: p.p_role, full_name: p.p_full_name, phone: p.p_phone })
      byId[uid].app_metadata.role = p.p_role
      return send(200, null)
    }
    if (m[1] && rpc[table]) { log.push({ method: "RPC", table, body: body ? JSON.parse(body) : null }); return send(200, rpc[table]) }
    if (req.method === "GET") {
      const rows = fixtures(uid, table)
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) return send(200, rows[0])
      return send(200, rows)
    }
    const entry = { method: req.method, table, query: url.search, body: body ? JSON.parse(body) : null, prefer: req.headers.prefer ?? "" }
    // Simulerat RLS-avslag för att testa permanenta fel.
    if (table === "messages" && entry.body?.body === "NEKA") {
      log.push({ ...entry, rejected: true })
      return send(403, { code: "42501", message: 'new row violates row-level security policy for table "messages"', details: null, hint: null })
    }
    log.push(entry)
    return send(req.method === "POST" ? 201 : 204, req.method === "POST" ? [] : undefined)
  }
  if (url.pathname.startsWith("/realtime/")) return send(404, {})
  send(404, { message: `mock: ${req.method} ${url.pathname}` })
}).listen(54321, () => console.log("mock supabase on :54321"))
