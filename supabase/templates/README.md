# Coaviras e-postmallar (Supabase Auth)

Filerna här klistras in i **Supabase Dashboard → Authentication → Emails → Templates**
(eller skickas upp med `scripts/push-email-templates.mjs`). De genereras av
`scripts/build-email-templates.mjs`. Ändra texterna där och kör
`node scripts/build-email-templates.mjs`, inte i HTML-filerna direkt.

## Vad som klistras in var

Öppna mallen i Dashboard, klistra in **Subject** och hela filens innehåll i
**Message body** (fliken *Source*) och tryck **Save changes**.

| Mall i Supabase | Subject | Message body (hela filen) | Länken går till |
|---|---|---|---|
| **Confirm sign up** | `Bekräfta din e-postadress för Coavira` | [`confirm-signup.html`](confirm-signup.html) | `/auth/confirm?…&type=email&next=/dashboard` |
| **Invite user** | `Du är inbjuden till Coavira` | [`invite-user.html`](invite-user.html) | `/auth/confirm?…&type=invite&next=/nytt-losenord` |
| **Magic link or OTP** | `Din inloggningslänk till Coavira` | [`magic-link.html`](magic-link.html) | `/auth/confirm?…&type=magiclink&next=/dashboard` |
| **Change email address** | `Bekräfta din nya e-postadress för Coavira` | [`change-email.html`](change-email.html) | `/auth/confirm?…&type=email_change&next=/dashboard` |
| **Reset password** | `Återställ ditt lösenord för Coavira` | [`reset-password.html`](reset-password.html) | `/auth/confirm?…&type=recovery&next=/nytt-losenord` |
| **Reauthentication** | `Din verifieringskod för Coavira` | [`reauthentication.html`](reauthentication.html) | ingen länk, bara koden `{{ .Token }}` |

Ämnesraderna finns också i [`subjects.json`](subjects.json).

## Krav i Supabase

- **Authentication → URL Configuration → Site URL** = appens adress (`https://ptapp2.vercel.app`).
  Alla länkar och logotypen byggs från `{{ .SiteURL }}`.
- **Redirect URLs** behöver inte ändras för mallarna, eftersom länkarna går till `{{ .SiteURL }}`.
- **Authentication → Providers → Email → Email OTP Expiration** = `3600` (standard).
  Texterna säger "gäller i 1 timme". Ändrar ni tiden, ändra `LINK_TTL` i generatorn.
- **Egen SMTP** (Authentication → Emails → SMTP Settings) i produktion, t.ex. Resend eller Postmark,
  med avsändaren `no-reply@coavira.fit` och namnet `Coavira`. Supabases inbyggda e-post skickar bara
  till projektets team och har en låg gräns per timme. Lägg in SPF, DKIM och DMARC för domänen hos
  SMTP-leverantören, annars hamnar mejlen i skräpposten.
- Logotypen hämtas från `{{ .SiteURL }}/email/coavira-mark.png` (`public/email/`). Den måste vara
  publicerad innan mejlen skickas.

## Varför token_hash och /auth/confirm

Supabase standardmall använder `{{ .ConfirmationURL }}` (PKCE). Den fungerar bara i samma webbläsare
som registreringen. Mallarna här använder `{{ .TokenHash }}` och appens `/auth/confirm`
(`src/app/auth/confirm/route.ts`, `verifyOtp`). Då fungerar länken även när den öppnas på en annan
enhet eller i mejlappens inbyggda webbläsare, och användaren loggas in direkt.

## Teknik

- Tabellayout med all stil inline, max 600 px. Mobilanpassad via `@media`.
- Ljust och mörkt läge (`prefers-color-scheme`).
- Förhandstext i inkorgen. Logotypen är en PNG, och namnet står även som text så att mejlet går att
  läsa med bilder avstängda.
- Inga HTML-kommentarer eller Outlook-villkor (`<!--[if mso]>`). Supabase renderar med Go:s
  `html/template`, som tar bort alla kommentarer.
- Färger och typsnitt är desamma som i appen:

  | Användning | Färg | Källa i appen |
  |---|---|---|
  | Logotypens fält | `#aced37` | `--brand`, `BRAND.color` |
  | Logotypens "C" | `#0e1a01` | `--brand-foreground`, `BRAND.ink` |
  | Knapp och länkar | `#006b2d`, text `#f8fef7` | `--primary`, `--primary-foreground` |
  | Bakgrund | `#f9fbf8`, kort `#ffffff`, kant `#dde3dc` | `--background`, `--card`, `--border` |
  | Text | `#0c1610`, dämpad `#5b675e` | `--foreground`, `--muted-foreground` |
  | Kodruta | `#e1f1de`, text `#033816` | `--accent`, `--accent-foreground` |
  | Mörkt läge | bakgrund `#131916`, kort `#1d2320`, text `#f4f6f2`, knapp `#abf051` | `globals.css`, mörkt tema |

  Typsnittet är **Geist** (som appen; Geist Mono för koden) via Google Fonts. Klienter som inte laddar
  webbtypsnitt, som Gmail och Outlook, faller tillbaka på systemtypsnittet:
  `-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`.

## Test

```bash
node e2e/email-templates.test.mjs                               # renderar med Go html/template, layout i Chromium
BASE_URL=http://localhost:3000 node e2e/email-templates.test.mjs # + klickar igenom länkarna (Supabase-läge mot mock)
```

## Lokalt med Supabase CLI (valfritt)

Kör ni `supabase start` lokalt kan mallarna kopplas in i `supabase/config.toml`:

```toml
[auth.email.template.confirmation]
subject = "Bekräfta din e-postadress för Coavira"
content_path = "./supabase/templates/confirm-signup.html"
# invite → invite-user.html, magic_link → magic-link.html, email_change → change-email.html,
# recovery → reset-password.html, reauthentication → reauthentication.html
```

Kör inte `supabase config push` mot produktion med en ofullständig `config.toml`. Det skriver över
andra Auth-inställningar, till exempel Site URL. Använd `scripts/push-email-templates.mjs`, som bara
ändrar mallarna.
