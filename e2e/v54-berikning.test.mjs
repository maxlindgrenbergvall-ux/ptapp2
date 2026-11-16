// E2E för v54 (CRM, demoläge): berikningsmotorn – bolagstyp och roll avgörs
// automatiskt från leadens uppgifter, egen webbplats, företagsregistrens utdrag
// (sök-API) och Bolagsverket, och kopplas till rätt mallar. Samma server som v47
// plus BOLAGSVERKET_* mot e2e/mock-crm.mjs (se scratch/start-skriptet i README).
//   BASE_URL=http://localhost:3000 node e2e/v54-berikning.test.mjs
import { chromium } from "playwright"

// Samma påhittade organisationsnummer som e2e/mock-crm.mjs (kontrollsiffran räknas fram).
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
const ORG_SODERBERG = luhn("559123456")
const ORG_LARSSON = luhn("559876543")
const ORG_DEAD = luhn("556111222")
const ORG_MALM = luhn("559222333")

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
const create = async (lead) => (await api("lead.create", { lead: { segment: "freelance", ...lead } })).lead
const kinds = (l) => (l.enrichment?.evidence ?? []).map((e) => `${e.source}:${e.kind}`)
await p.goto(`${base}/admin/leads`)
await p.waitForSelector("[data-testid=lead-table]")

// ---------------------------------------- 1. automatiskt när en lead skapas ---
const sara = await create({ name: "Sara Söderberg", email: "sara@soderbergtraning.se", websiteUrl: "https://soderbergtraning.se", city: "Göteborg" })
check(sara.companyType === "ab" && sara.orgNumber === ORG_SODERBERG && sara.legalBasis === "company" && sara.enrichmentStatus === "done", "webbplats med org.nr → AB, org.nr sparat, B2B tillåtet", { t: sara.companyType, org: sara.orgNumber, lb: sara.legalBasis })
check(Boolean(sara.verifiedAt) && kinds(sara).includes("bolagsverket:ab"), "organisationsnumret bekräftat hos Bolagsverket", kinds(sara))
check(sara.enrichment.confidence >= 92 && /Bolagsverket/.test(sara.enrichment.summary), "hög säkerhet och en förklaring", sara.enrichment.summary)

const emma = await create({ name: "Emma Eriksson", email: "emma@enskildpt.se", websiteUrl: "https://enskildpt.se" })
check(emma.companyType === "enskild_firma" && emma.companyForm === "enskild" && emma.legalBasis === "research", "\"enskild firma\" på webbplatsen → låst till referensgrupp/DM", { t: emma.companyType, lb: emma.legalBasis })
let pv = await api("outreach.preview", { leadIds: [emma.id, sara.id], templateId: null })
check(pv.items.find((i) => i.leadId === emma.id).templateKind === "research" && pv.items.find((i) => i.leadId === sara.id).templateName === "PT med aktiebolag", "mallarna följer automatiskt: referensgrupp för EF, B2B för AB", pv.items.map((i) => i.templateName))

const anna = await create({ name: "Anna Berg", email: "anna.berg@sats.se", gym: "SATS", segment: "gym_chain" })
check(anna.companyType === "gym_anstalld" && anna.legalBasis === "company" && anna.companyForm === "ab", "e-post på SATS domän → gym-PT på bolagets adress", { t: anna.companyType, lb: anna.legalBasis })

// v55: sökningen i företagsregister kostar och körs bara när någon klickar ("Sök i register").
const search = async (lead) => (await api("enrich.run", { id: lead.id, paid: true })).lead
let lisa = await create({ name: "Lisa Larsson", email: "lisa.larsson@gmail.com", city: "Uppsala" })
check(lisa.companyType === "unknown" && lisa.enrichment.skipped.some((s) => /bara när du klickar/.test(s)), "ny lead: ingen betald sökning automatiskt", lisa.enrichment.skipped)
lisa = await search(lisa)
check(lisa.companyType === "ab" && lisa.orgNumber === ORG_LARSSON && Boolean(lisa.verifiedAt), "registrets utdrag (sökning) → AB, bekräftat – namnen i en annan stad räknas inte", { t: lisa.companyType, org: lisa.orgNumber })

const per = await search(await create({ name: "Per Persson", email: "per.persson@gmail.com", city: "Malmö" }))
check(per.companyType === "enskild_firma" && per.legalBasis === "research", "registret: enskild firma → låst", per.companyType)
check(!/\d{6}-\d{4}/.test(JSON.stringify(per.enrichment)) && per.orgNumber === null, "personnumret från registret sparas inte någonstans", per.enrichment)

const gustav = await search(await create({ name: "Gustav Gammal", email: "gustav@gmail.com", city: "Lund" }))
check(gustav.companyType !== "ab" && gustav.legalBasis === "research" && kinds(gustav).includes("bolagsverket:inactive"), "avregistrerat bolag hos Bolagsverket räknas inte som AB", { t: gustav.companyType, k: kinds(gustav) })

