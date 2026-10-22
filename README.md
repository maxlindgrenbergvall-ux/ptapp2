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
   9. `supabase/migrations/20261022000000_v9_swedish_food_products.sql`. Den lägger till enhet (g/ml), bild och svensk marknad på produkter och enhet på matposter.
   10. `supabase/migrations/20261023000000_v10_calendar_feeds.sql`. Den lägger till kalenderlänkar (iCal) för synk med Google, Outlook och Apple.
   11. `supabase/migrations/20261024000000_v11_services_purchases_nutrition.sql`. Den lägger till tjänster, köp och betalning, passgräns, kostlås, recept och låsta certifikat. Befintliga klienter får ett köp för det som redan är schemalagt.
   12. `supabase/migrations/20261025000000_v12_multi_pt_interests.sql`. Den lägger till flera PT:er per klient, Lämna PT, ett aktivt kostschema, PT-utbud (träning/kost), intressen och mätpunkter.
   13. `supabase/migrations/20261026000000_v13_own_workouts_verify_avatar.sql`. Den lägger till klientens egna pass, PT:ns klarmarkering, program kopplade till bokade pass, profilbild för klienter och "Dagens kost" i realtid.
   14. `supabase/migrations/20261027000000_v14_fixes_rules.sql`. Den rättar RLS-felet vid profilbildsuppladdning, kost-PT-flaggan, spärrar genomförda pass i förtid, kräver vikter vid klarmarkering och låser samtal utan köp eller bokat pass.
   15. `supabase/migrations/20261028000000_v15_push_tokens.sql`. Den lägger till push-tokens för mobilappen (`push_tokens`, `register_push_token`, `unregister_push_token`).
   16. `supabase/seed.sql`
3. **Authentication → URL Configuration** (annars hamnar bekräftelselänkar på startsidan utan inloggning):
   - *Site URL*: produktionsadressen, dvs. den egna domänen (se "Egen domän" nedan) eller `https://ptapp2.vercel.app`. Inte localhost och inte en Vercel-förhandsadress.
   - *Redirect URLs*: `https://<domän>/**`, `https://*-<ert-vercel-team>.vercel.app/**` (förhandsversioner), `com.coavira.app://**` (mobilappen) och `http://localhost:3000/**`.
   - **Authentication → Emails → Templates**: byt länken i *Confirm signup* till
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
     och i *Reset password* till
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nytt-losenord`.
     Då loggas användaren in direkt och hamnar i appen, även om länken öppnas på en annan enhet eller i mejlappens webbläsare.
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
8. **Betalning (Stripe)**, krävs för att klienter ska kunna köpa pass:
   - Sätt serverhemligheterna `STRIPE_SECRET_KEY` (sk_live_… eller sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_…) och `SUPABASE_SERVICE_ROLE_KEY` i Vercel. Ingen av dem får ha prefixet `NEXT_PUBLIC_`.
   - I Stripe, under **Developers → Webhooks**, lägg till `https://<domän>/api/stripe/webhook` med händelserna `checkout.session.completed`, `checkout.session.async_payment_succeeded` och `charge.refunded`.
   - Utan Stripe-nycklar visar kassan "Kortbetalning är inte aktiverad än". En betalning utanför appen (t.ex. Swish) kan registreras manuellt i SQL Editor med `select mark_checkout_paid('<checkout_id>', null, null, null);`.
   - Verifierade certifikat läggs in av admin: `select admin_set_certifications('pt@exempel.se', array['Licensierad PT']);`.
9. Valfritt:
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

## Nytt i v9: svenska livsmedel, drycker och snacks

- **Sök och skanna mot Open Food Facts med svenska varor först** (`src/lib/openfoodfacts.ts`, anropas bara från servern med `User-Agent`):
  - **Streckkod:** `GET /api/v2/product/{ean}?fields=…&lc=sv&cc=se`. Både UPC-A (12 siffror) och EAN-13 med inledande nolla provas.
  - **Sök:** `GET /cgi/search.pl?search_terms=…&tagtype_0=countries&tag_0=sweden[&tagtype_1=brands&tag_1=barebells]&sort_by=unique_scans_n&lc=sv&cc=se`. Först söks produkter som säljs i Sverige, sedan samma varumärke i alla länder och sist hela databasen. Sökningen slutar när det finns tillräckligt många träffar.
