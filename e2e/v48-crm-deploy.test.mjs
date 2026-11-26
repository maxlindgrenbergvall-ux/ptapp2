// E2E för v48: CRM:et som egen driftsättning (COAVIRA_DEPLOYMENT=crm).
// Kontrollerar att bara CRM:et finns på adressen och att ingenting av appen läcker ut.
//   COAVIRA_DEPLOYMENT=crm npm run build
//   COAVIRA_DEPLOYMENT=crm CRM_DEMO=1 npm start
//   BASE_URL=http://localhost:3000 node e2e/v48-crm-deploy.test.mjs
const base = process.env.BASE_URL ?? "http://localhost:3000"
const ok = (m) => console.log("ok  ", m)
const check = (c, m, detail) => {
  if (c) ok(m)
  else {
    console.log(`FAIL ${m}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`)
    process.exitCode = 1
  }
}
const get = (path, init) => fetch(base + path, { redirect: "manual", ...init })

const root = await get("/")
check(root.status === 307 && new URL(root.headers.get("location"), base).pathname === "/admin/analytics", "/ leder direkt till statistiken", root.headers.get("location"))

// Appen, PT-portalen, landningssidans undersidor och appens API finns inte här.
for (const path of ["/klient", "/klient/kost", "/pt", "/pt/klienter", "/kom-igang", "/logga-in", "/logga-in/pt", "/registrera", "/valkommen", "/dashboard", "/support", "/integritet", "/villkor", "/ref/ABC123", "/api/food/search?q=mjolk", "/api/checkout", "/api/account/delete", "/sitemap.xml"]) {
  const res = await get(path)
  check(res.status === 404, `${path} finns inte (404)`, res.status)
}

// Det som hör till CRM:et.
check((await get("/admin/leads")).status === 200, "/admin/leads finns")
check((await get("/logga-in/admin")).status === 200, "administratörsinloggningen finns")
check((await get("/avregistrera/00000000-0000-4000-8000-000000000000")).status === 200, "avregistreringssidan finns (länken i mejlen)")
check((await get("/api/crm/unsubscribe?token=x", { method: "POST" })).status === 200, "avregistrering med ett klick finns")
check((await get("/api/resend/webhook", { method: "POST", body: "{}" })).status === 401, "Resend-webhooken finns (och kräver signatur)")
check((await get("/api/crm/queue")).status === 404, "cron-rutten är stängd utan hemlighet")

// Ska aldrig synas i sökmotorer.
const robots = await (await get("/robots.txt")).text()
check(/Disallow: \/\s*$/m.test(robots) && !/Allow:/.test(robots), "robots.txt stänger allt", robots)
check((await get("/admin/leads")).headers.get("x-robots-tag") === "noindex, nofollow", "X-Robots-Tag: noindex på alla sidor")
check((await get("/klient")).headers.get("x-robots-tag") === "noindex, nofollow", "X-Robots-Tag även på 404-svar")

// Säkerhetsheaders från appen gäller också här.
const headers = (await get("/admin/leads")).headers
check(headers.get("x-frame-options") === "DENY" && /frame-ancestors 'none'/.test(headers.get("content-security-policy") ?? ""), "säkerhetsheaders (inga iframes)")
