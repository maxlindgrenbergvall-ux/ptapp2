#!/usr/bin/env node
/**
 * Coaviras e-postmallar för Supabase Auth (v33).
 *
 * En gemensam layout och sex innehåll → statiska HTML-filer i supabase/templates/,
 * som klistras in under Supabase Dashboard → Authentication → Emails → Templates
 * (eller skickas upp med scripts/push-email-templates.mjs).
 *
 *   node scripts/build-email-templates.mjs          # skriver filerna
 *   node scripts/build-email-templates.mjs --check  # felar om filerna inte är uppdaterade (CI)
 *
 * Mallarna är Go-mallar (Supabase): {{ .SiteURL }}, {{ .TokenHash }}, {{ .Token }},
 * {{ .Email }}, {{ .NewEmail }}, {{ .ConfirmationURL }}, {{ .RedirectTo }}, {{ .Data }}.
 * Länkarna går till /auth/confirm med token_hash (fungerar på alla enheter och i
 * mejlappens webbläsare – ingen PKCE-cookie behövs), se src/app/auth/confirm/route.ts.
 *
 * E-postkompatibilitet: tabellayout, all stil inline (Gmail tar bort <style> i vissa
 * lägen), max 600 px, knapp med bakgrund på både cell och länk (Outlook), förhandstext,
 * ljust och mörkt läge, logotyp som PNG (SVG visas inte i Gmail/Outlook) och namnet
 * som text så att mejlet går att läsa med bilder avstängda.
 *
 * OBS: Supabase renderar med Go:s html/template, som tar bort ALLA HTML-kommentarer –
 * därför inga Outlook-villkorskommentarer (<!--[if mso]>) eller VML här; de skulle
 * försvinna. e2e/email-templates.test.mjs renderar mallarna med html/template.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "supabase/templates")

/** Exakta färger – samma som appen (src/app/globals.css, src/lib/brand.ts). */
export const EMAIL_COLORS = {
  /** --brand: oklch(0.87 0.21 128) – logotypens limegröna fält. */
  brand: "#aced37",
  /** --brand-foreground / BRAND.ink – logotypens "C". */
  ink: "#0e1a01",
  /** --primary: oklch(0.46 0.13 150) – knappar och länkar. */
  primary: "#006b2d",
  /** --primary-foreground: oklch(0.99 0.01 140). */
  primaryForeground: "#f8fef7",
  /** --background: oklch(0.985 0.004 135). */
  background: "#f9fbf8",
  /** --card. */
  card: "#ffffff",
  /** --foreground: oklch(0.19 0.02 155). */
  foreground: "#0c1610",
  /** --muted-foreground: oklch(0.5 0.02 155). */
  muted: "#5b675e",
  /** --border: oklch(0.91 0.012 140). */
  border: "#dde3dc",
  /** --accent: oklch(0.94 0.03 140) – kodrutan. */
  accent: "#e1f1de",
  /** --accent-foreground: oklch(0.3 0.08 150). */
  accentForeground: "#033816",
  /** Mörkt läge (globals.css @media prefers-color-scheme: dark). */
  darkBackground: "#131916",
  darkCard: "#1d2320",
  darkForeground: "#f4f6f2",
  darkMuted: "#a3ada6",
  darkBorder: "#2c3430",
  darkPrimary: "#abf051",
}

/** Appens typsnitt (Geist via next/font) med systemtypsnitt som reserv i e-postklienter utan webbtypsnitt. */
export const EMAIL_FONT = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

const SUPPORT = "support@coavira.fit"
/**
 * Giltighetstid i texterna. Måste stämma med Supabase → Authentication → Providers →
 * Email → "Email OTP Expiration" (standard 3600 s = 1 timme, gäller alla e-postlänkar och koder).
 */
