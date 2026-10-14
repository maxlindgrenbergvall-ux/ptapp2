# Forma – PT- och träningsplattform

Kopplar ihop personliga tränare (PT) och klienter. Appen körs i ett av två lägen:

| Läge | När | Data |
|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` är satta | Riktiga konton (e-post/lösenord), Postgres med RLS, realtid |
| **Demo** | Variablerna saknas | Mockdata i webbläsaren, inloggad som Sara (`/klient`) eller Elin (`/pt`) |

```bash
npm install
cp .env.example .env.local   # fyll i, eller hoppa över för demoläge
npm run dev                  # http://localhost:3000
```

## Sätta upp Supabase

1. Skapa ett projekt på supabase.com i **EU-region** (t.ex. *North EU (Stockholm)*).
2. Kör `supabase/migrations/20261014000000_init.sql` och sedan `supabase/seed.sql`
   (SQL Editor, eller `supabase link` + `supabase db push`).
3. **Authentication → URL Configuration**: sätt *Site URL* till appens adress och lägg till
   `https://<din-domän>/auth/callback` (och `http://localhost:3000/auth/callback`) under *Redirect URLs*.
4. **Authentication → Providers → Email**: ha *Confirm email* påslaget i produktion.
   Sätt minsta lösenordslängd till 8 och slå gärna på *Leaked password protection*.
5. Kopiera *Project URL* och *Publishable key* (Project Settings → API) till `.env.local`.
   **Service role-nyckeln ska aldrig in i appen.**
6. Registrera ett PT-konto, fyll i **Min profil** och publicera. Då syns PT:n i klienternas sökning.

### Flödet

1. Klienten registrerar sig. Samtycke till hälsodata krävs och sparas på profilen.
2. Klienten hittar en PT och skickar en bokningsförfrågan. Det skapar också en
   relation med status *pending*.
3. PT:n ser förfrågan och accepterar klienten. Först då kan PT:n se klientens
   hälsodata och lägga upp pass och kost.
4. Klienten loggar sina pass, även offline. PT:n ser loggade set i realtid och ger
   feedback i chatten.

## Funktioner

**PT-panel (`/pt`)**
- Översikt: nyckeltal, klientlista med status, senaste och nästa pass och följsamhet (4 v),
  "Behöver uppmärksamhet" (nya klienter, inaktiva klienter, kommentarer på pass) och bokningsförfrågningar.
- Klientdetalj: vikt-, styrke- (uppskattat 1RM) och frekvensgrafer, passhistorik med loggade set,
  feedback kopplad till ett pass, schemaläggning av pass, kostschema och chatt.
- Passbyggare: mallar, övningsbank med sök och muskelgruppsfilter, dra och släpp för ordning
  (fungerar även med tangentbord), set/reps/kg/vila/RPE, instruktioner och videolänk, tilldelning till flera datum.
- Kostbyggare: makromål med förval, kontroll av kcal mot makron, måltider från en livsmedelsbas och dagssumma mot målen.
- Meddelanden: en tråd per klient med olästräknare.
- Min profil: stad, inriktningar, pris, presentation, lediga tider och publicering i sökningen.

**Klientapp (`/klient`)**
- Idag: veckoremsa, dagens pass och dagens kost där varje måltid bockas av med ett tryck.
- Träningslogg: set förifylls i ordningen förra setet → förra passet → PT:ns mål, så ett set
  loggas normalt med **ett tryck**. Steg om 2,5 kg och 1 rep, vilotimer som startar automatiskt,
  nästa övning öppnas automatiskt och snabbkommentarer när passet avslutas. Allt sparas direkt.
- Hitta PT: filter på inriktning (flerval), pris, stad och distans, samt sortering på
  matchning, betyg, pris eller tidigast lediga tid. Profil med omdömen och bokning via kalender.
- Framsteg: styrka, vikt (med loggning), träningsfrekvens, historik och dataexport (JSON).

## Arkitektur

```
src/
  proxy.ts                   Förnyar sessionen, skyddar /pt och /klient (Next 16:s "middleware")
  types/domain.ts            Domänmodeller
  lib/supabase/*             Klienter (webbläsare/server) och konfiguration
  lib/data/state.ts          Alla ändringar som serialiserbara actions + reducer
  lib/data/store.tsx         useAppData(): demo- eller Supabase-provider, SyncEngine
  lib/data/outbox.ts         Offlinekö (localStorage), backoff
  lib/data/supabase-source.ts  Laddning, rad ⇄ domän-mappning, skrivningar, realtid
  lib/data/seed.ts           Mockdata för demoläget
  app/(logga-in|registrera|glomt-losenord|nytt-losenord|auth/callback)  Inloggning
  app/pt/**, app/klient/**   Vyerna
supabase/migrations/         Schema, RLS, triggers
supabase/seed.sql            Global övningsbank
supabase/tests/              RLS-tester (körs mot vanlig Postgres)
e2e/                         Webbläsartester (demo + Supabase-läge mot en mock)
```

