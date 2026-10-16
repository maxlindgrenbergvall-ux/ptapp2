// E2E i Supabase-läge mot e2e/mock-supabase.mjs: inloggning, routeskydd,
// offlinekön (nätet stängs av mitt i ett pass) och utloggning.
//   node e2e/mock-supabase.mjs &
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npm run build
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npm start
//   BASE_URL=http://localhost:3000 node e2e/supabase-mode.test.mjs
import { chromium } from "playwright"
const out = process.argv[2] ?? "e2e/screenshots"
await import("node:fs").then((fs) => fs.mkdirSync(out, { recursive: true }))
const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => { console.log("FAIL", m); process.exitCode = 1 }
const check = (cond, m) => (cond ? ok(m) : fail(m))
const getLog = async () => (await fetch(`${mock}/__log`)).json()
await fetch(`${mock}/__reset`)

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))

// 1. Skyddad route → inloggning
await p.goto(`${base}/klient`)
check(p.url().startsWith(`${base}/logga-in?next=%2Fklient`), "oinloggad skickas till /logga-in")

// 2. Fel lösenord
await p.fill("#email", "sara@test.se"); await p.fill("#password", "fel")
await p.click('button[type=submit]')
await p.waitForSelector("text=Fel e-post eller lösenord.")
ok("fel lösenord ger svenskt felmeddelande")

// 3. Rätt lösenord → /klient
await p.fill("#password", "hemligt123"); await p.click('button[type=submit]')
await p.waitForURL(`${base}/klient`); await p.waitForSelector("text=Testpass")
ok("klient loggar in och ser dagens pass från Supabase")

// 4. Klient kan inte gå till PT-panelen
await p.goto(`${base}/pt`); await p.waitForURL(`${base}/klient`)
ok("klient som går till /pt skickas till /klient")

// 5. Offline mitt i passet
await p.click("text=Starta passet"); await p.waitForSelector("text=Avsluta")
await p.click('button[aria-label="Bocka av set 1"]')
await p.waitForFunction(() => !document.body.innerText.includes("Synkar"))
let log = await getLog()
check(log.some((e) => e.table === "set_logs" && e.method === "POST"), "online: set 1 skickas direkt")
check(log.findIndex((e) => e.table === "scheduled_workouts") < log.findIndex((e) => e.table === "set_logs"), "status 'in_progress' skickas före första setet")

await ctx.setOffline(true)
await p.click('button[aria-label="Bocka av set 2"]')
await p.click('button[aria-label="Bocka av set 3"]')
await p.waitForSelector("text=/Offline – 2 ändringar sparade lokalt/")
ok("offline: indikatorn visar 2 köade ändringar")
await p.screenshot({ path: `${out}/sb-offline.png` })
const queued = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("coavira:outbox")).map((k) => JSON.parse(localStorage[k]).length))
check(queued[0] === 2, `offline: kön ligger i localStorage (${queued})`)
check((await getLog()).filter((e) => e.table === "set_logs").length === 1, "offline: inget skickat medan nätet är nere")

await ctx.setOffline(false)
const t0 = Date.now()
await p.waitForFunction(
  () => Object.keys(localStorage).filter((k) => k.startsWith("coavira:outbox")).every((k) => JSON.parse(localStorage[k]).length === 0),
  null,
  { timeout: 20000 }
)
console.log("     (kön tömd", Date.now() - t0, "ms efter att nätet kom tillbaka)")
log = await getLog()
const sets = log.filter((e) => e.table === "set_logs").map((e) => e.body.set_index)
check(JSON.stringify(sets) === "[0,1,2]", `online igen: köade set skickas i ordning (${sets})`)
const queuedAfter = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("coavira:outbox")).map((k) => JSON.parse(localStorage[k]).length))
check(queuedAfter[0] === 0, "kön är tom efter synk")

// 6. Avsluta passet med kommentar
await p.click("text=Avsluta"); await p.click("text=Lagom tungt"); await p.click("text=Spara pass")
await p.waitForURL(`${base}/klient`)
await p.waitForTimeout(500)
log = await getLog()
check(log.some((e) => e.table === "scheduled_workouts" && e.body?.status === "completed" && e.body?.client_comment === "Lagom tungt"), "avslutat pass sparas med kommentar")
check(log.some((e) => e.table === "messages" && e.body?.workout_id), "kommentaren skickas som meddelande kopplat till passet")

