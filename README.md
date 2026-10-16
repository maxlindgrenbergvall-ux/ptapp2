# Coavira – PT- och träningsplattform

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
2. Kör migrationerna i ordning och sedan seed-filen (SQL Editor, eller `supabase link` + `supabase db push`):
   1. `supabase/migrations/20261014000000_init.sql`
   2. `supabase/migrations/20261015000000_v2_media_trackers_calls.sql`. Den lägger till profilbild, coaching-typ, bilagor, trackers, wearables, Storage-buckets och regler för samtal.
   3. `supabase/migrations/20261016000000_v3_food_products_aliases.sql`. Den lägger till livsmedelsprodukter (streckkod och egna), gram och streckkod på matposter, övningsnamn per klient och det uppdaterade övningsbiblioteket.
   4. `supabase/migrations/20261017000000_v4_calendar.sql`. Den ersätter `bookings` och `trainer_availability` med en tvåvägskalender (`calendar_events`) och återkommande tillgänglighet (`availability_rules`). Befintliga bokningar och tider flyttas över automatiskt.
   5. `supabase/migrations/20261018000000_v5_reschedule_notifications_offers.sql`. Den lägger till ombokning av preliminära pass (`awaiting`, `previous_start/end`), aviseringar (`notifications`, skapas av en trigger) och PT-erbjudanden (`trainer_offers`).
   6. `supabase/migrations/20261019000000_v6_auth_onboarding_no_free.sql`. Den lägger till registrering med telefonnummer, välkomststeget (`complete_onboarding`) och regler mot gratispass.
   7. `supabase/migrations/20261020000000_v7_admin_created_trainers.sql`. Den gör att PT-konton bara kan skapas av en admin (rollen läses från `app_metadata`) och lägger till `admin_make_trainer()`.
   8. `supabase/migrations/20261021000000_v8_trainers_email_only.sql`. Den gör att PT-konton inte kan kopplas till Apple eller Google.
   9. `supabase/seed.sql`
3. **Authentication → URL Configuration**: sätt *Site URL* till appens adress och lägg till
   `https://<din-domän>/auth/callback` (och `http://localhost:3000/auth/callback`) under *Redirect URLs*.
4. **Authentication → Providers → Apple och Google** (för "Fortsätt med Apple/Google"):
   - **Google:** skapa ett OAuth-klient-id (typ *Web*) i Google Cloud Console med redirect-URI `https://<projekt>.supabase.co/auth/v1/callback`, och klistra in Client ID och Secret i Supabase.
   - **Apple:** skapa ett *Services ID* med *Sign in with Apple* och samma return-URL, och en nyckel (.p8). Fyll i Services ID, Team ID, Key ID och nyckeln i Supabase.
   - Appen skickar tillbaka användaren till `/auth/callback`, och nya konton hamnar i välkomststeget. Är en leverantör inte aktiverad visas ett tydligt felmeddelande.
5. **Authentication → Providers → Email**: ha *Confirm email* påslaget i produktion.
   Sätt minsta lösenordslängd till 8 och slå gärna på *Leaked password protection*.
6. Kopiera *Project URL* och *Publishable key* (Project Settings → API) till `.env.local`.
   **Service role-nyckeln ska aldrig in i appen.**
7. **Skapa PT-konton (bara admin, bara e-post).** PT:er kan inte registrera sig själva. Ni registrerar bara deras e-postadress, och PT:n väljer sitt eget lösenord. Välj ett av två sätt:
   - Kör `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/create-trainer.mjs pt@exempel.se "Namn" [telefon]` lokalt. Det skapar ett bekräftat konto **utan lösenord** med `app_metadata.role = "trainer"`.
   - I Dashboard: välj **Authentication → Add user** (e-post, *Auto Confirm*, valfritt engångslösenord som aldrig delas) och kör sedan `select admin_make_trainer('pt@exempel.se', 'Namn', '070…');` i SQL Editor.

   Säg till PT:n att gå till `/logga-in/pt` och trycka på **Välj lösenord** (*Glömt lösenordet?*). Hen anger sin e-post, öppnar länken i mejlet och väljer ett eget lösenord. Därefter loggar PT:n in med e-post och lösenord, fyller i **Min profil** och publicerar. PT-konton kan **inte** logga in med Apple eller Google.
