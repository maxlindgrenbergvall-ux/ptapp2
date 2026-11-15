// E2E för v47: internt CRM (/admin/leads) i demoläge mot e2e/mock-crm.mjs.
// Inget når internet: webbplatser, Resend och sök-API:t spelas av testservern.
//   node e2e/mock-crm.mjs &
//   CRM_DEMO=1 CRM_FETCH_MOCK_ORIGIN=http://localhost:54810 CRM_MX_MOCK=elinpt.se,viktorcoaching.se,sats.se,gymkedjan.example \
//   RESEND_API_KEY=re_test RESEND_API_BASE=http://localhost:54810 CRM_FROM_EMAIL="Test på Coavira <test@mail.coavira.fit>" \
//   BRAVE_SEARCH_API_KEY=test-key CRM_SEARCH_API_BASE=http://localhost:54810 CRM_MIN_GAP_SECONDS=20 \
//   CRM_WINDOW_START_HOUR=0 CRM_WINDOW_END_HOUR=24 CRM_SEND_WEEKENDS=1 \
//   RESEND_WEBHOOK_SECRET=whsec_dGVzdC1oZW1saWdoZXQtZm9yLWNybQ== CRON_SECRET=test-cron-secret-123456 npm start
//   BASE_URL=http://localhost:3000 node e2e/v47-crm.test.mjs
import { createHmac } from "node:crypto"

import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54810"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m, detail) => (c ? ok(m) : fail(`${m}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`))

// Ljust systemtema med flit: adminpanelen ska vara mörk ändå.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`))
const api = async (action, payload = {}) => {
  const res = await p.request.post(`${base}/api/admin/crm`, { data: { action, ...payload } })
  return { status: res.status(), ...(await res.json().catch(() => ({}))) }
}

// ------------------------------------------------- 1. dashboard och design ---
await p.goto(`${base}/admin/leads`)
await p.waitForSelector("[data-testid=lead-table]")
const look = await p.evaluate(() => ({ bg: getComputedStyle(document.querySelector(".admin-dark")).backgroundColor, text: getComputedStyle(document.querySelector(".admin-dark")).color, accent: getComputedStyle(document.querySelector("[data-testid=open-add]")).backgroundColor, font: getComputedStyle(document.body).fontFamily }))
check(look.bg === "rgb(19, 25, 22)" && look.text === "rgb(249, 251, 248)" && look.accent === "rgb(132, 204, 22)" && /Geist/.test(look.font), "Coaviras palett och Geist även i ljust systemtema", look)
await p.waitForTimeout(900)
const kpis = (await p.locator("[data-testid=kpis]").innerText()).replace(/\s+/g, " ")
check(/Leads totalt 9/.test(kpis) && /Verifierade e-postadresser 6/.test(kpis) && /Kontaktade 3/.test(kpis) && /Konverterade PT:er 1/.test(kpis), "KPI:er: totalt, verifierade, kontaktade, konverterade", kpis)
await p.click("[data-testid=seg-gym_chain]")
check((await p.locator("[data-testid=lead-row]").count()) === 3, "snabbfilter: gymkedjor")
await p.click("button[aria-pressed]:has-text('Alla')")
await p.fill("[data-testid=crm-search]", "malmö")
check((await p.locator("[data-testid=lead-row]").count()) === 2, "sök: ort")
await p.fill("[data-testid=crm-search]", "")
await p.click("[data-testid=view-kanban]")
check((await p.locator("[data-testid=col-new] [data-testid=kanban-card]").count()) === 3 && (await p.locator("[data-testid=kanban] section").count()) === 7, "pipeline: sju kolumner i statusflödets ordning")
await p.click("[data-testid=view-list]")

// ------------------------------------------- 2. berikning från en webbsida ---
await p.click("[data-testid=open-add]")
await p.fill("[data-testid=enrich-url]", "elinpt.se")
await p.click("[data-testid=enrich-go]")
await p.waitForSelector("[data-testid=enrich-result]", { timeout: 30000 })
const form = await p.evaluate(() => Object.fromEntries(["al-name", "al-email", "al-phone", "al-ig", "al-web", "al-city", "al-title"].map((id) => [id, document.getElementById(id).value])))
check(form["al-name"] === "Elin Söderberg" && form["al-email"] === "elin@elinpt.se" && form["al-phone"] === "+46701234567" && form["al-ig"] === "elin.pt" && form["al-city"] === "Göteborg" && form["al-title"] === "Personlig tränare", "parsern: namn, e-post (från kontaktsidan), telefon i +46-format, Instagram, ort och roll", form)
check(/elinpt\.se och elinpt\.se\/kontakt/.test(await p.locator("[data-testid=enrich-result]").innerText()), "en sida + högst en kontaktsida lästes")
await p.click("[data-testid=enrich-save]")
await p.waitForSelector("[data-testid=lead-drawer] >> text=Elin Söderberg")
check(/tar emot e-post/.test(await p.locator("[data-testid=mx-status]").innerText()), "MX-kontrollen gjordes när leaden sparades")
const breakdown = await p.locator("[data-testid=score-breakdown]").innerText()
check(/E-postdomänen tar emot post/.test(breakdown) && /Tydlig PT-roll/.test(breakdown), "Lead Score visar sina delar")
const fetched = await (await fetch(`${mock}/__fetched`)).json()
check(fetched.every((f) => /^CoaviraBot\/1\.0/.test(f.ua)) && fetched.some((f) => f.url === "https://elinpt.se/robots.txt"), "hämtningen: tydlig avsändare och robots.txt lästes först", fetched.map((f) => f.url))
check(fetched.filter((f) => !/robots\.txt$/.test(f.url)).length === 2, "ingen crawling: exakt två sidor hämtades")

