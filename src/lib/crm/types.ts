import type { CompanyType, EnrichmentStatus, Evidence } from "@/lib/crm/enrichment/decide"

/**
 * CRM för B2B-prospektering (v47, /admin/leads) – typer och etiketter som delas
 * av servern och gränssnittet. Inga hemligheter och ingen serverkod här.
 */

export const SEGMENTS = ["freelance", "influencer", "gym_chain"] as const
export type Segment = (typeof SEGMENTS)[number]
export const SEGMENT_LABEL: Record<Segment, string> = {
  freelance: "Frilans",
  influencer: "Influencer",
  gym_chain: "Gymkedja",
}
export const SEGMENT_LONG: Record<Segment, string> = {
  freelance: "Frilansande PT / egen företagare",
  influencer: "PT-influencer / onlinecoach",
  gym_chain: "PT på gymkedja",
}

/** Statusflödet, i ordning. "not_relevant" är avslutet vid sidan av. */
export const STATUSES = ["new", "qualified", "emailed", "replied", "meeting", "customer", "not_relevant"] as const
export type Status = (typeof STATUSES)[number]
export const STATUS_LABEL: Record<Status, string> = {
  new: "Ny lead",
  qualified: "Kvalificerad",
  // v53: kontakt i vilken kanal som helst (mejl eller Instagram-DM).
  emailed: "Kontaktad",
  replied: "Svarat / intresserad",
  meeting: "Samtal bokat",
  customer: "Onboarding / kund",
  not_relevant: "Ej aktuell",
}
/** Leaden har svarat eller kommit längre (då pausas alla automatiska utskick). */
export const ENGAGED: Status[] = ["replied", "meeting", "customer"]

/**
 * Bolagsform (v53) – avgör vilka utskick som är tillåtna:
 *   ab       aktiebolag (juridisk person): B2B-mejl på företagsadress är tillåtet,
 *            med tydlig avregistrering (marknadsföringslagen 19–21 §§).
 *   enskild  enskild näringsidkare / enskild firma: räknas som fysisk person.
 *            Säljande mejl kräver samtycke. Utan samtycke: bara den
 *            icke-säljande referensgruppsmallen – eller Instagram-DM.
 *   unknown  inte bedömd.
 */
export const COMPANY_FORMS = ["unknown", "ab", "enskild"] as const
export type CompanyForm = (typeof COMPANY_FORMS)[number]
export const COMPANY_FORM_LABEL: Record<CompanyForm, string> = { unknown: "Inte bedömd", ab: "Aktiebolag (AB)", enskild: "Enskild firma" }
export const COMPANY_FORM_SHORT: Record<CompanyForm, string> = { unknown: "?", ab: "AB", enskild: "EF" }

export const CHANNELS = ["email", "instagram", "phone"] as const
export type Channel = (typeof CHANNELS)[number]
export const CHANNEL_LABEL: Record<Channel, string> = { email: "E-post", instagram: "Instagram-DM", phone: "Telefon" }

/**
 * Varför vi får mejla (marknadsföringslagen 19 § och GDPR):
 *   company  – adressen hör till en juridisk person (t.ex. info@gymmet.se eller
 *              en anställds jobbadress hos en gymkedja) och mejlet rör yrkesrollen
 *   consent  – personen har själv bett om kontakt / samtyckt
 *   unknown  – inte bedömt än. Utskick är spärrade tills någon tagit ställning.
 * Enskild firma räknas som fysisk person: då krävs samtycke.
 */
export const LEGAL_BASES = ["unknown", "company", "research", "consent"] as const
export type LegalBasis = (typeof LEGAL_BASES)[number]
export const LEGAL_LABEL: Record<LegalBasis, string> = {
  unknown: "Inte bedömd",
  company: "Företagsadress (AB)",
  research: "Icke-säljande förfrågan (EF)",
  consent: "Samtycke",
}

export type LeadSource = "manual" | "csv" | "url" | "search" | "instagram"
export const SOURCE_LABEL: Record<LeadSource, string> = { manual: "Manuellt", csv: "CSV-import", url: "Webbsida", search: "Sökning", instagram: "Instagram (Apify)" }

export interface ScorePart {
  label: string
  points: number
}

export interface Lead {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  title: string | null
  segment: Segment
  status: Status
  email: string | null
  /** MX-kontroll: null = inte kontrollerad. */
  emailVerified: boolean | null
  phone: string | null
  /** Kontonamn utan @. */
  instagram: string | null
  /** Antal följare när profilen hämtades (v49). */
  instagramFollowers: number | null
  websiteUrl: string | null
  gym: string | null
  city: string | null
  specialties: string[]
  source: LeadSource
  sourceUrl: string | null
  score: number
  scoreBreakdown: ScorePart[]
  legalBasis: LegalBasis
  unsubscribedAt: string | null
  lastEmailedAt: string | null
  statusChangedAt: string
  // v53
  companyForm: CompanyForm
  /** Bara aktiebolagets organisationsnummer (5xxxxx-xxxx) – aldrig ett personnummer. */
  orgNumber: string | null
  preferredChannel: Channel
  nextActionAt: string | null
  nextActionNote: string | null
  lastContactedAt: string | null
  meetingAt: string | null
  convertedAt: string | null
  // v54: berikningsmotorn
  /** Bolagstyp och roll (ab, enskild_firma, gym_anstalld, influencer, privatperson, unknown). */
  companyType: CompanyType
  /** Satt för hand – motorn rör den inte. */
  companyTypeManual: boolean
  enrichmentStatus: EnrichmentStatus
  enrichment: EnrichmentResult | null
  enrichedAt: string | null
  /** Bekräftat hos Bolagsverket (aktivt aktiebolag). */
  verifiedAt: string | null
}

