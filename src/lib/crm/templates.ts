import { bestTemplate } from "@/lib/crm/compliance"
import { firstNameOf, type CompanyForm, type EmailTemplate, type Lead, type Segment, type TemplateKind } from "@/lib/crm/types"

/**
 * E-postmallar för B2B-utskick (v47). Variabler skrivs {{så_här}} och fylls i
 * per lead. En variabel som saknar värde får ett neutralt reservord, så att ett
 * mejl aldrig går ut med "Hej {{förnamn}}" eller "Hej ,".
 */
export const VARIABLES = [
  { key: "förnamn", hint: "Elin", fallback: "där" },
  { key: "namn", hint: "Elin Söderberg", fallback: "" },
  { key: "gym_eller_företag", hint: "SATS", fallback: "ditt gym" },
  { key: "stad", hint: "Stockholm", fallback: "din stad" },
  { key: "specialisering", hint: "styrka", fallback: "träning" },
  // v53: avsändarens förnamn (CRM_SENDER_NAME, annars namnet i CRM_FROM_EMAIL). Saknas det stoppas utskicket.
  { key: "avsändare", hint: "Max", fallback: "" },
] as const
export type VariableKey = (typeof VARIABLES)[number]["key"]

export function variablesFor(lead: Pick<Lead, "name" | "gym" | "city" | "specialties">, sender: string | null = null): Record<VariableKey, string> {
  const fallback = Object.fromEntries(VARIABLES.map((v) => [v.key, v.fallback])) as Record<VariableKey, string>
  return {
    förnamn: firstNameOf(lead.name) || fallback.förnamn,
    namn: lead.name.trim() || fallback.namn,
    gym_eller_företag: lead.gym?.trim() || fallback.gym_eller_företag,
    stad: lead.city?.trim() || fallback.stad,
    specialisering: lead.specialties[0]?.toLowerCase() || fallback.specialisering,
    avsändare: sender?.trim() ?? "",
  }
}

/**
 * Avsändarens namn i mejlen: CRM_SENDER_NAME, annars visningsnamnet i
 * CRM_FROM_EMAIL ("Max på Coavira <max@…>" → "Max"). null = saknas.
 */
export function senderName(env: Record<string, string | undefined>): string | null {
  const explicit = env.CRM_SENDER_NAME?.trim()
  if (explicit) return explicit.slice(0, 60)
  const display = env.CRM_FROM_EMAIL?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim()
  if (!display) return null
  const name = display.split(/\s+(?:på|från|at|@)\s+/i)[0].trim()
  return name && !/coavira/i.test(name) ? name.slice(0, 60) : null
}

/** Okända variabler lämnas kvar och rapporteras, så att stavfel i en mall syns i förhandsgranskningen. */
export function renderTemplate(text: string, vars: Record<string, string>): { text: string; unknown: string[] } {
  const unknown: string[] = []
  const out = text.replace(/\{\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*\}\}/gu, (whole, key: string) => {
    const k = key.toLowerCase()
    if (k in vars) return vars[k]
    if (!unknown.includes(key)) unknown.push(key)
    return whole
  })
  return { text: out, unknown }
}

export interface FooterInfo {
  unsubscribeUrl: string
  /** Var vi hittade uppgifterna (GDPR art. 14). */
  sourceUrl: string | null
  sender: string
  contactEmail: string
  /** v53: icke-säljande förfrågan (referensgrupp) – annan förklaring, inga fler mejl utan svar. */
  kind?: TemplateKind
}

/**
 * Sidfoten läggs ALLTID till av servern och går inte att redigera bort i en mall:
 * vem som skickar, varför mottagaren får mejlet, var uppgifterna kommer ifrån och
 * en tydlig avregistreringslänk (marknadsföringslagen 19–21 §§, GDPR art. 14 och 21).
 */
