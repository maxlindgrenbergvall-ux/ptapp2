// Testserver för CRM:et (v47, v49) på :54810 – spelar fyra roller, så att testerna aldrig når internet:
//   1. Publika webbplatser. Appen skickar ALLA hämtningar hit när CRM_FETCH_MOCK_ORIGIN är satt,
//      med den riktiga adressen i rubriken x-original-url.
//   2. Resend (POST /emails). Skickade mejl kan läsas på GET /__sent.
//   3. Brave Search API (GET /res/v1/web/search).
//   4. Apify (v49): starta en körning av apify~instagram-scraper, läs status och dataset.
//      Körningen är klar vid andra statusfrågan (så att avläsningen i appen prövas).
//   node e2e/mock-crm.mjs
import http from "node:http"

// v54: giltiga (påhittade) organisationsnummer – kontrollsiffran räknas fram.
const luhn = (nine) => {
  for (let d = 0; d <= 9; d++) {
    const n = `${nine}${d}`
    let sum = 0
    for (let i = 0; i < 10; i++) {
      let x = Number(n[i]) * (i % 2 === 0 ? 2 : 1)
      if (x > 9) x -= 9
      sum += x
    }
    if (sum % 10 === 0) return `${nine.slice(0, 6)}-${nine.slice(6)}${d}`
  }
}
const ORG_SODERBERG = luhn("559123456") // på webbplatsen
const ORG_LARSSON = luhn("559876543") // i registrets utdrag (sökningen)
const ORG_DEAD = luhn("556111222") // avregistrerat hos Bolagsverket
const PNR_PER = luhn("790315123") // personnummer (enskild firma) – sparas aldrig

const PAGES = {
  // v54: berikningsmotorn
  "https://soderbergtraning.se/": `<html><head><title>Söderberg Träning</title></head><body><h1>Personlig träning i Göteborg</h1><footer>Söderberg Träning AB · Org.nr ${ORG_SODERBERG}</footer></body></html>`,
  "https://lindtraning.se/": `<html><body><h1>Lind Träning</h1><p>Org.nr ${ORG_LARSSON}</p></body></html>`,
  "https://enskildpt.se/": `<html><head><title>Emma PT</title></head><body><h1>Emma Eriksson – personlig tränare</h1><p>Jag driver min verksamhet som enskild firma med F-skatt.</p></body></html>`,
  "https://elinpt.se/": `<!doctype html><html><head><title>Elin Söderberg – Personlig tränare i Göteborg</title>
<meta name="description" content="Certifierad PT i Göteborg. Styrketräning och viktnedgång."></head><body>
<h1>Träna med Elin</h1><p>Personlig tränare med fokus på styrka.</p><a href="/kontakt">Kontakt</a>
<a href="https://www.instagram.com/elin.pt/">Instagram</a></body></html>`,
  "https://elinpt.se/kontakt": `<html><head><title>Kontakt – Elin Söderberg</title></head><body><p>Mejla <a href="mailto:elin@elinpt.se">elin@elinpt.se</a> eller ring 070-123 45 67.</p></body></html>`,
  "https://linktr.ee/viktorcoach": `<html><head><title>@viktorcoach | Linktree</title><meta property="og:description" content="Online coach. Hyrox och löpning."></head><body>
<a href="https://www.instagram.com/viktorcoach">IG</a><a href="https://viktorcoaching.se">Program</a><a href="mailto:hej@viktorcoaching.se">Mejla</a></body></html>`,
  "https://hemlig.se/": `<html><body><a href="mailto:dold@hemlig.se">x</a></body></html>`,
  "https://omdirigerad.se/": { redirect: "http://169.254.169.254/latest/meta-data/" },
  "https://bild.se/": { type: "image/png", body: "PNG" },
}
const ROBOTS = { "hemlig.se": "User-agent: *\nDisallow: /\n", "elinpt.se": "User-agent: *\nDisallow: /admin\n" }
const IG = {
  "elin.pt": { username: "elin.pt", fullName: "Elin Söderberg", biography: "Personlig tränare i Göteborg. Styrka & viktnedgång.", externalUrl: "https://elinpt.se/", followersCount: 3200, businessCategoryName: "Personal Trainer", isBusinessAccount: true, private: false, relatedProfiles: [{ username: "jonas.pt" }, { username: "kennelklubben" }] },
  // v50: blandat urval – bara elin.pt, jonas.pt och karin.coach ska bli leads.
  "jonas.pt": { username: "jonas.pt", fullName: "Jonas Ek", biography: "PT i Stockholm 🏋️ Styrka och rehab. Boka: jonas.ek@gmail.com", followersCount: 1800, businessCategoryName: "Personal Trainer", private: false },
  kennelklubben: { username: "kennelklubben", fullName: "Kennel Guldklimpen", biography: "Kennelklubb – golden retriever. Valpar och träning för hundar. Coach för valpägare.", followersCount: 5200, private: false },
  "malin.pt": { username: "malin.pt", fullName: "Malin Persson", biography: "Personlig tränare i Malmö. Boka: info@infopt.se", followersCount: 2400, private: false },
  "us.coach": { username: "us.coach", fullName: "Mike Johnson", biography: "Online fitness coach based in Los Angeles. DM for coaching. mike@mikecoach.com", businessCategoryName: "Fitness Trainer", followersCount: 90000, private: false },
  "karin.coach": { username: "karin.coach", fullName: "Karin Ek", biography: "Online coach 💪 karin@karincoach.se", followersCount: 41000, businessCategoryName: "Coach", private: false },
  hemlig: { username: "hemlig", fullName: "", biography: "", private: true },
  bageriet: { username: "bageriet", fullName: "Bageriet", biography: "Surdeg varje dag", followersCount: 900, private: false },
}
const runs = new Map()
const lookups = []
const sent = []
const fetched = []