8. Valfritt:
   - **Wearables:** sätt `SUPABASE_SERVICE_ROLE_KEY` som serverhemlighet i Vercel. Lägg också till `FITBIT_CLIENT_ID` och `FITBIT_CLIENT_SECRET` från dev.fitbit.com, med callback `https://<domän>/api/wearables/fitbit/callback`. Utan Fitbit-nycklar kopplas en mock-enhet, så att flödet ändå går att testa.
   - **Samtal:** under *Realtime → Settings*, stäng av *Allow public access*, så att bara privata kanaler med RLS används. Behöver ni fungera bakom strikta brandväggar eller på vissa mobilnät, ange en TURN-server i `NEXT_PUBLIC_ICE_SERVERS`.

### Flödet

1. Startsidan är inloggning och registrering för klienter: *Fortsätt med Apple*, *Fortsätt med Google*, *Registrera dig* (e-post, telefonnummer och lösenord) eller *Logga in*. I välkomststeget (`/valkommen`) bekräftar klienten namn och telefon och lämnar samtycke till hälsodata, som sparas på profilen. PT:er registrerar sig inte. De får ett konto av Coavira och loggar in på `/logga-in/pt` med bara e-post och lösenord.
2. Klienten hittar en PT, väljer en ledig tid och skickar en bokningsförfrågan
   (status *pending*). Första bokningen skapar också en relation med status *pending*.
3. PT:n accepterar förfrågan i kalendern. Passet blir *confirmed* och syns direkt
   hos båda, och en ny klient aktiveras. Först då kan PT:n se klientens
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

## Nytt i v2

**PT**
- **Profil:**
  - profilbild (uppladdning eller länk)
  - coaching-typ (distans, på plats eller båda), som också blir ett filter i sökningen
  - certifieringar som badges
  - förhandsvisning av hur klienterna ser profilen
- **Kostbyggare:** färgkodade makron (protein blå, kolhydrater gul/orange, fett rosa) och snabbsök efter livsmedel. Gram ändras direkt på raden. Lättare ytor och en sammanfattning med fördelningsstapel.
- **Passbyggare:** instruktionsvideo per övning. Antingen en YouTube- eller Vimeo-länk, som bäddas in via youtube-nocookie och Vimeo dnt, eller en egen uppladdad fil (max 200 MB).
- **Klientsidan:** vanor de senaste 7 dagarna (vatten, sömn och extra mat).

**Klient**
- **Dagens kost:** fältet *Övrigt / extra* för mat utanför schemat, via snabbsök eller en egen rad med kcal och makron.
- **Vattentracker:** glas om 250 ml, med mål efter kroppsvikt (35 ml per kg).
- **Sömntracker:**
  - timmar och känsla
  - sömnsteg och sömnpoäng från klocka
  - snitt för veckan
- **Klocka och hälsoappar:** Fitbit via OAuth och webhook. Utan nycklar används en mock-enhet. Apple Health och Health Connect är förberedda men kräver en mobilapp, eftersom datan bara finns på telefonen.
- **Historik:** en sida per övning med varje tillfälle (set, vikt, reps), personbästa och 1RM-kurva. Varje pass går att öppna.

**Gemensamt**
- **Chatt:** bilder, video (max 50 MB) och PDF, via gem-knappen, dra och släpp eller klistra in.
- **Video- och röstsamtal:** WebRTC direkt mellan PT och klient, med signalering via Supabase Realtime. Ingen extern tjänst eller nyckel behövs. Samtalet loggas i chatten ("Videosamtal · 12 min" eller "Missat samtal").
- **Tema:** neutrala ytor med lätt grön ton. Mörkgrönt (ljust läge) eller neongrönt (mörkt läge) används på primärknappar, aktiva flikar, framstegsindikatorer, grafer och badges.

**Begränsningar och ärliga noteringar**
- **Fitbits sömnpoäng** ("Sleep Score") finns inte i det publika Web API:t. Appen räknar ut en egen poäng från längd, sömnsteg och avbrott, och märker den som *beräknad*.
- **Apple Health och Health Connect** har inga webb-API:er. Det som krävs är en iOS- eller Android-app som läser datan på telefonen och skickar den till servern. Datamodellen, `health_source` och adaptergränssnittet är förberedda för det.
- **Google Fits REST-API** är under avveckling till förmån för Health Connect. Bygg därför inte en ny koppling mot det.
- **Samtal:** utan TURN-server kan samtal misslyckas i vissa företagsnät och på vissa mobilnät. Appen visar då ett tydligt felmeddelande. Samtal är 1:1 och spelas inte in.
- **Bilagor** kräver uppkoppling. Själva meddelandet går via offlinekön först när filerna är uppladdade. I demoläget lever bilagor och videor bara tills sidan laddas om.

