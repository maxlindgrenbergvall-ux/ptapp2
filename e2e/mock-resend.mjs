// Mock av Resends REST-API (kontakter och segment) för e2e/v35-supabase.test.mjs.
//   node e2e/mock-resend.mjs   (port 54800; appen: RESEND_API_KEY=re_test RESEND_API_BASE=http://localhost:54800)
// Samma vägar som Resends officiella SDK: /segments, /contacts, /contacts/{email}/segments/{id}.
//   GET /__state  → { segments, contacts, log }   ·   GET /__reset
import http from "node:http"
import crypto from "node:crypto"

let segments = []
let contacts = new Map()
let log = []
function reset() {
  // Som i Coaviras Resend-konto. PT-segmentet med tankstreck och annat skiftläge –
  // appen ska ändå hitta det. "Nyhetsbrev (gammal)" ska aldrig röras.
  segments = [
    { id: "seg_gammal", name: "Nyhetsbrev (gammal)", created_at: new Date().toISOString() },
    { id: "seg_klient", name: "Klient - Nyhetsbrev", created_at: new Date().toISOString() },
    { id: "seg_pt", name: "PT – nyhetsbrev", created_at: new Date().toISOString() },
  ]
  contacts = new Map()
  log = []
}
reset()

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost")
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(body === undefined ? "" : JSON.stringify(body))
  }
  if (url.pathname === "/__reset") return reset(), send(200, {})
  if (url.pathname === "/__state") {
    return send(200, {
      segments,
      log,
      contacts: [...contacts.values()].map((c) => ({ ...c, segments: [...c.segments].map((id) => segments.find((s) => s.id === id)?.name ?? id) })),
    })
  }
  if (req.headers.authorization !== "Bearer re_test") return send(401, { name: "missing_api_key", message: "Missing API key" })
  let body = ""
  for await (const chunk of req) body += chunk
  const json = body ? JSON.parse(body) : {}
  log.push({ method: req.method, path: url.pathname, body: json })
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)

  // /segments
  if (parts[0] === "segments" && parts.length === 1) {
    if (req.method === "GET") return send(200, { object: "list", has_more: false, data: segments })
    if (req.method === "POST") {
      const s = { id: `seg_${crypto.randomUUID().slice(0, 8)}`, name: json.name, created_at: new Date().toISOString() }
      segments.push(s)
      return send(201, { object: "segment", id: s.id, name: s.name })
    }
  }
  // /contacts
  if (parts[0] === "contacts") {
    if (parts.length === 1 && req.method === "POST") {
      if (contacts.has(json.email)) return send(409, { name: "validation_error", message: "Contact already exists" })
      for (const s of json.segments ?? []) if (!segments.some((x) => x.id === s.id)) return send(404, { name: "not_found", message: "Segment not found" })
      contacts.set(json.email, {
        id: crypto.randomUUID(),
        email: json.email,
        first_name: json.first_name ?? null,
        last_name: json.last_name ?? null,
        unsubscribed: Boolean(json.unsubscribed),
        segments: new Set((json.segments ?? []).map((s) => s.id)),
      })
      return send(201, { object: "contact", id: contacts.get(json.email).id })
    }
    const c = contacts.get(parts[1])
    if (parts.length === 2) {
      if (!c) return send(404, { name: "not_found", message: "Contact not found" })
      if (req.method === "GET") return send(200, { object: "contact", ...c, segments: undefined })
      if (req.method === "PATCH") {
        for (const k of ["unsubscribed", "first_name", "last_name"]) if (json[k] !== undefined) c[k] = json[k]
        return send(200, { object: "contact", id: c.id })
      }
      if (req.method === "DELETE") return contacts.delete(parts[1]), send(200, { object: "contact", deleted: true })
    }
    if (parts[2] === "segments" && parts[3]) {
      if (!c) return send(404, { name: "not_found", message: "Contact not found" })
      if (!segments.some((s) => s.id === parts[3])) return send(404, { name: "not_found", message: "Segment not found" })
      if (req.method === "POST") return c.segments.add(parts[3]), send(200, { id: parts[3] })
      if (req.method === "DELETE") return c.segments.has(parts[3]) ? (c.segments.delete(parts[3]), send(200, { id: parts[3], deleted: true })) : send(404, { name: "not_found", message: "Not in segment" })
    }
  }
  send(404, { name: "not_found", message: `${req.method} ${url.pathname}` })
})
server.listen(54800, () => console.log("mock Resend på :54800"))