- **Varumärken:** `src/lib/swedish-brands.ts` känner igen cirka 60 vanliga butiksmärken (Barebells, Nocco, Celsius, Coca-Cola, Gainomax, Felix, Marabou, Oatly, ICA, Coop, Garant …). Nämner sökningen ett märke filtreras det på det, så att "barebells cookie" eller "nocco" ger rätt produkter. Populära märken visas som snabbval i sökningen.
- **Rangordning:** rätt varumärke och svensk marknad kommer först, sedan namnmatchning och popularitet.
- **Drycker i ml:** läsk, energidryck och mjölk anges per 100 ml, och portionen hämtas från förpackningen ("33 cl" blir en burk på 330 ml, en bar 55 g). Matposter sparas med enhet.
- **Egen cache:** produkter som sökts fram eller skannats sparas i `food_products` (av servern) och söks först. Svenska varor hittas då direkt, även om Open Food Facts är långsamt, nere eller har nått sin sökgräns (cirka 10 sökningar per minut).
- **Saknas varan?** *Lägg till egen produkt* finns både efter skanning och direkt i sökningen. Namnet förifylls, och man väljer mat eller dryck och kan ange streckkod. Produkten sparas privat på kontot och hittas under *Mina produkter* och vid nästa skanning.

## Nytt i v10: kalendersynk, förnamn, mobilkalender och animationer

- **Synka kalender** (PT- och klientkalendern):
  - **Prenumerationslänk:** en hemlig länk per användare, `/api/calendar/feed/{token}.ics`. Den läggs till med ett klick i Google Kalender (`calendar.google.com/calendar/r?cid=webcal://…`), Outlook.com och Microsoft 365 (`…/calendar/0/addfromweb?url=…`) eller Apple Kalender (`webcal://`). Nya, flyttade och avbokade pass uppdateras automatiskt.
  - **Vad som skickas:** bara tid, rubrik, plats och status (`calendar_feed()`, security definer). Anteckningar och hälsodata följer aldrig med.
  - **Byt länk:** länken kan bytas, och då slutar den gamla fungera.
  - **.ics-fil:** passen kan också laddas ner som en fil för engångsimport. Det fungerar även i demoläget.
  - OAuth-baserad tvåvägssynk kan läggas till senare. Envägssynken via iCal fungerar redan med alla stora kalenderappar.
- **Förnamn från profilen:** hälsningar ("Hej {förnamn}!") och alla namn i gränssnittet hämtas från profilen (`src/lib/names.ts`). Hårdkodade namn är borta, och demoläget hämtar namnen från demodatan.
- **Klientens kalender på mobil:**
  - Fliken *Vecka* (standard) har en veckoslider överst: svep eller använd pilarna och *Idag*. Under den visas bara den valda dagens pass, och tomma dagar har en genväg till nästa pass.
  - Fliken *Lista* visar alla kommande pass.
  - Väntande tider visas som en kort rad överst.
- **Animationer på mobil:** staplar och diagram startar när de syns (`useInView` med IntersectionObserver) i stället för vid sidladdning, så att de inte redan är klara när man scrollat dit. Knappar trycks ner lite vid tryck, och den grå tryckblinken är borta. `prefers-reduced-motion` respekteras i hela appen.

## Nytt i v11: tjänster, betalning, passgräns, kost och auth-länkar

- **E-postlänkar loggar in direkt.**
  - `/auth/confirm` verifierar `token_hash` och fungerar på alla enheter.
  - `/auth/callback` byter PKCE-koden. Öppnas länken i en annan webbläsare visas "Din e-post är bekräftad – logga in".
  - `/dashboard` skickar vidare till rätt startsida (eller välkomststeget).
  - En `?code=` som hamnat på fel sida skickas vidare av `proxy.ts`.
- **Certifikat** kan bara sättas av Coavira (`admin_set_certifications`; trigger spärrar PT-kontot). PT-profilen visar verifierade certifikat och hänvisar till certifiering@coavira.fit.
- **Sifferfält** (`NumberInput`) utan inledande nollor ("01"), med svenskt decimaltecken. Priser visas med `formatSek`.
- **Tjänster:** PT:n sätter ihop sin meny med fyra typer av tjänster:
  - enstaka pass
  - träningsprogram med fast antal pass
  - ren kostcoaching
  - helhetspaket (träning och kost)
- **Köp:**
  - Klienten väljer en tjänst. Saknar den kost och PT:n erbjuder kostcoaching visas: *"Kosten är det som syns på riktigt – vill du lägga till kostcoaching av {förnamn}?"*.
  - Betalningen sker via Stripe Checkout. Priserna hämtas i databasen (`create_checkout`), och bara servern kan markera köp som betalda (webhook eller `/api/checkout/verify`).