## Nytt i v3

- **Livsmedel:**
  - **Grundbibliotek:** cirka 230 vanliga livsmedel med värden per 100 g och typisk portion, i linje med Livsmedelsverkets databas. Det finns i `src/lib/food-library.ts`.
  - **Märkesvaror:** söks i Open Food Facts via `/api/food/search`.
  - **Sökningen** rangordnar träffar, tål å/ä/ö-varianter ("agg" hittar "Ägg") och visar grupperna *Senaste*, *Mina produkter*, *Baslivsmedel* och *Märkesvaror*.
  - **Portionsval:** snabbknappar (1 portion, 50, 100 g …) och makron som räknas direkt.
- **Streckkodsscanner:**
  - Läser med mobilkameran. Webbläsarens inbyggda `BarcodeDetector` används där den finns; annars zxing, som fungerar i Safari på iPhone.
  - Bara EAN/UPC-koder med giltig kontrollsiffra godtas, och med zxing krävs två identiska läsningar.
  - Ficklampa och manuell inmatning finns som reserv.
  - Saknas produkten kan klienten lägga till den själv. Den hittas sedan direkt nästa gång koden skannas.
  - Uppslaget går via `/api/food/barcode/[kod]`, cachas i CDN:en och med Supabase även i `food_products`, som används om Open Food Facts är nere.
- **Profilbild:** profilkortet längst ned i PT-menyn visar nu bilden. Ogiltiga eller trasiga adresser visar initialer på en fast färg per person.
- **Mörkt läge:** grafitgrå bas, ljusare kort och komponenter samt vitare text. Diagram- och makrofärger är kontrollerade mot de nya ytorna.
- **Övningsbibliotek:** 127 övningar med korrekta svenska namn, för styrka, olympiska lyft, bål och kondition. Källan är `src/lib/exercise-library.json`, och SQL genereras med `node scripts/gen-exercise-sql.mjs`. Befintliga id:n behålls, så historik och mallar påverkas inte.
- **Övningsnamn per klient:** PT:n döper om en övning för en viss klient under Klient → Pass → *Övningsnamn för klienten*. Klienten ser PT:ns namn i dagsvyn, träningsloggen och historiken. Biblioteket och andra klienter påverkas inte.

## Nytt i v4: kalender och bokning

- **Databas:** `calendar_events` (status `pending`/`confirmed`/`cancelled`/`completed`, typ pass eller blockering, plats på plats/distans, valfri koppling till ett schemalagt pass) och `availability_rules` (veckodag eller enskilt datum; ett datum ersätter veckoschemat den dagen). En exclusion constraint gör att väntande och bekräftade händelser aldrig kan överlappa för samma PT.
- **Lediga tider** räknas i databasen med `available_slots()`/`next_available_slots()`: tillgänglighet minus bokade pass, egna pass och blockeringar, med PT:ns minsta framförhållning. Klienten ser aldrig andras bokningar. Demoläget räknar likadant lokalt (`src/lib/calendar/slots.ts`).
- **PT-kalender** (`/pt/kalender`): månad, vecka och dag. Gult = väntar på bekräftelse, grönt = bekräftat, blått = planerat träningspass utan bokning, grått = blockerad tid. Panelen *Väntande förfrågningar* har Acceptera/Neka. PT:n kan lägga in egna pass, boka in en klient direkt (bekräftat) och blockera tid (lunch, semester, heldagar). Krockar stoppas. Klick på en tom tid skapar en händelse där.
- **Tillgänglighet:** veckoschema med passlängd per intervall, specialtider för enskilda datum och minsta framförhållning. Antalet lediga tider de kommande två veckorna visas direkt.
- **Klient** (`/klient/kalender`): *Mina pass* med tid, plats och PT, tydlig markering *Väntar på bekräftelse från PT*, planerade träningspass och avbokning. Bokningen från PT-profilen visar bara dagar och tider som är lediga.
- **Realtid:** ändringar i `calendar_events` skickas via Supabase Realtime, så en accepterad bokning syns hos klienten utan omladdning.

## Nytt i v5: Coavira, ombokning, aviseringar och systemtema

