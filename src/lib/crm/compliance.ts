/**
 * Svensk B2B-compliance för utskick (v53) – rena funktioner som delas av
 * gränssnittet (förval och varningar) och servern (det som faktiskt får gå ut).
 *
 * Grunden:
 *   - Marknadsföringslagen 19 §: e-post med direktmarknadsföring till en
 *     FYSISK person kräver förhandssamtycke. En enskild näringsidkare (enskild
 *     firma) räknas som fysisk person – även i yrkesrollen.
 *   - Till en JURIDISK person (aktiebolag, eller en anställd på bolagets
 *     adress) får B2B-mejl skickas utan samtycke, men mottagaren ska alltid
 *     kunna tacka nej enkelt (19–21 §§) – därför avregistreringslänken.
 *   - GDPR art. 14 och 21: berätta var uppgifterna kommer ifrån, och radera
 *     dem när personen säger nej.
 *
 * Därför: en enskild firma utan samtycke får bara ett genuint icke-säljande
 * mejl (referensgruppen) – utan pris, erbjudande, länkar eller uppmaning att
 * registrera sig – och ingen automatisk uppföljning. Annars: Instagram-DM.
 * Det här är en försiktig tolkning, inte juridisk rådgivning.
 */
import type { Channel, CompanyForm, EmailTemplate, Lead, LegalBasis, Segment } from "@/lib/crm/types"

// ------------------------------------------------------ bolagsform ---
/** Aktiebolag har organisationsnummer som börjar på 5 (556…, 559…). */
const ORG_NR = /\b(?:org(?:anisations)?\.?\s*-?\s*(?:nr|nummer)\.?:?\s*)?(5\d{5})[-\s]?(\d{4})\b/i
const AB_NAME = /\b(?:[A-ZÅÄÖ][\wåäöÅÄÖ&.-]*\s+)+AB\b|\baktiebolag(?:et)?\b|\bi\s+sverige\s+ab\b/
const ENSKILD = /\benskild(?:\s+firma|\s+näringsidkare)\b|\bEF\b(?=\s*[·|,.)–-]|\s*$)/i

/**
 * Bolagsform utifrån publik text (webbsida, Instagram-bio). Ett
 * organisationsnummer som börjar på 5 är ett aktiebolag. Enskilda firmor har
 * ägarens personnummer – det letar vi aldrig efter och sparar aldrig.
 */
export function detectCompanyForm(text: string): { form: CompanyForm; orgNumber: string | null } {
  const org = ORG_NR.exec(text)
  if (org) return { form: "ab", orgNumber: `${org[1]}-${org[2]}` }
  if (ENSKILD.test(text)) return { form: "enskild", orgNumber: null }
  if (AB_NAME.test(text)) return { form: "ab", orgNumber: null }
  return { form: "unknown", orgNumber: null }
}

/** Gymkedjans PT:er mejlas på arbetsgivarens (bolagets) adress. */
export const impliedCompanyForm = (segment: Segment, form: CompanyForm): CompanyForm => (form === "unknown" && segment === "gym_chain" ? "ab" : form)

/**
 * När bolagsformen sätts: välj rätt rättslig grund automatiskt (samtycke
 * ändras aldrig – det är starkare än allt annat).
 *   enskild → "Icke-säljande förfrågan" (bara referensgruppsmallen får gå ut)
 *   ab      → "Företagsadress"
 */
export function legalBasisFor(form: CompanyForm, current: LegalBasis): LegalBasis {
  if (current === "consent") return current
  if (form === "enskild") return "research"
  if (form === "ab") return "company"
  return current === "research" ? "unknown" : current
}

/** Rekommenderad kanal: enskild firma utan samtycke och med Instagram → DM. */
export function recommendedChannel(lead: Pick<Lead, "companyForm" | "legalBasis" | "email" | "instagram" | "phone">): Channel {
  if (lead.companyForm === "enskild" && lead.legalBasis !== "consent" && lead.instagram) return "instagram"
  if (lead.email) return "email"
  if (lead.instagram) return "instagram"
  return lead.phone ? "phone" : "email"
}

// ----------------------------------------------- icke-säljande text ---
/**
 * Ord och mönster som gör ett mejl säljande. En mall av typen "research" som
 * innehåller något av detta får inte gå till en enskild firma.
 */
