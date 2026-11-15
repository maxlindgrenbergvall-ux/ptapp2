import { firstNameOf, type EmailTemplate, type Lead, type Segment } from "@/lib/crm/types"

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
] as const
export type VariableKey = (typeof VARIABLES)[number]["key"]

export function variablesFor(lead: Pick<Lead, "name" | "gym" | "city" | "specialties">): Record<VariableKey, string> {
  const fallback = Object.fromEntries(VARIABLES.map((v) => [v.key, v.fallback])) as Record<VariableKey, string>
  return {
    förnamn: firstNameOf(lead.name) || fallback.förnamn,
    namn: lead.name.trim() || fallback.namn,
    gym_eller_företag: lead.gym?.trim() || fallback.gym_eller_företag,
    stad: lead.city?.trim() || fallback.stad,
    specialisering: lead.specialties[0]?.toLowerCase() || fallback.specialisering,
  }
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
    `Du får det här mejlet eftersom du arbetar som personlig tränare och vi tror att Coavira kan vara relevant för dig i din yrkesroll.${f.sourceUrl ? ` Vi hittade dina kontaktuppgifter här: ${f.sourceUrl}` : ""}`,
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
  name: string
  subject: string
  body: string
}

/** Startmallar – läggs in första gången mallarna öppnas och går sedan att redigera fritt. */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: "gym_chain",
    segment: "gym_chain",
    name: "PT på gymkedja – klienter vid sidan av",
    subject: "{{förnamn}}, ett enklare sätt att hålla ihop dina klienter",
    body: `Hej {{förnamn}}!

Jag heter [ditt namn] och jobbar med Coavira – en svensk app för personliga tränare.

Många PT:er på {{gym_eller_företag}} har klienter som vill ha mer än passen på gymmet: ett upplägg att följa mellan träffarna, koll på kosten och ett ställe att ställa frågor. I Coavira lägger du upp klientens träningssplit och kostschema, ser varje loggat pass och har chatten och videosamtalen på samma ställe.

Appen är gratis för dina klienter, och du sätter själv priserna på dina tjänster.

Vill du se hur det ser ut? Svara på det här mejlet, så skickar jag en kort genomgång.

Vänliga hälsningar
[ditt namn]
Coavira`,
  },
  {
    key: "influencer",
    segment: "influencer",
    name: "PT-influencer / onlinecoach",
    subject: "{{förnamn}}, onlinecoaching utan kalkylark och DM-kaos",
    body: `Hej {{förnamn}}!

Jag heter [ditt namn] och jobbar med Coavira – en svensk app för onlinecoacher och personliga tränare.

När man coachar på distans hamnar upplägget lätt i PDF:er, kalkylark och DM:s. I Coavira får varje klient sitt träningsschema och kostschema i en app, loggar passen själv, och du ser utvecklingen och svarar i chatten – med bilder, teknikvideor och videosamtal på samma ställe. Betalningen går via appen, och du sätter dina egna priser.

Appen är gratis för dina klienter.

Är det intressant? Svara på det här mejlet, så visar jag hur andra coacher inom {{specialisering}} har lagt upp det.

Vänliga hälsningar
[ditt namn]
Coavira`,
  },
  {
    key: "freelance",
    segment: "freelance",
    name: "Frilansande PT / egen företagare",
    subject: "{{förnamn}}, mindre administration kring dina klienter",
    body: `Hej {{förnamn}}!

Jag heter [ditt namn] och jobbar med Coavira – en svensk app för personliga tränare.

Som egen företagare i {{stad}} går mycket tid åt till sådant som inte är träning: bokningar, betalningar, scheman och uppföljning. Coavira samlar det: klienten bokar pass i din kalender, betalar i appen, följer sitt träningsschema och kostschema och loggar passen – och du ser allt på ett ställe.

Appen är gratis för dina klienter, och du sätter själv priserna på dina tjänster.

Vill du se hur det ser ut? Svara på det här mejlet, så skickar jag en kort genomgång.

Vänliga hälsningar
[ditt namn]
Coavira`,
  },
]

/** Mallen som passar leadens segment bäst (segmentets egen, annars en allmän). */
export function templateFor(templates: EmailTemplate[], segment: Segment): EmailTemplate | undefined {
  return templates.find((t) => t.segment === segment) ?? templates.find((t) => t.segment === null) ?? templates[0]
}