// Anteckning och redigering i sidopanelen.
await p.fill("textarea[aria-label='Ny anteckning']", "Ringde – vill se en demo")
await p.click("[data-testid=note-add]")
await p.waitForSelector("[data-testid=notes] >> text=Ringde – vill se en demo")
await p.fill("#ld-gym", "Eget företag")
await p.click("[data-testid=drawer-save]")
await p.waitForSelector("[data-sonner-toast] >> text=Sparat")
ok("sidopanel: anteckning sparad och kontaktuppgift redigerad")
await p.keyboard.press("Escape")

// ------------------------------------------------------- 3. dubbletter ---
const elin = (await api("bootstrap")).leads.find((l) => l.email === "elin@elinpt.se")
check(elin?.gym === "Eget företag" && elin.source === "url" && elin.sourceUrl === "https://elinpt.se/", "leaden sparades med källa (för GDPR art. 14)", elin)
let r = await api("lead.create", { lead: { name: "Dubblett", email: "ELIN@elinpt.se" } })
check(r.status === 409 && r.duplicate?.id === elin.id, "dubblett: samma e-post (annat skiftläge) stoppas", r.error)
r = await api("lead.create", { lead: { name: "Dubblett", instagram: "Elin.PT" } })
check(r.status === 409, "dubblett: samma Instagram-konto stoppas")
r = await api("lead.create", { lead: { name: "Dubblett", websiteUrl: "http://www.elinpt.se/" } })
check(r.status === 409, "dubblett: samma webbadress (www, http, snedstreck) stoppas")

// ------------------------------------ 4. hämtningens spärrar (hållbart och säkert) ---
const blocked = async (url) => api("enrich.preview", { url })
r = await blocked("https://hemlig.se/")
check(r.status === 422 && /robots\.txt/.test(r.error), "robots.txt respekteras", r.error)
r = await blocked("https://www.instagram.com/viktorcoach/")
check(r.status === 422 && /villkor/.test(r.error), "Instagram hämtas aldrig automatiskt", r.error)
for (const url of ["http://169.254.169.254/latest/meta-data/", "http://localhost:3000/api/admin/crm", "http://127.0.0.1/", "http://10.0.0.5/", "http://[::1]/", "http://intern.local/", "https://exempel.se:8443/", "ftp://exempel.se/", "https://user:pass@exempel.se/"]) {
  r = await blocked(url)
  check(r.status === 422 || r.status === 400, `interna/ogiltiga adresser hämtas inte: ${url}`, r)
}
r = await blocked("https://omdirigerad.se/")
check(r.status === 422 && /Interna adresser/.test(r.error), "omdirigering till en intern adress stoppas", r.error)
r = await blocked("https://bild.se/")
check(r.status === 422 && /HTML/.test(r.error), "annat än HTML avvisas", r.error)

// --------------------------------------------------------------- 5. CSV ---
await p.click("[data-testid=open-add]")
await p.click("[role=tab]:has-text('CSV')")
await p.setInputFiles("[data-testid=csv-file]", { name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from("Namn;E-post;Telefon;Gym;Stad;Segment\nKarin Sats;karin.sats@sats.se;070-555 66 77;SATS;Stockholm;gymkedja\nDubblett Elin;elin@elinpt.se;;;;\nTrasig;inte-en-adress;;;;\n") })
await p.waitForSelector("[data-testid=csv-summary]")
check(/2 leads att importera/.test(await p.locator("[data-testid=csv-summary]").innerText()) && /Rad 4/.test(await p.locator("[data-testid=csv-summary]").innerText()), "CSV: förhandsvisar antal och ogiltiga rader")
await p.click("[data-testid=csv-import]")
await p.waitForSelector("[data-sonner-toast] >> text=1 leads importerade")
const karin = (await api("bootstrap")).leads.find((l) => l.email === "karin.sats@sats.se")
check(karin?.phone === "+46705556677" && karin.segment === "gym_chain" && karin.source === "csv", "CSV: importerad med +46-nummer och segment; dubbletten hoppades över", karin)