// ------------------------------- v57: Instagram-namn → allabolag (befattning, enskild näringsidkare) ---
const q0 = (await (await fetch(`${mock}/__queries`)).json()).length
let moa = await search(await create({ name: "Moa 💪 Malm | PT Örebro", email: "moa.malm@gmail.com", city: "Örebro", instagram: "moamalm.pt" }))
const moaQ = (await (await fetch(`${mock}/__queries`)).json()).slice(q0)
check(moaQ[0] === 'site:allabolag.se "Moa Malm"' && moaQ.length === 1, "Instagram-namnet tvättas och första sökningen går mot allabolag (en sökning räckte)", moaQ)
check(moa.companyType === "ab" && moa.orgNumber === ORG_MALM && Boolean(moa.verifiedAt), "VD i ett träningsbolag → AB, bekräftat hos Bolagsverket", { t: moa.companyType, org: moa.orgNumber })
check(moa.legalBasis === "research" && moa.enrichmentStatus === "needs_review" && /bolagets adress/.test(moa.enrichment.summary), "men gmail-adressen är privat → låst och Granska", { lb: moa.legalBasis, s: moa.enrichment.summary })
pv = await api("outreach.preview", { leadIds: [moa.id], templateId: null })
check(pv.items[0].templateKind === "research", "ingen säljande mall till den privata adressen", pv.items[0].templateName)
moa = (await api("lead.update", { id: moa.id, patch: { email: "moa@malmtraning.se" } })).lead
moa = await search(moa)
check(moa.companyType === "ab" && moa.legalBasis === "company" && moa.enrichmentStatus === "done", "bolagets adress inlagd → B2B tillåtet", { t: moa.companyType, lb: moa.legalBasis })

const ellen = await search(await create({ name: "ellen.ek.pt", email: "ellen.ek@hotmail.com" }))
check(ellen.companyType === "enskild_firma" && ellen.legalBasis === "research", "användarnamnet ellen.ek.pt → \"Enskild näringsidkare\" på allabolag → enskild firma", { t: ellen.companyType, s: ellen.enrichment.summary })

const rolf = await search(await create({ name: "Rolf Ros", email: "rolf@gmail.com", city: "Gävle" }))
check(rolf.companyType === "unknown" && rolf.enrichment.evidence.some((e) => /ingen koppling till träning/.test(e.detail)), "styrelseledamot i ett byggbolag räknas inte", rolf.enrichment.evidence.map((e) => e.detail))
check(rolf.enrichment.skipped.some((s) => /F-skatt finns inte i allabolag/.test(s)), "inget säkert → förklaring om F-skatt utan handelsregister", rolf.enrichment.skipped)

const fitwith = await search(await create({ name: "fitwithanna", email: "fitwithanna@gmail.com" }))
check(fitwith.enrichment.skipped.some((s) => /inget för- och efternamn/.test(s)), "bara ett användarnamn → ingen sökning, ber om personens namn", fitwith.enrichment.skipped)

const nisse = await create({ name: "Nisse Okänd", email: "nisse@gmail.com" })
check(nisse.companyType === "unknown" && nisse.enrichmentStatus === "needs_review" && nisse.legalBasis === "research", "inget hittat → Granska, och låst under tiden", { t: nisse.companyType, s: nisse.enrichmentStatus })
pv = await api("outreach.preview", { leadIds: [nisse.id], templateId: null })
check(pv.items[0].templateKind === "research" && pv.items[0].blockers.every((b) => b.code === "not_reviewed"), "en okänd lead kan bara få referensgruppsmallen (och granskas först)", pv.items[0])

const coach = await create({ name: "Olle Online", email: "olle@gmail.com", segment: "influencer" })
check(coach.companyType === "influencer" && coach.legalBasis === "research", "onlinecoach utan bolag → Influencer, låst", coach.companyType)

const looked = await (await fetch(`${mock}/__bv`)).json()
check(looked.includes(ORG_SODERBERG.replace("-", "")) && looked.includes(ORG_LARSSON.replace("-", "")) && looked.includes(ORG_DEAD.replace("-", "")), "Bolagsverket tillfrågas om hittade organisationsnummer", looked)
check(!looked.some((n) => /^\d{2}(0[1-9]|1[0-2])/.test(n)), "ett personnummer skickas aldrig till Bolagsverket", looked)

// ------------------------------------------------- 2. ändring och manuellt ---
let r = await api("lead.update", { id: nisse.id, patch: { websiteUrl: "https://lindtraning.se/" } })
check(r.lead?.companyType === "ab", "ny webbplats → berikas igen automatiskt", r.lead?.companyType)
r = await api("lead.update", { id: emma.id, patch: { companyType: "ab" } })
check(r.lead.companyTypeManual && r.lead.companyType === "ab" && r.lead.legalBasis === "company", "bolagstyp satt för hand → manuell, regelverket följer")
r = await api("enrich.run", { id: emma.id })
check(r.status === 409, "motorn ändrar inte en manuell bolagstyp")
r = await api("enrich.reset", { id: emma.id })
check(!r.lead.companyTypeManual && r.lead.companyType === "enskild_firma", "Automatisk: motorn bestämmer igen")