// 7. Permanent fel (RLS-avslag) blockerar inte kön
await p.goto(`${base}/klient/chatt`); await p.waitForSelector('textarea[aria-label="Meddelande"]')
await p.fill('textarea[aria-label="Meddelande"]', "NEKA"); await p.keyboard.press("Enter")
await p.fill('textarea[aria-label="Meddelande"]', "Hej igen"); await p.keyboard.press("Enter")
await p.waitForSelector("text=En ändring kunde inte sparas")
await p.waitForTimeout(800)
log = await getLog()
check(log.some((e) => e.rejected) && log.some((e) => e.body?.body === "Hej igen"), "avvisad ändring släpps och nästa skickas ändå")
await p.screenshot({ path: `${out}/sb-rejected.png` })

// 8. Kalender: bekräftat pass från databasen och bokningsförfrågan från RPC-tider
await p.goto(`${base}/klient/kalender`); await p.waitForSelector("text=PT-pass")
check(await p.locator("text=Bekräftat").first().isVisible(), "klientkalendern visar bekräftat pass från Supabase")
await p.goto(`${base}/klient/hitta/11111111-0000-4000-8000-000000000001`)
await p.click('button:has-text("Boka")'); await p.waitForSelector("text=Välj en ledig tid")
await p.locator('[role=dialog] [role=grid] button:not([disabled])').first().click()
await p.locator('[role=dialog] [role=radiogroup][aria-label="Välj tid"] button').first().click()
await p.click('button:has-text("Skicka bokningsförfrågan")'); await p.waitForSelector("text=Förfrågan skickad")
await p.waitForTimeout(800)
log = await getLog()
check(log.some((e) => e.method === "RPC" && e.table === "available_slots"), "lediga tider hämtas via available_slots")
const req = log.find((e) => e.table === "calendar_events" && e.method === "POST")
// status sätts inte av klienten – databasen ger 'pending' som standard och RLS tillåter inget annat.
check(req && req.body.status === undefined && req.body.client_id === "22222222-0000-4000-8000-000000000001", "bokningsförfrågan sparas som pending i calendar_events")
await p.click('a:has-text("Visa mina pass")')
await p.waitForSelector("text=Väntar på bekräftelse från PT")
ok("förfrågan visas som väntande i klientkalendern")

// 8b. Aviseringar från databasen och ombokningsflödet (v5)
await p.goto(`${base}/klient/kalender`); await p.waitForSelector("text=Ny tid – ditt svar behövs")
// 1 oläst avisering + 1 erbjudande (klienten öppnade PT:ns profil ovan → intresse för styrkelyft).
const bellLabel = await p.locator('button[aria-label^="Aviseringar"]').getAttribute("aria-label")
check(bellLabel === "Aviseringar, 2 nya", `olästa aviseringar och matchande erbjudanden laddas från databasen (${bellLabel})`)
await p.click('button[aria-label^="Aviseringar"]'); await p.waitForSelector("text=Elin har flyttat ditt pass")
check(await p.locator("[data-slot=popover-content] >> text=Teknikpaket").isVisible(), "erbjudande från trainer_offers visas utifrån intresse")
await p.waitForTimeout(250)
await p.keyboard.press("Escape")
await p.locator("li", { hasText: "Ny tid – ditt svar behövs" }).locator('button:has-text("Acceptera tiden")').click()
await p.waitForSelector("text=Tiden är accepterad")
await p.waitForTimeout(800)
log = await getLog()
check(log.some((e) => e.table === "notifications" && e.method === "PATCH" && e.body?.read_at && e.query.includes("55555555")), "lästa aviseringar sparas (bara read_at)")
check(log.some((e) => e.table === "calendar_events" && e.method === "PATCH" && e.body?.status === "confirmed" && e.query.includes("44444444-0000-4000-8000-000000000002")), "klienten accepterar PT:ns nya tid (status confirmed)")

