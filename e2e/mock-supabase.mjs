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
  // v20: klient som raderar sitt konto (Auth admin-API:t och Storage) och ett konto vars data inte går att ladda.
  "radera@test.se": { id: "22222222-0000-4000-8000-00000000dead", email: "radera@test.se", password: "hemligt123", user_metadata: { role: "client", full_name: "Rut Radera" }, app_metadata: { role: "client" } },
  "trasig@test.se": { id: "22222222-0000-4000-8000-00000000beef", email: "trasig@test.se", password: "hemligt123", user_metadata: { role: "client", full_name: "Trasig Data" }, app_metadata: { role: "client" } },
}
const RADERA = users["radera@test.se"]
const TRASIG = "22222222-0000-4000-8000-00000000beef"
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
// v11: tjänster och köp. Sara har köpt 5 pass (3 använda: ett pass + två kalenderpass) men ingen kost.
const S_SINGLE = "99999999-0000-4000-8000-000000000001"
const S_FOOD = "99999999-0000-4000-8000-000000000002"
const CO_PAID = "aaaaaaaa-0000-4000-8000-000000000001"
const CO_NEW = "aaaaaaaa-0000-4000-8000-000000000002"
const serviceRows = [
  { id: S_SINGLE, trainer_id: T1, kind: "single", title: "Enstaka pass", description: "", sessions: 1, includes_nutrition: false, duration_weeks: null, price_sek: 800, active: true },
  { id: S_FOOD, trainer_id: T1, kind: "nutrition", title: "Kostcoaching", description: "Kostschema", sessions: 0, includes_nutrition: true, duration_weeks: 4, price_sek: 1190, active: true },
]
const purchaseRows = [
  { id: "bbbbbbbb-0000-4000-8000-000000000001", checkout_id: CO_PAID, client_id: C1, trainer_id: T1, service_id: null, kind: "package", title: "Program 5 pass", sessions: 5, includes_nutrition: false, price_sek: 3500, status: "paid", created_at: `${TODAY}T08:00:00Z`, paid_at: `${TODAY}T08:01:00Z`, stripe_session_id: "cs_old" },
  { id: "bbbbbbbb-0000-4000-8000-000000000002", checkout_id: CO_NEW, client_id: C1, trainer_id: T1, service_id: S_SINGLE, kind: "single", title: "Enstaka pass", sessions: 1, includes_nutrition: false, price_sek: 800, status: "pending", created_at: `${TODAY}T09:00:00Z`, paid_at: null, stripe_session_id: "cs_test_1" },
]
// v16: varukorg (Sara har en tjänst sparad) och PT Boost (ett obetalt boostköp med Stripe-session).
const cartRows = [{ client_id: C1, service_id: S_SINGLE, trainer_id: T1, added_at: `${TODAY}T07:00:00Z` }]
const BOOST = "cccccccc-0000-4000-8000-000000000001"
const boostRows = [{ id: BOOST, trainer_id: T1, price_sek: 199, duration_days: 7, status: "pending", stripe_session_id: "cs_boost_1", created_at: `${TODAY}T09:00:00Z` }]
// v18: Coavira Plus och inbjudningar. Sara har Plus via en inbjudan hon skickat; Nova är ny (kan lösa in).
const PLUS = "dddddddd-0000-4000-8000-000000000001"
const accounts = {
  [C1]: { referral_code: "SARA7KQ2", coavira_plus_until: null, is_coavira_plus: false, created_at: "2026-01-01T00:00:00Z", referred: false, can_redeem: false },
  [T1]: { referral_code: "ELNA2PT7", coavira_plus_until: null, is_coavira_plus: false, created_at: "2026-01-01T00:00:00Z", referred: false, can_redeem: false },
  [N1]: { referral_code: "NYKUND23", coavira_plus_until: null, is_coavira_plus: false, created_at: new Date().toISOString(), referred: false, can_redeem: true },
}
const account = (uid) => {
  const a = accounts[uid] ?? { referral_code: "XXXXXXXX", coavira_plus_until: null, is_coavira_plus: false, created_at: null, referred: false, can_redeem: false }
  return { ...a, is_plus: a.is_coavira_plus || (a.coavira_plus_until !== null && Date.parse(a.coavira_plus_until) > Date.now()) }
}
const referralRows = [
  { id: "eeeeeeee-0000-4000-8000-000000000001", referrer_id: C1, referred_id: "22222222-0000-4000-8000-000000000009", type: "CLIENT_PLUS", status: "COMPLETED", code: "SARA7KQ2", referrer_rewarded: true, created_at: `${TODAY}T06:00:00Z`, completed_at: `${TODAY}T06:00:00Z` },
]
const plusRows = [{ id: PLUS, user_id: C1, price_sek: 49, days: 30, status: "pending", stripe_session_id: "cs_plus_1", created_at: `${TODAY}T09:00:00Z` }]
// v19: kundursprung per klient hos Elin och Elins koder till befintliga klienter.
const acquisition = { [C1]: "PLATFORM_CLIENT" }
const inviteRows = [
  { id: "ffffffff-0000-4000-8000-000000000001", pt_id: T1, code: "EX-KALLE2", label: "Kalle", is_used: false, used_by: null, used_at: null, expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(), created_at: `${TODAY}T06:00:00Z` },
]
const resetV19 = () => {
  acquisition[C1] = "PLATFORM_CLIENT"
  delete acquisition[N1]
  const kalle = inviteRows.find((i) => i.code === "EX-KALLE2")
  inviteRows.splice(0, inviteRows.length, Object.assign(kalle, { is_used: false, used_by: null, used_at: null }))
}
const plus30 = (from) => new Date(Math.max(Date.now(), from ? Date.parse(from) : 0) + 30 * 86_400_000).toISOString()
const rpc = {
  attach_boost_session: null,
  attach_plus_session: null,
  calendar_feed_token: FEED_TOKEN,
  available_slots: slots,
  next_available_slots: [{ trainer_id: T1, start_time: slots[0].start_time }],
  attach_checkout_session: null,
}
const SERVICE_KEY = "service-test"

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
      return [{ trainer_id: T1, client_id: C1, status: "active", goal: "Bli stark", started_at: TODAY, created_at: `${TODAY}T08:00:00Z`, acquisition_type: acquisition[C1], client: { full_name: "Sara Test" } }]
    case "weight_entries": return client ? [] : []
    case "meal_checks": return []
    case "workout_templates": return []
    case "trainer_services": return serviceRows
    case "purchases": return purchaseRows
    case "recipes": return []
    case "cart_items": return client ? cartRows : []
    case "trainer_boosts": return client ? [] : boostRows
    case "pt_invites": return uid === T1 ? inviteRows : []
    case "referrals": return referralRows.filter((r) => r.referrer_id === uid || r.referred_id === uid)
    case "plus_purchases": return plusRows.filter((r) => r.user_id === uid)
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
  // v18: Plus och inbjudningar som från start, och Nova blir ny igen (ingen roll,
  // kan lösa in en kod) – så att v18-testet kan köras efter supabase-mode och om igen.
  if (url.pathname === "/__reset_v20") {
    users[RADERA.email] = RADERA
    byId[RADERA.id] = RADERA
    return send(200, {})
  }
  if (url.pathname === "/__reset_v18") {
    Object.assign(accounts[C1], { coavira_plus_until: null })
    plusRows[0].status = "pending"
    const nova = users["ny@test.se"]
    nova.user_metadata = { name: "Nova Ny" }
    nova.app_metadata = {}
    Object.assign(accounts[N1], { coavira_plus_until: null, referred: false, can_redeem: true })
    referralRows.splice(1)
    resetV19()
    return send(200, {})
  }

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
  // v20: kontoradering – servern (service role) listar och tar bort filer och raderar användaren.
  if (url.pathname.startsWith("/storage/v1/object/list/")) {
    if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return send(403, { message: "permission denied" })
    const bucket = url.pathname.split("/").pop()
    const p = JSON.parse(body || "{}")
    log.push({ method: "POST", table: `storage.list.${bucket}`, body: p })
    // Profilbilden ligger i en fil, chattbilagorna i en undermapp per meddelande.
    if (bucket === "avatars" && p.prefix === RADERA.id) return send(200, [{ name: "profil.jpg", id: "f1" }])
    if (bucket === "chat-attachments" && p.prefix === RADERA.id) return send(200, [{ name: "msg-1", id: null }])
    if (bucket === "chat-attachments" && p.prefix === `${RADERA.id}/msg-1`) return send(200, [{ name: "bild.png", id: "f2" }])
    return send(200, [])
  }
  if (url.pathname.startsWith("/storage/v1/object/") && req.method === "DELETE") {
    if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return send(403, { message: "permission denied" })
    const p = JSON.parse(body || "{}")
    log.push({ method: "DELETE", table: `storage.remove.${url.pathname.split("/").pop()}`, body: p })
    return send(200, (p.prefixes ?? []).map((name) => ({ name })))
  }
  if (url.pathname.startsWith("/auth/v1/admin/users/") && req.method === "DELETE") {
    if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return send(403, { msg: "not admin" })
    const id = url.pathname.split("/").pop()
    log.push({ method: "DELETE", table: "auth.admin.deleteUser", body: { id } })
    const u = byId[id]
    if (!u) return send(404, { msg: "User not found" })
    delete byId[id]
    delete users[u.email]
    return send(200, {})
  }
  if (url.pathname === "/auth/v1/user") return uid && byId[uid] ? send(200, userJson(byId[uid])) : send(401, { msg: "invalid JWT" })
  if (url.pathname === "/auth/v1/logout") return send(204)
  // v11: bekräftelselänk med token_hash (/auth/confirm → verifyOtp).
  if (url.pathname === "/auth/v1/verify" && req.method === "POST") {
    const p = JSON.parse(body || "{}")
    log.push({ method: "POST", table: "auth.verify", body: p })
    const u = p.token_hash === "th_sara" ? users["sara@test.se"] : p.token_hash === "th_ny" ? users["ny@test.se"] : null
    return u ? send(200, session(u)) : send(403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" })
  }
  // v11: servern (service role) markerar en kassa som betald.
  if (url.pathname === "/rest/v1/rpc/mark_checkout_paid" || url.pathname === "/rest/v1/rpc/mark_checkout_refunded") {
    if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return send(401, { code: "42501", message: "permission denied" })
    log.push({ method: "RPC", table: url.pathname.split("/").pop(), body: JSON.parse(body || "{}") })
    return send(200, 1)
  }
  // v16: servern (service role) markerar en boost som betald / återbetald.
  if (url.pathname === "/rest/v1/rpc/mark_boost_paid" || url.pathname === "/rest/v1/rpc/mark_boost_refunded") {
    if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return send(401, { code: "42501", message: "permission denied" })
    const p = JSON.parse(body || "{}")
    log.push({ method: "RPC", table: url.pathname.split("/").pop(), body: p })
    if (url.pathname.endsWith("refunded")) return send(200, 1)
    if (p.p_amount_sek !== null && p.p_amount_sek !== 199) return send(400, { code: "22023", message: "Beloppet stämmer inte" })
    trainerRow.boosted_until = new Date(Date.now() + 7 * 86_400_000).toISOString()
    boostRows[0].status = "paid"
    return send(200, trainerRow.boosted_until)
  }
  // v18: servern (service role) markerar Coavira Plus som betalt / återbetalt.
  if (url.pathname === "/rest/v1/rpc/mark_plus_paid" || url.pathname === "/rest/v1/rpc/mark_plus_refunded") {
    if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return send(401, { code: "42501", message: "permission denied" })
    const p = JSON.parse(body || "{}")
    log.push({ method: "RPC", table: url.pathname.split("/").pop(), body: p })
    if (url.pathname.endsWith("refunded")) return send(200, 1)
    if (p.p_amount_sek !== null && p.p_amount_sek !== 49) return send(400, { code: "22023", message: "Beloppet stämmer inte" })
    if (plusRows[0].status !== "paid") accounts[C1].coavira_plus_until = plus30(accounts[C1].coavira_plus_until)
    plusRows[0].status = "paid"
    return send(200, accounts[C1].coavira_plus_until)
  }
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
    if (m[1] && table === "create_checkout") {
      const p = JSON.parse(body || "{}")
      log.push({ method: "RPC", table, body: p })
      // v17: antal (enstaka pass). v19: serviceavgift 5 % för befintliga klienter, annars 10 % (som create_checkout).
      const lines = p.p_service_ids.map((id, i) => ({ s: serviceRows.find((x) => x.id === id), qty: p.p_quantities?.[i] ?? 1 })).filter((l) => l.s)
      const subtotal = lines.reduce((a, l) => a + l.s.price_sek * l.qty, 0)
      const pct = acquisition[uid] === "EXISTING_CLIENT" ? 5 : 10
      const fee = Math.floor((subtotal * pct + 50) / 100)
      return send(200, {
        checkout_id: CO_NEW,
        trainer_id: T1,
        acquisition_type: acquisition[uid] ?? "PLATFORM_CLIENT",
        subtotal_sek: subtotal,
        fee_percent: pct,
        service_fee_sek: fee,
        total_sek: subtotal + fee,
        lines: lines.map(({ s: x, qty }) => ({ purchase_id: x.id, title: x.title, kind: x.kind, quantity: qty, unit_price_sek: x.price_sek, price_sek: x.price_sek * qty })),
      })
    }
    if (m[1] && table === "create_boost_checkout") {
      log.push({ method: "RPC", table, body: null })
      if (uid !== T1) return send(403, { code: "42501", message: "Bara PT:er kan boosta sin profil" })
      return send(200, { boost_id: BOOST, trainer_id: T1, price_sek: 199, duration_days: 7, boosted_until: trainerRow.boosted_until ?? null })
    }
    if (m[1] && table === "create_pt_invite") {
      const p = JSON.parse(body || "{}")
      log.push({ method: "RPC", table, body: p })
      if (uid !== T1) return send(403, { code: "42501", message: "Bara verifierade PT:er kan bjuda in klienter" })
      const row = { id: "ffffffff-0000-4000-8000-000000000002", pt_id: T1, code: "EX-NYKD23", label: p.p_label ?? null, is_used: false, used_by: null, used_at: null, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), created_at: new Date().toISOString() }
      inviteRows.unshift(row)
      return send(200, { id: row.id, code: row.code, label: row.label, expires_at: row.expires_at, created_at: row.created_at })
    }
    if (m[1] && table === "redeem_pt_invite") {
      const p = JSON.parse(body || "{}")
      log.push({ method: "RPC", table, body: p })
      if (byId[uid].app_metadata.role !== "client") return send(200, { ok: false, error: "Bara klientkonton kan använda en inbjudningskod från en PT" })
      const inv = inviteRows.find((i) => i.code === p.p_code)
      if (!inv || inv.is_used) return send(200, { ok: false, error: "Koden finns inte eller har redan använts" })
      if (acquisition[uid] === "EXISTING_CLIENT") return send(200, { ok: false, error: "Du är redan kopplad till PT:n som befintlig klient" })
      if (purchaseRows.some((x) => x.client_id === uid && x.status === "paid")) return send(200, { ok: false, error: "Du har redan köpt hos PT:n via Coavira – koden gäller klienter som PT:n hade innan" })
      Object.assign(inv, { is_used: true, used_by: uid, used_at: new Date().toISOString() })
      acquisition[uid] = "EXISTING_CLIENT"
      return send(200, { ok: true, trainer_id: T1, trainer_name: "Elin Test", acquisition_type: "EXISTING_CLIENT" })
    }
    if (m[1] && table === "my_account") { log.push({ method: "RPC", table, body: null }); return send(200, account(uid)) }
    if (m[1] && table === "redeem_referral") {
      const p = JSON.parse(body || "{}")
      log.push({ method: "RPC", table, body: p })
      const mine = accounts[uid]
      const referrer = Object.keys(accounts).find((id) => accounts[id].referral_code === p.p_code)
      if (!referrer) return send(400, { code: "P0002", message: "Inbjudningskoden finns inte" })
      if (referrer === uid) return send(400, { code: "22023", message: "Du kan inte använda din egen kod" })
      if (!mine?.can_redeem) return send(400, { code: "22023", message: "Du har redan använt en inbjudningskod" })
      const role = byId[uid].app_metadata.role
      if (role !== byId[referrer].app_metadata.role) return send(400, { code: "22023", message: "Koden gäller inte för din kontotyp" })
      mine.can_redeem = false
      mine.referred = true
      mine.coavira_plus_until = plus30(mine.coavira_plus_until)
      accounts[referrer].coavira_plus_until = plus30(accounts[referrer].coavira_plus_until)
      const row = { id: "eeeeeeee-0000-4000-8000-000000000002", referrer_id: referrer, referred_id: uid, type: "CLIENT_PLUS", status: "COMPLETED", code: p.p_code, referrer_rewarded: true, created_at: new Date().toISOString(), completed_at: new Date().toISOString() }
      referralRows.push(row)
      return send(200, { id: row.id, type: row.type, status: row.status, coavira_plus_until: mine.coavira_plus_until })
    }
    if (m[1] && table === "create_plus_checkout") {
      log.push({ method: "RPC", table, body: null })
      if (byId[uid].app_metadata.role !== "client") return send(403, { code: "42501", message: "Coavira Plus är för klientkonton" })
      return send(200, { purchase_id: PLUS, user_id: uid, price_sek: 49, days: 30 })
    }
    if (m[1] && table in rpc) { log.push({ method: "RPC", table, body: body ? JSON.parse(body) : null }); return send(200, rpc[table]) }
    // v20: ett konto vars data inte går att läsa – appen ska visa ett felmeddelande, inte en blank sida.
    if (uid === TRASIG && table === "profiles") return send(403, { code: "42501", message: "permission denied for table profiles" })
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
