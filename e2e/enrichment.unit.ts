// Enhetstest för berikningsmotorn (v54): organisationsnummer, bevis och beslut.
//   npx tsx --tsconfig tsconfig.json e2e/enrichment.unit.ts
import { parseRegistry } from "@/lib/crm/enrichment/registry"
import { decide, type Evidence } from "@/lib/crm/enrichment/decide"
import { classifyNumber, findNumbers, luhnDigit, luhnValid, redactPersonnummer } from "@/lib/crm/enrichment/orgnr"
import { fromLead, fromSearch, fromText, searchQuery } from "@/lib/crm/enrichment/signals"

let failed = 0
const check = (c: boolean, m: string, extra?: unknown) => {
  console.log(c ? "ok  " : "FAIL", m)
  if (!c) {
    failed++
    if (extra !== undefined) console.log("     ", JSON.stringify(extra))
  }
}
const withCheck = (nine: string) => `${nine}${luhnDigit(nine)}`
const AB = withCheck("559123456") // giltigt aktiebolag
const AB_FMT = `${AB.slice(0, 6)}-${AB.slice(6)}`
const PNR = withCheck("850101123") // personnummer (påhittat, giltig kontrollsiffra)
const PNR_FMT = `${PNR.slice(0, 6)}-${PNR.slice(6)}`

// ---------------------------------------------------- organisationsnummer ---
check(luhnValid(AB) && !luhnValid(`${AB.slice(0, 9)}${(Number(AB[9]) + 1) % 10}`), "kontrollsiffran (Luhn) räknas rätt")
check(classifyNumber(AB) === "ab", "5…-nummer med giltig kontrollsiffra = aktiebolag")
check(classifyNumber(withCheck("969123456")) === "handelsbolag" && classifyNumber(withCheck("802012345")) === "forening", "9… = handelsbolag, 8… = förening")
check(classifyNumber(PNR) === "personnummer", "personnummer känns igen på datumet")
check(classifyNumber(withCheck("850161123")) === "personnummer", "samordningsnummer (dag + 60) känns också igen")
check(classifyNumber("5591234560") === "invalid" || luhnValid("5591234560"), "fel kontrollsiffra avvisas")
check(findNumbers(`Org.nr ${AB_FMT} · Göteborg`)[0]?.orgNumber === AB_FMT, "org.nr hittas i en text och formateras")
check(findNumbers(`Organisationsnummer: ${AB}`)[0]?.kind === "ab", "även utan bindestreck")
const p = findNumbers(`Org.nr: ${PNR_FMT}`)
check(p[0]?.kind === "personnummer" && p[0].orgNumber === null, "ett personnummer ger bara signalen – inga siffror")
check(findNumbers(`Född 19${PNR_FMT}`)[0]?.kind === "personnummer", "12-siffrigt personnummer känns igen")
check(!redactPersonnummer(`Org.nr ${PNR_FMT}, ${AB_FMT}`).includes(PNR_FMT) && redactPersonnummer(`Org.nr ${PNR_FMT}, ${AB_FMT}`).includes(AB_FMT), "personnummer tas bort ur texter, org.nr för AB står kvar")
check(findNumbers("Ring 070-123 45 67 eller +46701234567").length === 0, "telefonnummer är inga organisationsnummer")

// ---------------------------------------------------------------- bevis ---
const base = { email: null, gym: null, segment: "freelance" as const, instagramFollowers: null, orgNumber: null, title: null }
check(fromLead({ ...base, email: "anna.berg@sats.se" }).some((e) => e.kind === "gym_email" && e.weight >= 90), "e-post på SATS domän = kedjans adress")
check(fromLead({ ...base, gym: "Nordic Wellness" }).some((e) => e.kind === "gym" && /Nordic Wellness/.test(e.detail)), "gym-fältet ger rollen gym-PT")
check(fromLead({ ...base, segment: "influencer" }).some((e) => e.kind === "influencer"), "segmentet influencer ger rollen")
check(fromLead({ ...base, instagramFollowers: 12000 }).some((e) => e.kind === "influencer"), "många följare ger rollen influencer")
check(fromLead({ ...base, orgNumber: AB_FMT }).some((e) => e.kind === "ab" && e.orgNumber === AB_FMT), "ett angivet org.nr räknas")

const site = fromText(`Söderberg Träning AB · Org.nr ${AB_FMT} · Kontakt`, "website", "https://soderbergtraning.se")
check(site.some((e) => e.kind === "ab" && e.weight >= 90 && e.orgNumber === AB_FMT), "webbplats med org.nr = aktiebolag (hög vikt)")
check(fromText("Personlig träning i Göteborg Söderberg Träning AB", "website").some((e) => e.detail === 'Bolagsnamn "Söderberg Träning AB"'), "bolagsnamnet tas utan ord från meningen före")
check(fromText("Jag driver enskild firma med F-skatt", "website").some((e) => e.kind === "enskild" && e.weight >= 70), "\"enskild firma\" på webbplatsen")
const ef = fromText(`Elin PT · Org.nr: ${PNR_FMT}`, "website")
check(ef.some((e) => e.kind === "enskild") && !JSON.stringify(ef).includes(PNR_FMT), "personnummer som org.nr = enskild firma, siffrorna sparas inte")
check(fromText("Personlig tränare i Malmö sedan 2015", "website").length === 0, "en vanlig text ger inga bevis")
check(fromText("Medlem på SATS AB sedan 2019", "website").every((e) => e.kind !== "ab"), "kedjans eget bolagsnamn räknas inte som PT:ns AB")
check(fromText("Ingen F-skatt – jag tränar vänner och familj", "website").some((e) => e.kind === "private"), "ingen F-skatt = privatperson")