- **Betalt köp ⇒ aktiv klient:** klienten hamnar direkt i PT:ns Klientöversikt (trigger på `purchases`).
- **Passgräns:**
  - *Betalda pass* är summan av pass i betalda köp.
  - *Använda pass* är schemalagda träningspass plus aktiva kalenderpass utan kopplat träningspass.
  - Triggers på `scheduled_workouts` och `calendar_events` stoppar allt utöver det betalda, med lås per PT–klient-par mot samtidiga anrop.
  - Avbokade pass ger tillbaka passet.
  - Saldot visas för både PT och klient.
- **Kostlås:** kostschemat kan bara sparas av PT:n och läsas av klienten när klienten köpt kost (RLS och trigger). Klienten ser i stället ett låskort med köpknapp.
- **Kostbyggaren:**
  - Varje rad sparar näringsvärden per 100 g och räknar om från dem. Det rättar buggen där värdena försvann när gram ändrades.
  - Enheterna är g och st (t.ex. "3 ägg ≈ 180 g") – ml är borttaget.
  - Egna recept (`recipes`) kan sparas och läggas in i klienters måltider.
- **Mobil:** knapparna i klientvyn (Pausa/Schemalägg pass), sidhuvudens knappar, kalenderns verktygsrad, passbyggaren och vattenknapparna radbryts i stället för att överlappa.

## Nytt i v12: flera PT:er, kostval, PT-utbud, intressen och ny meny

- **Stripe-rättning:**
  - Kassan använder det officiella `stripe`-SDK:t med typade parametrar: `line_items` är en array, och `unit_amount`/`quantity` är heltal i öre.
  - Den överflödiga `currency` på sessionsnivå är borttagen.
  - Stripes felkod och meddelande loggas i Vercel och visas för klienten.
  - Webhooken verifieras med `stripe.webhooks.constructEvent`.
- **Flera PT:er:**
  - En klient kan ha flera aktiva PT:er samtidigt.
  - Varje PT ser klientens träning men ändrar bara sina egna pass och scheman.
  - Chatten är en tråd per PT (`messages.trainer_id`), och samtalskanalen är `call:{klient}:{pt}`.
  - *Lämna PT* (`end_coaching`) tar bort PT:ns åtkomst direkt, avbokar kommande pass och stänger av PT:ns kostschema. PT:n kan inte själv öppna relationen igen.
- **Ett aktivt kostschema:**
  - Ett unikt index tillåter bara ett aktivt schema per klient.
  - Sparar en andra PT ett schema blir det ett förslag, och klienten väljer vilket som gäller (`choose_nutrition_plan`).
- **PT-utbud:**
  - `offers_training` och `offers_nutrition` bestämmer vad PT:n erbjuder: en kost-PT säljer inga pass och en tränings-PT ingen kost (trigger).
  - Sökningen kan filtreras på Träning/Kost.
  - Nya inriktningar: Cykling, Kondition och Kost.
- **Intressen och Framsteg:**
  - Intressen och fokus väljs i välkomststeget och i Profilinställningar.
  - `src/lib/interests.ts` kopplar varje intresse till mätpunkter, t.ex. Cykling → Bästa tid på milen och Snitt-watt, Styrkelyft → 1RM ur passloggen.
  - Loggade värden sparas i `progress_entries` och syns för klientens PT:er.
- **Chatt och samtal:**
  - Samtal visas som brickor i chatten, och missade samtal har en röd markering och knappen *Ring upp*.
  - Bubblorna grupperas och "Läst" visas.
  - Samtalsläget har ny design: gradient, frostad kontrollrad med etiketter och en ny ring/lägg-på-ikon.
- **Logomenyn:** Coavira-loggan öppnar en meny med Inställningar, Profilinställningar, Min data och sekretess och Anslutningar. Sekretess och anslutningar har flyttats från Framsteg till egna sidor.

## Nytt i v14: buggfixar och regler

- **Profilbild – "new row violates row-level security policy":**
  - Uppladdningen gör upsert (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), som kräver INSERT, UPDATE **och** SELECT på `storage.objects`.
  - Bucketen `avatars` saknade SELECT-policy och UPDATE saknade `WITH CHECK`. Migration v14 lägger till båda, begränsade till den egna mappen `{auth.uid()}/…`. Gäller både klienter och PT:er.
  - Appen visar ett begripligt felmeddelande om behörighet ändå saknas.