const LINK_TTL = "1 timme"
const confirmUrl = (type, next) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`

/**
 * De sex mallarna i Supabase (Authentication → Emails → Templates).
 * `key` = namnet i Management API:t (mailer_templates_<key>_content / mailer_subjects_<key>).
 */
export const TEMPLATES = [
  {
    file: "confirm-signup.html",
    key: "confirmation",
    dashboard: "Confirm sign up",
    subject: "Bekräfta din e-postadress för Coavira",
    preheader: "Ett klick kvar – bekräfta din e-post så är ditt Coavira-konto klart.",
    heading: "Välkommen till Coavira!",
    paragraphs: [
      "Tack för att du skapade ett konto. Bekräfta din e-postadress <strong>{{ .Email }}</strong> så loggas du in och kommer vidare till appen.",
    ],
    button: { label: "Bekräfta e-postadressen", url: confirmUrl("email", "/dashboard") },
    note: `Länken gäller i ${LINK_TTL} och kan bara användas en gång.`,
    ignore: "Har du inte skapat ett konto hos Coavira kan du bortse från det här mejlet – inget konto aktiveras utan att länken öppnas.",
  },
  {
    file: "invite-user.html",
    key: "invite",
    dashboard: "Invite user",
    subject: "Du är inbjuden till Coavira",
    preheader: "Välj ett lösenord och kom igång med Coavira.",
    heading: "Du är inbjuden till Coavira",
    paragraphs: [
      "Ett konto har skapats åt dig med e-postadressen <strong>{{ .Email }}</strong>.",
      "Tryck på knappen, välj ett eget lösenord och slutför dina uppgifter – sedan är du igång.",
    ],
    button: { label: "Välj lösenord och kom igång", url: confirmUrl("invite", "/nytt-losenord") },
    note: `Inbjudan gäller i ${LINK_TTL} och kan bara användas en gång. Har den gått ut kan du välja lösenord via <em>Glömt lösenordet?</em> på inloggningssidan.`,
    ignore: "Väntade du dig inte den här inbjudan kan du bortse från mejlet.",
  },
  {
    file: "magic-link.html",
    key: "magic_link",
    dashboard: "Magic link or OTP",
    subject: "Din inloggningslänk till Coavira",
    preheader: "Logga in på Coavira med ett klick – inget lösenord behövs.",
    heading: "Logga in på Coavira",
    paragraphs: ["Tryck på knappen för att logga in som <strong>{{ .Email }}</strong>. Du behöver inget lösenord."],
    button: { label: "Logga in", url: confirmUrl("magiclink", "/dashboard") },
    note: `Länken gäller i ${LINK_TTL} och kan bara användas en gång.`,
    ignore: "Har du inte bett om att logga in kan du bortse från mejlet. Ingen kan logga in utan länken.",
  },
  {
    file: "change-email.html",
    key: "email_change",
    dashboard: "Change email address",
    subject: "Bekräfta din nya e-postadress för Coavira",
    preheader: "Bekräfta bytet av e-postadress för ditt Coavira-konto.",
    heading: "Bekräfta ny e&#8209;postadress",
    paragraphs: [
      "Du har bett om att byta e-postadress för ditt Coavira-konto från <strong>{{ .Email }}</strong> till <strong>{{ .NewEmail }}</strong>.",
      "Bekräfta bytet med knappen nedan. Om du får det här mejlet till båda adresserna behöver bytet bekräftas från båda.",
    ],
    button: { label: "Bekräfta bytet", url: confirmUrl("email_change", "/dashboard") },
    note: `Länken gäller i ${LINK_TTL} och kan bara användas en gång. Tills bytet är bekräftat loggar du in med din nuvarande adress.`,
    ignore: `Har du inte bett om att byta e-postadress? Öppna inte länken, byt lösenord och kontakta <a href="mailto:${SUPPORT}" class="link" style="color:${EMAIL_COLORS.primary};text-decoration:underline;">${SUPPORT}</a>.`,
  },
  {
    file: "reset-password.html",
    key: "recovery",
    dashboard: "Reset password",
    subject: "Återställ ditt lösenord för Coavira",
    preheader: "Välj ett nytt lösenord för ditt Coavira-konto.",
    heading: "Välj ett nytt lösenord",
    paragraphs: [
      "Vi har fått en begäran om att återställa lösenordet för <strong>{{ .Email }}</strong>. Tryck på knappen för att välja ett nytt lösenord.",
    ],
    button: { label: "Välj nytt lösenord", url: confirmUrl("recovery", "/nytt-losenord") },
    note: `Länken gäller i ${LINK_TTL} och kan bara användas en gång.`,
    ignore: "Har du inte bett om ett nytt lösenord kan du bortse från mejlet – ditt nuvarande lösenord fortsätter att gälla.",
  },
  {
    file: "reauthentication.html",
    key: "reauthentication",
    dashboard: "Reauthentication",
    subject: "Din verifieringskod för Coavira",
    preheader: "Bekräfta att det är du – din kod finns i mejlet.",
    heading: "Bekräfta att det är du",
    paragraphs: ["Ange koden nedan i Coavira för att slutföra ändringen på ditt konto <strong>{{ .Email }}</strong>."],
    code: { label: "Din verifieringskod:" },
    note: `Koden gäller i ${LINK_TTL} och kan bara användas en gång. Dela den aldrig med någon – Coavira frågar aldrig efter koden i telefon, chatt eller mejl.`,
    ignore: `Har du inte försökt ändra något på ditt konto? Byt lösenord och kontakta <a href="mailto:${SUPPORT}" class="link" style="color:${EMAIL_COLORS.primary};text-decoration:underline;">${SUPPORT}</a>.`,
  },
]

const c = EMAIL_COLORS

function button({ label, url }) {
  // Bakgrunden ligger både på cellen (bgcolor – Outlook) och länken (övriga), så hela ytan är klickbar.
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
                <tr>
                  <td align="center" bgcolor="${c.primary}" class="btn-td" style="border-radius:12px;background-color:${c.primary};">
                    <a href="${url}" target="_blank" class="btn" style="display:inline-block;padding:14px 28px;border:1px solid ${c.primary};border-radius:12px;background-color:${c.primary};font-family:${EMAIL_FONT};font-size:16px;font-weight:600;line-height:20px;color:${c.primaryForeground};text-decoration:none;">${label}</a>
                  </td>
                </tr>
              </table>`
}

