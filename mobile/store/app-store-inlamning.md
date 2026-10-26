# Coavira – inlämning till App Store (version 1.0)

Gör stegen i ordning. Allt i kodrutor kopierar du rakt in.

---

## Steg 1 – Demokonton (Supabase)
1. **Authentication → Users → Add user → Create new user**, kryssa i **Auto Confirm User**:
   - `review-pt@coavira.fit` – starkt lösenord
   - `review-klient@coavira.fit` – starkt lösenord
2. **SQL Editor:** kör hela `supabase/admin/app-review-demo-accounts.sql`.
3. Logga in med båda i TestFlight-appen och kontrollera att de fungerar.

---

## Steg 2 – Produkterna (Monetization)
Alla tre ska ha status **Ready to Submit**: pris, Availability, svensk lokalisering, Review Screenshot och Review Notes.

**Review Notes – Coavira Plus (månad och år):**
```
Coavira Plus is an auto-renewable subscription for client accounts (monthly or yearly). It unlocks sleep tracking, full training and nutrition history older than 30 days, advanced charts (1RM progress) and CSV export. Today's nutrition plan, booking sessions, doing workouts and chat with the trainer are always free.

How to test: log in with the client demo account (see App Review Information) → tap the Coavira logo (top left) → "Coavira Plus" → choose monthly or yearly. "Återställ köp" (Restore purchases) and "Hantera prenumeration" (Manage subscription) are on the same screen.
```

**Review Notes – PT Boost:** se texten under steg 5 (samma text).

---

## Steg 3 – App Information (vänstermenyn)
| Fält | Skriv |
|---|---|
| Subtitle | `Träning och kost med din PT` |
| Category | Health & Fitness / Lifestyle |
| Privacy Policy URL | `https://coavira.fit/privacy` |
| License Agreement | Standard Apple EULA (låt stå) |

---

## Steg 4 – Versionssidan "1.0 Prepare for Submission"

### Previews and Screenshots → iPhone 6.9"
Ladda upp i ordning (1320 × 2868, i landningssidans stil):
1. `mobile/store/ios/01-start.png`
2. `02-din-plan.png`
3. `03-kost.png`
4. `04-boka.png`
5. `05-framsteg.png`
6. `06-chatt.png`
7. `07-hitta-pt.png`

Felet "File dimensions are invalid" betyder att bilderna dras till fel storlek:
- Rutan **"iPhone with Dynamic Island (medium display)"** (6.1"/6.3") kräver 1206 × 2622. Använd `mobile/store/ios/1206x2622/`.
- Rutan **iPhone 6.9"** (via **View All Sizes in Media Manager**) tar 1320 × 2868 (`mobile/store/ios/`) eller 1290 × 2796 (`mobile/store/ios/1290x2796/`).

Bilderna skapas om med `node scripts/store-screenshots.mjs` (demoläget måste köra på `localhost:3000`; `REUSE_RAW=1` återanvänder råbilderna). Råbilderna från appen och landningssidan ligger i `mobile/store/ios/raw/`.

### Promotional Text (170 tecken)
```
Träning och kost på ett ställe – med din egen PT. Boka pass, följ ditt program, logga maten och se din utveckling.
```

### Description
```
Coavira samlar allt mellan dig och din personliga tränare i en app: pass, program, kost, bokningar och chatt.

FÖR DIG SOM TRÄNAR
• Dagens träning – starta passet och logga set, reps och vikter direkt i appen
• Program från din PT – med instruktionsvideor och dina egna övningar
• Dagens kost – kostschema, makron, vatten och livsmedelsskanner med svenska varor
• Boka och flytta pass i kalendern, med påminnelser
• Chatta med din PT – skicka bilder och videor på tekniken
• Följ din utveckling – vikt, mätpunkter och genomförda pass
• Hitta en PT nära dig eller på distans, med pris, inriktning och omdömen

FÖR PERSONLIGA TRÄNARE
• Klientöversikt med följsamhet och vad som behöver uppmärksamhet
• Passbyggare, kostscheman, kalender och tjänstemeny
• Ta med dina befintliga klienter med en egen inbjudningskod
• Syns först i sökningen med PT Boost

COAVIRA PLUS
Grunden är alltid gratis. Med Coavira Plus låser du upp sömntracking, full historik, djupgående grafer (1RM-utveckling) och export till CSV.
• Coavira Plus: 49 kr/månad eller 499 kr/år
• Prenumerationen förnyas automatiskt tills du säger upp den, senast 24 timmar före periodens slut, under Inställningar → [ditt namn] → Prenumerationer. Betalningen dras från ditt Apple-konto.
Pass och kostcoaching hos din PT betalas separat med kort.

Användarvillkor (EULA): https://coavira.fit/terms
Integritetspolicy: https://coavira.fit/privacy
```

### Keywords (100 tecken)
```
pt,personlig tränare,träning,kost,gym,träningsprogram,kostschema,styrka,hälsa,coach,boka pass,makro
```

### Övrigt
| Fält | Skriv |
|---|---|
| Support URL | `https://coavira.fit/support` |
| Marketing URL | `https://coavira.fit` |
| Version | `1.0` |
| Copyright | `2026 [ditt bolagsnamn]` |

### Build
Klicka **+** och välj senaste bygget från TestFlight.

### In-App Purchases and Subscriptions
Klicka **+** och markera **alla tre**: `coavira_plus_monthly`, `coavira_plus_yearly` och `coavira_pt_boost_7d`. De första köpen måste skickas in tillsammans med appversionen.

---

## Steg 5 – App Review Information
- **Sign-in required:** Ja
  - **User name:** `review-klient@coavira.fit`
  - **Password:** klientens lösenord
- **Contact Information:** ditt namn, din e-post och ditt telefonnummer.

**Notes** – byt ut `LÖSENORD` mot PT-kontots lösenord:
```
Coavira connects clients with their personal trainer (PT): workouts, nutrition plans, booking, chat and progress.

DEMO ACCOUNTS
Client (pre-filled above): review-klient@coavira.fit
Personal trainer: review-pt@coavira.fit / LÖSENORD
Trainer accounts are created by Coavira after manual certificate verification and log in with email and password ("PT-inloggning" on the start screen). Clients can also sign up with Apple, Google or email.

IN-APP PURCHASES
1) Coavira Plus (auto-renewable subscription, monthly/yearly) – client account: Coavira logo (top left) → "Coavira Plus".
2) PT Boost (non-renewing, 7 days) – trainer account: Coavira logo → "Profilinställningar" → "PT Boost" card → "Boosta i 7 dagar". The boosted profile is shown first in "Hitta PT" with a "Utvald" (Featured) badge, clearly labelled as a paid placement.
"Återställ köp" (Restore purchases) is available on both screens.

PHYSICAL SERVICES (guideline 3.1.3(e))
Personal training sessions and nutrition coaching are services performed by a real person, sold by the trainer, and paid with Stripe. Digital features (Coavira Plus, PT Boost) use In-App Purchase only.

ACCOUNT DELETION
Coavira logo → "Inställningar" → "Radera mitt konto" (also under "Profilinställningar"). Deletes the account and all data immediately.

NATIVE FEATURES
Sign in with Apple, push notifications, barcode scanner for food (camera), photo/video attachments in chat, deep links.
```

---

## Steg 6 – App Store Version Release
Välj **Manually release this version**. Då bestämmer du själv när appen går live efter godkännandet.

---

## Steg 7 – Skicka in
Klicka **Add for Review** uppe till höger och sedan **Submit to App Review**.

Svar kommer oftast inom 24–48 timmar. Får du en avvisning, klistra in Apples text till Claude.