- **Varumärke:** appen heter **Coavira**. Namn, beskrivning och färger finns på ett ställe (`src/lib/brand.ts`), loggan i `src/components/brand.tsx`. Favicon (`app/icon.svg`), hemskärmsikon (`app/apple-icon.tsx`), webbappsmanifest (`app/manifest.ts`), sidtitlar, Open Graph-data och laddningsskärmen använder det nya namnet. Osynkade ändringar och offlinecache under de gamla `forma:`-nycklarna flyttas automatiskt.
- **Systemtema:** ljust/mörkt läge följer enhetens inställning (iOS, Android/Samsung, macOS, Windows, webbläsare) via `prefers-color-scheme`. Tailwinds `dark:`-variant är definierad som mediafrågan (`@custom-variant dark (@media (prefers-color-scheme: dark))`), de mörka färgtokens ligger i samma mediafråga och `color-scheme: light dark` gör att även scrollbars och datumväljare följer med. Ingen JavaScript och ingen temaknapp, så det blir ingen blink vid laddning och temat byts direkt när systemet byter. `next-themes` är borttaget.
- **Dra-och-släpp (PT):** preliminära pass (gula, streckade) kan dras i vecko- och dagvyn (upp/ner = tid i steg om 15 min, sidled = dag) och mellan dagar i månadsvyn. Bekräftade pass, blockeringar och planerade pass är låsta. Under dragningen visas den nya tiden; krockar visas röda och går inte att släppa. Vid släpp bekräftar PT:n förslaget, och först då aviseras klienten. Fungerar med mus, penna och touch (Pointer Events); för tangentbord finns *Flytta* i passets detaljer.
- **Ombokningsflödet:** den som flyttar ett preliminärt pass lämnar över till motparten (`awaiting`). Klienten kan **acceptera** den nya tiden (blir bekräftad) eller **föreslå en ny tid** bland PT:ns lediga tider. Då hamnar passet hos PT:n igen, som kan acceptera, neka eller flytta. PT:n kan också lägga in ett pass som *preliminärt*, så att klienten bekräftar det.
- **Aviseringsmenyn** (klockan i headern) visar avbokningar (flera avbokningar från samma person inom en timme visas som en, till exempel "Elin avbokade 2 pass"), ombokningar med gammal och ny tid, bekräftelser och nya förfrågningar. Klienten kan acceptera eller föreslå en ny tid direkt i menyn. Aviseringar markeras som lästa när menyn stängs.
- **Personliga PT-erbjudanden:** PT:n skapar erbjudanden per inriktning under *Min profil*. Klienten ser i aviseringsmenyn erbjudanden i de kategorier hen visat intresse för: filterval väger 3, sökord 2 och öppnade PT-profiler 1. Intresset halveras på 14 dagar. Högst tre erbjudanden visas, och högst ett per PT. Historiken sparas **bara lokalt på enheten**, raderas vid utloggning och kan stängas av eller rensas i menyn.

## Nytt i v6: inloggning och inga gratispass

- **Inloggning och registrering** (startsidan `/`, `/registrera`, `/logga-in`):
  - Apple och Google via `signInWithOAuth` (PKCE). Supabase skickar tillbaka till `/auth/callback`, som byter koden mot en session.
  - E-post, telefonnummer och lösenord via `signUp`. Telefonnumret normaliseras till E.164 (+46…) och sparas av triggern `handle_new_user()` i `profiles.phone`.
  - Med e-postbekräftelse påslagen leder länken till välkomststeget.
- **Välkomststeget** (`/valkommen`): nya konton, även från Apple och Google, väljer kontotyp, bekräftar namn och telefon och (för klienter) samtycker till hälsodata.
  - Det sparas med RPC:n `complete_onboarding()`. Den sätter rollen **en gång**, skapar PT-profilen och speglar rollen i auth-metadata.
  - Appen förnyar sedan sessionen. `proxy.ts` skickar konton utan kontotyp hit, och `/pt` och `/klient` är stängda tills kontotypen är vald.
- **Inga gratispass:** Coavira hanterar inga pass utan betalning, för att slippa avräkningar mellan plattformen och PT:erna.
  - Erbjudanden måste ha ett pris över 0 kr eller en rabatt på högst 99 %, och får inte kallas gratis eller kostnadsfria. Reglerna finns både i appen (`src/lib/offers/policy.ts`) och som constraints i databasen.
  - En publicerad PT-profil måste ha ett pris per pass.
  - Befintliga gratiserbjudanden tas bort av migrationen.

