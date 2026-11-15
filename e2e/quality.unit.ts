// Enhetstester för kvalitetsreglerna i prospekteringen (v50).
//   npx tsx --tsconfig tsconfig.json e2e/quality.unit.ts
import { profileToCandidate } from "@/lib/crm/instagram"
import { emailVerdict, isChainAccount, looksSwedish, NOT_TRAINER } from "@/lib/crm/quality"

let failed = 0
const check = (ok: boolean, name: string, detail?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`)
  if (!ok) failed++
}

// ---------------------------------------------------------- e-post ---
const cases: [string, string, string, string][] = [
  ["elin@elinpt.se", "Elin Söderberg", "elin.pt", "direct"],
  ["e.soderberg@studio.se", "Elin Söderberg", "elin.pt", "direct"],
  ["jonas.ek@gmail.com", "Jonas Ek", "jonas.pt", "direct"],
  ["traningmedjonas@gmail.com", "Jonas Ek", "jonas.pt", "direct"],
  ["elinpt@elinpt.se", "", "elin.pt", "direct"],
  ["info@elinpt.se", "Elin Söderberg", "elin.pt", "role"],
  ["Kontakt@elinpt.se", "Elin Söderberg", "elin.pt", "role"],
  ["hej@viktorcoaching.se", "Viktor Lund", "viktorcoach", "role"],
  ["booking@ptstudio.se", "Amir Rahimi", "amir_pt", "role"],
  ["info.stockholm@ptstudio.se", "Amir Rahimi", "amir_pt", "role"],
  ["coach@ptstudio.se", "Amir Rahimi", "amir_pt", "role"],
  ["reception@sats.se", "Amir Rahimi", "amir_pt", "role"],
  ["studio.city@ptstudio.se", "Amir Rahimi", "amir_pt", "not_personal"],
  ["", "Amir", "amir", "invalid"],
]
for (const [email, name, handle, want] of cases) check(emailVerdict(email, name, handle) === want, `e-post ${email || "(tom)"} → ${want}`, emailVerdict(email, name, handle))

// ------------------------------------------------------------ PT? ---
check(NOT_TRAINER.test("Kennelklubb för golden retriever – valpar") && NOT_TRAINER.test("Frisörsalong i Malmö") && !NOT_TRAINER.test("Personlig tränare i Malmö"), "kennel och salong sorteras bort, PT inte")
check(isChainAccount("SATS Sverige", "sats_sverige") && !isChainAccount("Amir | PT på SATS", "amir_pt"), "gymkedjans eget konto ≠ PT som jobbar där")
const kennel = profileToCandidate({ username: "kennelklubben", fullName: "Kennel Guldklimpen", biography: "Kennelklubb – golden retriever. Valpar och träning för hundar. Coach för valpägare.", private: false })!
check(!kennel.isTrainer && kennel.warnings.some((w) => /kennel/.test(w)), "kennelklubb som nämner 'träning' och 'coach' räknas inte som PT", kennel.warnings)
const chain = profileToCandidate({ username: "sats_sverige", fullName: "SATS Sverige", biography: "Personlig träning och gruppträning i hela Sverige", private: false })!
check(!chain.isTrainer, "gymkedjans eget konto räknas inte som PT")

// --------------------------------------------------------- Sverige? ---
check(looksSwedish("Personlig tränare", {}) && looksSwedish("Coach", { city: "Umeå" }) && looksSwedish("Coach", { email: "a@b.se" }) && looksSwedish("Coach", { phone: "+46701234567" }), "svenska signaler: å/ä/ö, ort, .se, +46")
check(!looksSwedish("Online fitness coach based in Los Angeles. DM for coaching", { email: "mike@mikecoach.com" }), "engelsk profil i USA räknas inte som svensk")
check(looksSwedish("Online coach - boka din tid med mig och nå dina mål", {}), "svensk text utan å/ä/ö känns igen på orden")

// ------------------------------------------------------- kandidat ---
const good = profileToCandidate({ username: "jonas.pt", fullName: "Jonas Ek", biography: "PT i Stockholm. Boka: jonas.ek@gmail.com", private: false })!
check(good.isTrainer && good.isSwedish && good.directEmail && good.warnings.length === 0, "riktig PT i Sverige med direkt e-post: inga varningar", good.warnings)
const info = profileToCandidate({ username: "malin.pt", fullName: "Malin Persson", biography: "Personlig tränare i Malmö. Boka: info@infopt.se", private: false })!
check(info.isTrainer && !info.directEmail && info.warnings.some((w) => /gemensam adress/.test(w)), "info@-adress märks som gemensam adress", info.warnings)
const related = profileToCandidate({ username: "elin.pt", fullName: "Elin", biography: "PT i Göteborg", relatedProfiles: [{ username: "jonas.pt" }, { username: "karin.coach" }, "anna_pt", { foo: 1 }] })!
check(JSON.stringify(related.related) === JSON.stringify(["jonas.pt", "karin.coach", "anna_pt"]), "liknande konton läses (objekt eller strängar)", related.related)

console.log(failed ? `\n${failed} FEL` : "\nalla kvalitetsregler gick igenom")
process.exit(failed ? 1 : 0)