**Ändringsflödet:** en vy anropar `actions.x()`. Det skapar en fullständig action med
klientgenererade id:n och tidpunkter. Actionen appliceras direkt i UI:t (optimistiskt),
läggs i offlinekön och skickas sedan till Supabase i ordning. Nekar databasen ändringen
(RLS eller validering) visas ett felmeddelande och kön fortsätter.

### Offline i träningsloggen

Gymmen har ofta dålig täckning, så loggen ska aldrig vänta på nätet:

- Varje avbockat set sparas först i en kö i `localStorage` och skickas därifrån.
  Skrivningarna är idempotenta (upsert på `(workout_id, workout_exercise_id, set_index)`,
  id:n skapas i klienten), så ett omskick ger aldrig dubbletter.
- Vid nätverksfel väntar kön med exponentiell backoff (2–60 s). Den försöker också igen
  direkt när webbläsaren säger att nätet är tillbaka (`online`) och när fliken blir
  aktiv. Ordningen behålls, så "passet startat" alltid kommer före första setet.
- En indikator visar "Offline – N ändringar sparade lokalt". När allt är synkat syns den inte.
- Laddas appen om utan nät startar den från en lokal cache, och köade ändringar
  spelas upp ovanpå. Cache och kö rensas vid utloggning. Finns osynkade ändringar
  frågar appen först.
- **Begränsning:** det finns ingen service worker än, så sidan i sig kan inte öppnas
  från noll utan nät. Det typiska fallet, att nätet försvinner mitt i passet, fungerar.
  Nästa steg är en PWA med en service worker som cachar app-skalet.

## Säkerhet och GDPR (hälsodata = art. 9)

- **RLS på alla tabeller**, och alla policyer gäller bara inloggade. Hälsodata
  (pass, set, vikt, kost, måltider, meddelanden) kan bara läsas av klienten själv
  och klientens **aktiva** PT. En PT med obesvarad förfrågan ser bara namnet.
- **Triggers** stoppar det som RLS inte räcker till för:
  - Klienten kan inte ändra programmet i sina pass.
  - Ingen kan byta parterna i en relation eller bokning, så en PT kan inte peka om en relation till en annan klient.
  - Rollen på en profil kan inte ändras.
  - Det går bara att boka lediga tider. Samma tid kan inte dubbelbokas.
- **Samtycke**: krävs för klientkonton och sparas i `profiles.health_data_consent_at`.
  En check constraint gör att det inte går att skapa ett klientkonto utan samtycke.
- **Dataportabilitet** (art. 20): klienten kan exportera all sin data som JSON.
- **Radering** (art. 17): *Radera mitt konto* anropar `delete_my_account()`. Allt
  raderas sedan via kaskad.
- `proxy.ts` styr bara navigeringen. Åtkomstkontrollen ligger i databasen, så en
  manipulerad roll i användarens metadata ger ingen data.

**Kvar inför lansering:**
1. Juridiskt granskad integritetspolicy (`/integritet` är ett utkast) och personuppgiftsbiträdesavtal (DPA) med Supabase.
2. PWA/service worker för att öppna appen helt offline.
3. Betalning för bokningar (t.ex. Stripe eller Swish Handel).
4. Fler inloggningssätt (BankID, Google) och tvåstegsverifiering för PT-konton.
5. Lagringstid för gamla loggar och meddelanden.
6. Genererade databastyper (`supabase gen types typescript`) i stället för de handskrivna radtyperna.

## Tester

```bash
npm run typecheck && npm run lint

# Schema + RLS mot en lokal Postgres 15+ (simulerar Supabase-roller och auth.uid()):
PGHOST=localhost PGUSER=postgres npm run test:db

# Webbläsartester, se kommentarerna överst i respektive fil:
node e2e/demo-mode.test.mjs
node e2e/supabase-mode.test.mjs
```

RLS-testerna (46 st) kontrollerar bland annat följande:
- Andra klienter och andra PT:er ser ingen hälsodata.
- En PT med obesvarad förfrågan ser ingen hälsodata.
- Klienten kan inte ändra sitt program.
- Bokning och dubbelbokning fungerar som avsett.
- Radering av konto tar bort allt via kaskad.

Supabase-e2e:n kör en mock av Supabase och kontrollerar:
- Inloggning och felmeddelanden.
- Rollstyrd navigering.
- Offlinekön: nätet stängs av mitt i ett pass och set skickas i rätt ordning när nätet är tillbaka.
- Att ändringar som databasen nekar inte blockerar kön.
- Att utloggning rensar lokal data.

## Teknik

Next.js 16 (App Router, `cacheComponents`, `proxy.ts`), React 19, TypeScript, Supabase
(`@supabase/ssr`, Postgres, Auth, Realtime), Tailwind v4, shadcn/ui, Radix, lucide-react,
Recharts 3, dnd-kit, react-day-picker, sonner och next-themes.

shadcn-komponenterna är kopierade från [shadcn-ui/ui](https://github.com/shadcn-ui/ui)
(`apps/v4/registry/new-york-v4/ui`), eftersom `ui.shadcn.com` var blockerad i byggmiljön.
`components.json` är konfigurerad, så `npx shadcn add <komponent>` fungerar i en miljö med
nätåtkomst.