## Nytt i v7: PT-konton skapas av Coavira

- **Ingen självregistrering för PT:** registreringen och välkomststeget skapar bara klientkonton.
  - `complete_onboarding()` avvisar allt annat än `client`.
  - `handle_new_user()` ignorerar en PT-roll i `user_metadata`, som vem som helst kan skicka med `signUp`.
  - Användare kan inte heller skapa en PT-profil eller sätta PT-rollen själva.
- **Admin-skapade konton:** PT-rollen godtas bara från `app_metadata`, som bara kan sättas med service role (`scripts/create-trainer.mjs`) eller av `admin_make_trainer()` i SQL Editor. Ett befintligt klientkonto kan inte göras om till PT.
- **PT-inloggning** (`/logga-in/pt`): bara e-post och lösenord, utan registrering och utan Apple eller Google. Ett konto som inte är PT-konto loggas ut med en förklaring. Startsidan och den vanliga inloggningen länkar dit.
- **Navigering:** appen och `proxy.ts` läser rollen från `app_metadata` (PT-rollen bara därifrån). Åtkomstkontrollen sker som tidigare med RLS.

## Nytt i v8: PT loggar bara in med e-post

- **Apple och Google spärrade för PT:er.**
  - **I databasen:** en trigger på `auth.identities` stoppar att Apple eller Google kopplas till ett PT-konto (Supabase lägger annars ihop konton med samma e-post). Inloggningen misslyckas då redan i Supabase. Eventuella befintliga kopplingar tas bort, och `admin_make_trainer()` vägrar konton som är kopplade till Apple eller Google.
  - **I appen:** `proxy.ts` avslutar en PT-session som skapats via OAuth (`amr = oauth`) och visar en förklaring på PT-inloggningen.