http
  .createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks).toString("utf8")
    const send = (status, type, text, headers = {}) => {
      res.writeHead(status, { "Content-Type": type, ...headers })
      res.end(text)
    }
    const original = req.headers["x-original-url"]
    if (original) {
      const url = new URL(original)
      fetched.push({ url: original, ua: req.headers["user-agent"] })
      if (url.pathname === "/robots.txt") return ROBOTS[url.hostname] ? send(200, "text/plain", ROBOTS[url.hostname]) : send(404, "text/plain", "")
      const page = PAGES[original] ?? PAGES[original.replace(/\/$/, "")]
      if (!page) return send(404, "text/html", "<h1>404</h1>")
      if (typeof page === "string") return send(200, "text/html; charset=utf-8", page)
      if (page.redirect) return send(302, "text/html", "", { Location: page.redirect })
      return send(200, page.type, page.body)
    }
    if (req.method === "POST" && req.url === "/emails") {
      const mail = JSON.parse(body)
      const key = req.headers["idempotency-key"]
      const prior = sent.find((m) => m.key === key)
      if (prior) return send(200, "application/json", JSON.stringify({ id: prior.id }))
      const id = `mock-${sent.length + 1}`
      sent.push({ id, key, ...mail })
      return send(200, "application/json", JSON.stringify({ id }))
    }
    if (req.url?.startsWith("/v2/")) {
      if (req.headers.authorization !== "Bearer apify-test-token") return send(401, "application/json", JSON.stringify({ error: { message: "Unauthorized" } }))
      const u = new URL(req.url, "http://x")
      if (req.method === "POST" && u.pathname === "/v2/acts/apify~instagram-scraper/runs") {
        const id = `run${runs.size + 1}abcdef`
        runs.set(id, { input: JSON.parse(body), polls: 0, maxItems: Number(u.searchParams.get("maxItems")) })
        return send(201, "application/json", JSON.stringify({ data: { id, status: "READY", defaultDatasetId: `ds-${id}` } }))
      }
      const run = /^\/v2\/actor-runs\/([A-Za-z0-9]+)$/.exec(u.pathname)
      if (run && runs.has(run[1])) {
        const r = runs.get(run[1])
        r.polls++
        return send(200, "application/json", JSON.stringify({ data: { id: run[1], status: r.polls >= 2 ? "SUCCEEDED" : "RUNNING", defaultDatasetId: `ds-${run[1]}` } }))
      }
      const ds = /^\/v2\/datasets\/ds-([A-Za-z0-9]+)\/items$/.exec(u.pathname)
      if (ds && runs.has(ds[1])) {
        const { input } = runs.get(ds[1])
        if (input.resultsType === "posts") {
          const tag = decodeURIComponent(/explore\/tags\/([^/]+)\//.exec(input.directUrls[0])?.[1] ?? "")
          const owners = { ptsverige: ["kennelklubben", "malin.pt", "us.coach", "elin.pt", "hemlig", "bageriet"], onlinecoach: ["karin.coach", "us.coach"] }[tag] ?? ["elin.pt", "karin.coach", "elin.pt", "bageriet"]
          return send(200, "application/json", JSON.stringify(owners.map((ownerUsername) => ({ ownerUsername }))))
        }
        const items = input.directUrls.map((url) => {
          const handle = /instagram\.com\/([^/]+)\//.exec(url)?.[1]
          return IG[handle] ?? { error: "not_found", errorDescription: "Profilen finns inte", url }
        })
        return send(200, "application/json", JSON.stringify(items))
      }
      return send(404, "application/json", JSON.stringify({ error: { message: "Not found" } }))
    }
    if (req.url === "/__runs") return send(200, "application/json", JSON.stringify([...runs.entries()]))
    if (req.url === "/__sent") return send(200, "application/json", JSON.stringify(sent))
    if (req.url === "/__fetched") return send(200, "application/json", JSON.stringify(fetched))
    // v54: Bolagsverket (värdefulla datamängder) – inloggning och uppslag på organisationsnummer.
    if (req.method === "POST" && req.url === "/oauth2/token") {
      if (!/client_id=bv-test&client_secret=bv-secret/.test(body)) return send(401, "application/json", JSON.stringify({ error: "invalid_client" }))
      return send(200, "application/json", JSON.stringify({ access_token: "bv-token", expires_in: 3600 }))
    }
    if (req.method === "POST" && req.url === "/vardefulla-datamangder/v1/organisationer") {
      if (req.headers.authorization !== "Bearer bv-token") return send(401, "application/json", "{}")
      const id = String(JSON.parse(body || "{}").identitetsbeteckning ?? "")
      lookups.push(id)
      const fmt = `${id.slice(0, 6)}-${id.slice(6)}`
      if (fmt === ORG_LARSSON || fmt === ORG_SODERBERG) return send(200, "application/json", JSON.stringify({ organisationer: [{ identitet: { identitetsbeteckning: id }, organisationsform: { kod: "AB", klartext: "Aktiebolag" }, organisationsnamn: { namn: fmt === ORG_LARSSON ? "Larsson Hälsa AB" : "Söderberg Träning AB" }, avregistreringsdatum: null }] }))
      if (fmt === ORG_DEAD) return send(200, "application/json", JSON.stringify({ organisationer: [{ organisationsform: { kod: "AB", klartext: "Aktiebolag" }, avregistreringsdatum: "2023-06-30" }] }))
      return send(404, "application/json", "{}")
    }
    if (req.url === "/__bv") return send(200, "application/json", JSON.stringify(lookups))
    if (req.url?.startsWith("/res/v1/web/search")) {
      if (req.headers["x-subscription-token"] !== "test-key") return send(401, "application/json", "{}")
      const q = new URL(req.url, "http://x").searchParams.get("q") ?? ""
      // v54: registersökningar från berikningsmotorn – företagsregistrens egna utdrag.
      if (/organisationsnummer/.test(q)) {
        const results = []
        if (/Lisa Larsson/.test(q)) results.push({ title: "Lisa Larsson – Larsson Hälsa AB", url: "https://www.allabolag.se/5598765437/larsson-halsa-ab", description: `Styrelseledamot: Lisa Larsson, Uppsala. Larsson Hälsa AB, org.nr ${ORG_LARSSON}.` })
        if (/Lisa Larsson/.test(q)) results.push({ title: "Lisa Larsson Bergström", url: "https://www.merinfo.se/x", description: `Annan person i Kiruna, org.nr ${ORG_DEAD}.` })
        if (/Per Persson/.test(q)) results.push({ title: "Per Persson, Malmö – enskild firma", url: "https://www.merinfo.se/foretag/per-persson", description: `Per Persson PT, enskild firma i Malmö. Org.nr ${PNR_PER}.` })
        if (/Gustav Gammal/.test(q)) results.push({ title: "Gustav Gammal – Gammal Träning AB", url: "https://www.allabolag.se/gammal", description: `Gustav Gammal, Lund. Gammal Träning AB (${ORG_DEAD}).` })
        return send(200, "application/json", JSON.stringify({ query: q, web: { results } }))
      }
      return send(
        200,
        "application/json",
        JSON.stringify({
          query: q,
          web: {
            results: [
              { title: "Elin Söderberg – <strong>Personlig tränare</strong> i Göteborg", url: "https://elinpt.se/", description: "Certifierad PT i Göteborg." },
              { title: "Viktor (@viktorcoach)", url: "https://www.instagram.com/viktorcoach/", description: "Online coach" },
              { title: "PT Göteborg – hitta.se", url: "https://www.hitta.se/pt-goteborg", description: "Katalog" },
            ],
          },
        })
      )
    }
    send(404, "text/plain", "okänd väg")
  })
  .listen(54810, () => console.log("mock CRM (webbplatser, Resend, sök) på :54810"))