// ------------------------------------------------ 3. import + "alla nya" ---
r = await api("lead.import", { leads: [{ name: "Ida Import", email: "ida@soderbergtraning.se" }, { name: "Jens Import", email: "jens@sats.se", gym: "SATS" }, { name: "Kim Import", email: "kim@gmail.com" }] })
check(r.leads?.length === 3 && r.pendingEnrichment === 3 && r.leads.every((l) => l.enrichmentStatus === "pending"), "importerade leads väntar på berikning (blockerar inte importen)", r.pendingEnrichment)
await p.reload()
await p.waitForSelector("[data-testid=enrich-all]")
const label = await p.locator("[data-testid=enrich-all]").innerText()
check(/Auto-berika nya \(\d+\)/.test(label), `knappen visar antalet nya (${label.trim()})`)
check((await p.locator("[data-testid=lead-row] [data-enrichment=pending]").count()) >= 3, "väntande leads har en streckad badge")
// Svepet syns bara medan en lead berikas (mockarna svarar snabbt) – registrera det när det händer.
await p.evaluate(() => {
  window.__sweep = false
  const seen = () => document.querySelector("[data-testid=lead-row] [data-enrichment=running].enrich-sweep") && (window.__sweep = true)
  new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-enrichment", "class"] })
})
await p.click("[data-testid=enrich-all]")
await p.waitForSelector("[data-testid=enrich-progress]")
ok("förloppet visas medan motorn arbetar")
await p.waitForFunction(() => window.__sweep, null, { timeout: 15_000 })
ok("svepet över badgarna medan de berikas")
await p.waitForSelector("[data-testid=enrich-progress]", { state: "detached", timeout: 180_000 })
await p.waitForSelector("[data-sonner-toast] >> text=/leads berikade/")
const after = (await api("bootstrap")).leads
check(!after.some((l) => !l.companyTypeManual && (l.enrichmentStatus === "pending" || l.enrichmentStatus === "running")), "alla nya är berikade", after.filter((l) => l.enrichmentStatus === "pending").map((l) => l.name))
const ida = after.find((l) => l.name === "Ida Import")
const jens = after.find((l) => l.name === "Jens Import")
check(ida.companyType === "ab" && jens.companyType === "gym_anstalld", "importen: AB (företagsdomän med org.nr) och SATS-PT", [ida.companyType, jens.companyType])
check((await p.locator("[data-testid=enrich-all]").count()) === 0, "knappen försvinner när inget väntar")

// ---------------------------------------------------- 4. badges och panel ---
const saraRow = p.locator("[data-testid=lead-row]", { hasText: "Sara Söderberg" })
check((await saraRow.locator("[data-company-type=ab]").innerText()).includes("AB"), "badge i tabellen: AB")
check((await p.locator("[data-testid=lead-row]", { hasText: "Anna Berg" }).locator("[data-company-type=gym_anstalld]").innerText()).includes("SATS PT"), "badge i tabellen: SATS PT")
check((await p.locator("[data-testid=lead-row]", { hasText: "Emma Eriksson" }).locator("[data-company-type]").innerText()).includes("Enskild firma"), "badge i tabellen: Enskild firma")
// Knappen per rad.
await p.locator("[data-testid=lead-row]", { hasText: "Kim Import" }).locator("[data-testid=row-enrich]").click()
await p.waitForSelector("[data-sonner-toast] >> text=Kim Import")
ok("Auto-berika per lead")

await saraRow.locator("td:nth-child(2) button").click()
await p.waitForSelector("[data-testid=enrichment] [data-testid=evidence]")
const evidence = await p.locator("[data-testid=evidence]").innerText()
check(/Bolagsverket/.test(evidence) && /Egen webbplats/.test(evidence), "panelen visar bevisen och källorna", evidence)
check((await p.locator("[data-testid=verified]").count()) === 1, "verifierat hos Bolagsverket markeras")
await p.click("[data-testid=enrich-run]")
await p.waitForSelector("[data-testid=enrich-working]")
ok("Kör igen: laddningsanimationen per källa")
await p.waitForSelector("[data-testid=enrich-working]", { state: "detached", timeout: 30_000 })
check((await p.locator("[data-testid=enrich-summary]").innerText()).length > 10, "ny slutsats efter körningen")
await p.keyboard.press("Escape")

// ------------------------------------------------- 5. integritet och åtkomst ---
const all = JSON.stringify(await api("bootstrap"))
check(!/(19|20)?\d{2}(0[1-9]|1[0-2])\d{2}-\d{4}/.test(all.replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "")), "inga personnummer i något CRM-svar")
const anon = await (await browser.newContext()).request.post(`${base}/api/admin/crm`, { data: { action: "enrich.batch", limit: 1 } })
check(anon.status() === 404 || anon.status() === 401 || anon.status() === 200, `utan inloggning (demo: ${anon.status()})`)

check(errors.length === 0, `inga konsolfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
