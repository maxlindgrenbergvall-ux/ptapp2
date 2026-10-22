// Domänuppdelningen mot en körande server: coavira.fit = landningssidan, ptapp2.vercel.app = appen.
// Skickar riktiga Host-huvuden till samma server (som Vercel gör för båda domänerna).
//   BASE_URL=http://localhost:3000 node e2e/host-split.test.mjs
// I Supabase-läge (e2e/mock-supabase.mjs körs) testas även inloggning i webbläsaren på appens domän.
import http from "node:http"
import { chromium } from "playwright"

const base = new URL(process.env.BASE_URL ?? "http://localhost:3000")
let failed = 0
const check = (cond, msg) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}

/** GET utan att följa omdirigeringar. */
function get(host, path, { ua = "Mozilla/5.0 (iPhone)", method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: base.hostname, port: base.port, path, method, headers: { host, "user-agent": ua } }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location ?? "", robots: res.headers["x-robots-tag"] ?? "", body }))
    })
    req.on("error", reject)
    req.end()
  })
}
const isRedirect = (s) => s >= 300 && s < 400
const pathOf = (loc) => {
  const u = new URL(loc, "http://x")
  return `${u.host === "x" ? "" : u.host}${u.pathname}${u.search}`
}

// coavira.fit: bara landningssidan
for (const host of ["coavira.fit", "www.coavira.fit"]) {
  const r = await get(host, "/")
  check(r.status === 200 && r.body.includes('data-store="ios"') && r.body.includes("hero-title"), `${host}/ visar landningssidan (${r.status})`)
  check(!/noindex/.test(r.robots), `${host}/ får indexeras`)
}
for (const p of ["/support", "/integritet", "/villkor", "/robots.txt", "/sitemap.xml"]) {
  const r = await get("coavira.fit", p)
  check(r.status === 200, `coavira.fit${p} → 200 (${r.status})`)
}
for (const [p, to] of [
  ["/kom-igang", "ptapp2.vercel.app/kom-igang"],
  ["/logga-in", "ptapp2.vercel.app/logga-in"],
  ["/klient/kalender?vecka=2", "ptapp2.vercel.app/klient/kalender?vecka=2"],
  ["/pt", "ptapp2.vercel.app/pt"],
  ["/auth/callback?code=abc&next=%2Fklient", "ptapp2.vercel.app/auth/callback?code=abc&next=%2Fklient"],
  ["/?code=abc", "ptapp2.vercel.app/?code=abc"],
]) {
  const r = await get("coavira.fit", p)
  check(isRedirect(r.status) && pathOf(r.location) === to, `coavira.fit${p} → ${to} (${r.status} ${r.location})`)
}
{
  const r = await get("coavira.fit", "/api/calendar/feed/finnsinte.ics")
  check(!isRedirect(r.status), `coavira.fit/api/* omdirigeras inte (${r.status})`)
  // 404 utan ANDROID_APP_SHA256 – det viktiga är att filen inte omdirigeras.
  const w = await get("coavira.fit", "/.well-known/assetlinks.json")
  check(!isRedirect(w.status), `coavira.fit/.well-known omdirigeras inte (${w.status})`)
}
{
  // Äldre app-byggen som laddar coavira.fit fungerar som förut.
  const ua = "Mozilla/5.0 (iPhone) CoaviraApp"
  const r = await get("coavira.fit", "/", { ua })
  check(isRedirect(r.status) && pathOf(r.location).endsWith("/kom-igang"), `mobilappen på coavira.fit: / → /kom-igang (${r.location})`)
  check(!pathOf(r.location).startsWith("ptapp2.vercel.app"), "mobilappen stannar på samma domän")
  const k = await get("coavira.fit", "/kom-igang", { ua })
  check(k.status === 200, `mobilappen på coavira.fit: /kom-igang → 200 (${k.status})`)
}

// ptapp2.vercel.app: appen
{
  const r = await get("ptapp2.vercel.app", "/")
  check(isRedirect(r.status) && pathOf(r.location).replace(/^ptapp2\.vercel\.app/, "") === "/kom-igang", `ptapp2.vercel.app/ → /kom-igang (${r.status} ${r.location})`)
  const k = await get("ptapp2.vercel.app", "/kom-igang")
  check(k.status === 200 && !k.body.includes("hero-title"), `ptapp2.vercel.app/kom-igang visar appens inloggning (${k.status})`)
  check(/noindex/.test(k.robots), `appens domän indexeras inte (X-Robots-Tag: ${k.robots})`)
  for (const p of ["/logga-in", "/integritet", "/support"]) {
    const x = await get("ptapp2.vercel.app", p)
    check(x.status === 200, `ptapp2.vercel.app${p} → 200 (${x.status})`)
  }
}

// Övriga värdar (localhost, förhandsversioner): båda delarna fungerar.
{
  const r = await get(base.host, "/")
  check(r.status === 200 && r.body.includes("hero-title"), `${base.host}/ visar landningssidan`)
  const k = await get(base.host, "/kom-igang")
  check(k.status === 200, `${base.host}/kom-igang visar appen`)
}

// Supabase-läge: inloggning på appens domän (webbläsaren når båda namnen via den lokala servern).
const mock = "http://localhost:54321"
if (await fetch(`${mock}/__reset`).then((r) => r.ok).catch(() => false)) {
  const target = `${base.hostname === "localhost" ? "127.0.0.1" : base.hostname}:${base.port}`
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: [`--host-resolver-rules=MAP ptapp2.vercel.app ${target}, MAP coavira.fit ${target}`],
  })
  const p = await (await browser.newContext()).newPage()
  await p.goto("http://ptapp2.vercel.app/")
  check(new URL(p.url()).pathname === "/kom-igang", `utloggad på appens domän: / → /kom-igang (${p.url()})`)
  await p.goto("http://ptapp2.vercel.app/logga-in")
  await p.fill("#email", "sara@test.se")
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL("http://ptapp2.vercel.app/klient", { timeout: 20000 }).catch(() => {})
  check(p.url() === "http://ptapp2.vercel.app/klient", `inloggning på appens domän fungerar (${p.url()})`)
  await p.goto("http://ptapp2.vercel.app/")
  check(p.url() === "http://ptapp2.vercel.app/klient", `inloggad på appens domän: / → startsidan i appen (${p.url()})`)
  await p.goto("http://coavira.fit/")
  check(p.url() === "http://coavira.fit/" && (await p.locator("main [data-store=ios]").first().isVisible()), "coavira.fit visar landningssidan även för en inloggad användare")
  await browser.close()
}

if (failed) {
  console.log(`${failed} FEL`)
  process.exit(1)
}
console.log("DOMÄNUPPDELNINGEN GODKÄND")