// -------------------------------------------------------------- 6. sökning ---
r = await api("search", { query: { segment: "freelance", city: "Göteborg" } })
check(r.candidates?.length === 2 && r.candidates[0].title === "Elin Söderberg – Personlig tränare i Göteborg" && r.candidates[1].socialOnly === true, "sökning via API: kandidater, kataloger filtreras bort, sociala nätverk märks", r.candidates)

// ------------------------------------------------------- 7. utskick ---
r = await api("lead.verify", { ids: [karin.id] })
check(r.leads?.[0]?.emailVerified === true, "MX-kontroll i efterhand")
let preview = await api("outreach.preview", { leadIds: [elin.id, karin.id], templateId: null })
check(preview.items.every((i) => i.blockers.some((b) => b.code === "legal_basis")), "utan rättslig grund går inga mejl ut", preview.items.map((i) => i.blockers.map((b) => b.code)))
await api("lead.bulk", { ids: [elin.id], patch: { legalBasis: "consent" } })
await api("lead.bulk", { ids: [karin.id], patch: { legalBasis: "company" } })
preview = await api("outreach.preview", { leadIds: [elin.id, karin.id], templateId: null })
// v53: startmallarna har inga platshållare – avsändaren fylls i från CRM_FROM_EMAIL ("Test på Coavira <…>" → Test).
check(preview.items.every((i) => i.blockers.length === 0 && /\nTest\nCoavira/.test(i.body)), "startmallarna går att skicka direkt – avsändaren fylls i", preview.items.map((i) => i.blockers))
check(preview.items.find((i) => i.leadId === karin.id)?.templateName?.includes("gymkedja") && preview.items.find((i) => i.leadId === karin.id)?.followupDays === 4, "gymkedja: gymkedjemallen med uppföljning efter fyra dagar")
// Mallarna går att redigera (i API:t för den första, och syns i gränssnittet).
const templates = (await api("bootstrap")).templates
const first = templates[0]
await api("template.save", { template: { ...first, body: `${first.body}\nPS. Hälsningar från Max` } })
await p.reload()
await p.waitForSelector("[data-testid=lead-table]")
await p.click("[data-testid=open-templates]")
check((await p.locator("[data-testid=template-body]").inputValue()).includes("Max"), "mallarna går att redigera och sparas")
await p.keyboard.press("Escape")
// Markera två leads och schemalägg i gränssnittet.
for (const email of ["elin@elinpt.se", "karin.sats@sats.se"]) await p.locator("[data-testid=lead-row]", { hasText: email }).locator("[role=checkbox]").click()
await p.click("[data-testid=bulk-outreach]")
await p.waitForSelector("[data-testid=outreach-ok] li")
const mail = await p.locator("[data-testid=outreach-mail]").innerText()
check(/Hej (Elin|Karin)[,!]/.test(mail) && !/\{\{/.test(mail), "förhandsgranskning: variablerna är ifyllda", mail.slice(0, 80))
check((await p.locator("[data-testid=outreach-ok] > li").count()) === 2, "förhandsgranskning: två mejl, var och en med sin segmentmall")
await p.click("[data-testid=outreach-schedule]")
await p.waitForSelector("[data-testid=queue-list] li[data-status=queued]")
let logs = (await api("bootstrap")).logs.filter((l) => l.status === "queued")
const gap = Math.abs(new Date(logs[0].scheduledAt) - new Date(logs[1].scheduledAt)) / 1000
check(logs.length === 2 && gap >= 20, `kö: två mejl schemalagda med paus emellan (${gap} s)`)
check((await api("outreach.preview", { leadIds: [elin.id], templateId: null })).items[0].blockers.some((b) => b.code === "already_queued"), "samma lead kan inte köas två gånger")

// Kön: ett mejl per körning, sedan paus.
r = await api("queue.run")
check(r.result.sent === 1, "kön skickar ett mejl", r.result)
r = await api("queue.run")
check(r.result.sent === 0 && (r.result.idle === "gap" || r.result.idle === "empty"), "nästa körning väntar (paus mellan mejl) – inget skickas i klump", r.result)
const sent = await (await fetch(`${mock}/__sent`)).json()
const m = sent.at(-1)
check(sent.length === 1 && m.from === "Test på Coavira <test@mail.coavira.fit>" && /^crm-/.test(m.key), "Resend: ett mejl med avsändare och idempotensnyckel", { n: sent.length, from: m?.from })
check(/^<http.*\/api\/crm\/unsubscribe\?token=[0-9a-f-]{36}>$/.test(m.headers["List-Unsubscribe"]) && m.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "mejlet har avregistrering med ett klick (List-Unsubscribe)")
check(/avregistrera\/[0-9a-f-]{36}/.test(m.text) && /kontakt@coavira\.fit/.test(m.text) && (m.to[0] !== "elin@elinpt.se" || /elinpt\.se/.test(m.text.split("—").at(-1))), "sidfoten: avsändare, källa och avregistreringslänk", m.text.slice(-300))
check(!/<script|\{\{/.test(m.html) && /<a href="https?:\/\/[^"]*avregistrera/.test(m.html), "HTML-versionen har klickbar avregistreringslänk")
const sentLead = (await api("bootstrap")).leads.find((l) => l.email === m.to[0])
check(sentLead.status === "emailed" && Boolean(sentLead.lastEmailedAt), "leaden flyttas till Mail skickat med tidsstämpel", sentLead.status)

// Schemalagt jobb (cron): kräver hemligheten.
check((await fetch(`${base}/api/crm/queue`)).status === 404 && (await fetch(`${base}/api/crm/queue`, { headers: { Authorization: "Bearer fel" } })).status === 404, "cron-rutten är stängd utan rätt hemlighet")
check((await fetch(`${base}/api/crm/queue`, { headers: { Authorization: "Bearer test-cron-secret-123456" } })).status === 200, "cron-rutten svarar med rätt hemlighet")

// ------------------------------------------------- 8. leveranskvitto (webhook) ---
const sign = (body, secret = "dGVzdC1oZW1saWdoZXQtZm9yLWNybQ==", ts = Math.floor(Date.now() / 1000)) => ({
  "svix-id": "msg_1",
  "svix-timestamp": String(ts),
  "svix-signature": `v1,${createHmac("sha256", Buffer.from(secret, "base64")).update(`msg_1.${ts}.${body}`).digest("base64")}`,
  "content-type": "application/json",
})
const delivered = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: m.id } })
check((await fetch(`${base}/api/resend/webhook`, { method: "POST", body: delivered, headers: sign(delivered, "ZmVsLWhlbWxpZ2hldA==") })).status === 401, "webhook: fel signatur avvisas")
check((await fetch(`${base}/api/resend/webhook`, { method: "POST", body: delivered, headers: sign(delivered, undefined, Math.floor(Date.now() / 1000) - 3600) })).status === 401, "webhook: gammal händelse avvisas (återuppspelning)")
check((await fetch(`${base}/api/resend/webhook`, { method: "POST", body: delivered, headers: sign(delivered) })).status === 200, "webhook: giltig signatur tas emot")
const log = (await api("bootstrap")).logs.find((l) => l.resendId === m.id)
check(log.status === "delivered" && Boolean(log.deliveredAt), "utskicket markeras Levererat med tidsstämpel", log.status)

