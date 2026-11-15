// E2E för v49: Instagram-profiler via Apify i CRM:et (demo + e2e/mock-crm.mjs, inget når internet).
// Servern startas som för v47-crm.test.mjs, plus APIFY_TOKEN=apify-test-token APIFY_API_BASE=http://localhost:54810
//   BASE_URL=http://localhost:3000 node e2e/v49-instagram.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54810"
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
check((await api("bootstrap")).config.instagram === true, "Instagram är påslaget när APIFY_TOKEN finns")

// ------------------------------------------------ 1. hashtag → konton ---
await p.click("[data-testid=open-add]")
await p.click("[data-testid=tab-instagram]")
await p.click("[role=tab]:has-text('Hashtag')")
await p.fill("[data-testid=ig-hashtag]", "#PersonligTränare")
await p.click("[data-testid=ig-search]")
await p.waitForSelector("[data-testid=ig-running]")
ok("körningen startas och visas som pågående")
await p.waitForSelector("[data-testid=ig-handles]", { timeout: 30000 })
await p.waitForFunction(() => document.querySelector("[data-testid=ig-handles]")?.value.includes("karin.coach"), null, { timeout: 30000 })
const handles = await p.inputValue("[data-testid=ig-handles]")
check(handles === "elin.pt\nkarin.coach\nbageriet", "hashtag: unika konton bakom inläggen förs över till Profiler", handles)
const runs = await (await fetch(`${mock}/__runs`)).json()
check(runs[0][1].input.resultsType === "posts" && /explore\/tags\/personligtr%C3%A4nare\/$/.test(runs[0][1].input.directUrls[0]) && runs[0][1].maxItems === 50, "Apify fick hashtag-indata med kostnadstak (maxItems)", runs[0][1])

// ------------------------------------------------ 2. profiler → förslag ---
await p.fill("[data-testid=ig-handles]", "@elin.pt\nhttps://www.instagram.com/karin.coach/\nhemlig\nbageriet\nfinnsinte")
await p.click("[data-testid=ig-fetch]")
await p.waitForSelector("[data-testid=ig-results]", { timeout: 30000 })
const rows = p.locator("[data-testid=ig-candidate]")
check((await rows.count()) === 4, "fyra profiler (kontot som inte finns hoppas över)", await rows.count())
const checked = await rows.evaluateAll((els) => els.filter((e) => e.querySelector("[role=checkbox]")?.getAttribute("data-state") === "checked").map((e) => e.querySelector("a")?.textContent))
check(JSON.stringify(checked) === JSON.stringify(["@elin.pt", "@karin.coach"]), "förvalt: bara tydliga tränare som inte är privata", checked)
const text = await p.locator("[data-testid=ig-results]").innerText()
check(/Privat konto/.test(text) && /nämner inte träning/.test(text) && /41\s000/.test(text) && /karin@karincoach\.se/.test(text), "varningar, följarantal och e-post ur biografin visas")
check(/kan letas upp på webbplatsen/.test(text), "Elin saknar e-post men har webbplats – det sägs")

// ------------------------------------------------ 3. lägg till ---
await p.click("[data-testid=ig-add]")
await p.waitForSelector("[data-sonner-toast] >> text=2 leads tillagda", { timeout: 30000 })
const after = await api("bootstrap")
const elin = after.leads.find((l) => l.instagram === "elin.pt")
const karin = after.leads.find((l) => l.instagram === "karin.coach")
check(elin?.source === "instagram" && elin.instagramFollowers === 3200 && elin.sourceUrl === "https://www.instagram.com/elin.pt/", "leaden sparas med källa instagram och följarantal", elin)
check(elin?.email === "elin@elinpt.se" && elin.emailVerified === true && elin.phone === "+46701234567", "e-post och telefon hittades på Elins webbplats (MX-kontrollerad)", elin)
check(karin?.segment === "influencer" && karin.email === "karin@karincoach.se" && karin.scoreBreakdown.some((p) => p.label === "Räckvidd på Instagram"), "Karin: influencer, e-post ur biografin, poäng för räckvidd", karin)
check(elin.legalBasis === "unknown" && karin.legalBasis === "unknown", "rättslig grund är Inte bedömd – inga mejl förrän ni tagit ställning")
check(/Finns redan i CRM:et/.test(await p.locator("[data-testid=ig-results]").innerText()), "tillagda konton markeras som redan i CRM:et")

// Samma konto igen: markeras som befintligt direkt.
await p.fill("[data-testid=ig-handles]", "elin.pt")
await p.click("[data-testid=ig-fetch]")
await p.waitForFunction(() => document.querySelectorAll("[data-testid=ig-candidate]").length === 1, null, { timeout: 30000 })
check((await p.locator("[data-testid=ig-candidate] [role=checkbox]").isDisabled()) && /Finns redan/.test(await p.locator("[data-testid=ig-results]").innerText()), "befintligt konto kan inte läggas till igen")
check((await api("lead.create", { lead: { name: "Dubblett", instagram: "ELIN.PT", source: "instagram" } })).status === 409, "dubblettskyddet gäller Instagram-leads")

// ------------------------------------------------ 4. validering ---
check((await api("instagram.start", { request: { mode: "profiles", handles: Array.from({ length: 51 }, (_, i) => `pt${i}`) } })).status === 400, "högst 50 profiler per körning")
check((await api("instagram.start", { request: { mode: "hashtag", hashtag: "pt", limit: 500 } })).status === 400, "högst 100 inlägg per hashtag-sökning")
check((await api("instagram.start", { request: { mode: "profiles", handles: ["https://evil.example/"] } })).status === 400, "bara kontonamn – inga godtyckliga adresser till Apify")
check((await api("instagram.result", { runId: "../../v2/users/me", mode: "profiles" })).status === 400, "körnings-id valideras (ingen sökvägsinjektion)")

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