// 9. Logga ut rensar lokal data
await p.goto(`${base}/klient`); await p.waitForSelector("text=Testpass")
await p.waitForTimeout(1200) // cachen skrivs avstudsat
check(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("coavira:cache"))), "offlinecache finns när man är inloggad")
await p.click('button[aria-label="Logga ut"]')
await p.waitForURL(/\/logga-in/)
check(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("coavira:")))), "utloggning rensar cache och kö")
await p.goto(`${base}/klient`)
check(p.url().includes("/logga-in"), "efter utloggning är /klient skyddad igen")

// 10. PT
await p.fill("#email", "elin@test.se"); await p.fill("#password", "hemligt123"); await p.click('button[type=submit]')
await p.waitForURL(`${base}/pt`); await p.waitForSelector("text=Sara Test")
ok("PT loggar in och ser sin klient")
await p.goto(`${base}/pt/kalender`); await p.waitForSelector("text=Väntande förfrågningar")
await p.click('[role=tab]:has-text("Månad")')
const evDay = new Date(Date.now() + 2 * 86400e3)
if (evDay.getMonth() !== new Date().getMonth()) await p.click('button[aria-label="Nästa"]')
await p.waitForSelector('button[title*="Sara Test"] >> visible=true')
ok("PT-kalendern visar passet från Supabase")
await p.goto(`${base}/klient`); await p.waitForURL(`${base}/pt`)
ok("PT som går till /klient skickas till /pt")
await p.goto(`${base}/logga-in`); await p.waitForURL(`${base}/pt`)
ok("inloggad som besöker /logga-in skickas hem")

// 11. v6: startsidan är inloggning/registrering (inget PT/klient-val), Apple/Google, registrering och välkomststeget
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } })
const q = await c2.newPage()
q.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await q.goto(`${base}/`)
for (const label of ["Fortsätt med Apple", "Fortsätt med Google", "Registrera dig", "Logga in"]) {
  check(await q.locator(`text=${label}`).first().isVisible(), `startsidan har "${label}"`)
}
check((await q.locator("text=Jag är PT").count()) === 0, "startsidan har inget PT/klient-val")
await q.screenshot({ path: `${out}/sb-start.png` })

// OAuth: webbläsaren skickas till Supabase /authorize med rätt leverantör och retur-URL.
const oauth = []
await q.route(`${mock}/auth/v1/authorize**`, (route) => {
  oauth.push(new URL(route.request().url()))
  return route.fulfill({ status: 200, contentType: "text/html", body: "<p>leverantör</p>" })
})
for (const provider of ["google", "apple"]) {
  await q.goto(`${base}/`)
  await q.click(`text=Fortsätt med ${provider === "google" ? "Google" : "Apple"}`)
  await q.waitForURL(/\/auth\/v1\/authorize/)
  const u = oauth.at(-1)
  check(u.searchParams.get("provider") === provider, `"Fortsätt med ${provider}" startar OAuth hos Supabase`)
  check(decodeURIComponent(u.searchParams.get("redirect_to") ?? "").includes("/auth/callback?next=/valkommen"), `${provider}: tillbaka via /auth/callback till välkomststeget`)
  check(u.searchParams.has("code_challenge"), `${provider}: PKCE används`)
}

// Registrering: e-post + telefon + lösenord skickas till Supabase Auth.
await q.goto(`${base}/registrera`)
await q.fill("#email", "ny.kund@test.se"); await q.fill("#phone", "123"); await q.fill("#password", "hemligt123")
await q.click('button[type=submit]')
await q.waitForSelector("text=Ange ett giltigt telefonnummer")
ok("ogiltigt telefonnummer stoppas i formuläret")
await q.fill("#phone", "070-123 45 67")
await q.click('button[type=submit]')
await q.waitForSelector("text=Kolla din e-post")
log = await getLog()
const signup = log.find((e) => e.table === "auth.signup")
check(signup?.body.email === "ny.kund@test.se" && signup.body.password === "hemligt123", "registreringen skickar e-post och lösenord till Supabase Auth")
check(signup?.body.data?.phone === "+46701234567", `telefonnumret skickas normaliserat (${signup?.body.data?.phone})`)
check(!("role" in (signup?.body.data ?? {})), "ingen kontotyp väljs vid registreringen")
check(decodeURIComponent(signup?.query ?? "").includes("/auth/callback?next=/valkommen"), "bekräftelselänken leder till välkomststeget")

