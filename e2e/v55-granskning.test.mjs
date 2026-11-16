// E2E för v55 (CRM, demoläge): granskningskö för leads (tangentbord), inga
// automatiska betalda sökningar, och granskning/godkännande av varje utskick
// innan det skickas. Samma server som v54 (e2e/mock-crm.mjs + BOLAGSVERKET_*).
//   BASE_URL=http://localhost:3000 node e2e/v55-granskning.test.mjs
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
const lead = async (name) => (await api("bootstrap")).leads.find((l) => l.name === name)

// ------------------------------------- 1. inga automatiska betalda källor ---
let r = await api("lead.create", { lead: { name: "Lisa Larsson", email: "lisa.larsson@gmail.com", city: "Uppsala", segment: "freelance" } })
check(r.lead.companyType === "unknown" && r.lead.enrichment.skipped.some((s) => /bara när du klickar/.test(s)), "ny lead: sökningen i företagsregister körs inte automatiskt", r.lead.enrichment.skipped)
await api("lead.import", { leads: [{ name: "Ida Import", email: "ida@soderbergtraning.se" }] })
const cron = await (await fetch(`${base}/api/crm/queue`, { headers: { Authorization: "Bearer test-cron-secret-123456" } })).json()
check(cron.enriched === undefined && (await lead("Ida Import")).enrichmentStatus === "pending", "den schemalagda kön berikar ingenting (och kostar inget)", cron)
r = await api("enrich.batch", { limit: 5 })
check(r.leads.every((l) => !(l.enrichment?.evidence ?? []).some((e) => e.source === "search")), "\"Auto-berika nya\" använder bara gratis källor")
check((await lead("Ida Import")).companyType === "ab", "gratis källor räcker långt: webbplatsen gav AB")

// ------------------------------------------------- 2. granskningskön ---
await p.goto(`${base}/admin/leads`)
await p.waitForSelector("[data-testid=lead-table]")
const tab = await p.locator("[data-testid=view-review]").innerText()
check(/Granska \(\d+\)/.test(tab), `fliken visar hur många som väntar (${tab.trim()})`)
await p.click("[data-testid=view-review]")
await p.waitForSelector("[data-testid=review-card]")
const left = async () => Number((await p.locator("[data-testid=review-progress] span").first().innerText()).trim())
const start = await left()
const first = await p.locator("[data-testid=review-card]").getAttribute("data-lead")
check(start > 5, `kön har ${start} leads att granska`)
check(await p.locator("[data-testid=review-suggestion]").isVisible(), "motorns förslag och ledtrådar visas vid varje lead")

await p.keyboard.press("a")
await p.waitForFunction((id) => document.querySelector("[data-testid=review-card]")?.getAttribute("data-lead") !== id, first)
let first1 = (await api("bootstrap")).leads.find((l) => l.id === first)
check(first1.companyType === "ab" && first1.companyTypeManual && first1.legalBasis !== "unknown", "A: AB – sparat som granskat, regelverket följer", { t: first1.companyType, lb: first1.legalBasis })
check((await left()) === start - 1, "räknaren går ned")

const second = await p.locator("[data-testid=review-card]").getAttribute("data-lead")
await p.keyboard.press("s")
await p.waitForFunction((id) => document.querySelector("[data-testid=review-card]")?.getAttribute("data-lead") !== id, second)
check(!(await api("bootstrap")).leads.find((l) => l.id === second).companyTypeManual, "S: hoppa över ändrar ingenting")
await p.keyboard.press("ArrowLeft")
await p.waitForFunction((id) => document.querySelector("[data-testid=review-card]")?.getAttribute("data-lead") === id, second)
ok("←: tillbaka till föregående")
await p.keyboard.press("e")
await p.waitForFunction((id) => document.querySelector("[data-testid=review-card]")?.getAttribute("data-lead") !== id, second)
const s2 = (await api("bootstrap")).leads.find((l) => l.id === second)
check(s2.companyType === "enskild_firma" && s2.legalBasis !== "company", "E: enskild firma – låst till referensgrupp/DM", { t: s2.companyType, lb: s2.legalBasis })

// R: sök i register (betalt) – bara på klick.
const third = await p.locator("[data-testid=review-card]").getAttribute("data-lead")
await p.keyboard.press("r")
await p.waitForSelector("[data-sonner-toast] >> text=Förslag:")
check(Boolean((await api("bootstrap")).leads.find((l) => l.id === third).enrichedAt), "R: sökningen körs när man ber om den")
await p.keyboard.press("x")
await p.waitForFunction((id) => document.querySelector("[data-testid=review-card]")?.getAttribute("data-lead") !== id, third)
check((await api("bootstrap")).leads.find((l) => l.id === third).status === "not_relevant", "X: ej aktuell")
// Knapparna fungerar också.
const fourth = await p.locator("[data-testid=review-card]").getAttribute("data-lead")
await p.click("[data-testid=review-gym_anstalld]")
await p.waitForFunction((id) => document.querySelector("[data-testid=review-card]")?.getAttribute("data-lead") !== id, fourth)
check((await api("bootstrap")).leads.find((l) => l.id === fourth).companyType === "gym_anstalld", "knappen Gym-PT")

