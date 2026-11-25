// E2E (Supabase-läge) för v81: portalverifieringen och aktiveringen mot mocken.
//  - PT:n slår på en portal → verifieringskortet (leverantörs-ID, bevis, intygande)
//  - beviset laddas upp i den privata bucketen, i PT:ns egen mapp (inte via servern)
//  - submit_wellness_verification → "Granskas"
//  - aktiverad PT (Stripe + paket): ingen checklista, inbjudan öppen
// Kräver mock-supabase (se v16-supabase.test.mjs).
//   BASE_URL=http://localhost:3000 node e2e/v81-supabase.test.mjs [skärmbildsmapp]
import fs from "node:fs"
import { chromium } from "playwright"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))
const getLog = async () => (await fetch(`${mock}/__log`)).json()
await fetch(`${mock}/__reset`)

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "sv-SE", colorScheme: "dark", deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(e.message))
await p.goto(base + "/logga-in/pt")
await p.fill("#email", "elin@test.se")
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForURL(/\/pt(\?|$)/)
await p.waitForLoadState("networkidle")
check((await p.locator("[data-testid=activation-checklist]").count()) === 0, "aktiverad PT (Stripe + paket): ingen checklista")
check((await p.locator("[data-testid=invite-client]").first().getAttribute("data-locked")) === "false", "aktiverad PT: inbjudan är öppen")

await p.goto(base + "/pt/profil")
const settings = p.locator("[data-testid=wellness-settings]")
await settings.waitFor()
await settings.locator("[data-testid=portal-acceptsEpassi]").click()
const card = settings.locator("[data-testid=wellness-verification]")
await card.waitFor()
check((await card.getAttribute("data-status")) === "none", "ny portal: verifieringskortet visas")
await card.locator("#wellness-merchant-id").fill("Elin Test PT (ePassi 4711)")
await card.locator("[data-testid=wellness-proof]").setInputFiles({ name: "avtal.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%test\n") })
await card.locator("[data-testid=wellness-attest]").click()
await fetch(`${mock}/__reset`)
await card.locator("[data-testid=wellness-submit]").click()
await settings.locator("[data-testid=wellness-verification][data-status=pending]").waitFor()
ok("inskickat: \"Granskas\"")
const log = await getLog()
const upload = log.find((e) => e.table === "storage.upload.wellness-verifications")
check(upload && !upload.body.service && /^[0-9a-f-]{36}\/\d+-bevis\.pdf$/.test(upload.body.path), "beviset laddas upp av PT:n själv i den egna mappen", upload?.body)
const portals = log.find((e) => e.table === "trainers" && e.method === "PATCH" && "accepts_epassi" in (e.body ?? {}))
check(portals?.body.accepts_epassi === true, "portalerna sparas före inskicket")
const submit = log.find((e) => e.table === "submit_wellness_verification")
check(submit?.body.p_attested === true && submit.body.p_merchant_id === "Elin Test PT (ePassi 4711)" && submit.body.p_proof_path === upload?.body.path, "submit_wellness_verification med ID, bevis och intygande")
await p.screenshot({ path: `${out}/v81-verifiering.png` })

check(errors.length === 0, `inga sidfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
