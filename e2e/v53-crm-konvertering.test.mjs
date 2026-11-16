// E2E för v53 (CRM, demoläge): bolagsform och compliance, referensgruppsmallen,
// automatiska uppföljningar som pausas vid svar, snabbloggning, "Att göra" och
// konverteringsstatistik. Samma server som v47 (se e2e/v47-crm.test.mjs), med
// CRM_FROM_EMAIL="Test på Coavira <test@mail.coavira.fit>".
//   BASE_URL=http://localhost:3000 node e2e/v53-crm-konvertering.test.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`))
const api = async (action, payload = {}) => {
  const res = await p.request.post(`${base}/api/admin/crm`, { data: { action, ...payload } })
  return { status: res.status(), ...(await res.json().catch(() => ({}))) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------ 1. startmallar ---
let boot = await api("bootstrap")
const keys = boot.templates.map((t) => t.key).filter(Boolean).sort()
check(["ab_intro", "gym_chain_intro", "influencer_intro", "research_referensgrupp"].every((k) => keys.includes(k)), "startmallar: referensgrupp, AB, gymkedja och onlinecoach", keys)
const research = boot.templates.find((t) => t.key === "research_referensgrupp")
check(research.subject === "Referensgrupp för nytt svenskt PT-verktyg" && research.kind === "research" && research.followupDays === null, "referensgruppsmallen: exakt ämne, icke-säljande, ingen uppföljning")
check(/5–6 duktiga tränare/.test(research.body) && /torsdag eller fredag/.test(research.body) && /Allt gott,\n\{\{avsändare\}\}\nCoavira$/.test(research.body), "referensgruppsmallen: den fastställda texten")
check(boot.config.senderName === "Test", "avsändaren hämtas från CRM_FROM_EMAIL", boot.config.senderName)

// ---------------------------------------------- 2. bolagsform → grund ---
let r = await api("lead.create", { lead: { name: "Ella Enskild", email: "ella@elinpt.se", segment: "freelance", companyForm: "enskild", instagram: "ella.enskild.pt", city: "Malmö" } })
const ella = r.lead
check(ella?.legalBasis === "research" && ella.companyForm === "enskild", "enskild firma → grunden Icke-säljande förfrågan sätts automatiskt", ella?.legalBasis)
r = await api("lead.create", { lead: { name: "Anna Aktiebolag", email: "anna@viktorcoaching.se", segment: "freelance", companyForm: "ab", orgNumber: "5591234567", specialties: ["Styrka"] } })
const anna = r.lead
check(anna?.legalBasis === "company" && anna.orgNumber === "559123-4567", "aktiebolag → Företagsadress, org.nr normaliseras", anna)
r = await api("lead.update", { id: anna.id, patch: { orgNumber: "19900101-1234" } })
check(r.status === 400 && /aktiebolag/i.test(r.error), "ett personnummer kan inte sparas som organisationsnummer", r)
r = await api("lead.update", { id: ella.id, patch: { orgNumber: "559999-0000" } })
check(r.lead?.orgNumber === null, "enskild firma får inget organisationsnummer", r.lead?.orgNumber)
r = await api("lead.update", { id: ella.id, patch: { legalBasis: "company" } })
let pv = await api("outreach.preview", { leadIds: [ella.id], templateId: null })
check(pv.items[0].blockers.some((b) => b.code === "company_form"), "enskild firma med grunden Företagsadress spärras", pv.items[0].blockers)
await api("lead.update", { id: ella.id, patch: { legalBasis: "research" } })

// ---------------------------------------------------------- 3. mallval ---
pv = await api("outreach.preview", { leadIds: [ella.id, anna.id], templateId: null })
const pe = pv.items.find((i) => i.leadId === ella.id)
const pa = pv.items.find((i) => i.leadId === anna.id)
check(pe.templateKind === "research" && pe.subject === "Referensgrupp för nytt svenskt PT-verktyg" && pe.followupDays === null && !pe.blockers.length, "enskild firma: referensgruppsmallen förvald, ingen uppföljning", pe)
check(pe.body.startsWith("Hej Ella,") && pe.body.endsWith("Allt gott,\nTest\nCoavira"), "variablerna ifyllda (förnamn och avsändare)")
check(pa.templateName === "PT med aktiebolag" && pa.followupDays === 4 && !pa.blockers.length, "aktiebolag: B2B-mallen med uppföljning efter fyra dagar", pa)
const abTpl = boot.templates.find((t) => t.key === "ab_intro")
pv = await api("outreach.preview", { leadIds: [ella.id], templateId: abTpl.id })
check(pv.items[0].blockers.some((b) => /icke-säljande/.test(b.text)), "en säljande mall kan inte väljas för en enskild firma", pv.items[0].blockers)
const salesy = await api("template.save", { template: { ...research, id: undefined, name: "Testmall med pris", body: `${research.body}\nPris: 199 kr/mån` } })
pv = await api("outreach.preview", { leadIds: [ella.id], templateId: salesy.template.id })
check(pv.items[0].blockers.some((b) => /pris/.test(b.text)), "en \"icke-säljande\" mall med pris spärras", pv.items[0].blockers)
await api("template.delete", { id: salesy.template.id })

// ------------------------------------------- 4. utskick och uppföljning ---
const sentBefore = (await (await fetch(`${mock}/__sent`)).json()).length
r = await api("outreach.schedule", { leadIds: [ella.id, anna.id], templateId: null })
check(r.logs?.length === 2, "två mejl schemalagda", r)
// v55: godkänn efter granskning.
await api("email.approve", { ids: r.logs.map((l) => l.id) })
let sentNow = 0
for (let i = 0; i < 4 && sentNow < 2; i++) {
  const q = await api("queue.run")
  sentNow += q.result.sent
  if (sentNow < 2) await sleep(21_000)
}
const sent = (await (await fetch(`${mock}/__sent`)).json()).slice(sentBefore)
check(sent.length === 2, "kön skickade båda – ett i taget med paus", sent.length)
const mailElla = sent.find((m) => m.to[0] === "ella@elinpt.se")
const mailAnna = sent.find((m) => m.to[0] === "anna@viktorcoaching.se")
check(/inget erbjudande/.test(mailElla.text) && /inga fler mejl om du inte svarar/.test(mailElla.text) && /avregistrera\//.test(mailElla.text), "referensgruppsmejlet: egen sidfot (inget erbjudande) + avregistrering")
check(/eftersom du arbetar som personlig tränare/.test(mailAnna.text) && mailAnna.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "B2B-mejlet: vanlig sidfot och avregistrering med ett klick")
boot = await api("bootstrap")
const followups = boot.logs.filter((l) => l.step === 2)
const fuAnna = followups.find((l) => l.leadId === anna.id)
check(fuAnna?.status === "pending_approval" && !followups.some((l) => l.leadId === ella.id), "uppföljning (väntar på granskning) för aktiebolaget – inte för den enskilda firman", followups.map((l) => [l.leadId === anna.id ? "anna" : "ella", l.status]))
const days = (new Date(fuAnna.scheduledAt) - Date.now()) / 86_400_000
check(days > 3.9 && days < 6, `uppföljningen går om ca fyra dagar (${days.toFixed(1)} d)`)
check(/lyfter det en gång till/.test(fuAnna.body) && fuAnna.parentId, "uppföljningens text och koppling till första mejlet")
check(boot.leads.find((l) => l.id === anna.id).status === "emailed" && boot.leads.find((l) => l.id === anna.id).lastContactedAt, "leaden blir Kontaktad med tidsstämpel")

// Svar → uppföljningen pausas direkt.
r = await api("activity.log", { leadId: anna.id, kind: "email_reply", body: "Låter intressant" })
check(r.lead?.status === "replied" && r.cancelled === 1, "svar på mejl: status Svarat och uppföljningen pausas", { status: r.lead?.status, cancelled: r.cancelled })
boot = await api("bootstrap")
check(boot.logs.find((l) => l.id === fuAnna.id).status === "cancelled", "uppföljningen är avbruten i kön")

// ------------------------------------------------- 5. samtal och PT ---
r = await api("activity.log", { leadId: anna.id, kind: "call_booked" })
check(r.status === 400, "ett bokat samtal kräver en tid")
const meeting = new Date(Date.now() + 2 * 3600_000).toISOString()
r = await api("activity.log", { leadId: anna.id, kind: "call_booked", meetingAt: meeting, body: "Google Meet" })
check(r.lead?.status === "meeting" && r.lead.meetingAt === meeting, "samtal bokat: status och tid", r.lead?.status)
r = await api("activity.log", { leadId: ella.id, kind: "dm_sent" })
check(r.lead?.preferredChannel === "instagram", "DM skickat: kanalen blir Instagram")
r = await api("activity.log", { leadId: ella.id, kind: "dm_reply" })
check(r.lead?.status === "replied", "svar på DM: Svarat")
r = await api("conversions.sync")
check(r.converted === 0, "konverteringssynken svarar (demon har inga PT-konton)")

// --------------------------------------------- 6. öppningar (om påslaget) ---
const sign = (body, ts = Math.floor(Date.now() / 1000)) => ({
  "svix-id": "msg_53",
  "svix-timestamp": String(ts),
  "svix-signature": `v1,${createHmac("sha256", Buffer.from("dGVzdC1oZW1saWdoZXQtZm9yLWNybQ==", "base64")).update(`msg_53.${ts}.${body}`).digest("base64")}`,
  "content-type": "application/json",
})
const opened = JSON.stringify({ type: "email.opened", created_at: new Date().toISOString(), data: { email_id: mailAnna.id } })
check((await fetch(`${base}/api/resend/webhook`, { method: "POST", body: opened, headers: sign(opened) })).status === 200, "webhook: email.opened tas emot")
boot = await api("bootstrap")
check(boot.logs.find((l) => l.resendId === mailAnna.id)?.openCount === 1, "öppningen räknas (bara om spårning är påslagen i Resend)")

// ------------------------------------------------------- 7. gränssnittet ---
await p.goto(`${base}/admin/leads`)
await p.waitForSelector("[data-testid=lead-table]")
check(/Bokade samtal/.test(await p.locator("[data-testid=kpis]").innerText()), "KPI: bokade samtal")
await p.waitForSelector("[data-testid=todo-compact]")
const compact = await p.locator("[data-testid=todo-compact] [data-testid=todo-row]").allInnerTexts()
check(compact.length >= 2 && compact.some((t) => /Ella Enskild/.test(t) && /Boka samtalet/.test(t)), "Att göra idag: svaret från Ella högst upp (boka samtalet)", compact.slice(0, 3))
await p.click("[data-testid=view-today]")
await p.waitForSelector("[data-testid=todo]")
const actions = await p.locator("[data-testid=todo-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")))
check(actions[0] === "book_call" && actions.includes("prep_call"), "Att göra: boka samtal först, förbered dagens samtal", actions)
check((await p.locator("[data-testid=todo-row] [data-testid=hot]").count()) >= 1, "heta leads markeras")

// Lead-panelen: bolagsform, rekommendation, snabbloggning och DM-hjälp.
await p.locator("[data-testid=todo-row]", { hasText: "Ella Enskild" }).click()
await p.waitForSelector("[data-testid=lead-drawer] [data-testid=quick-log]")
check(/Nästa steg: Boka samtalet/.test(await p.locator("[data-testid=next-action]").innerText()), "panelen: nästa steg överst")
check(/Instagram-DM|referensgruppsmallen/.test(await p.locator("[data-testid=recommendation]").innerText()), "panelen: rekommendation för enskild firma")
check(/^Hej Ella!/.test(await p.locator("[data-testid=dm-text]").innerText()), "DM-texten är färdig att kopiera")
check((await p.locator("[data-testid=activities] li").count()) === 2, "aktiviteterna listas (DM och svar)")
await p.click("[data-testid=open-book]")
await p.fill("#ql-note", "Torsdag, 10 min")
await p.click("[data-testid=book-save]")
await p.waitForSelector("[data-testid=meeting-at]")
boot = await api("bootstrap")
check(boot.leads.find((l) => l.id === ella.id).status === "meeting", "Boka samtal i panelen: status Samtal bokat")
await p.click("[data-testid=open-remind]")
await p.fill("#ql-note", "Skicka agendan")
await p.click("[data-testid=remind-save]")
await p.waitForSelector("[data-testid=reminder]")
check((await api("bootstrap")).leads.find((l) => l.id === ella.id).nextActionNote === "Skicka agendan", "påminnelsen sparas")
await p.click("[data-testid=log-converted]")
await p.waitForSelector("[data-sonner-toast] >> text=Blev PT i Coavira")
check((await api("bootstrap")).leads.find((l) => l.id === ella.id).status === "customer", "Blev PT: leaden blir kund")
await p.keyboard.press("Escape")

// Statistik.
await p.click("[data-testid=view-stats]")
await p.waitForSelector("[data-testid=funnel]")
const funnel = await p.locator("[data-testid=funnel]").innerText()
check(/Kontaktade/.test(funnel) && /Svarat/.test(funnel) && /Bokade samtal/.test(funnel) && /Registrerade PT:er/.test(funnel), "statistik: tratten")
const rows = await p.locator("[data-testid=template-stat]").allInnerTexts()
check(rows.some((t) => /Referensgrupp/.test(t)) && rows.some((t) => /PT med aktiebolag/.test(t)), "statistik: svar per mall", rows)
check((await p.locator("[data-testid=template-stats] th", { hasText: "Öppnade" }).count()) === 1, "öppningsgrad visas när öppningar faktiskt spåras")
check(/1 skickade/.test(await p.locator("[data-testid=dm-stats]").innerText()), "statistik: Instagram-DM")

// Pipeline: sju steg, med Samtal bokat.
await p.click("[data-testid=view-kanban]")
check((await p.locator("[data-testid=col-meeting]").count()) === 1 && (await p.locator("[data-testid=col-meeting] [data-testid=kanban-card]").count()) >= 1, "pipeline: kolumnen Samtal bokat")

// Mallredigeraren: typ och uppföljning; varning för säljande text i en icke-säljande mall.
await p.click("[data-testid=open-templates]")
await p.locator("[role=tab]", { hasText: "Referensgrupp" }).click()
check((await p.locator("[data-testid=followup-editor]").count()) === 0, "icke-säljande mall: ingen uppföljning att slå på")
await p.fill("[data-testid=template-body]", `${research.body}\nGratis i 30 dagar!`)
await p.waitForSelector("[data-testid=sales-warning]")
ok("varning när en icke-säljande mall får säljande text")
await p.locator("[role=tab]", { hasText: "PT med aktiebolag" }).click()
check((await p.locator("[data-testid=followup-toggle]").isChecked()) && (await p.inputValue("[data-testid=followup-days]")) === "4", "B2B-mall: uppföljning efter 4 dagar")
await p.keyboard.press("Escape")

// Mobil: panelen och Att göra ryms.
await p.setViewportSize({ width: 390, height: 844 })
await p.click("[data-testid=view-today]")
await p.waitForSelector("[data-testid=todo]")
check((await p.evaluate(() => document.documentElement.scrollWidth)) <= 390, "Att göra ryms på 390 px")

check(errors.length === 0, `inga konsolfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