const SALES: { pattern: RegExp; label: string }[] = [
  { pattern: /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:se|com|fit|app|io)\b/i, label: "länk" },
  { pattern: /\b\d[\d\s]*(?:kr|kronor|sek|:-)(?=\W|$)/i, label: "pris" },
  { pattern: /\b(?:pris(?:er|et)?|kostar|kostnad|rabatt\w*|erbjudande\w*|kampanj\w*|gratis|kostnadsfri\w*|provperiod|abonnemang\w*|prenumeration\w*)\b/i, label: "pris eller erbjudande" },
  { pattern: /\b(?:registrera\s+dig|skapa\s+(?:ett\s+)?konto|ladda\s+ner|köp\w*|beställ\w*|testa\s+(?:appen|gratis)|prova\s+(?:appen|gratis))\b/i, label: "uppmaning att köpa eller registrera sig" },
]

/** Det som gör texten säljande (tom lista = icke-säljande). */
export function salesIssues(text: string): string[] {
  return SALES.filter((s) => s.pattern.test(text)).map((s) => s.label)
}

// --------------------------------------------------------- mallval ---
export type TemplateBlock =
  | { code: "needs_research"; text: string }
  | { code: "research_is_sales"; text: string }
  | { code: "company_form_mismatch"; text: string }

/** Får den här mallen gå till den här leaden? (null = ja) */
export function templateBlock(
  lead: Pick<Lead, "companyForm" | "legalBasis">,
  template: Pick<EmailTemplate, "kind" | "companyForm" | "subject" | "body" | "followupBody">
): TemplateBlock | null {
  if (template.kind === "research") {
    const issues = salesIssues(`${template.subject}\n${template.body}\n${template.followupBody ?? ""}`)
    if (issues.length) return { code: "research_is_sales", text: `Mallen ska vara icke-säljande men innehåller ${[...new Set(issues)].join(", ")}` }
  }
  const restricted = lead.legalBasis !== "consent" && (lead.companyForm === "enskild" || lead.legalBasis === "research")
  if (restricted && template.kind !== "research") {
    return { code: "needs_research", text: "Enskild firma utan samtycke: bara den icke-säljande referensgruppsmallen får användas (eller Instagram-DM)" }
  }
  if (template.companyForm && template.companyForm !== lead.companyForm && lead.legalBasis !== "consent") {
    return { code: "company_form_mismatch", text: `Mallen är till för ${template.companyForm === "ab" ? "aktiebolag" : "enskilda firmor"}` }
  }
  return null
}

/**
 * Bästa mallen för en lead:
 *   1. Enskild firma utan samtycke → den icke-säljande referensgruppsmallen.
 *   2. Gymkedja → gymkedjemallen.
 *   3. Annars mall för leadens segment + bolagsform, sedan segment, sedan bolagsform.
 * Arkiverade och spärrade mallar väljs aldrig.
 */
export function bestTemplate<T extends Pick<EmailTemplate, "kind" | "companyForm" | "segment" | "subject" | "body" | "followupBody" | "key">>(
  templates: T[],
  lead: Pick<Lead, "companyForm" | "legalBasis" | "segment">
): T | undefined {
  const allowed = templates.filter((t) => !templateBlock(lead, t))
  const restricted = lead.legalBasis !== "consent" && (lead.companyForm === "enskild" || lead.legalBasis === "research")
  if (restricted) return allowed.find((t) => t.kind === "research")
  // Med samtycke spelar bolagsformen ingen roll för vad som är tillåtet – bara för vad som passar bäst.
  const formFit = (t: T) => (t.companyForm === lead.companyForm ? 2 : t.companyForm === null ? 1 : lead.legalBasis === "consent" ? 0 : -10)
  const score = (t: T) =>
    (t.segment === lead.segment ? 4 : t.segment === null ? 1 : -10) +
    formFit(t) +
    (t.kind === "intro" ? 1 : 0) +
    (t.key ? 0.5 : 0)
  return allowed.filter((t) => score(t) > 0).sort((a, b) => score(b) - score(a))[0]
}

/** Text till gränssnittet: vad som rekommenderas för leaden, och varför. */
export function recommendation(lead: Pick<Lead, "companyForm" | "legalBasis" | "segment" | "instagram" | "email">): string {
  if (lead.legalBasis === "consent") return "Samtycke finns – alla mallar går att använda."
  if (lead.companyForm === "enskild") {
    return lead.instagram
      ? "Enskild firma: skicka ett Instagram-DM eller den icke-säljande referensgruppsmallen. Ingen automatisk uppföljning."
      : "Enskild firma: bara den icke-säljande referensgruppsmallen får mejlas. Ingen automatisk uppföljning."
  }
  if (lead.companyForm === "ab") return lead.segment === "gym_chain" ? "Gymkedja (bolagets adress): B2B-mallen för gymkedjor med uppföljning." : "Aktiebolag: B2B-mallen med en diskret uppföljning efter fyra dagar."
  return "Bedöm bolagsformen först – AB eller enskild firma avgör vad som får skickas."
}