// ------------------------------------------- 3. granskning av utskick ---
const sara = (await api("lead.create", { lead: { name: "Sara Söderberg", email: "sara@soderbergtraning.se", websiteUrl: "https://soderbergtraning.se", segment: "freelance" } })).lead
let pv = await api("outreach.preview", { leadIds: [sara.id], templateId: null })
check(pv.items[0].blockers.some((b) => b.code === "not_reviewed"), "en ogranskad lead kan inte mejlas")
await api("lead.update", { id: sara.id, patch: { companyType: "ab" } })
const anna = (await api("lead.create", { lead: { name: "Anna Berg", email: "anna.berg@sats.se", gym: "SATS", segment: "gym_chain" } })).lead
await api("lead.update", { id: anna.id, patch: { companyType: "gym_anstalld" } })
r = await api("outreach.schedule", { leadIds: [sara.id, anna.id], templateId: null })
check(r.logs.length === 2 && r.logs.every((l) => l.status === "pending_approval" && !l.approvedAt), "nya utskick väntar på granskning", r.logs.map((l) => l.status))
const sentBefore = (await (await fetch(`${mock}/__sent`)).json()).length
check((await api("queue.run")).result.sent === 0, "kön skickar inget som inte är godkänt")

await p.reload()
await p.waitForSelector("[data-testid=lead-table]")
check(/2 att granska/.test(await p.locator("[data-testid=view-queue]").innerText()), "fliken Utskick visar att två väntar på granskning")
await p.click("[data-testid=view-queue]")
await p.waitForSelector("[data-testid=email-review]")
const cards = p.locator("[data-testid=review-mail]")
check((await cards.count()) === 2, "båda mejlen visas för granskning")
const saraCard = cards.filter({ hasText: "sara@soderbergtraning.se" })
check(/Hej Sara,/.test(await saraCard.locator("[data-testid=review-body]").innerText()), "hela texten visas, med variablerna ifyllda")
check(/avregistreringslänk/.test(await saraCard.locator("[data-testid=review-footer]").innerText()), "sidfoten som läggs till visas också")

// Redigera Saras mejl och godkänn det.
await saraCard.locator("[data-testid=edit]").click()
const body = await p.inputValue("[data-testid=edit-body]")
await p.fill("[data-testid=edit-body]", body.replace("Passar 15 minuter nästa vecka?", "Passar 15 minuter på torsdag?"))
await p.click("[data-testid=edit-save]")
await p.waitForSelector("[data-sonner-toast] >> text=Ändringen är sparad")
check(/på torsdag/.test(await saraCard.locator("[data-testid=review-body]").innerText()), "ändringen syns i granskningen")
r = await api("email.edit", { id: r.logs[0].id, subject: "Hej", body: "Hej {{förnamn}}" })
check(r.status === 400 || r.status === 409, "en kvarglömd variabel kan inte sparas", r)
await saraCard.locator("[data-testid=approve]").click()
await p.waitForSelector("[data-sonner-toast] >> text=Utskicket är godkänt")
// Avvisa Annas mejl.
await cards.filter({ hasText: "anna.berg@sats.se" }).locator("[data-testid=reject]").click()
await p.waitForSelector("[data-sonner-toast] >> text=avvisat")
let logs = (await api("bootstrap")).logs
const saraLog = logs.find((l) => l.leadId === sara.id && l.step === 1)
const annaLog = logs.find((l) => l.leadId === anna.id && l.step === 1)
check(saraLog.status === "queued" && saraLog.approvedAt && saraLog.editedAt, "godkänt: i kön, med tid för godkännande och markerat som ändrat")
check(annaLog.status === "cancelled" && /Avvisad vid granskning/.test(annaLog.error), "avvisat: skickas aldrig")
check(await p.locator("[data-testid=email-review]").count() === 0, "inget kvar att granska")

r = await api("queue.run")
check(r.result.sent === 1, "det godkända mejlet skickas", r.result)
const sent = (await (await fetch(`${mock}/__sent`)).json()).slice(sentBefore)
check(sent.length === 1 && sent[0].to[0] === "sara@soderbergtraning.se" && /på torsdag/.test(sent[0].text), "exakt det granskade (ändrade) mejlet gick ut – inget annat", sent.map((m) => m.to[0]))

// Uppföljningen granskas också.
logs = (await api("bootstrap")).logs
const fu = logs.find((l) => l.leadId === sara.id && l.step === 2)
check(fu?.status === "pending_approval", "uppföljningen väntar också på granskning", fu?.status)
await p.reload()
await p.click("[data-testid=view-queue]")
await p.waitForSelector("[data-testid=review-followup]")
ok("uppföljningen är märkt i granskningen")

// Godkänn alla – med bekräftelse.
const extra = (await api("lead.create", { lead: { name: "Ola Aktie", email: "ola@soderbergtraning.se", segment: "freelance" } })).lead
await api("lead.update", { id: extra.id, patch: { companyType: "ab" } })
await api("outreach.schedule", { leadIds: [extra.id], templateId: null })
await p.reload()
await p.click("[data-testid=view-queue]")
await p.waitForSelector("[data-testid=approve-all]")
await p.click("[data-testid=approve-all]")
await p.waitForSelector("[role=alertdialog], [role=dialog]")
check(/läst/.test(await p.locator("[role=alertdialog], [role=dialog]").innerText()), "Godkänn alla kräver en bekräftelse om att allt är läst")
await p.locator("[role=alertdialog] button, [role=dialog] button", { hasText: "godkänn" }).click()
await p.waitForSelector("[data-sonner-toast] >> text=utskick godkända")
check(!(await api("bootstrap")).logs.some((l) => l.status === "pending_approval"), "alla godkända")

check(errors.length === 0, `inga konsolfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
