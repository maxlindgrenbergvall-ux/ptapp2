// Enhetstester för Instagram-tolkningen (v49).
//   npx tsx --tsconfig tsconfig.json e2e/instagram.unit.ts
import { hashtagInput, MAX_PROFILES_PER_RUN, ownersFromPosts, parseHandle, parseHandles, parseHashtag, profilesInput, profileToCandidate } from "@/lib/crm/instagram"

let failed = 0
const check = (ok: boolean, name: string, detail?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`)
  if (!ok) failed++
}

// ------------------------------------------------------------ indata ---
check(parseHandle("@Elin.PT") === "Elin.PT" && parseHandle("https://www.instagram.com/elin.pt/?hl=sv") === "elin.pt" && parseHandle("instagram.com/elin.pt") === "elin.pt", "kontonamn ur @, länk och länk med frågesträng")
check(parseHandle("https://www.instagram.com/p/Cabc/") === null && parseHandle("har mellanslag") === null && parseHandle("") === null, "inlägg, ogiltiga tecken och tomt avvisas")
const many = parseHandles(Array.from({ length: 60 }, (_, i) => `@pt${i}`).join("\n") + "\n@PT1\nfel/namn")
check(many.handles.length === MAX_PROFILES_PER_RUN && many.invalid[0] === "fel/namn", "högst 50 per körning, dubbletter (skiftläge) slås ihop, ogiltiga rapporteras", [many.handles.length, many.invalid])
check(parseHashtag("#PersonligTränare") === "personligtränare" && parseHashtag("pt stockholm") === null && parseHashtag("#") === null, "hashtag: å/ä/ö godtas, mellanslag avvisas")
check(JSON.stringify(profilesInput(["elin.pt"])) === JSON.stringify({ directUrls: ["https://www.instagram.com/elin.pt/"], resultsType: "details", resultsLimit: 1, addParentData: false }), "indata för profiler (resultsType details)")
check(hashtagInput("personligtränare", 500).resultsLimit === 100 && hashtagInput("pt", 25).directUrls[0] === "https://www.instagram.com/explore/tags/pt/", "indata för hashtag: tak 100 inlägg")

// ----------------------------------------------------- profiler (Apify) ---
// Fältnamnen som apify/instagram-scraper brukar använda.
const elin = profileToCandidate({
  username: "elin.pt",
  fullName: "Elin Söderberg",
  biography: "Personlig tränare i Göteborg 💪 Styrka & viktnedgång\n📩 elin@elinpt.se | 070-123 45 67",
  externalUrl: "https://elinpt.se/",
  followersCount: 3200,
  businessCategoryName: "Personal Trainer",
  isBusinessAccount: true,
  private: false,
})!
check(elin.lead.name === "Elin Söderberg" && elin.lead.instagram === "elin.pt" && elin.lead.instagramFollowers === 3200, "namn, konto och följare")
check(elin.lead.email === "elin@elinpt.se" && elin.lead.phone === "+46701234567", "e-post och telefon (+46) ur biografin", [elin.lead.email, elin.lead.phone])
check(elin.lead.websiteUrl === "https://elinpt.se" && elin.lead.city === "Göteborg" && elin.lead.segment === "freelance" && elin.lead.title === "Personlig tränare", "webbplats, ort, segment frilans och roll", elin.lead)
check(elin.lead.specialties!.includes("Styrka") && elin.lead.specialties!.includes("Viktnedgång"), "specialiseringar ur biografin")
check(elin.lead.source === "instagram" && elin.lead.sourceUrl === "https://www.instagram.com/elin.pt/" && elin.isTrainer && elin.warnings.length === 0, "källa instagram med profillänk, inga varningar")
check(elin.score >= 70, `Lead Score räknas (${elin.score}), med räckvidd`)

// Andra tänkbara fältnamn och kontaktuppgifter som Instagram visar för företagskonton.
const alt = profileToCandidate({ userName: "viktorcoach", full_name: "Viktor | Online coach", bio: "Hyrox & löpning", external_url: "linktr.ee/viktorcoach", edge_followed_by: { count: 48000 }, public_email: "Hej@Viktorcoaching.se", public_phone_number: "+46 73 987 65 43", is_private: false })!
check(alt.lead.email === "hej@viktorcoaching.se" && alt.lead.phone === "+46739876543" && alt.followers === 48000, "alternativa fältnamn: public_email, public_phone_number, edge_followed_by", alt.lead)
check(alt.lead.segment === "influencer" && alt.lead.title === "Onlinecoach" && alt.lead.websiteUrl === "https://linktr.ee/viktorcoach", "över 5 000 följare/onlinecoach → influencer, länk utan https får https")
const links = profileToCandidate({ username: "amir_pt", biography: "PT på SATS Odenplan, Stockholm", externalUrls: [{ url: "https://www.instagram.com/annat/" }, { url: "https://amirpt.se" }] })!
check(links.lead.websiteUrl === "https://amirpt.se" && links.lead.segment === "gym_chain" && links.lead.gym === "SATS" && links.lead.city === "Stockholm", "externalUrls (Instagram-länkar hoppas över), gymkedja och ort", links.lead)
check(links.warnings.some((w) => /webbplatsen/.test(w)), "saknas e-post men finns webbplats: varning att den kan letas upp")
const priv = profileToCandidate({ username: "hemlig", private: true, biography: "" })!
check(priv.isPrivate && priv.warnings.some((w) => /Privat/.test(w)) && !priv.isTrainer, "privat konto märks")
const bakery = profileToCandidate({ username: "bageriet", fullName: "Bageriet", biography: "Surdeg varje dag" })!
check(!bakery.isTrainer && bakery.warnings.some((w) => /träning/.test(w)), "konto som inte är en tränare märks")
check(profileToCandidate({ error: "not_found", username: "finnsinte" }) === null && profileToCandidate({}) === null, "fel och tomma poster hoppas över")
check(profileToCandidate({ username: "x", biography: "kontakt: ta@bort.png <script>" })!.lead.email === null, "bildfilnamn blir inte e-postadresser")

// ------------------------------------------------------- hashtag-inlägg ---
const owners = ownersFromPosts([{ ownerUsername: "elin.pt" }, { ownerUsername: "ELIN.PT" }, { owner: { username: "viktorcoach" } }, { caption: "utan ägare" }])
check(JSON.stringify(owners) === JSON.stringify(["elin.pt", "viktorcoach"]), "hashtag: unika konton i ordning", owners)

console.log(failed ? `\n${failed} FEL` : "\nalla Instagram-enhetstester gick igenom")
process.exit(failed ? 1 : 0)
