// Enhetstester för CRM:ets rena logik (v47): parser, poäng, mallar, utskicksplan, CSV.
//   npx tsx --tsconfig tsconfig.json e2e/crm.unit.ts
import { leadsFromCsv, normalizeInstagram, normalizeUrl, parseCsv } from "@/lib/crm/csv"
import { contactLinks, extractContacts } from "@/lib/crm/extract"
import { blockersFor, DEFAULT_QUEUE, nextWindowStart, planSchedule, stockholmDay } from "@/lib/crm/outreach"
import { scoreLead } from "@/lib/crm/score"
import { DEFAULT_TEMPLATES, emailHtml, footerText, renderTemplate, variablesFor } from "@/lib/crm/templates"
import { websiteKey, type Lead } from "@/lib/crm/types"

let failed = 0
const check = (ok: boolean, name: string, detail?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`)
  if (!ok) failed++
}

// ------------------------------------------------------------ parser ---
const site = `<!doctype html><html><head><title>Elin Söderberg – Personlig tränare i Göteborg</title>
<meta name="description" content="Certifierad PT i Göteborg. Styrketräning, viktnedgång och kostrådgivning.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"Elin Söderberg","jobTitle":"Personlig tränare","address":{"addressLocality":"Göteborg"}}</script>
<style>.x{color:red} a@b.png</style><script>var e="tracker@sentry.io"</script></head>
<body><h1>Träna med Elin</h1><p>Jag hjälper dig med styrka. Boka på <a href="mailto:Elin@ElinPT.se?subject=Hej">mejl</a> eller ring <a href="tel:+46 70-123 45 67">070-123 45 67</a>.</p>
<p>Andra adressen: info [at] elinpt [dot] se. Org.nr 556677-8899, startade 2019-03-04.</p>
<a href="https://www.instagram.com/elin.pt/">Instagram</a> <a href="https://instagram.com/p/Cabc123/">inlägg</a>
<a href="/kontakt">Kontakta mig</a> <a href="https://annan.se/kontakt">extern</a><img src="logo@2x.png"></body></html>`
const a = extractContacts(site, "https://www.elinpt.se/")
check(a.name === "Elin Söderberg", "namn ur schema.org/titel", a.name)
check(a.title === "Personlig tränare", "titel", a.title)
check(a.emails[0] === "elin@elinpt.se" && a.emails.includes("info@elinpt.se"), "e-post: mailto först, maskerad adress tolkas", a.emails)
check(!a.emails.some((e) => /sentry|png/.test(e)), "e-post: skript, stilmallar och bildfiler ger inga adresser", a.emails)
check(a.phones.length === 1 && a.phones[0] === "+46701234567", "telefon: +46-format, samma nummer en gång, org.nr och datum räknas inte", a.phones)
check(a.instagram === "elin.pt", "Instagram: profilen, inte ett inlägg", a.instagram)
check(a.city === "Göteborg" && a.gym === null && a.segment === "freelance" && a.isTrainer, "ort, segment frilans, tydlig PT-profil", a)
check(a.specialties.includes("Styrka") && a.specialties.includes("Viktnedgång") && a.specialties.includes("Kost"), "specialiseringar", a.specialties)
check(a.websiteUrl === "https://www.elinpt.se", "webbplats = sidans adress", a.websiteUrl)
check(JSON.stringify(contactLinks(site, "https://www.elinpt.se/")) === JSON.stringify(["https://www.elinpt.se/kontakt"]), "kontaktsida: bara samma domän", contactLinks(site, "https://www.elinpt.se/"))

const linktree = `<html><head><title>@viktorcoach | Linktree</title><meta property="og:description" content="Online coach. Hyrox & löpning. Coaching på distans."></head><body>
<a href="https://www.instagram.com/viktorcoach">IG</a><a href="https://viktorcoaching.se/program?ref=lt">Mina program</a><a href="mailto:hej%40viktorcoaching.se">Mejla</a></body></html>`
const b = extractContacts(linktree, "https://linktr.ee/viktorcoach")
check(b.segment === "influencer" && b.title === "Onlinecoach", "länk-i-bio: influencer / onlinecoach", b)
check(b.emails[0] === "hej@viktorcoaching.se" && b.instagram === "viktorcoach", "länk-i-bio: e-post (URL-kodad) och Instagram", b)
check(b.websiteUrl === "https://viktorcoaching.se/program" && b.name === "viktorcoach", "länk-i-bio: egen webbplats = första externa länken", [b.websiteUrl, b.name])
check(b.specialties.includes("Hyrox") && b.specialties.includes("Löpning") && b.specialties.includes("Onlinecoaching"), "länk-i-bio: specialiseringar", b.specialties)

const gym = `<html><head><title>Amir Rahimi | Personlig tränare</title></head><body><h1>Amir Rahimi</h1><p>PT på SATS Odenplan i Stockholm. Stockholm är hemma. Rehab och styrka.</p><p>amir.rahimi@sats.se · 08-123 456 78</p></body></html>`
const c = extractContacts(gym, "https://amirpt.se/om")
check(c.segment === "gym_chain" && c.gym === "SATS" && c.city === "Stockholm", "gymkedja känns igen på text och e-postdomän", c)
check(c.phones[0] === "+468123456 78".replace(" ", ""), "riktnummer med bindestreck → +46", c.phones)
const empty = extractContacts("<html><body><p>Hej</p></body></html>", "https://exempel-sida.se/")
check(empty.emails.length === 0 && !empty.isTrainer && empty.name === "exempel-sida", "tom sida: inga påhittade uppgifter", empty)
check(extractContacts("<title>&lt;b&gt;x&#x110000;&#xD800;</title>", "https://a.se/").emails.length === 0, "ogiltiga teckenkoder kraschar inte")

// -------------------------------------------------------------- poäng ---
const base = { name: "Elin Söderberg", title: "Personlig tränare", email: "elin@elinpt.se", emailVerified: true, phone: "+46701234567", instagram: "elin.pt", websiteUrl: "https://elinpt.se", gym: "SATS", city: "Göteborg", specialties: ["Styrka"], sourceUrl: "https://elinpt.se" }
check(scoreLead(base).score === 100, "komplett profil = 100", scoreLead(base))
check(scoreLead({ ...base, emailVerified: null }).score === 85, "utan MX-kontroll −15")
check(scoreLead({ ...base, emailVerified: false }).score === 65, "domän som inte tar emot post drar ned")
const thin = scoreLead({ name: "Okänd", title: null, email: null, emailVerified: null, phone: null, instagram: null, websiteUrl: null, gym: null, city: null, specialties: [], sourceUrl: null })
check(thin.score === 1 && thin.breakdown.length === 0, "tom lead = golvet 1", thin)
check(scoreLead({ ...base, email: "elin@gmail.com", instagram: null, websiteUrl: null, sourceUrl: null }).breakdown.some((p) => p.points === -5), "gratisadress utan annan närvaro ger avdrag")
check(scoreLead(base).breakdown.reduce((s, p) => s + p.points, 0) === 100, "delarna summerar till poängen")

// ------------------------------------------------------------- mallar ---
const vars = variablesFor({ name: "Elin Söderberg", gym: "SATS", city: null, specialties: [] })
const r = renderTemplate("Hej {{förnamn}} på {{ gym_eller_företag }} i {{stad}}! {{Förnamn}} {{okänd_sak}}", vars)
check(r.text === "Hej Elin på SATS i din stad! Elin {{okänd_sak}}" && r.unknown[0] === "okänd_sak", "variabler fylls i, reservord när värdet saknas, stavfel rapporteras", r)
check(variablesFor({ name: "  ", gym: null, city: null, specialties: [] }).förnamn === "där", "utan namn: \"Hej där\"")
for (const t of DEFAULT_TEMPLATES) check(renderTemplate(`${t.subject}\n${t.body}`, vars).unknown.length === 0, `startmallen "${t.name}" har bara kända variabler`)
const footer = footerText({ unsubscribeUrl: "https://app.se/avregistrera/abc", sourceUrl: "https://elinpt.se", sender: "Coavira", contactEmail: "kontakt@coavira.fit" })
check(/avregistrera\/abc/.test(footer) && /elinpt\.se/.test(footer) && /kontakt@coavira\.fit/.test(footer), "sidfot: avsändare, källa och avregistreringslänk")
const html = emailHtml('Hej <script>alert(1)</script> & "du"\n\nSe https://coavira.fit.', footer)
check(!html.includes("<script>") && html.includes("&lt;script&gt;") && html.includes('<a href="https://coavira.fit"'), "HTML: text escapas, länkar blir klickbara", html.slice(0, 200))

// ------------------------------------------------------------ utskick ---
const lead = (p: Partial<Lead>): Lead => ({ id: "1", createdAt: "", updatedAt: "", name: "Elin", title: null, segment: "freelance", status: "qualified", email: "elin@elinpt.se", emailVerified: true, phone: null, instagram: null, instagramFollowers: null, websiteUrl: null, gym: null, city: null, specialties: [], source: "manual", sourceUrl: null, score: 50, scoreBreakdown: [], legalBasis: "company", unsubscribedAt: null, lastEmailedAt: null, statusChangedAt: "", companyForm: "ab", orgNumber: null, preferredChannel: "email", nextActionAt: null, nextActionNote: null, lastContactedAt: null, meetingAt: null, convertedAt: null, companyType: "unknown", companyTypeManual: true, enrichmentStatus: "done", enrichment: null, enrichedAt: null, verifiedAt: null, ...p })
const now = new Date("2026-11-16T09:00:00Z") // måndag 10:00 i Sverige
const ctx = { suppressed: false, queued: false, now }
check(blockersFor(lead({}), ctx).length === 0, "komplett lead med rättslig grund får mejlas")
check(blockersFor(lead({ legalBasis: "unknown" }), ctx)[0] === "legal_basis", "utan rättslig grund: spärrad")
check(blockersFor(lead({ email: null }), ctx).includes("no_email"), "utan e-post: spärrad")
check(blockersFor(lead({ unsubscribedAt: now.toISOString() }), ctx).includes("unsubscribed"), "avregistrerad: spärrad")
check(blockersFor(lead({}), { ...ctx, suppressed: true }).includes("suppressed"), "spärrlistad adress: spärrad")
check(blockersFor(lead({ emailVerified: false }), ctx).includes("bad_domain"), "domän utan MX: spärrad")
check(blockersFor(lead({ status: "customer" }), ctx).includes("closed") && blockersFor(lead({ status: "not_relevant" }), ctx).includes("closed"), "kund / ej aktuell: spärrad")
check(blockersFor(lead({ lastEmailedAt: "2026-11-10T09:00:00Z" }), ctx).includes("recently_emailed") && !blockersFor(lead({ lastEmailedAt: "2026-10-20T09:00:00Z" }), ctx).includes("recently_emailed"), "nytt mejl tidigast efter 14 dagar")
check(blockersFor(lead({}), { ...ctx, queued: true }).includes("already_queued"), "redan i kö: spärrad")

const cfg = { ...DEFAULT_QUEUE, dailyCap: 3 }
const plan = planSchedule(5, { now, cfg, random: () => 0 })
check(plan[0].getTime() === now.getTime() && plan[1].getTime() - plan[0].getTime() === 90_000, "kö: första direkt, sedan minst 90 s emellan", plan.map((d) => d.toISOString()))
check(stockholmDay(plan[2]) === "2026-11-16" && stockholmDay(plan[3]) === "2026-11-17", "kö: dygnstaket flyttar resten till nästa dag", plan.map(stockholmDay))
check(plan[3].toISOString() === "2026-11-17T07:00:00.000Z", "kö: nästa dag börjar kl. 08 svensk tid", plan[3].toISOString())
check(nextWindowStart(new Date("2026-11-14T10:00:00Z"), cfg).toISOString() === "2026-11-16T07:00:00.000Z", "kö: lördag → måndag kl. 08")
check(nextWindowStart(new Date("2026-11-16T18:30:00Z"), cfg).toISOString() === "2026-11-17T07:00:00.000Z", "kö: efter kontorstid → nästa morgon")
check(nextWindowStart(new Date("2026-07-06T05:30:00Z"), cfg).toISOString() === "2026-07-06T06:00:00.000Z", "kö: sommartid räknas rätt (08 = 06 UTC)")
const after = planSchedule(1, { now, cfg, lastScheduled: new Date("2026-11-16T09:10:00Z"), random: () => 0 })
check(after[0].toISOString() === "2026-11-16T09:11:30.000Z", "kö: nya mejl hamnar efter det sist köade")
const jit = planSchedule(2, { now, cfg: DEFAULT_QUEUE, random: () => 0.999 })
check(jit[1].getTime() - jit[0].getTime() === 150_000, "kö: slumpen lägger på högst 60 s")
check(planSchedule(2, { now, cfg, sentPerDay: { "2026-11-16": 3 }, random: () => 0 })[0].toISOString() === "2026-11-17T07:00:00.000Z", "kö: redan skickade mejl räknas mot dygnstaket")

// ---------------------------------------------------------------- CSV ---
check(JSON.stringify(parseCsv('a;b\n"x;1";"säger ""hej"""\r\n\r\n')) === JSON.stringify([["a", "b"], ["x;1", 'säger "hej"']]), "CSV: semikolon, citattecken, tomma rader")
const csv = leadsFromCsv("﻿Förnamn;Efternamn;E-post;Telefon;Instagram;Hemsida;Gym;Stad;Okänd\nElin;Söderberg;ELIN@elinpt.se;070-123 45 67;https://instagram.com/elin.pt/;elinpt.se;SATS;göteborg;x\n;;inte-en-adress;;;;;;\n;;;;;;;;y\nAmir;;;;@amir_pt;;;;")
check(csv.leads.length === 2 && csv.skipped.length === 2, "CSV: giltiga rader in, ogiltiga rapporteras med radnummer", csv.skipped)
check(csv.leads[0].name === "Elin Söderberg" && csv.leads[0].email === "elin@elinpt.se" && csv.leads[0].phone === "+46701234567" && csv.leads[0].instagram === "elin.pt" && csv.leads[0].websiteUrl === "https://elinpt.se" && csv.leads[0].city === "Göteborg" && csv.leads[0].segment === "gym_chain", "CSV: fälten normaliseras (e-post, +46, Instagram, https, ort, gymkedja)", csv.leads[0])
check(csv.leads[1].instagram === "amir_pt" && csv.leads[1].name === "Amir" && csv.columns.length === 8, "CSV: okända kolumner hoppas över", csv.columns)
check(normalizeInstagram("@a b") === null && normalizeUrl("javascript:alert(1)") === null && normalizeUrl("ftp://x.se") === null, "ogiltiga Instagram-namn och adresser avvisas")
check(websiteKey("HTTPS://www.ElinPT.se/?utm=1#x") === "elinpt.se" && websiteKey("http://elinpt.se/kontakt/") === "elinpt.se/kontakt", "dubblettnyckel för webbadress = samma regler som databasen")

console.log(failed ? `\n${failed} FEL` : "\nalla CRM-enhetstester gick igenom")
process.exit(failed ? 1 : 0)