// Konto utan kontotyp → välkomststeget.
await q.goto(`${base}/logga-in`)
await q.fill("#email", "ny@test.se"); await q.fill("#password", "hemligt123"); await q.click('button[type=submit]')
await q.waitForURL(`${base}/valkommen`)
ok("inloggat konto utan kontotyp hamnar i välkomststeget")
await q.goto(`${base}/klient`); await q.waitForURL(`${base}/valkommen`)
ok("appens vyer är stängda tills kontotypen är vald")
await q.waitForSelector("#name")
check((await q.inputValue("#name")) === "Nova Ny", "namnet förifylls från leverantören")
await q.screenshot({ path: `${out}/sb-valkommen.png` })
check((await q.locator("text=Jag är PT").count()) === 0, "välkomststeget har inget val för PT-konto")
await q.fill("#phone", "0709876543")
await q.click('button[type=submit]')
await q.waitForSelector("text=godkänna behandlingen av hälsouppgifter")
ok("klientkonto kräver samtycke till hälsodata")
await q.click("#consent")
await q.click('button[type=submit]')
await q.waitForURL(`${base}/klient`)
log = await getLog()
const onboard = log.find((e) => e.table === "complete_onboarding")
check(onboard?.body.p_role === "client" && onboard.body.p_phone === "+46709876543" && onboard.body.p_health_data_consent === true, "välkomststeget sparar kontotyp, telefon och samtycke via complete_onboarding")
ok("efter välkomststeget kommer man till sin startsida")
await q.goto(`${base}/valkommen`); await q.waitForURL(`${base}/klient`)
ok("välkomststeget kan inte göras om")
await c2.close()

// 12. v7: ingen självregistrering för PT, PT-inloggning med bara e-post/lösenord
const c3 = await browser.newContext({ viewport: { width: 390, height: 844 } })
const r3 = await c3.newPage()
r3.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await r3.goto(`${base}/registrera`)
check((await r3.locator("text=/Jag är PT|PT-konto/").count()) === 0, "registreringen har inget PT-val")
await r3.goto(`${base}/logga-in/pt`)
check(await r3.locator("h1:has-text('PT-inloggning')").isVisible(), "PT-inloggningen finns")
check((await r3.locator("text=/Fortsätt med|Registrera dig/").count()) === 0, "PT-inloggningen har bara e-post och lösenord (ingen registrering eller Apple/Google)")
await r3.screenshot({ path: `${out}/sb-pt-login.png` })
// Klientkonto på PT-inloggningen → utloggad med förklaring.
await r3.fill("#email", "sara@test.se"); await r3.fill("#password", "hemligt123"); await r3.click('button[type=submit]')
await r3.waitForSelector("text=Kontot är inte ett PT-konto")
ok("klientkonto släpps inte in via PT-inloggningen")
// Försök att bli PT via user_metadata → behandlas som konto utan kontotyp.
await r3.goto(`${base}/logga-in`)
await r3.fill("#email", "fejk@test.se"); await r3.fill("#password", "hemligt123"); await r3.click('button[type=submit]')
await r3.waitForURL(`${base}/valkommen`)
await r3.goto(`${base}/pt`); await r3.waitForURL(`${base}/valkommen`)
ok("roll \"trainer\" i user_metadata ger ingen tillgång till PT-panelen")
// Admin-skapad PT loggar in via PT-inloggningen.
await c3.clearCookies()
await r3.goto(`${base}/logga-in/pt`)
await r3.fill("#email", "elin@test.se"); await r3.fill("#password", "hemligt123"); await r3.click('button[type=submit]')
await r3.waitForURL(`${base}/pt`)
ok("admin-skapad PT loggar in via PT-inloggningen")
await c3.close()

console.log(errors.length ? errors.join("\n") : "inga sidfel")
await browser.close()