export function footerText(f: FooterInfo): string {
  return [
    "—",
    `${f.sender} · ${f.contactEmail}`,
    f.kind === "research"
      ? `Vi hör av oss eftersom vi vill höra hur personliga tränare arbetar i praktiken. Det här är inget erbjudande, och vi skickar inga fler mejl om du inte svarar.${f.sourceUrl ? ` Vi hittade dina kontaktuppgifter här: ${f.sourceUrl}` : ""}`
      : `Du får det här mejlet eftersom du arbetar som personlig tränare och vi tror att Coavira kan vara relevant för dig i din yrkesroll.${f.sourceUrl ? ` Vi hittade dina kontaktuppgifter här: ${f.sourceUrl}` : ""}`,
    `Vill du inte höra från oss igen? Avregistrera dig här, så raderar vi dina uppgifter: ${f.unsubscribeUrl}`,
  ].join("\n")
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const linkify = (escaped: string) => escaped.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:#4d7c0f">${u}</a>`)

/** Enkel, läsbar HTML (ser ut som ett vanligt mejl – inga bilder eller spårpixlar). */
export function emailHtml(body: string, footer: string): string {
  const paragraphs = (t: string) =>
    t
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 14px">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)
      .join("")
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#131916;max-width:560px">${paragraphs(body)}<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e3e8e1;font-size:12px;line-height:1.5;color:#5b655f">${paragraphs(footer.replace(/^—\n/, ""))}</div></div>`
}

export interface DefaultTemplate {
  key: string
  segment: Segment | null
  kind: TemplateKind
  companyForm: CompanyForm | null
  name: string
  subject: string
  body: string
  followupDays: number | null
  followupSubject: string | null
  followupBody: string | null
}

/** Referensgruppsmallens nyckel – standardval för enskilda firmor (v53). */
export const RESEARCH_TEMPLATE_KEY = "research_referensgrupp"

/**
 * Startmallar (v53). Läggs in när CRM:et öppnas om de saknas (per nyckel) och
 * går sedan att redigera. En startmall som tas bort arkiveras, så att den inte
 * kommer tillbaka. Korta, personliga, utan floskler – och utan "[ditt namn]":
 * avsändaren fylls i automatiskt med {{avsändare}}.
 */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    // Obligatorisk huvudmall för enskilda firmor och frilansande PT:er – texten är fastställd.
    key: RESEARCH_TEMPLATE_KEY,
    segment: null,
    kind: "research",
    companyForm: "enskild",
    name: "Referensgrupp (enskild firma, icke-säljande)",
    subject: "Referensgrupp för nytt svenskt PT-verktyg",
    body: `Hej {{förnamn}},

Vi bygger ett nytt svenskt coachingverktyg med fokus på ren design och noll krångel för klienten. Innan vi släpper in fler sätter vi ihop en liten referensgrupp med 5–6 duktiga tränare som får tycka till om vad som faktiskt funkar i praktiken – och vad som mest tar onödig tid idag.

Har du 10 minuter över för ett kort samtal i veckan så vi får höra dina tankar?

Säg bara till om torsdag eller fredag passar bäst så skickar jag en kalenderinbjudan.

Allt gott,
{{avsändare}}
Coavira`,
    // Ingen automatisk uppföljning till enskilda firmor – följ hellre upp med ett DM.
    followupDays: null,
    followupSubject: null,
    followupBody: null,
  },
  {
    key: "ab_intro",
    segment: null,
    kind: "intro",
    companyForm: "ab",
    name: "PT med aktiebolag",
    subject: "Hur följer du upp dina klienter mellan passen?",
    body: `Hej {{förnamn}},

Jag heter {{avsändare}} och är med och bygger Coavira, en svensk app där PT:er samlar program, kostschema, bokning och betalning för sina klienter.

Många PT:er vi pratar med lägger ett par timmar i veckan på att skicka upplägg som PDF, svara i DM och hålla koll på vem som har betalat. Den tiden vill vi ge tillbaka – särskilt till dig som driver eget inom {{specialisering}}.

Passar 15 minuter nästa vecka? Jag visar hur det fungerar, och du får säga rakt ut om det inte passar ditt sätt att jobba.

Vänliga hälsningar,
{{avsändare}}
Coavira`,
    followupDays: 4,
    followupSubject: "Hur följer du upp dina klienter mellan passen?",
    followupBody: `Hej {{förnamn}},

Jag skickade ett mejl för några dagar sedan och lyfter det en gång till, ifall det försvann i inkorgen.

Passar 15 minuter nästa vecka? Ett "nej tack" går också bra – då hör jag inte av mig igen.

Vänliga hälsningar,
{{avsändare}}`,
  },
  {
    key: "gym_chain_intro",
    segment: "gym_chain",
    kind: "intro",
    companyForm: "ab",
    name: "PT på gymkedja (SATS, Nordic Wellness m.fl.)",
    subject: "Dina PT-klienter mellan passen på {{gym_eller_företag}}",
    body: `Hej {{förnamn}},

Jag heter {{avsändare}} och är med och bygger Coavira, en svensk app för personliga tränare.

Många PT:er på {{gym_eller_företag}} berättar att det mesta av jobbet mellan passen sker i sms, DM och anteckningsappen: programmet, kosten och frågorna. I Coavira har klienten allt i en app, och du ser varje loggat pass. Det fungerar vid sidan av gymmets egna system.

Vill du se hur det ser ut? Jag tar gärna 15 minuter med dig en dag som passar dig.

Vänliga hälsningar,
{{avsändare}}
Coavira`,
    followupDays: 4,
    followupSubject: "Dina PT-klienter mellan passen på {{gym_eller_företag}}",
    followupBody: `Hej {{förnamn}},

Jag lyfter mitt förra mejl en gång till, ifall det kom en dag med fullt schema.

Är 15 minuter nästa vecka okej? Annars räcker det med ett kort "nej tack", så hör jag inte av mig igen.

Vänliga hälsningar,
{{avsändare}}`,
  },
  {
    key: "influencer_intro",
    segment: "influencer",
    kind: "intro",
    companyForm: "ab",
    name: "Onlinecoach / PT-influencer (aktiebolag)",
    subject: "Onlinecoaching utan PDF:er och DM-kaos",
    body: `Hej {{förnamn}},

Jag heter {{avsändare}} och är med och bygger Coavira, en svensk app för onlinecoacher och personliga tränare.

När man coachar på distans hamnar upplägget lätt i PDF:er, kalkylark och DM. I Coavira får varje klient sitt träningsschema och kostschema i en app, loggar passen själv, och du ser utvecklingen och svarar i chatten – med teknikvideor och videosamtal på samma ställe.

Har du 15 minuter nästa vecka? Jag visar hur andra coacher inom {{specialisering}} har lagt upp det.

Vänliga hälsningar,
{{avsändare}}
Coavira`,
    followupDays: 4,
    followupSubject: "Onlinecoaching utan PDF:er och DM-kaos",
    followupBody: `Hej {{förnamn}},

Jag lyfter mitt förra mejl en gång till – det är lätt att det drunknar bland alla förfrågningar.

Passar 15 minuter nästa vecka? Ett "nej tack" är också ett bra svar.

Vänliga hälsningar,
{{avsändare}}`,
  },
]

/**
 * Instagram-DM (v53): referensgruppstexten i DM-form – kortare, utan sidfot.
 * Kopieras i lead-panelen och klistras in i Instagram; själva DM:et skickas
 * för hand (Instagram tillåter inte automatiska DM).
 */
export function dmText(lead: Pick<Lead, "name">, sender: string | null): string {
  const first = firstNameOf(lead.name) || "där"
  return [
    `Hej ${first}! Vi bygger ett nytt svenskt coachingverktyg för PT:er, med fokus på ren design och noll krångel för klienten.`,
    `Innan vi släpper in fler sätter vi ihop en liten referensgrupp med 5–6 tränare som får tycka till om vad som faktiskt funkar i vardagen. Har du 10 minuter för ett kort samtal i veckan?`,
    sender ? `/${sender}, Coavira` : "/Coavira",
  ].join("\n\n")
}

/** Mallen som passar leaden bäst (bolagsform, rättslig grund och segment – se compliance.ts). */
export function templateFor(templates: EmailTemplate[], lead: Pick<Lead, "companyForm" | "legalBasis" | "segment">): EmailTemplate | undefined {
  return bestTemplate(templates, lead)
}