- **Kost-PT:er:**
  - Buggen: `trainers.offers_nutrition` var `true` som standard, så PT:er som aldrig sålt kost visades under "Se andra PT:s som erbjuder kostschema".
  - Nu `false` som standard, och befintliga PT:er rättas utifrån om de har en aktiv kosttjänst.
  - I appen kräver filtret **Kostschema** (söksidan), taggen **Kostschema** (sökkort och PT-profil) och rekommendationerna både ikryssad kost och en aktiv tjänst som innehåller kostcoaching (`offersNutritionPlan`).
- **Inga genomförda pass i förtid:**
  - Pass kan inte markeras som genomförda eller klarmarkeras innan passdagen har kommit och ett kopplat kalenderpass har börjat. Det gäller både PT och klient (triggers i databasen, samma regel i appen via `src/lib/workout-rules.ts`).
  - Klienten kan fortfarande se passet, "Starta ändå nu" och logga set i förväg, men "Avsluta" är spärrat. Passet försvinner inte i förtid.
- **Vikter krävs:** PT:n kan inte klarmarkera förrän minst ett set är genomfört och alla genomförda set i viktövningar (skivstång, hantlar, kettlebell, kabel, maskin …) har en vikt. Kontrollfönstret visar "Vikt saknas" per övning.
- **Uppvärmning och nedvarvning:** varje övning i passbyggaren har en del (Uppvärmning, Huvudpass eller Nedvarvning). Mallen sparas i den ordningen och passvyn och kalendern visar delarna.
- **Logiska enheter i kosten** (`allowedUnits` i `src/lib/nutrition/meal-items.ts`, samma regler för PT och klient):
  - Vätskor (mjölk, juice, dryck): dl och ml. Olja: msk, tsk, ml och dl.
  - Ris, pasta, gryn, flingor, bönor, kvarg/yoghurt: g och dl.
  - Ägg, frukt, bröd: st och g. Smör, honung, socker, pulver, frön, såser: g, msk och tsk.
  - Kött, fisk, fågel och andra fasta livsmedel: bara g.
- **Samtal kräver köp eller bokat pass:** ett gratiskonto kan inte ringa någon PT. `has_call_access` (betalt köp eller bekräftat/genomfört pass mellan paret) krävs nu av `can_access_call`. I appen visas ett lås med förklaring i stället för ring-knapparna.

## Nytt i v13: klarmarkering, förhandsvisning, egna pass, profilbild och köksmått

- **Klarmarkera pass (PT):**
  - PT:n öppnar passet i samma passvy som klienten loggar i (`/pt/klienter/{klient}/pass/{pass}`).
  - Där rättar PT:n vikter och reps och bockar av genomförda set. Sedan visas ett kontrollfönster med sammanfattning och kommentar.
  - Klarmarkeringen sparar `verified_at`, `verified_by` och `trainer_comment` (bara passets PT kan sätta dem), och kopplade kalenderpass blir genomförda.
- **Förhandsvisning:**
  - Bokade pass i klientens kalender visar övningarna i programmet.
  - "Förhandsgranska passet" öppnar passvyn i läsläge fram till passdagen, med knappen "Starta ändå nu".
- **Program i kalendern:**
  - PT:n kopplar ett program från en mall till ett bokat pass, antingen i passets detaljer eller i formuläret ("Nytt från mall").
  - Programmet (`scheduled_workouts.event_id`) tar kalenderpassets plats i passgränsen och kostar inget extra pass.
- **Egna pass:**
  - Klienten skapar och loggar egna pass ("Logga eget pass"). De sparas med `trainer_id = null`.
  - Klientens PT:er ser dem som underlag, men de räknas aldrig som betalda pass och kan bara ändras av klienten.
- **Profilbild för klienter:**
  - Bilden sparas i `profiles.avatar_url` och visas för PT:n i översikten, klientlistan, chatten, kalendern, samtalet och under "Senaste köp".
  - Den fasta rutan "Knäböj 1RM" är borttagen; 1RM styrs nu av intressena.
- **Videosamtal:** den egna kamerarutan kan dras fritt eller flyttas med piltangenterna.
- **Dagens kost:**
  - `DailyNutrition` är samma komponent för klient och PT. PT:n ser exakt samma måltider, avbockningar (`meal_checks` i realtid) och extra mat, och kan bläddra mellan dagar.
  - Utan köpt kost rekommenderas i första hand klientens PT, annars en annan kost-PT (`src/lib/services/recommend.ts`). Länken "Se andra PT:s som erbjuder kostschema" leder till en filtrerad lista.
- **Köksmått:**
  - Kostbyggaren har enheterna g, st, dl, msk (15 ml) och tsk (5 ml).
  - Köksmått räknas om till gram med livsmedlets densitet (`densityOf`, t.ex. 1 dl havregryn ≈ 35 g). Raden sparar `qty` och `gPerMl`.

