// Enhetstester för friskvård (v75): kalkylator, org/personnummer, chattregler och kvitto-PDF.
//   npx tsx --tsconfig tsconfig.json e2e/wellness.unit.ts
import assert from "node:assert/strict"

import { mentionsOffplatformPayment } from "../src/lib/wellness/off-platform"
import { isValidOrgNumber, normalizeOrgNumber, normalizePersonnummer } from "../src/lib/wellness/identity"
import { priceUnderCap, WELLNESS_TEMPLATE, wellnessCalc } from "../src/lib/wellness/pricing"
import { buildReceiptPdf, includedVat, receiptFromRpc } from "../src/lib/wellness/receipt"

async function main() {
let n = 0
const ok = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(() => {
    n++
    console.log("ok  ", name)
  })

await ok("mallen: titeln ryms i 80 tecken och beskrivningen i 400", () => {
  assert.ok(WELLNESS_TEMPLATE.title.length <= 80)
  assert.ok(WELLNESS_TEMPLATE.description.length <= 400)
  assert.equal(WELLNESS_TEMPLATE.priceSek, 3495)
})

await ok("kalkylator: PT:n får hela priset, klienten betalar pris + avgift", () => {
  const c = wellnessCalc(3000)
  assert.equal(c.ptNet, 3000)
  assert.equal(c.clientTotalApp, 3300)
  assert.equal(c.clientTotalOwn, 3150)
  assert.equal(c.portalNetLow, 2700)
  assert.equal(c.portalNetHigh, 2850)
  assert.equal(c.portalPriceForSameNetLow, 3160)
  assert.equal(c.portalPriceForSameNetHigh, 3335)
})

await ok("kalkylator: föreslår pris under tusentalet när avgiften tar klienten över", () => {
  assert.deepEqual(wellnessCalc(3995).capTip, { cap: 4000, price: 3595, total: 3955 })
  assert.equal(wellnessCalc(3495).capTip, null)
  assert.equal(priceUnderCap(5000, 10), 4495)
  assert.equal(priceUnderCap(2000, 5), 1895)
})

await ok("organisationsnummer: Luhn och normalisering (samma som databasen)", () => {
  assert.equal(isValidOrgNumber("559123-4561"), true)
  assert.equal(isValidOrgNumber("559123-4562"), false)
  assert.equal(isValidOrgNumber("19850101-0113"), true)
  assert.equal(normalizeOrgNumber("5591234561"), "559123-4561")
  assert.equal(normalizeOrgNumber("123"), null)
})

await ok("personnummer: datum och kontrollsiffra", () => {
  assert.equal(normalizePersonnummer("850101-0113"), "850101-0113")
  assert.equal(normalizePersonnummer("198501010113"), "19850101-0113")
  assert.equal(normalizePersonnummer("850101-0114"), null)
  assert.equal(normalizePersonnummer("5591234561"), null, "organisationsnummer är inget personnummer (månad 91)")
})

await ok("chattregler: samma bedömning som databasen", () => {
  for (const s of [
    "Swisha mig på 070-123 45 67",
    "Mitt nummer är +46 70 123 45 67",
    "Swishnummer 123 456 78 90",
    "Du kan betala via ePassi istället",
    "Vi kör betalningen utanför appen",
    "Ring mig på 0701234567",
    "Kan jag betala nästa period via ePassi?",
  ]) assert.equal(mentionsOffplatformPayment(s), true, s)
  for (const s of ["Kör 3x10 på 60 kg, vila 90 s. Ses 07:30 imorgon!", "Bra jobbat, 2026-11-24 blev ett rekordpass", "Hej! Vilket paket passar mig?"])
    assert.equal(mentionsOffplatformPayment(s), false, s)
})

await ok("kvitto: moms som ingår", () => {
  assert.equal(includedVat(3495, 6), 197.83)
  assert.equal(includedVat(3495, 0), 0)
})

await ok("kvitto: PDF med svenska tecken, org.nr och personnummer", async () => {
  const r = receiptFromRpc({
    checkout_id: "c1",
    receipt_number: "CV-2026-000123",
    paid_at: "2026-11-24T10:00:00Z",
    buyer_name: "Åsa Öberg",
    seller: { name: "Petra", company_name: "Petra Friskvård AB", org_number: "559123-4561", company_address: "Storgatan 1, 111 22 Stockholm", vat_registered: true, complete: true },
    lines: [{ title: "Friskvårdsupplägg 3 månader – Personlig träning & skräddarsytt kostschema", quantity: 1, unit_price_sek: 3495, price_sek: 3495, is_wellness_package: true }],
    subtotal_sek: 3495,
    service_fee_sek: 350,
    total_sek: 3845,
    vat_rate: 6,
  })
  const bytes = await buildReceiptPdf(r, { personnummer: "19850101-0113" })
  const head = Buffer.from(bytes.slice(0, 5)).toString("latin1")
  assert.equal(head, "%PDF-")
  assert.ok(bytes.length > 1500)
  const { PDFDocument } = await import("pdf-lib")
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getPageCount(), 1)
  assert.equal(doc.getTitle(), "Friskvårdskvitto CV-2026-000123")
})

console.log(`\nFRISKVÅRD GODKÄND (${n} test)`)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
