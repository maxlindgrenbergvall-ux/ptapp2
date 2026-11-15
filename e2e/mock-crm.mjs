// Testserver för CRM:et (v47) på :54810 – spelar tre roller, så att testerna aldrig når internet:
//   1. Publika webbplatser. Appen skickar ALLA hämtningar hit när CRM_FETCH_MOCK_ORIGIN är satt,
//      med den riktiga adressen i rubriken x-original-url.
//   2. Resend (POST /emails). Skickade mejl kan läsas på GET /__sent.
//   3. Brave Search API (GET /res/v1/web/search).
//   node e2e/mock-crm.mjs
import http from "node:http"

const PAGES = {
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
    if (req.url === "/__sent") return send(200, "application/json", JSON.stringify(sent))
    if (req.url === "/__fetched") return send(200, "application/json", JSON.stringify(fetched))
    if (req.url?.startsWith("/res/v1/web/search")) {
      if (req.headers["x-subscription-token"] !== "test-key") return send(401, "application/json", "{}")
      const q = new URL(req.url, "http://x").searchParams.get("q") ?? ""
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