function codeBox({ label }) {
  return `<p class="muted" style="margin:0 0 8px 0;font-family:${EMAIL_FONT};font-size:14px;line-height:20px;color:${c.muted};">${label}</p>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td class="code-td" bgcolor="${c.accent}" style="border-radius:12px;background-color:${c.accent};padding:14px 22px;">
                    <span class="code" style="font-family:${MONO};font-size:28px;font-weight:700;letter-spacing:6px;line-height:32px;color:${c.accentForeground};">{{ .Token }}</span>
                  </td>
                </tr>
              </table>`
}

const para = (html) =>
  `<p class="fg" style="margin:0 0 16px 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${c.foreground};">${html}</p>`

export function renderTemplate(t) {
  const body = [
    `<h1 class="fg" style="margin:0 0 16px 0;font-family:${EMAIL_FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.3px;color:${c.foreground};">${t.heading}</h1>`,
    ...t.paragraphs.map(para),
    t.button ? button(t.button) : "",
    t.code ? codeBox(t.code) : "",
    t.button
      ? `<p class="muted" style="margin:0 0 6px 0;font-family:${EMAIL_FONT};font-size:13px;line-height:20px;color:${c.muted};">Fungerar inte knappen? Kopiera länken till webbläsaren:</p>
              <p style="margin:0 0 20px 0;font-family:${EMAIL_FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${t.button.url}" target="_blank" class="link" style="color:${c.primary};text-decoration:underline;">${t.button.url}</a></p>`
      : "",
    `<p class="muted" style="margin:0 0 12px 0;font-family:${EMAIL_FONT};font-size:14px;line-height:22px;color:${c.muted};">${t.note}</p>`,
    `<p class="muted" style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:22px;color:${c.muted};">${t.ignore}</p>`,
  ]
    .filter(Boolean)
    .join("\n              ")

  return `<!DOCTYPE html>
<!-- Coavira – ${t.dashboard} (${t.key}). Genererad av scripts/build-email-templates.mjs – ändra där, inte här. Ämnesrad: ${t.subject} -->
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${t.subject}</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700&family=Geist+Mono:wght@700&display=swap" rel="stylesheet">
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
    u + #body a { color:inherit; text-decoration:none; }
    @media only screen and (max-width:620px) {
      .container { width:100% !important; }
      .px { padding-left:20px !important; padding-right:20px !important; }
      .card-pad { padding:28px 20px !important; }
      .btn { display:block !important; text-align:center !important; }
      .btn-td { width:100% !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bg { background-color:${c.darkBackground} !important; }
      .card { background-color:${c.darkCard} !important; border-color:${c.darkBorder} !important; }
      .fg { color:${c.darkForeground} !important; }
      .muted { color:${c.darkMuted} !important; }
      .link { color:${c.darkPrimary} !important; }
      .btn-td, .btn { background-color:${c.darkPrimary} !important; color:${c.ink} !important; }
      .code-td { background-color:${c.darkBorder} !important; }
      .code { color:${c.darkPrimary} !important; }
    }
    [data-ogsc] .bg { background-color:${c.darkBackground} !important; }
    [data-ogsc] .card { background-color:${c.darkCard} !important; border-color:${c.darkBorder} !important; }
    [data-ogsc] .fg { color:${c.darkForeground} !important; }
    [data-ogsc] .muted { color:${c.darkMuted} !important; }
  </style>
</head>
<body id="body" class="bg" style="margin:0;padding:0;width:100%;background-color:${c.background};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${t.preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="bg" bgcolor="${c.background}" style="width:100%;background-color:${c.background};">
    <tr>
      <td align="center" class="px" style="padding:32px 16px;">
        <table role="presentation" class="container" width="600" align="center" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;">
          <tr>
            <td style="padding:0 4px 20px 4px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <a href="{{ .SiteURL }}" target="_blank" style="text-decoration:none;"><img src="{{ .SiteURL }}/email/coavira-mark.png" width="40" height="40" alt="Coavira" style="display:block;width:40px;height:40px;border-radius:10px;background-color:${c.brand};"></a>
                  </td>
                  <td class="fg" style="vertical-align:middle;font-family:${EMAIL_FONT};font-size:20px;line-height:24px;font-weight:700;letter-spacing:-0.3px;color:${c.foreground};">Coavira</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="card card-pad" bgcolor="${c.card}" style="background-color:${c.card};border:1px solid ${c.border};border-radius:16px;padding:36px 36px 32px 36px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 4px 0 4px;">
              <p class="muted" style="margin:0 0 6px 0;font-family:${EMAIL_FONT};font-size:12px;line-height:18px;color:${c.muted};">Coavira – PT &amp; träning. Program, kost, kalender och uppföljning på ett ställe.</p>
              <p class="muted" style="margin:0;font-family:${EMAIL_FONT};font-size:12px;line-height:18px;color:${c.muted};">Frågor? Skriv till <a href="mailto:${SUPPORT}" class="link" style="color:${c.primary};text-decoration:underline;">${SUPPORT}</a>. Det här är ett automatiskt mejl om ditt konto och går inte att svara på.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

function build() {
  const files = new Map()
  for (const t of TEMPLATES) files.set(t.file, renderTemplate(t))
  files.set(
    "subjects.json",
    JSON.stringify(Object.fromEntries(TEMPLATES.map((t) => [t.key, { dashboard: t.dashboard, file: t.file, subject: t.subject }])), null, 2) + "\n"
  )
  return files
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = build()
  if (process.argv.includes("--check")) {
    const stale = [...files].filter(([f, s]) => !fs.existsSync(path.join(outDir, f)) || fs.readFileSync(path.join(outDir, f), "utf8") !== s)
    if (stale.length) {
      console.error(`Inaktuella e-postmallar: ${stale.map(([f]) => f).join(", ")} – kör node scripts/build-email-templates.mjs`)
      process.exit(1)
    }
    console.log("ok   e-postmallarna är uppdaterade")
  } else {
    fs.mkdirSync(outDir, { recursive: true })
    for (const [f, s] of files) fs.writeFileSync(path.join(outDir, f), s)
    console.log(`Skrev ${files.size} filer till supabase/templates/`)
  }
}