/** Det motorn sparar: bevisen och slutsatsen (aldrig ett personnummer). */
export interface EnrichmentResult {
  evidence: Evidence[]
  confidence: number
  summary: string
  /** Källor som inte gick att använda (inte konfigurerade, fel …). */
  skipped: string[]
}

/** Det som går att ange när en lead skapas eller ändras. */
export type LeadInput = Partial<
  Pick<
    Lead,
    | "name" | "title" | "segment" | "status" | "email" | "emailVerified" | "phone" | "instagram" | "instagramFollowers" | "websiteUrl" | "gym" | "city" | "specialties" | "source" | "sourceUrl" | "legalBasis"
    | "companyForm" | "orgNumber" | "preferredChannel" | "nextActionAt" | "nextActionNote" | "meetingAt"
    | "companyType"
  >
>
/** Fält som bara servern sätter (utskick, aktiviteter, avregistrering). */
export type ServerLeadPatch = LeadInput & {
  lastEmailedAt?: string
  unsubscribedAt?: string | null
  lastContactedAt?: string
  convertedAt?: string | null
  // v54: sätts av berikningsmotorn (och av en manuell ändring)
  companyTypeManual?: boolean
  enrichmentStatus?: EnrichmentStatus
  enrichment?: EnrichmentResult | null
  enrichedAt?: string | null
  verifiedAt?: string | null
}

export interface Note {
  id: string
  leadId: string
  body: string
  createdAt: string
}

/**
 * Malltyp (v53):
 *   intro     vanligt B2B-mejl (aktiebolag, gymkedjor, samtycke).
 *   research  icke-säljande förfrågan (referensgrupp) – det enda som får gå
 *             till en enskild firma utan samtycke. Får inte innehålla pris,
 *             erbjudanden, länkar eller uppmaningar att registrera sig.
 */
export type TemplateKind = "intro" | "research"
export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = { intro: "Säljande (B2B)", research: "Icke-säljande (referensgrupp)" }

export interface EmailTemplate {
  id: string
  /** Startmallens nyckel (null = egen mall). */
  key: string | null
  segment: Segment | null
  kind: TemplateKind
  /** Bolagsformen mallen är till för (null = alla). */
  companyForm: CompanyForm | null
  name: string
  subject: string
  body: string
  /** Automatisk uppföljning efter så här många dagar utan svar (null = ingen). */
  followupDays: number | null
  followupSubject: string | null
  followupBody: string | null
  updatedAt: string
}
export type TemplateInput = Omit<EmailTemplate, "id" | "key" | "updatedAt"> & { id?: string }

/** Aktiviteter som loggas för hand (v53). */
export const ACTIVITY_KINDS = ["dm_sent", "dm_reply", "email_reply", "call_booked", "call_held", "no_show", "converted"] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  dm_sent: "DM skickat",
  dm_reply: "Svar på DM",
  email_reply: "Svar på mejl",
  call_booked: "Samtal bokat",
  call_held: "Samtal genomfört",
  no_show: "Uteblev från samtal",
  converted: "Blev PT i Coavira",
}
export interface Activity {
  id: string
  leadId: string
  kind: ActivityKind
  body: string | null
  occurredAt: string
}

export const EMAIL_STATUSES = ["pending_approval", "queued", "sending", "sent", "delivered", "bounced", "complained", "failed", "cancelled"] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]
export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  // v55: varje utskick granskas och godkänns innan det kan skickas.
  pending_approval: "Väntar på granskning",
  queued: "Godkänt, i kö",
  sending: "Skickas",
  sent: "Skickat",
  delivered: "Levererat",
  bounced: "Studsade",
  complained: "Anmält som skräp",
  failed: "Misslyckades",
  cancelled: "Avbrutet",
}

export interface EmailLog {
  id: string
  leadId: string
  templateId: string | null
  createdAt: string
  toEmail: string
  subject: string
  body: string
  status: EmailStatus
  scheduledAt: string
  sentAt: string | null
  deliveredAt: string | null
  resendId: string | null
  error: string | null
  /** 1 = första mejlet, 2 = automatisk uppföljning (v53). */
  step: 1 | 2
  parentId: string | null
  /** Bara om öppningsspårning är påslagen i Resend (avstängt som standard). */
  openedAt: string | null
  openCount: number
  /** v55: godkänt för utskick (null = väntar på granskning). */
  approvedAt: string | null
  /** Texten ändrades vid granskningen. */
  editedAt: string | null
}
/** Utskick som väntar på svar eller går ut – räknas som "i kö" för spärrar och planering. */
export const isOpenLog = (l: Pick<EmailLog, "status">) => l.status === "pending_approval" || l.status === "queued" || l.status === "sending"

