// E2E för v50: automatisk prospektering (demo + e2e/mock-crm.mjs, inget når internet).
// Servern startas som för v49-instagram.test.mjs; CRM_MX_MOCK måste innehålla karincoach.se,
// gmail.com, infopt.se och mikecoach.com (så att det är kvalitetsreglerna – inte MX – som sorterar).
//   BASE_URL=http://localhost:3000 node e2e/v50-prospektering.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const check = (c, m, detail) => {
  if (c) ok(m)
  else {
    console.log(`FAIL ${m}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`)
    process.exitCode = 1
  }
}
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`))
const api = async (action, payload = {}) => {
  const res = await p.request.post(`${base}/api/admin/crm`, { data: { action, ...payload } })
  return { status: res.status(), ...(await res.json().catch(() => ({}))) }
}

await p.goto(`${base}/admin/leads`)
await p.waitForSelector("[data-testid=lead-table]")
const before = (await api("bootstrap")).leads.length

// ------------------------------------------------------ starta jobbet ---
await p.click("[data-testid=open-prospect]")
await p.waitForSelector("[data-testid=prospect-form]")
check(/info@, kontakt@ eller hej@/.test(await p.locator("[data-testid=prospect-form]").innerText()), "kraven visas innan jobbet startas")
await p.fill("[data-testid=prospect-target]", "3")
await p.fill("#pr-tags", "ptsverige onlinecoach")
await p.click("[data-testid=prospect-start]")
await p.waitForSelector("[data-testid=prospect-job]")
check((await api("prospect.start", { config: { target: 1 } })).status === 409, "bara ett jobb åt gången")
await p.keyboard.press("Escape")
await p.waitForSelector("[data-testid=prospect-banner][data-status=running]")
ok("jobbet syns överst i CRM:et medan det pågår")

// ------------------------------------------- vänta tills målet är nått ---
await p.waitForSelector("[data-testid=prospect-banner][data-status=done]", { timeout: 240000 })
const job = (await api("prospect.list")).jobs[0]
const found = job.state.found.map((f) => f.handle).sort()
check(JSON.stringify(found) === JSON.stringify(["elin.pt", "jonas.pt", "karin.coach"]), "exakt de tre riktiga svenska PT:erna blev leads", found)
const r = job.state.stats.rejected
check(r["Inte en personlig tränare"] >= 2, "kennelklubb och bageri sorterades bort som inte PT", r)
check(r["Bara en gemensam adress (info@, kontakt@ …)"] === 1, "PT med bara info@-adress sorterades bort", r)
check(r["Inte i Sverige"] >= 1, "amerikansk coach sorterades bort", r)
check(r["Privat konto"] === 1, "privat konto sorterades bort", r)
check(job.state.stats.runs >= 3 && job.state.log.some((l) => /jonas\.pt/.test(l.text)), "jonas.pt hittades via Elins liknande konton", job.state.log.map((l) => l.text))

// -------------------------------------------------- leadsen i CRM:et ---
const leads = (await api("bootstrap")).leads
check(leads.length === before + 3, `tre nya leads i CRM:et (${leads.length - before})`)
const byHandle = Object.fromEntries(leads.filter((l) => l.instagram).map((l) => [l.instagram, l]))
check(byHandle["elin.pt"].email === "elin@elinpt.se" && byHandle["jonas.pt"].email === "jonas.ek@gmail.com" && byHandle["karin.coach"].email === "karin@karincoach.se", "direkta adresser: från webbplatsen (Elin), biografin (Jonas, Karin)")
check(Object.values(byHandle).filter((l) => ["elin.pt", "jonas.pt", "karin.coach"].includes(l.instagram)).every((l) => l.emailVerified === true && l.score >= 50 && l.legalBasis === "unknown" && l.source === "instagram"), "alla är MX-verifierade, Lead Score minst 50, källa Instagram, rättslig grund inte bedömd")
check(!leads.some((l) => ["kennelklubben", "malin.pt", "us.coach", "hemlig", "bageriet"].includes(l.instagram)), "inga av de bortsorterade kontona finns i CRM:et")
check(/3\s*av 3 hittade/.test(await p.locator("[data-testid=prospect-banner]").innerText()), "statusraden visar 3 av 3")
check((await p.locator("[data-testid=lead-row]", { hasText: "jonas.ek@gmail.com" }).count()) === 1, "nya leads dyker upp i listan av sig själva")

// Dialogen visar resultatet och skälen.
await p.click("[data-testid=prospect-banner]")
const text = await p.locator("[data-testid=prospect-job]").innerText()
check(/Klart – målet nått/.test(text) && /jonas\.ek@gmail\.com/.test(text) && /Inte i Sverige/.test(text), "dialogen visar hittade leads och bortsorterade per skäl")

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
