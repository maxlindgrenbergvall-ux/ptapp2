import { CITIES, firstNameOf, GYM_CHAINS } from "@/lib/crm/types"

/**
 * Kvalitetsregler för automatisk prospektering (v50). Rena funktioner – samma
 * regler i jobbet, i förhandsgranskningen och i testerna.
 *
 * Målet är få men bra leads: en riktig personlig tränare i Sverige med en
 * direkt, verifierad e-postadress. Hellre tio träffsäkra än hundra blandade.
 */

/** Rolladresser som går till en inkorg för "alla", inte till personen själv. */
const ROLE_LOCAL = new Set([
  "info", "information", "kontakt", "contact", "contacts", "hello", "hallo", "hej", "hejhej", "hey", "hi", "halla",
  "mail", "email", "e-post", "epost", "post", "office", "kontor", "support", "admin", "booking", "bookings", "bokning", "boka",
  "order", "orders", "sales", "salj", "kundtjanst", "kundservice", "service", "team", "noreply", "no-reply", "press", "media",
  "marketing", "jobb", "jobs", "career", "ekonomi", "faktura", "invoice", "webmaster", "studio", "gym", "reception", "coaching",
  "coach", "pt", "training", "traning", "fitness", "member", "medlem", "medlemsservice", "kund", "customer", "inquiries", "enquiries",
])
const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|msn|telia|spray|bredband|comhem|proton|protonmail|tutanota)\.[a-z.]+$/i

/** Bokstäver utan accenter och å/ä/ö (så att "Söderberg" matchar "soderberg"). */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

/** Ord ur ett namn som är långa nog att känna igen i en e-postadress. */
function nameParts(name: string, handle: string): string[] {
  const words = `${name} ${handle}`.split(/[\s._\-|,@]+/).map(fold).filter((w) => w.length >= 3 && /^[a-z]+$/.test(w))
  return [...new Set(words.filter((w) => !["personlig", "tranare", "coach", "coaching", "online", "fitness", "training", "traning", "official"].includes(w)))]
}

export type EmailVerdict = "direct" | "role" | "not_personal" | "invalid"

/**
 * Är adressen en direkt kontaktväg till personen?
 *   direct       – innehåller förnamn/efternamn (eller kontonamnet), eller en
 *                  personlig gratisadress som inte är en rolladress
 *   role         – info@, kontakt@, hej@, booking@ …
 *   not_personal – en företagsadress utan personens namn (t.ex. coach@studio.se)
 */
export function emailVerdict(email: string | null | undefined, name: string, handle = ""): EmailVerdict {
  const e = email?.trim().toLowerCase() ?? ""
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,24}$/.test(e)) return "invalid"
  const local = e.split("@")[0]
  const bare = fold(local).replace(/[^a-z]/g, "")
  if (ROLE_LOCAL.has(local) || ROLE_LOCAL.has(bare) || /^(info|kontakt|contact|hello|hej|booking|bokning|support|admin|noreply|order|team|office)[._-]?[a-z0-9]*$/.test(local)) return "role"
  const parts = nameParts(name, handle)
  if (parts.some((p) => bare.includes(p))) return "direct"
  if (FREE_MAIL.test(e)) return "direct"
  return "not_personal"
}

export const EMAIL_VERDICT_TEXT: Record<Exclude<EmailVerdict, "direct">, string> = {
  role: "Bara en gemensam adress (info@, kontakt@ …)",
  not_personal: "E-posten är inte personens egen",
  invalid: "Ingen e-postadress",
}

/** Konton som inte är personliga tränare även om de nämner träning (hundar, hästar, butiker …). */
export const NOT_TRAINER =
  /\b(kennel\w*|uppfödning|uppfödare|valp\w*|hund\w*|katt(er|uppfödare)?|häst\w*|ridskola|stall\b|frisör\w*|salong\w*|naglar|nagel\w*|lash\w*|fransar|tatuer\w*|restaurang\w*|café|kafé|bageri\w*|konditori|butik\w*|webbshop|webshop|e-handel|fotograf\w*|mäklare|bilverkstad|förening\w*|församling|kyrka|kommun\b|skola\b|förskola|apotek|tandläkare|veterinär\w*|frisyr|skönhet\w*|spa\b|massage(?!\s*terapeut))\b/i

/** Officiella konton för gymkedjor (t.ex. "SATS Sverige") – inte en enskild PT. */
export const isChainAccount = (name: string, handle: string) => GYM_CHAINS.some((g) => g.pattern.test(name) && !/\b(pt|personlig|coach|tränare)\b/i.test(name)) || /^(sats|nordicwellness|nordic_wellness|fitness24seven|actic|stc|friskissvettis)[._]?(sverige|sweden|se)?$/i.test(handle)

const SWEDISH_WORDS = /\b(och|jag|för|med|din|ditt|dina|träning\w*|tränare|boka|hälsa|kost|mål|vill|hjälper|styrka|välkommen|kontakta|personlig|stark\w*)\b/gi

/** Verkar kontot finnas i Sverige? Ort, svensk domän eller telefon, eller svensk text. */
export function looksSwedish(text: string, signals: { email?: string | null; website?: string | null; phone?: string | null; city?: string | null }): boolean {
  if (signals.city && (CITIES as readonly string[]).includes(signals.city)) return true
  if (/\.se$/i.test(signals.email ?? "") || /\.se(\/|$)/i.test((signals.website ?? "").replace(/[?#].*$/, ""))) return true
  if (signals.phone?.startsWith("+46")) return true
  if (/[åäö]/i.test(text)) return true
  return (text.match(SWEDISH_WORDS)?.length ?? 0) >= 2
}

export { firstNameOf }