// ------------------------------------------------------ 9. avregistrering ---
const token = /avregistrera\/([0-9a-f-]{36})/.exec(m.text)[1]
const anon = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await anon.goto(`${base}/avregistrera/${token}`)
await anon.waitForSelector("[data-testid=unsubscribe-confirm]")
check((await api("bootstrap")).leads.some((l) => l.id === sentLead.id), "att bara öppna länken avregistrerar ingen (mejlfilter förhandsöppnar länkar)")
await anon.click("[data-testid=unsubscribe-confirm]")
await anon.waitForSelector("[data-testid=unsubscribed]")
const after = await api("bootstrap")
check(!after.leads.some((l) => l.id === sentLead.id) && after.suppressed === 1, "avregistrerad: uppgifterna är raderade och adressen spärrad")
r = await api("lead.create", { lead: { name: "Tillbaka", email: m.to[0] } })
check(r.status === 409 && /avregistrerat/.test(r.error), "en avregistrerad adress kan inte läggas till igen", r.error)
check((await fetch(`${base}/api/crm/unsubscribe?token=00000000-0000-4000-8000-000000000000`, { method: "POST" })).status === 200, "okänd nyckel ger samma svar (går inte att pröva sig fram)")

// ------------------------------------------------------- 10. validering ---
check((await api("lead.create", { lead: { name: "X", hemligt: 1 } })).status === 400, "okända fält avvisas")
check((await api("lead.update", { id: "inte-ett-id", patch: {} })).status === 400, "ogiltigt id avvisas")
check((await api("finns-inte")).status === 400, "okänd åtgärd avvisas")
check((await p.request.post(`${base}/api/admin/crm`, { data: { action: "bootstrap" }, headers: { origin: "https://ond-sajt.example" } })).status() === 403, "anrop från en annan webbplats avvisas (CSRF)")

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
