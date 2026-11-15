import assert from "node:assert/strict"
import { instagramHref, normalizeInstagram, normalizeWebsite, safeWebsiteHref, websiteLabel } from "../src/lib/trainer-links"

let n = 0
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++; console.log("  ok  ", msg) }
const val = (r: ReturnType<typeof normalizeWebsite>) => (r.ok ? r.value : `ERR:${r.error}`)

ok(val(normalizeWebsite("piapt.se")) === "https://piapt.se", "https:// läggs till")
ok(val(normalizeWebsite("  https://WWW.PiaPT.se/om-mig/ ")) === "https://www.piapt.se/om-mig/", "värdnamn blir gemener, sökvägen behålls")
ok(val(normalizeWebsite("")) === null, "tomt = ingen hemsida")
ok(!normalizeWebsite("javascript:alert(1)").ok, "javascript: stoppas")
ok(!normalizeWebsite("data:text/html,hej").ok, "data: stoppas")
ok(!normalizeWebsite("ftp://piapt.se").ok, "ftp stoppas")
ok(!normalizeWebsite("https://user:pw@piapt.se").ok, "inloggningsuppgifter stoppas")
ok(!normalizeWebsite("https://localhost").ok, "värd utan domän stoppas")
ok(!normalizeWebsite("https://pia pt.se").ok, "mellanslag stoppas")
ok(!normalizeWebsite("https://piapt.se/\"><script>").ok || !val(normalizeWebsite("https://piapt.se/\"><script>"))!.toString().includes("<"), "html i adressen slinker inte igenom")
ok(!normalizeWebsite("https://" + "a".repeat(300) + ".se").ok, "för lång adress stoppas")

const ig = (s: string) => { const r = normalizeInstagram(s); return r.ok ? r.value : null }
ok(ig("@pia.pt") === "pia.pt", "@ tas bort")
ok(ig("https://www.instagram.com/pia.pt/?hl=sv") === "pia.pt", "länk till kontot blir namnet")
ok(ig("instagram.com/pia_pt") === "pia_pt", "länk utan protokoll")
ok(ig("") === null && normalizeInstagram("").ok, "tomt = inget konto")
ok(!normalizeInstagram("pia pt").ok, "mellanslag stoppas")
ok(!normalizeInstagram("a".repeat(31)).ok, "över 30 tecken stoppas")
ok(!normalizeInstagram("pia/../x").ok, "snedstreck stoppas")

ok(safeWebsiteHref("javascript:alert(1)") === null, "osäker länk visas aldrig")
ok(safeWebsiteHref("https://piapt.se") === "https://piapt.se", "säker länk visas")
ok(instagramHref("pia.pt") === "https://www.instagram.com/pia.pt/", "Instagramlänk")
ok(instagramHref("<x>") === null, "felaktigt Instagramnamn ger ingen länk")
ok(websiteLabel("https://www.piapt.se/") === "piapt.se", "badge-text utan www och snedstreck")
console.log(`\n${n} kontroller godkända`)