- **Första inloggningen:** PT-kontot registreras med bara e-post. På `/logga-in/pt` finns rutan *Första gången? Välj lösenord*. Den leder till `/glomt-losenord?pt=1`, där PT:n får en länk för att välja sitt eget lösenord. Ingen behöver skicka lösenord.

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
  lib/brand.ts, components/brand.tsx  Varumärket Coavira (namn, färger, logga)
  lib/calendar/*             Tider, lediga tider och krockkontroll
  components/calendar/*      PT- och klientkalender, dra-och-släpp (use-event-drag.ts)
  lib/notifications/*        Aviseringsregler (speglar databastriggern) och texter
  lib/offers/interests.ts    Lokal intressehistorik och matchning av PT-erbjudanden
  components/notifications/* Aviseringsmenyn
  lib/storage.ts             Uppladdning, signerade länkar (Storage) och demoläge
  lib/video.ts               Tolkning av YouTube-/Vimeo-/fil-länkar
  lib/calls/*                Samtal: signalering (Supabase/demo) och WebRTC-motor
  lib/wearables/*            Adaptrar (Fitbit, mock), sömnpoäng, serverlogik
  app/api/wearables/**       OAuth (connect/callback), synk och Fitbit-webhook
  app/api/food/**            Streckkodsuppslag och sök (Open Food Facts)
  lib/food-library.ts        Grundbibliotek med livsmedel
  lib/food-search.ts         Sökning, portioner och kontroll av streckkoder
  lib/exercise-library.json  Övningsbiblioteket (källa för app, demo och SQL)
  components/nutrition/*     Livsmedelsväljare, streckkodsscanner, makrofärger
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
  - En klient kan bara skapa *pending*-förfrågningar på tider som `available_slots()` erbjuder, och kan bara avboka. PT, klient och typ går inte att ändra i efterhand.
  - Samma tid kan inte dubbelbokas (exclusion constraint på tidsintervallet).
- **Samtycke**: krävs för klientkonton och sparas i `profiles.health_data_consent_at`.
  En check constraint gör att det inte går att skapa ett klientkonto utan samtycke.
- **Ingen beteendeprofil på servern:** intressen för personliga erbjudanden räknas fram och sparas bara på klientens enhet. De kan stängas av, och de raderas vid utloggning. Aviseringar innehåller tider och namn, men aldrig hälsodata.
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
node e2e/v2-features.test.mjs   # kräver Chromium-flaggorna i filen (falsk kamera/mikrofon)
node e2e/v3-features.test.mjs   # mot e2e/mock-openfoodfacts.mjs; kamerafallet läser en riktig EAN-13
                                # ur en genererad video (node e2e/make-barcode-video.mjs)
node e2e/calendar.test.mjs      # boka → väntar → PT accepterar → bekräftat, blockering, krockar, vyer
node e2e/v5-coavira.test.mjs    # branding, systemtema, aviseringar, erbjudanden, dra-och-släpp och ombokning
```

RLS-testerna (`rls`, `rls_v2` … `rls_v8`) och ett migreringstest för v4 kontrollerar bland annat följande:
- Andra klienter och andra PT:er ser ingen hälsodata.
- En PT med obesvarad förfrågan ser ingen hälsodata.
- Klienten kan inte ändra sitt program.
- Klienter kan bara boka lediga tider, inte dubbelboka och inte se andras bokningar.
- Ombokning: bara preliminära pass flyttas i flödet. Klienten kan acceptera PT:ns tid eller föreslå en ledig tid, men aldrig ändra passets innehåll eller flytta ett bekräftat pass. `awaiting` och tidigare tid sätts av databasen.
- Aviseringar skapas bara av triggern. Ingen kan skapa eller ändra en avisering åt någon annan, och mottagaren kan bara sätta `read_at` eller ta bort sina egna.
- Registrering och välkomststeget: telefonnummer normaliseras, kontotypen kan bara väljas en gång och bara via `complete_onboarding`, och klientkonton kräver samtycke.
- PT-konton: självregistrering med PT-roll i metadatan ger ett konto utan kontotyp. Välkomststeget, direkta uppdateringar och egna PT-profiler stoppas. Bara admin (`app_metadata` eller `admin_make_trainer`) kan skapa PT:er.
- PT bara via e-post: Apple och Google kan inte kopplas till PT-konton, inte heller för PT:er skapade via dashboard, och ett Google-konto kan inte göras till PT. Klienter kan fortfarande använda Apple och Google.
- Inga gratispass: 0 kr, 100 % rabatt eller "gratis" i texten stoppas, och en PT utan pris kan inte publiceras.
- PT-erbjudanden: bara i PT:ns egna inriktningar. Klienter ser bara aktiva och giltiga erbjudanden från publicerade PT:er.
- Accept, nekande och avbokning ger rätt lediga tider; gamla bokningar migreras korrekt till kalendern.
- Radering av konto tar bort allt via kaskad.
- Bilagor, övningsvideor och samtalskanaler kan bara nås av rätt parter.
- Wearable-tokens är oläsbara för inloggade användare.
- Egna produkter är privata, och den delade produktcachen kan bara skrivas av servern.
- Övningsnamn kan bara sättas av klientens aktiva PT.

Supabase-e2e:n kör en mock av Supabase och kontrollerar:
- Inloggning och felmeddelanden.
- Rollstyrd navigering.
- Offlinekön: nätet stängs av mitt i ett pass och set skickas i rätt ordning när nätet är tillbaka.
- Att ändringar som databasen nekar inte blockerar kön.
- Att utloggning rensar lokal data.
- Kalendern: pass från databasen visas hos klient och PT, lediga tider hämtas via RPC och bokningsförfrågan sparas.
- PT:ns första inloggning ("Välj lösenord" skickar en länk via Supabase Auth), och att en PT-session från Google loggas ut och inte kommer åt PT-panelen.
- PT-inloggningen har bara e-post och lösenord. Klientkonton släpps inte in där, och en PT-roll i `user_metadata` ger ingen tillgång till PT-panelen.
- Startsidan har Apple, Google, registrering och inloggning. OAuth startas med rätt leverantör och retur-URL (PKCE). Registreringen skickar e-post, normaliserat telefonnummer och lösenord, och välkomststeget sparar kontotypen.
- Aviseringar och erbjudanden laddas från databasen, lästa aviseringar sparas, och klientens accept av en ny tid skickas.

## Teknik

Next.js 16 (App Router, `cacheComponents`, `proxy.ts`), React 19, TypeScript, Supabase
(`@supabase/ssr`, Postgres, Auth, Realtime), Tailwind v4, shadcn/ui, Radix, lucide-react,
Recharts 3, dnd-kit, react-day-picker, sonner och next-themes.

shadcn-komponenterna är kopierade från [shadcn-ui/ui](https://github.com/shadcn-ui/ui)
(`apps/v4/registry/new-york-v4/ui`), eftersom `ui.shadcn.com` var blockerad i byggmiljön.
`components.json` är konfigurerad, så `npx shadcn add <komponent>` fungerar i en miljö med
nätåtkomst.