/** Det parsern hittar på en publik sida – ett förslag som en människa granskar innan det sparas. */
export interface Extracted {
  name: string | null
  title: string | null
  emails: string[]
  phones: string[]
  instagram: string | null
  websiteUrl: string | null
  gym: string | null
  city: string | null
  specialties: string[]
  segment: Segment
  /** Sidan beskriver tydligt en personlig tränare. */
  isTrainer: boolean
  /** v53: bolagsform om sidan avslöjar den (org.nr, "AB", "enskild firma"). */
  companyForm: CompanyForm
  orgNumber: string | null
}

/** Större svenska orter som går att filtrera på (och som parsern känner igen). */
export const CITIES = [
  "Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås", "Örebro", "Linköping", "Helsingborg", "Jönköping", "Norrköping",
  "Lund", "Umeå", "Gävle", "Borås", "Södertälje", "Eskilstuna", "Halmstad", "Växjö", "Karlstad", "Sundsvall",
  "Luleå", "Trollhättan", "Östersund", "Borlänge", "Kalmar", "Kristianstad", "Skövde", "Falun", "Nyköping", "Varberg",
  "Solna", "Täby", "Nacka", "Sollentuna", "Mölndal", "Kungsbacka", "Visby", "Karlskrona", "Uddevalla", "Skellefteå",
] as const

/** Gymkedjor som parsern känner igen (namn som visas → mönster i text). */
export const GYM_CHAINS: { name: string; pattern: RegExp; domains: string[] }[] = [
  { name: "SATS", pattern: /\bsats\b/i, domains: ["sats.se", "sats.com"] },
  { name: "Nordic Wellness", pattern: /\bnordic\s*wellness\b/i, domains: ["nordicwellness.se"] },
  { name: "STC", pattern: /\bstc\b(?:\s+training\s+club)?/i, domains: ["stc.se"] },
  { name: "Fitness24Seven", pattern: /\bfitness\s*24\s*seven\b/i, domains: ["fitness24seven.com", "fitness24seven.se"] },
  { name: "Friskis&Svettis", pattern: /\bfriskis\s*(?:&|och|o)?\s*svettis\b/i, domains: ["friskissvettis.se"] },
  { name: "Actic", pattern: /\bactic\b/i, domains: ["actic.se"] },
  { name: "Member 24", pattern: /\bmember\s*24\b/i, domains: ["member24.se"] },
  { name: "Puls & Träning", pattern: /\bpuls\s*(?:&|och)\s*träning\b/i, domains: ["pulsochtraning.se"] },
  { name: "World Class", pattern: /\bworld\s*class\b/i, domains: ["worldclass.se"] },
]

export const SPECIALTIES: { label: string; pattern: RegExp }[] = [
  { label: "Styrka", pattern: /\bstyrk(?:a|etr[äa]ning)\b|\bstrength\b/i },
  { label: "Viktnedgång", pattern: /\bviktnedg[åa]ng\b|\bg[åa]\s+ner\s+i\s+vikt\b|\bfat\s*loss\b/i },
  { label: "Kost", pattern: /\bkostr[åa]dgiv\w*|\bkostschema\b|\bnutrition\w*|\bkostcoach\w*/i },
  { label: "Onlinecoaching", pattern: /\bonline\s*-?\s*coach\w*|\bonline\s*-?\s*pt\b|\bdistanscoach\w*/i },
  { label: "Rehab", pattern: /\brehab\w*|\bskadef[öo]rebygg\w*|\bfysioterap\w*/i },
  { label: "Löpning", pattern: /\bl[öo]pning\b|\bl[öo]pcoach\w*|\brunning\b/i },
  { label: "Hyrox", pattern: /\bhyrox\b/i },
  { label: "Crossfit", pattern: /\bcross\s*fit\b/i },
  { label: "Bodybuilding", pattern: /\bbodybuilding\b|\bfitness\s*t[äa]vl\w*|\bbikini\s*fitness\b/i },
  { label: "Gravid & mamma", pattern: /\bgravid\w*|\bmammatr[äa]ning\b|\bpostnatal\b/i },
  { label: "Senior", pattern: /\bseniortr[äa]ning\b|\b(?:tr[äa]ning\s+f[öo]r\s+)?seniorer\b/i },
  { label: "Yoga & rörlighet", pattern: /\byoga\b|\br[öo]rlighet\b|\bmobility\b/i },
]

/** Normaliserade nycklar – samma regler som de genererade kolumnerna i databasen (v47). */
export const emailKey = (email: string | null | undefined) => email?.trim().toLowerCase() || null
export const instagramKey = (handle: string | null | undefined) => handle?.trim().replace(/^@/, "").toLowerCase() || null
export const websiteKey = (url: string | null | undefined) =>
  url
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "") || null

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? ""