const lead = { name: "Anna Lind", city: "Göteborg" }
const hits = fromSearch(
  [
    { title: "Anna Lind – Lind Hälsa AB", url: "https://www.allabolag.se/x", snippet: `Styrelseledamot i Lind Hälsa AB (${AB_FMT}), Göteborg.` },
    { title: "Anna Lindqvist", url: "https://www.merinfo.se/y", snippet: `Org.nr ${withCheck("556999888")}` },
    { title: "Lind, Erik", url: "https://ratsit.se/z", snippet: "Enskild firma i Malmö" },
  ],
  lead
)
check(hits.length === 1 && hits[0].kind === "ab" && hits[0].orgNumber === AB_FMT && hits[0].weight === 80, "sökträff med namn + ort ger AB (namne och annan person räknas inte)", hits)
check(fromSearch([{ title: "Anna Lind, Göteborg", url: "https://www.merinfo.se/a", snippet: `Enskild firma. ${PNR_FMT}` }], lead).some((e) => e.kind === "enskild"), "registerutdrag för enskild firma")
check(searchQuery(lead) === '"Anna Lind" Göteborg (organisationsnummer OR "enskild firma" OR aktiebolag)', "sökfrågan: namn, ort och registerord")

// --------------------------------------------------------------- beslut ---
const ev = (p: Partial<Evidence>): Evidence => ({ source: "website", kind: "ab", weight: 90, detail: "x", ...p })
const unknown = { legalBasis: "unknown" as const }
let d = decide([ev({ kind: "gym_email", weight: 95, detail: "E-post på SATS" })], unknown)
check(d.type === "gym_anstalld" && d.companyForm === "ab" && d.legalBasis === "company" && d.salesAllowed, "kedjans e-post → gym-PT, B2B tillåtet")
d = decide([ev({ orgNumber: AB_FMT })], unknown)
check(d.type === "ab" && d.legalBasis === "company" && d.orgNumber === AB_FMT && !d.verified, "org.nr på webbplatsen → AB, säljande mallar")
d = decide([ev({ orgNumber: AB_FMT }), ev({ source: "bolagsverket", weight: 97, orgNumber: AB_FMT, verified: true })], unknown)
check(d.verified && d.confidence === 97, "bekräftat hos Bolagsverket → verifierat")
d = decide([ev({ orgNumber: AB_FMT, weight: 80 }), ev({ source: "bolagsverket", kind: "inactive", weight: 95, orgNumber: AB_FMT })], unknown)
check(d.type !== "ab" && d.legalBasis === "research", "avregistrerat bolag räknas inte")
d = decide([ev({ kind: "enskild", weight: 85 })], unknown)
check(d.type === "enskild_firma" && d.companyForm === "enskild" && d.legalBasis === "research" && !d.salesAllowed, "enskild firma → låst till referensgrupp/DM")
d = decide([ev({ kind: "private", weight: 75 })], unknown)
check(d.type === "privatperson" && d.legalBasis === "research", "privatperson → låst")
d = decide([ev({ source: "lead", kind: "gym", weight: 60, detail: "PT på SATS" })], unknown)
check(d.type === "gym_anstalld" && d.legalBasis === "research" && !d.salesAllowed, "gym-PT med privat adress → låst tills ett AB hittas")
d = decide([ev({ source: "lead", kind: "gym", weight: 60 }), ev({ orgNumber: AB_FMT })], unknown)
check(d.type === "ab", "gym-PT med eget AB → AB")
d = decide([ev({ source: "lead", kind: "influencer", weight: 60 })], unknown)
check(d.type === "influencer" && d.legalBasis === "research", "influencer utan bolagsform → låst")
d = decide([ev({ source: "search", kind: "ab", weight: 60 })], unknown)
check(d.type === "unknown" && d.status === "needs_review" && d.legalBasis === "research", "svagt bevis → okänd, granska, låst")
d = decide([], unknown)
check(d.type === "unknown" && d.status === "needs_review", "inga bevis → granska")
d = decide([ev({ kind: "enskild", weight: 85 })], { legalBasis: "consent" })
check(d.legalBasis === null && d.salesAllowed, "samtycke ändras aldrig")
d = decide([ev({ kind: "enskild", weight: 85 }), ev({ orgNumber: AB_FMT, weight: 90 })], unknown)
check(d.type === "ab", "ett starkt AB-bevis väger tyngre än ett EF-bevis")

// ----------------------------------------------------------- Bolagsverket ---
const bv = (json: unknown) => parseRegistry(json)
check(bv({ organisationer: [{ organisationsform: { kod: "AB", klartext: "Aktiebolag" }, organisationsnamn: { namn: "Lind Hälsa AB" } }] })?.isAktiebolag === true, "svar med organisationsform AB")
check(bv({ organisationsform: "Aktiebolag", namn: "X AB" })?.isAktiebolag === true, "organisationsform som text")
check(bv({ organisationsform: { kod: "HB", klartext: "Handelsbolag" } })?.isAktiebolag === false, "handelsbolag är inget aktiebolag")
check(bv({ organisationer: [{ organisationsform: { kod: "AB" }, avregistreringsdatum: "2024-01-01" }] })?.inactive === true, "avregistrerat bolag känns igen")
check(bv({ organisationer: [{ organisationsform: { kod: "AB" }, avregistreringsdatum: null }] })?.inactive === false, "inget avregistreringsdatum = aktivt")
check(bv({ helt: "annat" }) === null && bv(null) === null, "oväntat svar = inget besked (aldrig ett påhittat AB)")

console.log(failed ? `\n${failed} fel` : "\nBERIKNINGSMOTORN GODKÄND")
process.exit(failed ? 1 : 0)