## Landningssidan (/)

Coavira är en **mobilapp** (App Store och Google Play), ingen webbportal. Landningssidan på `coavira.fit` leder därför bara till nedladdning, och har inga inloggnings-, registrerings- eller portallänkar. Appen själv laddar sina sidor från samma domän och börjar på `/kom-igang`, och i webbläsaren visas landningssidan för alla, även inloggade.

| Fil | Innehåll |
|---|---|
| `store-badges.tsx` | App Store-/Google Play-brickor ("Hämta i App Store", "Ladda ned på Google Play"), sidans primära CTA. Med `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` länkar de till butiken, annars öppnas en "Släpps snart"-ruta (med konfetti, PT-ansökan och kontakt). |
| `nav.tsx` | Fast meny som blir glas vid scroll, ankarlänkar, "Ladda ned" (scrollar till brickorna) och mobilmeny med brickorna |
| `hero.tsx` | Rubrik med ord-för-ord-animation, butiksbrickor, 3D-telefon med "Dagens kost" och "Schemalagda pass", flytande brickor, faktaremsa |
| `bento.tsx` | Funktioner (#funktioner): PT ↔ klient, kostschema med appens riktiga enhetslogik, kalendersynk och passgräns, verifierade PT:er, betalning och anslutningar (de två sista bara från md) |
| `goals.tsx` | "Vad vill du uppnå?" (#mal): välj mål ur `INTERESTS` och se Framsteg-vyn byggas om |
| `chat-showcase.tsx` | Chatt och samtal (#kommunikation): missat samtal, demo-videosamtal med flyttbar kameraruta |
| `pricing.tsx` | Priser (#priser): appen 0 kr, exempel på PT-tjänster med mersälj av kostcoaching, PT-ansökan |
| `final-cta.tsx` | Avslutande CTA (#ladda-ned) med pulserande butiksbrickor, och sidfot med Support, Sekretesspolicy, Användarvillkor och Kontakt |
| `primitives.tsx` | Gemensamt: Reveal/Stagger, GlassCard, TiltCard, PhoneFrame, FloatingBadge, useConfetti |

- **När apparna publiceras:** sätt `NEXT_PUBLIC_APP_STORE_URL` (t.ex. `https://apps.apple.com/se/app/coavira/id…`) och `NEXT_PUBLIC_PLAY_STORE_URL` (`https://play.google.com/store/apps/details?id=com.coavira.app`) i Vercel och bygg om. Brickorna länkar då direkt till butikerna. `NEXT_PUBLIC_APP_STORE_ID` aktiverar dessutom Safaris Smart App Banner.
- **Officiella brickor:** brickorna är ritade i App Store-/Google Play-stil. Apple och Google kräver att man använder deras officiella badge-grafik (Apple Marketing Guidelines, Google Play badge-generatorn). Byt till de officiella SVG-filerna innan lansering.
- **Sidor som butikerna kräver:** `/support` (Support URL), `/integritet` (Privacy Policy) och `/villkor` (Terms). Integritet och villkor är utkast som ska granskas juridiskt.
- **E-post:** `support@coavira.fit`, `kontakt@coavira.fit` och `certifiering@coavira.fit` (`src/lib/brand.ts`). Brevlådorna måste finnas.
- **Tema och animationer:** alltid mörkt (`.landing` i `globals.css`), framer-motion 13.5.1 och canvas-confetti 1.9.4. `MotionConfig reducedMotion="user"`.
- **Prestanda (regler för nya animationer):**
  - Ändlösa loopar görs i CSS (`landing-float`, `bento-*`, `cta-*` i `globals.css`, Tailwinds `animate-spin`/`animate-ping`), aldrig med framer-motion `repeat: Infinity`. De animerar bara `transform`/`opacity`, pausas när de inte syns och stängs av med "minska rörelse".
  - Inga `filter: blur()`-sken: använd radiella gradienter (`GlowOrb`). `backdrop-blur` bara från `md:` (stängs dessutom av för allt under `.landing` på telefoner).
  - `whileInView` alltid med `viewport={{ once: true }}`. Scroll-parallax (`useScroll`) monteras bara från md, så att telefoner inte har några scroll-lyssnare som mäter layout.
  - `transform-gpu`/`will-change-transform` bara på element som rör sig hela tiden. Engångsanimationer i CSS använder `fill-mode-backwards`, så att inga lager blir kvar.
  - Mobil: sekundära block döljs under md (`hidden md:block`), sektioner har `py-12` på mobil.
  - Mät med `BASE_URL=http://localhost:3000 node e2e/landing-perf.mjs` (390×844, CPU strypt 4×): sektionshöjder, huvudtråden i vila och bildrutetider vid scroll.
- **Fakta:** inga påhittade siffror, betyg eller avgifter. "0 kr" gäller appen och kontot, och inga gratispass utlovas (kontrolleras i `e2e/landing.test.mjs`).

## Domän: coavira.fit

Den officiella domänen är `coavira.fit`. Den är standard för metadata, Open Graph, kanonisk adress, sitemap/robots och mobilapparna. `NEXT_PUBLIC_SITE_URL` kan skriva över den.

1. **Vercel → Project → Settings → Domains:** lägg till `coavira.fit` och `www.coavira.fit`. Välj `coavira.fit` som primär och låt `www` omdirigera dit (308).
2. **DNS hos domänleverantören** (Vercel visar exakta värden när domänen läggs till):

   | Typ | Namn | Värde |
   |---|---|---|
   | A | `@` (coavira.fit) | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` (eller det projektspecifika värde Vercel visar) |

   - Ta bort gamla A/AAAA-poster för `@` och `www` som pekar någon annanstans. **Behåll MX- och TXT-poster** för e-post.
   - Har domänen CAA-poster: lägg till `0 issue "letsencrypt.org"` så att Vercel kan utfärda certifikatet.
   - Alternativ: byt namnservrar till `ns1.vercel-dns.com` och `ns2.vercel-dns.com` (då sköter Vercel all DNS, även e-postposter som ni lägger in där).
3. **Vercel → Settings → Environment Variables (Production):** `NEXT_PUBLIC_SITE_URL=https://coavira.fit`, och bygg om (Redeploy).
   - Kanonisk adress, Open Graph, `sitemap.xml` och `robots.txt` pekar då på domänen.
   - `ptapp2.vercel.app` i produktion skickas vidare till domänen (308, `src/lib/site.ts`). Undantag som fortsätter fungera på den gamla adressen: `/api/*` (Stripe-webhook, kalenderprenumerationer), `/auth/*` (e-postlänkar skickade före bytet), `/.well-known/*` och appen.
4. **Supabase → Authentication → URL Configuration:**
   - *Site URL*: `https://coavira.fit` (e-postmallarna använder `{{ .SiteURL }}`, så bekräftelse- och lösenordslänkar går till domänen).
   - *Redirect URLs*: `https://coavira.fit/**`, `https://www.coavira.fit/**`, `com.coavira.app://**`, `http://localhost:3000/**` och förhandsversionerna. Behåll `https://ptapp2.vercel.app/**` under en övergångsperiod.
   - Inloggningslänkar byggs från adressen användaren är på (`window.location.origin`), så PKCE-nyckeln och sessionen hör alltid till samma domän.
5. **Stripe:** `success_url` och `cancel_url` byggs från domänen användaren köper på (`request.nextUrl.origin` i `/api/checkout`), alltså `https://coavira.fit/klient/kop…` efter bytet. Ändra webhook-adressen till `https://coavira.fit/api/stripe/webhook` (Developers → Webhooks) och uppdatera `STRIPE_WEBHOOK_SECRET` om ni skapar en ny endpoint. Den gamla adressen fortsätter fungera under bytet.
6. **Google/Apple-inloggning:** Supabase-callbacken (`https://<projekt>.supabase.co/auth/v1/callback`) ändras inte. Lägg gärna till `coavira.fit` som *Authorized domain* i Googles OAuth-samtyckesskärm.
7. **Wearables:** uppdatera callback-domänen hos Strava/Garmin/Fitbit till `https://coavira.fit/api/wearables/<leverantör>/callback`.
8. **Mobilappen:** sätt repo-variabeln `SITE_URL=https://coavira.fit` (GitHub → Settings → Secrets and variables → Actions → Variables). Nästa bygge laddar domänen.

## Mobilapp (iOS och Android) med Capacitor

Native-apparna finns i `ios/` och `android/` (Capacitor 8) och byggs i GitHub Actions. Ingen Mac eller Android Studio behövs.

- **Så fungerar det:** appen använder SSR, API-routes, auth-callbacks och `proxy.ts` och kan därför inte exporteras statiskt. Native-appen laddar i stället den driftsatta webbtjänsten i en WebView (`server.url` i `capacitor.config.ts`). Webben byggs och driftsätts på Vercel exakt som förut; `.vercelignore` håller native-mapparna utanför Vercel.
- **App-id och namn:** `com.coavira.app`, "Coavira". Version 1.0 (Android `versionCode` 1).
- **Serveradress:** `CAPACITOR_SERVER_URL`. Standard är `https://coavira.fit`. I GitHub kan den ändras med repo-variabeln `CAPACITOR_SERVER_URL` eller när arbetsflödet körs manuellt.
- **Byggen (`.github/workflows/mobile.yml`, "Mobilappar"):** körs vid ändringar i appfilerna på `main`, i pull requests och manuellt (Actions → Mobilappar → Run workflow). Under *Artifacts* på körningen finns:
  - `coavira-android-debug`: `app-debug.apk` som kan installeras direkt på en Android-telefon (tillåt installation från okänd källa).
  - `coavira-ios-simulator`: osignerad `App.app` för iOS-simulatorn. En riktig iPhone kräver signering via Apple-utvecklarkontot (TestFlight, senare steg).
- **Ikoner och startskärm:** källbilder i `mobile/assets` (ritas av `npm run mobile:icons` ur Coaviras märke). `npm run mobile:assets` skapar alla storlekar för båda plattformarna. Startskärmen är limegrön, i mörkt läge mörk.
- **Porträttläge:** låst på både iOS och Android (iPad: helskärm i porträtt).
- **Behörigheter:** kamera (streckkoder, profilbild, videosamtal), mikrofon (samtal) och bilder (iOS), med svenska förklaringar. Android säkerhetskopierar inte appdata (`allowBackup=false`), eftersom inloggning och hälsodata ligger i WebView.
- **Reservsidor:** `scripts/mobile-www.mjs` skapar `mobile/www/index.html` och `offline.html` (visas utan nätverk). De genereras och checkas inte in.
- **Lokalt (valfritt):** `CAPACITOR_SERVER_URL=http://<datorns-ip>:3000 npm run cap:ios` (macOS och Xcode) eller `npm run cap:android` (Android Studio). Bara mot http tillåts klartext och WebView-felsökning.
- **Igenkänning:** appen lägger till `CoaviraApp` i user agent (och `CoaviraPush` när bygget har push), så att webben kan känna igen native-appen.

### Mobilanpassning och native-funktioner (steg 3)

- **Apple/Google i appen:** Google tillåter inte inloggning i en WebView. I appen öppnas leverantören därför i systemets webbläsare (`@capacitor/browser`) och skickar tillbaka till `com.coavira.app://auth/callback?code=…`. `NativeBridge` stänger fönstret och växlar koden på `/auth/callback` i appens WebView, där PKCE-nyckeln finns. På webben är flödet oförändrat.
  - **Krävs i Supabase:** lägg till `com.coavira.app://**` under Authentication → URL Configuration → Redirect URLs.
- **E-post och lösenord** fungerar direkt i appen. E-postlänkar (bekräftelse, nytt lösenord) öppnas i telefonens webbläsare tills App Links/Universal Links är aktiverade (kräver signeringscertifikat och Apple Team ID).
- **Djuplänkar:** `com.coavira.app://klient/kalender` och appens egna https-länkar öppnar rätt sida, även vid kall start. Andra domäner och `//`-sökvägar ignoreras (ingen öppen omdirigering).
- **Push-notiser (grundstöd):** frågar först när användaren slår på "Push-notiser" i Inställningar (syns bara i appen). Enhetens token sparas i `push_tokens` och tas bort vid utloggning eller när push stängs av. Tryck på en notis öppnar `data.url` (bara interna sökvägar).
  - **Android:** lägg Firebase-filen `google-services.json` som repo-hemligheten `GOOGLE_SERVICES_JSON`; då byggs appen med push. Utan den visas "kommer i en kommande version".
  - **iOS:** kräver APNs-nyckel och Push-capability i Apple-kontot (certifikatfasen). `AppDelegate` vidarebefordrar redan enhetens token.
  - **Utskick** (Firebase Cloud Messaging från servern, t.ex. när en avisering skapas) görs i ett senare steg.
- **App Links / Universal Links (förberett):** `/.well-known/assetlinks.json` (miljövariabeln `ANDROID_APP_SHA256`) och `/.well-known/apple-app-site-association` (`APPLE_TEAM_ID`) svarar 404 tills värdena finns.
- **Helskärm och safe area:** `viewport-fit=cover`; sidhuvuden, bottenmeny, samtalsvy och inloggningssidor lägger till `--safe-top`/`--safe-bottom` (från `env(safe-area-inset-*)` och Capacitors `--safe-area-inset-*` på Android). Android kör kant till kant (`EdgeToEdge`). På webben är marginalerna 0.
- **Betalning:** Stripe Checkout öppnas i appen (`allowNavigation`), så att man kommer tillbaka till appen efter köpet. Andra externa länkar (bilagor, Google Kalender) öppnas i systemets webbläsare.
- **Kamera, mikrofon och filer:** streckkodsscanner, videosamtal och bilduppladdning använder WebView:ns kamera/filväljare med behörigheterna från steg 2.
- **Kända begränsningar:** anslutning av Strava/Garmin och `.ics`-nedladdning går via webbläsaren och fungerar bäst på webben tills de får egna appflöden.

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
node e2e/v9-livsmedel.test.mjs  # Barebells/Nocco/Coca-Cola mot OFF-mocken, ml, UPC/EAN, egen produkt
node e2e/v10-ux.test.mjs        # förnamn, veckoslider (svep), .ics-export, animationer i bild, minska rörelse
node e2e/v11-tjanster.test.mjs  # mersälj, kostlås, passgräns, kostbyggaren (st, gram-buggen, recept), "01", mobil
node e2e/v13-pass-profil-kost.test.mjs # förhandsvisning, egna pass, klarmarkering, program i kalendern, profilbild, kamera, kost, dl/msk
node e2e/landing.test.mjs       # landningssidan: struktur, fakta, länkar, demos, 360–1440 px, minska rörelse, SEO, appen → /kom-igang
node e2e/landing-shots.mjs <mapp> # skärmdumpar av landningssidan i fyra bredder
node e2e/landing-perf.mjs         # prestanda på mobil: sidhöjd, huvudtråd i vila, bildrutor vid scroll
NEXT_PUBLIC_SITE_URL=https://coavira.fit NEXT_PUBLIC_CANONICAL_REDIRECT=1 npx tsx --tsconfig tsconfig.json e2e/site-url.unit.ts  # domänomdirigeringen
node e2e/v15-app-demo.test.mjs  # mobilappen (låtsas-Capacitor): djuplänkar, kall start, push, safe area, webben opåverkad
node e2e/v15-app-oauth.test.mjs # mobilappen i Supabase-läge: Google i systemwebbläsaren, PKCE, tillbaka via com.coavira.app://
node e2e/v14-regler.test.mjs    # Kostschema-filter/tagg, logiska enheter, tidsspärr, vikter krävs, uppvärmning/nedvarvning, samtalslås
node e2e/v12-multi-pt.test.mjs  # logomeny, flera PT:er, chatt per PT, missat samtal, kostval, kost-PT, intressen → Framsteg
# Supabase-läget kör även mot e2e/mock-stripe.mjs (STRIPE_API_BASE=http://localhost:54500)
```

RLS-testerna (`rls`, `rls_v2` … `rls_v15`) och ett migreringstest för v4 kontrollerar bland annat följande:
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
- v11: PT kan inte ändra certifikat. Köp kan inte skapas eller markeras betalda av klienten. Priset hämtas från tjänsten, och fel belopp avvisas.
- v11: en betalning aktiverar relationen. Pass 6 av 5 stoppas både som träningspass och i kalendern, och en avbokning ger tillbaka passet.
- v13: klienten skapar, ändrar och tar bort sina egna pass, men kan inte skapa pass i PT:ns namn eller klarmarkera. Egna pass tar inga betalda pass, och PT:n ser dem men kan inte ändra dem. Program kopplat till ett bokat pass tar inget extra pass. Bara passets PT klarmarkerar, och profilbilden måste vara en https-adress eller en bild.
- v15: push-tokens kan bara skrivas via `register_push_token`, är privata, flyttas till den som loggar in på telefonen och tas bort vid utloggning. Utloggade kan inte registrera tokens.
- v14: profilbilden kan laddas upp och ersättas (upsert) i den egna mappen men inte i någon annans. Kost-PT-flaggan följer aktiva kosttjänster. Varken PT eller klient kan markera ett pass som genomfört innan det ägt rum, klarmarkering kräver vikter i viktövningar, och samtal kräver köp eller bokat pass.
- v12: tre PT:er samtidigt, PT:er ser inte varandras chattar eller samtal och ändrar inte varandras pass eller scheman, bara ett aktivt kostschema, och klienten väljer det. Lämna PT stänger åtkomsten och PT:n kan inte återaktivera relationen. Kost-PT säljer inga pass, och intressen och mätpunkter är privata.
- v11: kostplan kräver köpt kost (och låses vid återbetalning). Klienten kan inte köpa hos en annan PT än sin aktiva, och recept är privata.

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
