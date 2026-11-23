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
   16. `supabase/migrations/20261029000000_v16_cart_boost.sql`. Den lägger till varukorgen (`cart_items`, `abandoned_carts`, `mark_cart_reminded`) och PT Boost (`trainer_boosts`, `trainers.boosted_until`, `create_boost_checkout`, `mark_boost_paid`, `mark_boost_refunded`).
   17. `supabase/migrations/20261030000000_v17_quantity_service_fee.sql`. Den lägger till antal enstaka pass (varukorg och köp), serviceavgiften 7 % (`checkout_fees`, `service_fee_sek`) och härdar RLS-hjälpfunktionerna inför öppen registrering.
   18. `supabase/migrations/20261031000000_v18_plus_referrals.sql`. Den lägger till Coavira Plus (`profiles.is_coavira_plus`, `coavira_plus_until`, `plus_plans`, `plus_purchases`), inbjudningskoder (`profiles.referral_code`) och inbjudningar (`referrals`, `redeem_referral`). Den döljer också andras kod och Plus-status med kolumnrättigheter på `profiles`.
   19. `supabase/migrations/20261101000000_v19_custom_exercises_pt_invites.sql`. Den lägger till egna övningar (`custom_exercises`), PT:ns koder till befintliga klienter (`pt_invites`, `create_pt_invite`, `redeem_pt_invite`), kundursprung på relationen (`coaching_relationships.acquisition_type`) och serviceavgiften 5 % / 10 % i `create_checkout`.
   20. `supabase/migrations/20261102000000_v20_launch_account_deletion.sql`. Den rättar kontoraderingen för konton som bjudit in någon (v18), avidentifierar omdömen och aviseringar när ett konto raderas och sparar när villkoren godkändes (`profiles.terms_accepted_at`).
   21. `supabase/migrations/20261103000000_v21_store_purchases.sql`. Den lägger till köp i appen via App Store/RevenueCat (`profiles.store_plus_until`, `store_transactions`, `apply_store_plus`, `apply_store_boost`, `revoke_store_boost`) och sätter webbpriset för Coavira Plus till 49 kr / 30 dagar.
   22. `supabase/migrations/20261104000000_v22_stripe_connect.sql`. Den lägger till Stripe Connect och den obligatoriska PT-onboardingen (`trainers.stripe_onboarding_complete`, den privata tabellen `trainer_payout_accounts`, `apply_stripe_account`, `admin_mark_pt_onboarded`). **Publicerade PT-profiler döljs tills PT:n kopplat Stripe och visas sedan automatiskt igen.**
   23. `supabase/migrations/20261105000000_v23_security_hardening.sql`. Säkerhetsgranskningen: hälsodata kräver samtycke även via API:t, relationsfrågorna svarar bara parterna, TRUNCATE m.fl. tas bort för anon/authenticated och tabellen `rate_limits` med `hit_rate_limit()` (bara servern).
   24. `supabase/migrations/20261106000000_v24_training_recipes.sql`. Engelska övningsnamn (Romanian Deadlift, Bench Press …), klienten får ändra ordningen på övningar i PT:ns pass, `edit_completed_workout()` för att redigera genomförda pass, låsta set efter PT:ns klarmarkering och klientens recept (`client_recipes`, `servings`).
   25. `supabase/migrations/20261107000000_v25_recipe_import_favorites.sql`. Receptimport och favoriter: nya fält på `client_recipes` (`goal_types`, `image_url`, `source_url`, `steps`, `total_minutes`, `nutrition`, `macros_source`), tabellen `user_favorite_recipes` (RLS: `auth.uid() = user_id`) och måltid/recept på `food_entries` (`meal_type`, `recipe_id`).
   26. `supabase/migrations/20261108000000_v26_recipe_library.sql`. Coaviras färdiga receptbibliotek (`library_recipes`, 40 recept med makron, bilder, tid, metriska ingredienser och steg – läsbart för inloggade, ingen kan skriva), favoriter för både biblioteks- och egna recept och `food_entries.library_recipe_id`. Kan köras om.
   27. `supabase/migrations/20261109000000_v27_recipe_photos.sql`. Tar bort de illustrerade receptbilderna och skapar bucketen `recipe-images` (publik läsning, max 2 MB) för riktiga matfoton.
   28. `supabase/migrations/20261110000000_v28_recipe_photos.sql`. Riktiga matfoton (Pexels) för 34 av 40 biblioteksrecept. Skriver inte över foton som laddats upp till Storage.
   29. `supabase/migrations/20261111000000_v29_moderation_mealprep_templates.sql`. Bildfiltret (tabellen `moderation_events`, inga direkta bilduppladdningar till `avatars`/`chat-attachments`), receptkategorin `meal_prep` med hela biblioteket (44 recept) och klienternas passmallar (`workout_templates.client_id`).
   30. `supabase/migrations/20261112000000_v30_client_goals.sql`. Klientens mål, mått, takt (reglaget) och kalorimål från intro-flödet (`client_goals`, RLS: klienten själv, aktiva PT:er läser).
   31. `supabase/migrations/20261113000000_v31_onboarding_roles.sql`. Nytt intro-flöde för alla. Migrationen gör följande:
       - Sätter `onboarding_completed = false` för **alla** konton och speglar flaggan i JWT:n.
       - **Loggar ut alla** genom att tömma `auth.sessions` och `auth.refresh_tokens`.
       - Lägger till förnamn och efternamn, `legal_acceptances` och profilbilder som bara får ligga i den egna Storage-mappen.
       - Lägger till RPC-funktionerna `save_profile_step`, `accept_legal_documents`, `finish_onboarding` och `my_onboarding_status`.
   32. `supabase/migrations/20261114000000_v32_training_activity.sql`. Träning och aktivitet: extra set och egna övningar (`"extra": true`) i PT:ns pass under passet, målet `bodybuilding` i `client_goals`, `strava` i `wearable_provider`, tabellerna `activity_logs` (pass från Strava, Apple Hälsa, Health Connect) och `activity_days` (dagssummor från telefonen) med RLS. Stravas pass raderas när kopplingen tas bort.
   33. `supabase/migrations/20261115000000_v34_user_agreement_marketing.sql`. Ett sammanslaget användaravtal i intro-flödet (`accept_user_agreement`, krävs nu även för klienter i `finish_onboarding`) och samtycke till nyhetsbrev (`profiles.marketing_consent(_at)`, loggen `consent_events`, `set_marketing_consent`). Befintliga konton som redan är klara påverkas inte.
   34. `supabase/migrations/20261116000000_v36_marketing_prompt.sql`. Kräver v34. Lägger till `profiles.marketing_choice_at` (när användaren valt ja eller nej) och `marketing_choice_needed` i `my_onboarding_status()`. `set_marketing_consent(p_granted, p_source)` tar nu också källan `prompt`, och svaret i pop-upen loggas i `consent_events`.
   35. `supabase/seed.sql`
3. **Authentication → URL Configuration** (annars hamnar bekräftelselänkar på startsidan utan inloggning):
   - *Site URL*: appens adress, `https://ptapp2.vercel.app` (se "Domäner" nedan). Inte landningssidan, localhost eller en Vercel-förhandsadress.
   - *Redirect URLs*: `https://ptapp2.vercel.app/**`, `https://*-<ert-vercel-team>.vercel.app/**` (förhandsversioner), `com.coavira.app://**` (mobilappen) och `http://localhost:3000/**`.
   - **Authentication → Emails → Templates**: klistra in Coaviras sex mallar från `supabase/templates/`. Tabellen i [`supabase/templates/README.md`](supabase/templates/README.md) visar vilken fil och ämnesrad som hör till *Confirm sign up*, *Invite user*, *Magic link or OTP*, *Change email address*, *Reset password* och *Reauthentication*. Du kan också köra `SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/push-email-templates.mjs`, som bara ändrar mallarna.
     Länkarna går till `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`. Då loggas användaren in direkt och hamnar i appen, även om länken öppnas på en annan enhet eller i mejlappens webbläsare.
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

   Säg till PT:n att gå till `/logga-in/pt` och trycka på **Välj lösenord** (*Glömt lösenordet?*). Hen anger sin e-post, öppnar länken i mejlet och väljer ett eget lösenord. Därefter loggar PT:n in med e-post och lösenord och går igenom den obligatoriska onboardingen (`/pt/onboarding`, v22): profil och utbetalningar via Stripe. Sedan lägger PT:n in tjänster under **Min profil** och publicerar. PT-konton kan **inte** logga in med Apple eller Google.
8. **Betalning (Stripe)**, krävs för att klienter ska kunna köpa pass:
   - Sätt serverhemligheterna `STRIPE_SECRET_KEY` (sk_live_… eller sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_…) och `SUPABASE_SERVICE_ROLE_KEY` i Vercel. Ingen av dem får ha prefixet `NEXT_PUBLIC_`.
   - I Stripe, under **Developers → Webhooks**, lägg till `https://<domän>/api/stripe/webhook` med händelserna `checkout.session.completed`, `checkout.session.async_payment_succeeded` och `charge.refunded`.
   - Samma webhook hanterar PT Boost (`metadata.kind = "boost"`); inga extra händelser behövs.
   - **Stripe Connect (v22):** aktivera Connect i Stripe (*Connect → Get started*, plattform/marknadsplats, Sverige). Lägg till samma endpoint en gång till under **Developers → Webhooks → Add endpoint → "Events on Connected accounts"** med händelsen `account.updated`, och sätt dess hemlighet som `STRIPE_CONNECT_WEBHOOK_SECRET` i Vercel.
   - Utan Stripe-nycklar visar kassan "Kortbetalning är inte aktiverad än". En betalning utanför appen (t.ex. Swish) kan registreras manuellt i SQL Editor med `select mark_checkout_paid('<checkout_id>', null, null, null);`.
   - Verifierade certifikat läggs in av admin: `select admin_set_certifications('pt@exempel.se', array['Licensierad PT']);`.
9. Valfritt:
   - **Wearables:** sätt `SUPABASE_SERVICE_ROLE_KEY` som serverhemlighet i Vercel. Lägg också till `FITBIT_CLIENT_ID` och `FITBIT_CLIENT_SECRET` från dev.fitbit.com, med callback `https://<domän>/api/wearables/fitbit/callback`. Utan Fitbit-nycklar kopplas en mock-enhet i utveckling (eller med `WEARABLES_MOCK=1`). I produktion skapas aldrig falsk data; då visas att källan inte är aktiverad än.
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
- Klientdetalj: vikt-, styrke- (tyngsta set) och frekvensgrafer, passhistorik med loggade set,
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
- **Vattentracker:** glas om 250 ml, med mål efter kroppsvikt (30 ml per kg, 1,5–3 l sedan v68).
- **Sömntracker:**
  - timmar och känsla
  - sömnsteg och sömnpoäng från klocka
  - snitt för veckan
- **Klocka och hälsoappar:** Fitbit via OAuth och webhook. Utan nycklar används en mock-enhet. Apple Health och Health Connect är förberedda men kräver en mobilapp, eftersom datan bara finns på telefonen.
- **Historik:** en sida per övning med varje tillfälle (set, vikt, reps), personbästa och kurva över tyngsta set. Varje pass går att öppna.

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
  - `src/lib/interests.ts` kopplar varje intresse till mätpunkter, t.ex. Cykling → Bästa tid på milen och Snitt-watt, Styrkelyft → tyngsta set ur passloggen.
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
  - Den gamla fasta maxlyftrutan är borttagen (v39: inga uppskattade maxlyft alls).
- **Videosamtal:** den egna kamerarutan kan dras fritt eller flyttas med piltangenterna.
- **Dagens kost:**
  - `DailyNutrition` är samma komponent för klient och PT. PT:n ser exakt samma måltider, avbockningar (`meal_checks` i realtid) och extra mat, och kan bläddra mellan dagar.
  - Utan köpt kost rekommenderas i första hand klientens PT, annars en annan kost-PT (`src/lib/services/recommend.ts`). Länken "Se andra PT:s som erbjuder kostschema" leder till en filtrerad lista.
- **Köksmått:**
  - Kostbyggaren har enheterna g, st, dl, msk (15 ml) och tsk (5 ml).
  - Köksmått räknas om till gram med livsmedlets densitet (`densityOf`, t.ex. 1 dl havregryn ≈ 35 g). Raden sparar `qty` och `gPerMl`.

## Nytt i v16: varukorg och PT Boost

**Varukorg (klient)**
- Knappen med påsen i sidhuvudet öppnar varukorgen (`src/components/cart/cart.tsx`). Klienten lägger tjänster i den med **Lägg i varukorg** på en PT:s profil; **Välj** köper direkt som förut.
- Varukorgen kan innehålla tjänster från flera PT:er, grupperade per PT. Kassan (Stripe) gäller en PT och högst 5 tjänster åt gången (`create_checkout`), så varje PT har en egen **Till kassan**. Saknar klienten kost hos PT:n föreslås PT:ns kostcoaching.
- Varukorgen sparas i `cart_items` (offlinekön, realtid mellan enheter) och lokalt i demoläget. En betald tjänst tas bort automatiskt (trigger på `purchases`).
- **Påminnelser (förberett):** `abandoned_carts(interval)` listar klienter vars varukorg legat orörd längre än intervallet och inte påmints om (antal, summa, PT:er). `mark_cart_reminded(client_id)` markerar påminnelsen. Båda kan bara anropas med service role, t.ex. från ett schemalagt jobb som skickar push via `push_tokens`.

**PT Boost (199 kr för 7 dagar)**
- PT:n köper Boost under **Min profil** (`src/components/boost/boost.tsx`). Profilen måste vara publicerad.
- Köpflödet:
  - `POST /api/stripe/boost-checkout` kör `create_boost_checkout()` (priset bestäms i databasen) och skapar en Checkout-session med 19 900 öre i SEK, `mode: payment` och metadata `kind: boost`, `boost_id`, `trainer_id` och `boost_duration_days: 7`.
  - Webhooken `checkout.session.completed` anropar `mark_boost_paid()`, som sätter `trainers.boosted_until` till nu + 7 dagar. Köper PT:n igen medan boosten pågår läggs de nya 7 dagarna efter den pågående.
  - `GET /api/stripe/boost-checkout/verify` bekräftar direkt efter returen, utan att vänta på webhooken. `charge.refunded` kortar boosten med 7 dagar.
- PT:n kan aldrig sätta `boosted_until` själv (trigger), och `trainer_boosts` är skrivskyddad för användare.
- **Synlighet:** utvalda PT:er visas först i **Hitta PT** (standardsorteringen "Bäst matchning", bland dem som matchar filtren) med märket **Utvald**. Väljer klienten en annan sortering gäller den.
- **Klockan:** utvalda PT:er rekommenderas till klienter som har personliga erbjudanden påslagna och har visat intresse för PT:ns inriktning. Högst 2 visas, inga PT:er klienten redan tränar med, och klienten kan dölja dem.
- **Märkning:** betalda placeringar märks för klienten ("Utvalda PT:er är betalda placeringar", "Annons" i klockan), enligt marknadsföringslagen och EU:s krav på att betald rangordning ska anges.

## Nytt i v17: antal, serviceavgift och öppen registrering

**Antal enstaka pass:** i varukorgen väljer klienten antal (1–20) med − och + för enstaka pass. Radpriset är styckpris × antal. Paket och kostcoaching är alltid 1 st. Antalet sparas i `cart_items.quantity`. Ett köp av 3 × enstaka pass ger 3 pass att boka (`purchases.quantity`, `sessions`, `price_sek`).

**Serviceavgift 7 %** (ersatt i v19 av 5 % / 10 % efter kundursprung, se nedan):
- Avgiften räknas på deltotalen per kassa och avrundas till hela kronor (950 kr → 67 kr). Varukorgen och köpdialogen visar *Deltotal*, *Serviceavgift (7 %)* och *Totalt att betala*.
- Databasen bestämmer beloppet: `create_checkout(p_service_ids, p_quantities)` räknar ut avgiften med `service_fee_sek()` och sparar den i `checkout_fees`. Klienten ser sina egna avgifter; PT:er ser dem inte.
- Stripe: `/api/checkout` skickar tjänsterna (styckpris × antal) och avgiften som en egen rad, "Serviceavgift (7 %)". Avgiften kontrolleras mot samma regel i `src/lib/payments/fees.ts` innan sessionen skapas.
- `mark_checkout_paid` godkänner bara deltotal + avgift. PT:n får tjänstens pris; avgiften är Coaviras.

**Öppen registrering på appens domän:** koden har ingen inbjudnings- eller åtkomstspärr. Alla kan registrera sig med e-post, Google eller Apple, välja *klient* i välkomststeget och komma in direkt. PT-konton skapas fortfarande bara av Coavira efter manuell granskning (`complete_onboarding` nekar rollen PT). Tre inställningar utanför koden kan ändå stänga ute nya användare:
1. **Vercel → Settings → Deployment Protection:** med *Standard Protection* kan Vercel kräva inloggning på `*.vercel.app`-adresser när projektet har en egen domän. Sätt *Vercel Authentication* till **Only Preview Deployments**, eller ge appen en egen domän (t.ex. `app.coavira.fit` + `NEXT_PUBLIC_APP_URL`).
2. **Supabase → Authentication → Emails → SMTP Settings:** Supabases inbyggda e-post skickar bara till medlemmar i projektets team, och med en låg gräns per timme. Koppla en egen SMTP-tjänst (t.ex. Resend eller Postmark), annars får nya användare aldrig bekräftelsemejlet.
3. **Google Cloud → OAuth consent screen:** i läget *Testing* kan bara listade testanvändare logga in med Google. Välj **Publish app**.

**Säkerhet:**
- Alla tabeller har RLS, och `rls_v17.test.sql` testar att en nyregistrerad användare bara ser sin egen data. Den testar också att PT- och adminfunktioner är låsta, och att anonyma besökare varken ser data eller kan anropa RLS-hjälpfunktionerna.
- `node scripts/check-secrets.mjs` (efter `npm run build` med hemligheterna satta) kontrollerar att inga hemliga nycklar finns i webbläsarkoden och att ingen `NEXT_PUBLIC_`-variabel har ett hemligt namn.

## Nytt i v18: Coavira Plus och inbjudningar

**Coavira Plus.** Grunden är alltid gratis: dagens kostschema, bokning, att utföra pass och chatten. Plus låser upp fyra saker:
1. sömntracking,
2. historik äldre än 30 dagar (pass under Framsteg och per övning),
3. djupgående grafer (styrkeutveckling),
4. export av träning och kost till CSV.

Exporten av *all* egen data under Min data och sekretess (JSON) är alltid gratis. Den är en rättighet enligt GDPR (art. 15 och 20), så den låses inte. Därför är det en ny CSV-export som är Plus-funktionen.

- `<RequirePlus feature="sleep">…</RequirePlus>` (`src/components/plus/require-plus.tsx`) visar innehållet för Plus-användare. Andra ser en suddig förhandsvisning med ett lås. Ett tryck öppnar uppgraderingsrutan på frostat glas (`backdrop-blur-md`) med två knappar: *Bjud in en vän & få 1 månad gratis* och *Skaffa Coavira Plus*. PT:er påverkas aldrig.
- Effektiv Plus = `is_coavira_plus` (utan slutdatum, sätts av Coavira) eller `coavira_plus_until > now()`. Användaren kan inte ändra fälten själv (trigger och kolumnrättigheter).
- **Köp:** `/api/stripe/plus-checkout` → `create_plus_checkout()` → Stripe Checkout (`metadata.kind = "plus"`) → webhook/verify → `mark_plus_paid`. Plus förnyas inte automatiskt. **Inget pris finns i koden:** tills Coavira lagt in en plan svarar köpknappen att Plus inte går att köpa än och föreslår en inbjudan:
  ```sql
  insert into plus_plans (days, price_sek) values (30, 49);   -- 49 kr för 30 dagar (exempel)
  update plus_plans set active = false where price_sek = 49;   -- avsluta en plan
  ```

**Inbjudningar ("Bjud in & tjäna", i logomenyn):**
- Alla konton får en unik kod med 8 tecken, utan tecken som är lätta att förväxla (`profiles.referral_code`).
- **Klient → klient: ge 1 månad, få 1 månad.**
  - Länken `coavira.fit/ref/KOD` leder till registreringen, och koden förifylls i välkomststeget.
  - När kontot skapats löser `redeem_referral(kod)` in koden. Den nya klienten får 30 dagar Plus och inbjudaren +30 dagar.
  - Nya konton kan också lösa in en kod i efterhand, under Bjud in & tjäna.
- **PT → PT: en veckas Boost.**
  - PT:n ser sin kod i portalen.
  - Den nya PT:n anger koden i ansökan till certifiering@coavira.com. Coavira kopplar den när kontot skapas:
    ```sql
    select admin_link_trainer_referral('ny-pt@example.com', 'PTKOD234');
    select admin_set_certifications('ny-pt@example.com', array['Licensierad PT']);  -- verifierad → +7 dagar Boost till den som bjöd in
    ```
  - Belöningen delas ut automatiskt (trigger) när den nya PT:n får sitt första certifikat.
- **Skydd mot fusk:**
  - Koden kan bara lösas in inom 14 dagar från att kontot skapades, med bekräftad e-post, en gång per konto, och aldrig den egna koden.
  - Klientkoder gäller bara klienter och PT-koder bara PT:er.
  - En inbjudare får högst 12 belöningar per år. Fler inbjudningar räknas, men ger ingen ny belöning.
- **RLS:** användare läser bara sina egna inbjudningar (som inbjudare eller inbjuden) och sin egen kod och Plus-status (`my_account()`). Ingen kan skriva i `referrals`. PT:er ser inte klienternas kod eller Plus.

## Nytt i v19: egna övningar, PT:ns koder och serviceavgift 5 % / 10 %

**Egna övningar.** Saknas en övning i övningsbanken kan klienter (under *Logga eget pass*) och PT:er (i passbyggaren) välja *Lägg till egen övning*:
- Varje övning har namn, startvikt/standardvikt i kg eller lbs, set, reps och muskelgrupp.
- Övningen sparas i `custom_exercises`, kopplad till användaren (`user_id`), och läggs direkt i passet med sina förslag. Pass loggas i kg, så lbs räknas om och avrundas till 0,5 kg.
- Övningen syns sedan i alla övningslistor med märket *Egen* och visas i passvyn som övriga övningar.
- **RLS:** ägaren läser och ändrar sina övningar. PT:n och klienten som ägaren tränar med kan läsa dem, eftersom övningen kan finnas i ett tilldelat pass eller i klientens egna pass. Ingen annan ser dem.
- Begränsningar: samma namn kan bara finnas en gång per användare, och varje användare kan ha högst 300 egna övningar.

**PT:ns koder till befintliga klienter.**
1. *Bjud in existerande klient* finns i PT:ns översikt (klientlistan). Knappen skapar en engångskod, t.ex. `EX-8FK29A`, med `create_pt_invite()`.
   - Bara godkända PT:er kan skapa koder, det vill säga PT-konton med certifikat verifierade av Coavira.
   - En PT kan ha högst 50 oanvända koder.
2. PT:n kopierar koden eller länken `coavira.fit/ref/EX-8FK29A` och skickar den i sin egen kanal.
3. Klienten anger koden på ett av två ställen:
   - i välkomststeget efter registreringen, i fältet *Har du en inbjudningskod från din PT?*, som fylls i automatiskt från länken;
   - under *Inställningar*.
4. `redeem_pt_invite()` kopplar klienten direkt till PT:n med en aktiv relation och `acquisition_type = 'EXISTING_CLIENT'`, och koden förbrukas.

Klienter som hittar och bokar en PT i appen får `PLATFORM_CLIENT`, vilket är standard för alla relationer, även de som fanns innan v19.

**Säkerhet för koderna:**
- Klienter kan aldrig läsa `pt_invites`. PT:er ser bara sina egna koder och kan inte skriva i tabellen.
- Koderna skapas med kryptografisk slump, gäller i 30 dagar och kan bara användas en gång.
- Högst 10 felaktiga försök per klient och timme.
- En klient som redan köpt hos PT:n i appen kan inte bli befintlig klient i efterhand.
- Bara databasen kan sätta `acquisition_type`, och Coavira kan rätta det:
  ```sql
  select admin_set_acquisition('klient@example.com', 'pt@example.com', 'EXISTING_CLIENT');
  ```

**Serviceavgift 5 % / 10 %:** `create_checkout()` väljer procentsatsen efter relationen:
- 5 % för `EXISTING_CLIENT`
- 10 % för `PLATFORM_CLIENT`

Avgiften räknas på deltotalen och avrundas till hela kronor. Den sparas i `checkout_fees.fee_percent`.

Varukorgen och köpdialogen visar *Serviceavgift (5 %)* eller *Serviceavgift (10 %)* före Stripe Checkout, och för befintliga klienter raden "Befintlig klient: 5 % i stället för 10 %". Samma regel finns i `src/lib/payments/fees.ts` och kontrolleras igen innan Stripe-sessionen skapas.

## Nytt i v20: lansering i App Store och Google Play

**Kontoradering (Apple 5.1.1(v), Google Play, GDPR art. 17).** *Radera mitt konto* finns i *Inställningar*, i *Profilinställningar* och under *Min data och sekretess*, för både klienter och PT:er. Användaren bekräftar genom att skriva RADERA. Sedan sker detta:
1. `POST /api/account/delete` identifierar användaren med sessionen, aldrig med ett id från webbläsaren.
2. Servern tar bort användarens filer i Storage: profilbild, chattbilagor och övningsvideor.
3. Kontot raderas med Supabase Auth admin-API:t (`auth.admin.deleteUser`). Det kräver `SUPABASE_SERVICE_ROLE_KEY`, som bara finns på servern.
4. Databasen raderar resten via `on delete cascade`.
   - Det andra behåller avidentifieras: omdömen visas som "Tidigare klient" och aviseringar som "Raderat konto".
   - Utan service role används `delete_my_account()`. Det raderar samma data, men filerna ligger kvar.
- **Fel som rättats:** sedan v18 gick det inte att radera ett konto som hade bjudit in en vän. `rls_v20.test.sql` raderar nu konton av alla slag: klient med köp och varukorg, befintlig klient med egna övningar, PT med tjänster, koder och boost, samt inbjudare.

**Samtycke och villkor:**
- Registreringen och välkomststeget har en obligatorisk bockruta: "Jag godkänner användarvillkoren och behandlingen av mina hälsouppgifter för träningsuppföljning i enlighet med Integritetspolicyn."
- Apple och Google på registreringssidan är låsta tills rutan är ikryssad.
- Välkomststeget gäller alla inloggningssätt. Där sparas `health_data_consent_at` och `terms_accepted_at`.
- Länkar till `https://coavira.fit/privacy` och `https://coavira.fit/terms` finns i registreringen, på Kom igång och under Inställningar. Adresserna leder till `/integritet` och `/villkor`. Använd dem i App Store Connect och Google Play Console.

**Fel och nätverk:**
- `error.tsx` (rot, klient, PT), `global-error.tsx` och `not-found.tsx` visar ett tydligt felmeddelande i stället för en blank sida.
- Utan uppkoppling visar felvyn "Ingen uppkoppling" och försöker igen automatiskt när nätet är tillbaka. Datalagret hade redan offlinekö och cache.

**Köp i iOS-appen (App Store 3.1.1):**
- Coavira Plus och PT Boost är digitala tjänster. De säljs inte med Stripe i iOS-appen: knapparna visas inte, och servern nekar köpen.
- Plus via inbjudan fungerar som vanligt.
- PT-pass och kostcoaching utförs av en person och betalas med Stripe även i iOS-appen (3.1.3(e)).
- På webben och i Android-appen fungerar alla köp som förut.

**Native:**
- Externa länkar öppnas i appens inbyggda webbläsare (SFSafariViewController / Custom Tabs).
- Stripe Checkout öppnas i webbläsarvyn (SFSafariViewController/Custom Tabs) med Klar-knapp och kommer tillbaka till appen via `/app-retur` → `com.coavira.app://…` (se Betalning nedan).
- iOS har fått `ITSAppUsesNonExemptEncryption = false` och integritetsmanifestet `PrivacyInfo.xcprivacy` (ingen spårning).

**Checklista före inlämning:**
1. Kör migrationerna 18–20 i Supabase.
2. Kontrollera *Redirect URLs* i Supabase (se ovan): `com.coavira.app://**` måste finnas.
3. Sätt `SUPABASE_SERVICE_ROLE_KEY` i Vercel, annars ligger filer kvar efter kontoradering. Sätt `APPLE_TEAM_ID` för Universal Links.
4. App Store Connect:
   - *App Privacy* ska stämma med `PrivacyInfo.xcprivacy`: hälsa och träning, namn, e-post, telefon, foton, innehåll och köphistorik, kopplat till kontot och ingen spårning.
   - Ange länkarna till integritetspolicyn och villkoren.
   - Ange ett demokonto för granskningen (klient och PT).
5. Google Play Console:
   - *Data safety* motsvarande.
   - Länk för kontoradering: `https://coavira.fit/support`. Användaren kan också radera i appen.
   - Hälsoappdeklarationen.

## Nytt i v21: köp i iPhone-appen (App Store via RevenueCat)

| Vad | Webben | iPhone-appen | Android-appen |
|---|---|---|---|
| PT-pass och kostcoaching | Stripe | Stripe | Stripe |
| Coavira Plus | Stripe, 49 kr / 30 dagar | App Store-prenumeration, 49 kr/mån eller 499 kr/år | visas inte än (kräver Google Play Billing) |
| PT Boost | Stripe, 199 kr / 7 dagar | App Store-engångsköp, 199 kr / 7 dagar | visas inte än |

**Produkterna i App Store Connect och RevenueCat:**
- `coavira_plus_monthly` och `coavira_plus_yearly`: prenumerationsgruppen "Coavira Plus", entitlement `plus` och offering `default`.
- `coavira_pt_boost_7d`: icke-förnyande prenumeration.

**Flödet:**
1. Appen loggar in i RevenueCat med Supabase-id:t och köper hos Apple. Köpvyn i iPhone-appen innehåller det Apple kräver:
   - pris från App Store
   - att prenumerationen förnyas automatiskt och hur man säger upp
   - länkar till villkor (EULA) och integritetspolicy
   - *Återställ köp* och *Hantera prenumeration*
2. Direkt efter köpet anropar appen `POST /api/revenuecat/sync`.
3. RevenueCats webhook `POST /api/revenuecat/webhook` hanterar förnyelser, uppsägningar, byten och återbetalningar. Den skyddas av `REVENUECAT_WEBHOOK_SECRET` i Authorization-headern. Sandbox-köp från TestFlight och Apples granskning räknas också.
4. Båda routes hämtar kundens köp från RevenueCat med `REVENUECAT_SECRET_KEY`, som bara finns på servern, och skriver resultatet med service role:
   - **Plus från butiken** sparas för sig (`store_plus_until`) och skriver aldrig över Plus från inbjudningar eller webbköp.
   - **Boost** räknas en gång per butikstransaktion (`store_transactions`).

**Miljövariabler i Vercel** (bygg om efteråt):
- `NEXT_PUBLIC_REVENUECAT_IOS_KEY` (`appl_…`, publik)
- `REVENUECAT_SECRET_KEY` (`sk_…`)
- `REVENUECAT_WEBHOOK_SECRET`

**TestFlight utan Mac:** *Actions → "iOS → TestFlight" → Run workflow*.
- Arbetsflödet arkiverar, signerar automatiskt med App Store Connect-nyckeln och laddar upp.
- Hemligheter i GitHub: `ASC_KEY_ID`, `ASC_ISSUER_ID` och `ASC_KEY_P8`.
- Team ID är `4MK2V6C8XZ`.
- Byggnumret är körningens nummer.
- Appen är iPhone-only i version 1.0.

## Nytt i v22: Stripe Connect och obligatorisk PT-onboarding

**Onboardingen (`/pt/onboarding`).** En PT kommer inte åt resten av PT-portalen förrän båda stegen är klara:
1. **Profil:** namn, profilbild, minst en inriktning och en presentation på minst 40 tecken.
2. **Utbetalningar:** *Koppla bankkonto för utbetalningar* skapar ett Stripe Connect-konto (Express, Sverige) och skickar PT:n till Stripes onboarding. Stripe skickar tillbaka till `/pt/onboarding/callback`, som hämtar kontots status från Stripe. Godkänt (`details_submitted` och `charges_enabled`) → portalen öppnas med ett välkomstmeddelande.

**Spärren:**
- `proxy.ts` omdirigerar en PT till `/pt/onboarding` så länge `app_metadata.pt_ready` inte är `true`.
- Databasen håller värdet aktuellt (`sync_pt_ready`, triggrar på profilen och utbetalningarna), så proxyn behöver inget extra databasanrop.
- Callbacken förnyar sessionen, så att den nya JWT:n släpper in PT:n direkt.
- PT Boost kräver en publicerad profil och kan därför inte köpas före onboardingen.

**Betalningen delas automatiskt** (destination charge):

| Del | Mottagare |
|---|---|
| Tjänsternas pris | PT:ns Stripe-konto (`transfer_data.destination`) |
| Serviceavgiften, 5 % eller 10 % | Coavira (`application_fee_amount`) |
| Stripes avgifter | Coavira (kontot har `controller.fees.payer = application`) |

**Synlighet:**
- En profil kan bara publiceras med godkända utbetalningar.
- Tjänster går bara att köpa när PT:ns konto tar emot kort.
- Stänger Stripe av kortbetalningar (`account.updated`) döljs profilen och visas igen när det är rättat. Portalen låses inte.

**Återbetalningar** görs i Stripe-panelen. Välj **Reverse transfer** (och vid behov *Refund application fee*), så att pengarna tas tillbaka från PT:ns konto.

**Demokonton** (t.ex. Apples granskning) som inte kan koppla ett riktigt bankkonto: `select admin_mark_pt_onboarded('review-pt@coavira.fit');`. `supabase/admin/app-review-demo-accounts.sql` gör det redan. Köp hos ett sådant konto går till Coavira utan delning.

## Nytt i v70: laddningsskärm där Coavira-loggan snurrar

- **Ingen vit skärm när appen startar.** Medan appens data hämtas visas en mörk laddningsskärm (`src/components/boot-splash.tsx`) där själva C:et i loggan snurrar. Den ersätter det gamla skelettet (`app-skeleton.tsx` är borttagen).
  - Skärmen finns redan i serverns HTML. Innan JavaScript har laddats snurrar loggan med en CSS-animation (ett varv på 1,1 s).
  - När React startar tar `requestAnimationFrame` över från samma vinkel och i samma fart, utan hopp.
  - När datan är redo bromsar loggan in mjukt (en Hermite-kurva från snurrens fart till stilla) och landar rakt på nästa hela varv.
  - Sedan tonas skärmen bort, så att appen fadear in. Appen under är redan renderad, och tryck släpps igenom så fort datan är redo.
  - Skärmen visas en gång per appstart, inte vid byte av flik. Den gäller både klient- och PT-appen.
  - Med "minska rörelse" står loggan still och skärmen försvinner direkt.
- **Sömlöst från native-startbilden:** loggan har samma färg (#aced37), storlek (11,2 % av skärmens längsta sida) och plats som i startbilden, på samma mörka bakgrund (#0b0f0d).
- **Native (kräver nytt appbygge):**
  - `capacitor.config.ts`: WebView-bakgrunden är #0b0f0d i stället för vit.
  - Startbilden är mörk även i ljust läge: iOS `Splash.imageset`, Android `drawable*/splash.png` och bakgrunden i `LaunchScreen.storyboard`. Tidigare var den helt lime i ljust läge.
  - Kör `npx cap sync` och bygg om appen i Xcode och Android Studio.
- **Test:** `e2e/v70-laddningsskarm.test.mjs`. Det fördröjer JavaScript och kontrollerar:
  - att loggan snurrar före JS, bara framåt och utan hopp,
  - att den landar rakt och att skärmen försvinner,
  - att storleken matchar native-startbilden.

Inga databasändringar och inga migrationer.

## Nytt i v69: bottenmenyn glider undan för tangentbordet

- **Menyn lägger sig inte längre ovanpå tangentbordet.** När ett textfält får fokus på en pekskärm glider bottenmenyn undan (nedåt och tonas ut, 200 ms). Den kommer tillbaka när fältet lämnas. Det gäller både klientappen och PT-appen.
  - `useKeyboardOpen` (`src/lib/use-keyboard-open.ts`) avgör detta med `useSyncExternalStore`, `focusin`/`focusout` och `pointer: coarse`.
  - Knappar, kryssrutor och filfält räknas inte som textfält. Mellan två fält blinkar menyn inte fram.
  - Medan menyn är undanglidd är den `inert`, så den går inte att trycka på eller nå med tangentbord och skärmläsare.
  - På en dator med mus finns inget skärmtangentbord, så där står menyn kvar.
- **Test:** `e2e/v69-meny-tangentbord.test.mjs`.

Inga databasändringar och inga migrationer.

## Nytt i v68: träningsloggen lika mjuk, lägre vattenmål och sökfältet ovanför tangentbordet

- **Övningarna fälls ut och ihop mjukt** (`CollapsePanel` i `src/components/motion.tsx`).
  - När ett kort stängs försvinner fälten ur sidan direkt. En stum kopia (inert, aria-hidden, utan id:n och etiketter) krymper i dess ställe, så inget hoppar och inga fält dubbleras.
  - Nästa övning växer fram. Rullningen till den sker när korten har satt sig.
- **Fjädern från vattenglaset överallt i loggen** (`useBounce` i `src/lib/spring.ts`):
  - Passets progress i sidhuvudet glider för varje avbockat set (`FillBar`, `data-testid="workout-progress"`).
  - Raden studsar till när ett set bockas av, och kortet när övningen blir klar.
  - Siffran i − och + gör en liten studs.
- **Set:** ett tillagt set glider in. "Ta bort set" fäller först ihop raden och tar sedan bort setet.
- **Vilotimern** glider in och har en tunn stapel som töms i jämn takt.
- **Vattenmålet** är nu 30 ml per kg kroppsvikt, avrundat till hela glas och begränsat till 1,5–3 l (2 l utan vikt). Förut var det 35 ml per kg, upp till 4,5 l. En del av vätskan kommer från maten.
- **Kost: tangentbordet täcker inte längre träffarna.** När sökfältet får fokus (via + på en måltidsbricka eller ett tryck i fältet) läggs fältet strax under sidhuvudet. Det görs igen när tangentbordet har öppnats (`visualViewport`), så att träffarna syns ovanför det.
- **Med "minska rörelse"** sker allt direkt.
- **Tester:**
  - Nytt test: `e2e/v68-traning-smooth.test.mjs`.
  - v34 väntar in att setet tas bort efter infällningen.

Inga databasändringar och inga migrationer.

## Nytt i v67: kostloggen lika mjuk som vattenglaset

- **En gemensam fjäder** (`src/lib/spring.ts`, `useSpring`/`createSpring`) med samma inställningar som vattenglaset: damping 20, stiffness 140, mass 0.8.
  - Den skriver direkt i DOM:en med `requestAnimationFrame`, så det blir ingen React-rendering per bildruta.
  - Den går att avbryta mitt i en rörelse, stannar när den står still och hoppar direkt till målet med "minska rörelse".
- **Staplarna:**
  - `FillBar` (kcal-mätaren och makromålen) glider nu med fjädern i stället för en CSS-övergång.
  - Måltidsbrickornas makrostaplar glider på samma sätt.
- **Måltidsbrickorna:**
  - Brickan studsar till lite när något loggas till den och lägger sig sedan.
  - Gram för protein, kolhydrater och fett räknar mjukt.
  - Höjden är fortfarande fast.
- **Logga mat:**
  - Markeringen i måltidsväljaren glider till vald måltid i stället för att hoppa.
  - Ett snabbval bekräftas med en bock i knappen.
  - Portionsformuläret glider in, och dess kcal räknar mjukt när mängden ändras.
  - Sökträffarna tonar in.
- **Ta bort:** raden fälls ihop mjukt så att resten glider upp. Toasten har nu **Ångra**, som lägger tillbaka posten.
- **Buggfixar:**
  - En vara från sökningen gav två toaster. Nu blir det en, med Ångra.
  - Vid byte av dag lyste alla poster till som "nya". Nu nollställs loggaren per dag.
- **Tester:**
  - Nytt test: `e2e/v67-kost-smooth.test.mjs`.
  - v46 kontrollerar nu att kcal-stapeln drivs av transform från fjädern.

Inga databasändringar och inga migrationer.

## Nytt i v66: vattenglaset från reklamfilmen

- **Ett interaktivt glas** (`src/components/client/water-glass.tsx`) ersätter raden med små glas på Idag. Det fylls när man trycker på `+ 250 ml` eller `+ 500 ml` och töms med `−`.
- **Samma fysik som i reklamfilmen:**
  - Nivån följer en fjäder (damping 20, stiffness 140, mass 0.8). Ytan skvalpar till vid varje tryck, mer ju större ändringen är, och lägger sig.
  - Animationen går att avbryta. Trycker man igen mitt i rörelsen fortsätter den från där vattnet är, utan hopp.
  - Den ritas direkt i SVG med `requestAnimationFrame`, utan React-rendering per bildruta, och stannar när glaset står still.
  - Med "minska rörelse" sätts nivån direkt.
- **Layout som i filmen:** glaset till vänster, liter och mål i mitten, knapparna under. Rutans höjd är fast, så inget under den flyttar sig när man loggar.
- **Tester:** v46, v52 och v56 mäter nu vattenytan i glaset (stiger mjukt, landar på rätt nivå, direkt med "minska rörelse", ingen förskjutning).

Inga databasändringar och inga migrationer.

## Nytt i v65: communityregler, rapportering och avstängning av konton

- **Communityregler** (`/communityregler`, `src/components/legal/community-content.tsx`) är en ny del av användaravtalet för klienter och PT:er, del 3 i `/avtal` och `/avtal/pt`.
  - De beskriver vad som är förbjudet, till exempel sexuellt innehåll, trakasserier, hat, självskada och ätstörningar, olagligt innehåll, bedrägeri och betalning utanför appen, andras bilder utan samtycke och medicinska löften.
  - De beskriver också hur man rapporterar, vilka åtgärder som finns (borttagning, varning, tillfällig avstängning, avstängning tills vidare eller avslutat konto) och att den som drabbas har rätt till en motivering och kan överklaga inom sex månader, i linje med DSA.
- **Godkänns vid registreringen:** samtycket lyder nu "Jag godkänner användarvillkoren, communityreglerna och behandlingen av mina hälsouppgifter …". Avtalets version höjs till 2026-12 (`legal_version()`, `LEGAL_VERSION`).
  - **Befintliga användare** som godkänt en äldre version får en dialog (`AccountGate`) som inte går att stänga och som de godkänner innan de fortsätter. Först då gäller reglerna för dem.
  - **PT:er:** spärren för publicering kräver godkänt avtal. En PT som inte godkänt den nya versionen kan därför dölja sig från Hitta PT när spärren räknas om, tills PT:n godkänt.
- **Rapportera:** en flagga vid den andra partens meddelanden i chatten öppnar en dialog med åtta kategorier och en valfri beskrivning (`content_reports`).
  - Man kan bara rapportera någon man har en relation med, och bara meddelanden i sin egen chatt.
  - Den rapporterade ser aldrig vem som rapporterade.
  - Högst 20 rapporter per dygn och användare.
- **Avstängning:**
  - Administratörer varnar, stänger av (7 dagar, 30 dagar eller tills vidare) och häver avstängningar på `/admin/moderering`.
  - Varje åtgärd kräver ett skäl, loggas i `account_actions` och syns för användaren. En banner visar skälet, slutdatumet och hur man överklagar.
  - Under en avstängning blockerar databasen meddelanden, uppladdningar, bokningar, kundvagn, köp, recensioner och förfrågningar. En avstängd PT avpubliceras och PT:ns tjänster pausas.
  - Administratörer ser bara det rapporterade meddelandet, aldrig resten av chatten.
- **Videor i chatten finns kvar**, med en gräns på högst 30 bilagor och 10 videor per avsändare och dygn.
- **Tester:**
  - `supabase/tests/rls_v65.test.sql` (33 kontroller, databassviten ger 1 161 godkända)
  - `e2e/v65-communityregler.test.mjs` (demo)
  - `e2e/v65-supabase.test.mjs` (dialogen mot mocken)

**Migration att köra i Supabase:** `supabase/migrations/20261201000000_v65_community_rules_suspension.sql`.

## Nytt i v64: säkerhetshärdning efter penetrationstest

Penetrationstestet gjordes bara mot källkoden och en lokal kopia av databasen (alla 48 migrationer, `npm run test:db`), aldrig mot produktionen. Det omfattade:
- 996 automatiska försök att läsa, ändra och radera andras rader i alla 59 tabeller, som ny klient, som PT utan koppling och som anonym besökare
- riktade försök att eskalera egna rader, kapa relationer och förfalska recensioner
- granskning av 106 funktioner med förhöjda rättigheter, alla API-routes och webhooks samt lagringsreglerna

Resultat: RLS, triggervakterna och webhooks höll. Tre hål lagades:

1. **Medel – bildfiltret i chatten gick att kringgå.**
   - Så gick det till: en part i chatten kunde ladda upp en bild direkt till Storage med en annan filändelse och sedan skicka den som en bildbilaga, som visades ogranskad.
   - Lagning: en ny trigger (`guard_message_attachments`) kräver att varje bildbilaga är en fil i samma chatt som servern laddat upp efter granskningen.
2. **Låg till medel – `exercise-videos` tog emot uppladdningar** från alla inloggade, även klienter, upp till 200 MB per fil, trots att funktionen togs bort i v61. Uppladdning är nu stängd. Läsning och radering finns kvar.
3. **Låg – wearables-routerna litade på `user_metadata.role`**, som användaren kan ändra själv. De använder nu `roleFromClaims`, som läser rollen från `app_metadata`.

Tester: `supabase/tests/rls_v64.test.sql` (9 kontroller, sviten ger 1 128 godkända).

**Migration att köra i Supabase:** `supabase/migrations/20261130000000_v64_chat_media_guard.sql`.

## Nytt i v63: automatisk viktökning och direkt viktinmatning (hotfix)

- **+1,25 kg automatiskt:**
  - Har en viktövning historik förinställs vikten i nästa pass till förra passets toppset plus 1,25 kg. Reps blir desamma som förra gången, inom repintervallet. Det gäller i `src/lib/progression.ts` (`AUTO_INCREMENT_KG`).
  - Ingen 1RM, inga formler. Den tidigare dubbla progressionen (steg per utrustning, "ett rep till" och avlastning) är ersatt.
  - Kroppsviktsövningar ökar fortfarande reps. Tid, distans och AMRAP upprepar förra passet.
- **Synligt i passet:**
  - Den förinställda vikten visas i limegrönt (#84cc16).
  - Under "Mål idag" står "+1,25 kg från förra passet".
  - Skärmläsare får samma förklaring.
- **Tryck direkt på vikten:**
  - Siffran mellan `−` och `+` är ett eget fält (`type="text"`, `inputMode="decimal"`, `pattern="[0-9.,]*"`).
  - Ett tryck markerar hela värdet, även i iOS WKWebView, så att man skriver ny vikt direkt.
  - `−` och `+` (2,5 kg) finns kvar.
- **Punkt och komma:**
  - 62.5 och 62,5 betyder samma sak (`src/lib/decimal-input.ts`).
  - Bara ett decimaltecken och högst två decimaler.
  - En egen vikt avrundas inte längre till 0,25 kg.
- **Tomt är tomt:** raderar man vikten blir fältet blankt, aldrig 0 eller 1. Setet kan inte bockas av förrän en vikt fyllts i.
- **Inga skärmhopp:**
  - Fältet har fast storlek.
  - Långa värden som 86,25 krymper till 16 px så att de får plats på 360 px breda telefoner. Mindre än 16 px blir det aldrig, eftersom iOS då zoomar in.
- **Tester:**
  - `e2e/progression.unit.ts` och `e2e/decimal-input.unit.ts`
  - `e2e/v63-vikt.test.mjs` (21 kontroller, mobil i mörkt läge)

Inga databasändringar och inga migrationer.

## Nytt i v62: guide-atleten har rätt stance, lyft och hållning

Alla 93 rörelser är granskade bildruta för bildruta. Motorn (`src/lib/exercise-guides/figure.ts`) löser nu fysiken i varje bildruta, så att även mellanlägena blir rätt:

- **Stance:** foten har en egen fotled. Den står plant i stående styrka och hälen lyfts bara i tåhävningar (tårna står still). I utfall och split squat står bakre foten kvar i golvet eller på bänken (`plant`, invers kinematik).
- **Stångbana och balans:** i knäböj, frontböj, goblet squat, good morning, press, push press, thruster och wall ball lutar bålen så att tyngdpunkten (kropp + redskap) står över mittfoten (`track: "bar"`). I marklyft och RDL hänger armarna och stången går över mittfoten, tätt mot benen (`track: "hang"`). Övriga stående övningar använder ankelstrategin (högst 12° lutning), till exempel i curl, frontlyft och kettlebellsving.
- **Hållning:** marklyftets start har skivorna i golvet, höften över knäna och ryggen i 58°. RDL och good morning skjuter höften bakåt. Frivändning, ryck och upright row drar stången nära kroppen med en arm-IK (armbågen bakom stången, aldrig översträckt). Armarna har realistisk längd.
- **Golvkontakt:** i armhävning, planka, mountain climbers och ab wheel ligger händer (armbågar, hjul) och tår (knän) i golvet samtidigt. Burpees, hopp och löpning går aldrig igenom golvet. I glute bridge ligger skulderbladen kvar i golvet.
- **Redskapen ritas tydligare:**
  - skivstången som viktskiva med hylsa och en skiva bakom (djup)
  - hantlar som skivpar
  - kettlebell med handtag
  - D-handtag på kabel
  - maghjul
  - räcke med bom och stolpe i pull-ups och hängande benlyft
  - dipstation, låg stång (inverterad rodd) och släde med stolpar, alla där händerna greppar
  - bänkar med ben, även under bakre foten i bulgarisk split squat och under händerna i bänkdips
- **Tester:** `e2e/exercise-guides.unit.ts` kontrollerar balans i alla fristående rörelser, stångbana, marklyftets startläge, knäböjsdjup, plana fötter, planterade fötter, golvkontakt och att varje redskap ritas. Hjälpfunktionerna finns i `src/lib/exercise-guides/biomech.ts`.

Inga databasändringar och inga migrationer.

## Nytt i v61: videoguiden är bara animation – inga API-nycklar

- Videoguiden visar **alltid** samma guide-atlet, animerad efter varje övnings rörelse och nu med **övningens eget redskap**. Exempel: hantlar i hantelpress och rumänsk marklyft med hantlar, kabelhandtag i kabelcurl, kabelsidolyft och kabelflyes, kettlebell i goblet squat och suitcase carry, inget redskap i Hip Thrust i maskin. Det styrs av `hand` i `src/lib/exercise-guides/guides.ts`.
- **AI-videodelen är borttagen:** `scripts/generate-ai-exercise-videos.ts`, videospelaren i guiden och mappningen av `exercises.video_url`. Ingen fal.ai-nyckel, ingen referensbild och inga betalda anrop behövs. Allt ritas i appen.
- **Ingen ny migration.** v60:s migration kan ligga kvar: bucketen `exercise-guides` används inte, men regeln `exercises_video_guide_only` stoppar fortfarande YouTube- och Vimeo-länkar i databasen.
- **Tester:** `e2e/exercise-guides.unit.ts` kontrollerar också att guiden inte har någon video, inga nätverksanrop och redskap per övning. `e2e/v60-videoguide.test.mjs` kontrollerar att inga video- eller AI-anrop görs.

## Nytt i v60: Videoguide / Utförande direkt under varje övning

**Inline, ingen popup** (`src/components/exercises/exercise-guide.tsx`):
- Raden **Videoguide / Utförande** ligger direkt under övningen i passet (`workout-logger.tsx`) och i den delade passbyggaren (`split-builder.tsx`, både klient och PT).
- Ett tryck fäller ut guiden mjukt rakt under övningen, så att set, reps och vikter syns samtidigt.
- Video eller animation laddas först när guiden fälls ut, och pausas och släpps när den stängs (lazy load).
- Bildytan har fast format (16:10), så inget hoppar när videon laddats.

**En och samma AI-modell** – tvåstegssystemet:
1. **AI-video:**
   - Bucketen `exercise-guides` (publik läsning, bara servern laddar upp).
   - Batch-scriptet `scripts/generate-ai-exercise-videos.ts` använder fal.ai bild-till-video med en **låst referensbild** (`GUIDE_REFERENCE_IMAGE_URL`), en låst karaktärsprompt och ett låst seed.
   - Det sparar MP4-loopar som `exercise-guides/<id>.mp4` och sätter `exercises.video_url`. Appen spelar dem `autoPlay loop muted playsInline`.
   - Scriptet kör torrt som standard och genererar bara med `--yes` (det kostar per video). Det finns ingen automatisk kö.
   - Det testas mot en lokal mock i `e2e/ai-videos.unit.ts`.
2. **Inbyggd animation med samma modell:**
   - `src/lib/exercise-guides/figure.ts`, `motions.ts` och `src/components/exercises/guide-figure.tsx` ger en atletisk silhuett i mörk studio (#131916) med limegröna detaljer (pannband, skor, viktskivor).
   - Det finns 93 rörelser med poser. Motorn håller fötterna (eller händerna) i marken och skalar hela rörelsen in i bild.
   - Animationen använder genererade CSS-keyframes med bara `transform`, alltså GPU-vänligt utan omräkning av layouten. Med Minska rörelse står atleten still.
   - Den visas för alla övningar som ännu inte har AI-video, och om videon inte går att ladda.

**100 % av övningsbanken:**
- Alla **135** förinlagda övningar (JSON-banken och databasens seed) pekar på en rörelse och tre utförandesteg (`src/lib/exercise-guides/guides.ts`).
- Stegen är **Utgångsläge**, **Rörelse** och **Kontroll / andning**, på sv/en/es/fr/de (`guide.steps.*`, 97 rörelsemönster, genererade av `scripts/guide-steps.py`).
- **Egna övningar** har ingen guide.
- Verifieras i `e2e/exercise-guides.unit.ts`:
  - täckning 100 %;
  - steg på alla språk;
  - alla rörelser ryms i bild;
  - bara `exercise-guides`-URL:er godtas;
  - inga YouTube/Vimeo-embeds;
  - ingen 1RM.

**Inga YouTube- eller Vimeo-klipp längre:**
- Fältet för videolänk eller uppladdning i passbyggaren, YouTube/Vimeo-spelaren (`video-embed.tsx`, `lib/video.ts`) och "Visa instruktionsvideo" i passet är borttagna.

**Migration** `supabase/migrations/20261129000000_v60_exercise_guides.sql`:
- Bucketen `exercise-guides`: publik läsning, MP4/WebM upp till 25 MB, och ingen skrivrätt för inloggade.
- Kontrollen `exercises_video_guide_only`, som bara tillåter `https://…/storage/v1/object/public/exercise-guides/<id>.mp4|webm`. Äldre länkar nollställs.
- Testas i `supabase/tests/rls_v60.test.sql`. Klient och PT kan inte ladda upp eller byta bankens videor.

**Kör AI-videorna** (på din dator, med nycklar som aldrig läggs i `NEXT_PUBLIC_`):
```
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… FAL_KEY=… GUIDE_REFERENCE_IMAGE_URL=… \
  npx tsx --tsconfig tsconfig.json scripts/generate-ai-exercise-videos.ts --yes --limit 5
```

## Nytt i v59: samma passbyggare för klient och PT

**En komponent:** `src/components/workouts/split-builder.tsx` (`<SplitBuilder mode="client" | "trainer">`).
- Den renderas på klientens "Upplägg / Tips" (`/klient/schema`) och på PT:ns Passbyggare (`/pt/pass`, `src/components/pt/pt-workout-builder.tsx`).
- Den gamla PT-byggaren (`src/components/pt/workout-builder.tsx`) är borttagen. Ändringar i byggaren slår nu igenom på båda sidor samtidigt.
- Ett e2e-test jämför byggarens struktur för rollerna och kräver att den är identisk.

**I byggaren, för båda rollerna:**
- Filtret Alla/Styrka/Löpning/Hyrox, färdiga upplägg, **Mina mallar** (öppnas och uppdateras på plats) och eget upplägg.
- Dagar och vilodagar som dras fritt.
- Övningar med adaptiva fält per `tracking_type`: Set × Reps × Vikt (kg), eller Intervaller × Distans × Tempo × Vila, eller Varv × Distans (m) × Reps/kal.
- Block/varv.
- Övningslistan grupperad efter muskelgrupp plus Löpning och Hyrox, och **Skapa egen övning** direkt i dagen.
- Antal dagar per vecka, utan datumfält.
- Blanka fält vid radering, aldrig 1. Ingen 1RM någonstans.
- Allt som fanns i PT:ns gamla byggare ligger kvar bakom **Mer** per övning: del av passet (uppvärmning/huvudpass/nedvarvning), vila, RPE, olika reps per set, instruktioner och video.
- Texterna finns på sv/en/es/fr/de (`builder.*`).

**Det enda som skiljer (längst ned i byggaren):**
- **Klient:** Använd upplägget (aktivt schema, Nästa pass).
- **PT:** **Tilldela till klient** (en eller flera aktiva klienter, så att klientens aktiva schema ersätts) eller **Spara som PT-mall**. Panelen har fast höjd i båda lägena.
- Klienten ser "Från <PT>" på ett tilldelat upplägg. Väljer klienten ett eget upplägg blir det klientens eget.
- Att lägga ut en mall på bestämda datum (betalda pass) görs som förut från klientsidan för PT:n (`/pt/klienter/[id]`).

**Migration** `supabase/migrations/20261128000000_v59_pt_assign_split.sql` (kräver v43 och v58, körs i en transaktion):
- `client_splits.assigned_by`.
- Policyerna "splits: trainer assign" och "splits: trainer update", som bara gäller **aktiva** klienter (`is_active_coach_of`; pausade och andra PT:ers klienter nekas).
- En trigger: en PT måste stå som avsändare, klienten kan inte märka upplägget som en annan PT:s, och dagarnas övningsfält valideras som passen (v58).
- Mallar (`workout_templates`) och egna övningar (`custom_exercises`) använder befintliga policyer. Det verifieras i `supabase/tests/rls_v59.test.sql`.

**Kalendern:** drag-and-drop väljer nu dagen under fingret/pekaren (`pointerWithin`). Tidigare kunde ett brett kort täcka flera dagknappar så att fel dag (eller ingen) valdes beroende på veckodag.

Tester: `e2e/v59-delad-passbyggare.test.mjs` (42 kontroller) och `rls_v59.test.sql` (18). De äldre passbyggartesterna (v2, v3, v14, v19, v24, v29, v32, v58, demo-mode) är uppdaterade till den gemensamma byggaren och kontrollerar samma funktioner som förut.

## Nytt i v58: intressebaserad träning (Styrka, Löpning, Hyrox, Hybrid) och fem språk

**Migration:** `supabase/migrations/20261127000000_v58_i18n_training_modes.sql`. Den körs i en transaktion och testas i `supabase/tests/rls_v58.test.sql`. Den lägger till:
- `profiles.preferred_language` (`sv`/`en`/`es`/`fr`/`de`, `null` = enhetens språk) och `profiles.training_interests` (`strength`/`running`/`hyrox`/`hybrid`/`health`, högst fem). Kolumnbehörighet ges till `authenticated`, och raderna styrs av den befintliga RLS-policyn "profiles: update self".
- `exercises.modality` (`strength`/`running`/`hyrox`/`conditioning`) och `exercises.tracking_type` (`strength`/`running`/`conditioning`). Hyrox-stationerna får internationella namn, och nya löpövningar läggs till: Tempo, Långpass zon 2, Backintervaller och Hyrox 1 km.
- En check på passens och mallarnas övningar (jsonb): `trackingType`, `distanceM`, `paceSecPerKm`, `durationSec` och `blockId` valideras.
- `set_logs.distance_m`, `duration_sec` och `calories` med rimliga gränser. RLS på `set_logs` gäller som förut.
- Appen fungerar även innan migrationen är körd. Då gäller enhetens språk, styrkeloggar sparas som vanligt och språkvalet sparas bara i webbläsaren.

**Språk (i18n)** (`src/lib/i18n/*`):
- Ett lätt lager över React-kontext, utan omladdning eller sidhopp. Valet sparas i webbläsaren (localStorage + cookie), i profilen och i `<html lang>`.
- Ordböcker för `sv`, `en`, `es`, `fr` och `de`. Svenska är källan, och de andra språken typkontrolleras mot den, så en saknad nyckel ger ett kompileringsfel.
- Gymlingo per land, till exempel Set/Reps/Vikt, Series/Repes/Peso, Séries/Reps/Charge/Allure/Fractionné och Sätze/Wdh./Gewicht/Grundlagenausdauer.
- Hyrox-stationerna heter samma sak på alla språk och har en lokal hjälptext per station.
- Översatt hittills: bottenmenyn, registreringens språkval, intro-flödets första steg, Appinställningar, "Upplägg / Tips" (texter, tips, nivåer, uppläggens namn och dagar) samt passbyggarens och passloggerns fält för löpning, kondition och block. Resten av appen är fortfarande på svenska och kan översättas skärm för skärm med `useT()`.
- **Förval:** riktiga konton följer enhetens språk (`navigator.languages`; nordiska språk ger svenska, övriga okända engelska). Demoläget startar på svenska eftersom demodatan är svensk.

**Registrering och intro:**
- Språkchips överst på registreringssidan.
- Intro-flödets första steg har språkchips (byter hela vyn direkt) och intresse-pills: Styrka & hypertrofi, Löpning, Hyrox, Hybridträning och Allmän hälsa. Allt sparas optimistiskt i profilen.

**Appinställningar** (Profil → Inställningar → Appinställningar, `/klient/installningar/app` och `/pt/installningar/app`):
- Språklista och intresse-pills med fasta höjder. Ändringar slår igenom direkt i hela appen.

**Intressestyrd passbyggare och "Upplägg / Tips":**
- En pill-rad Alla · Styrka · Löpning · Hyrox, förvald efter intressena. Upplägg som passar intressena märks *För dig* och visas först, med tre tips per kategori.
- Nya färdiga upplägg: **Hyrox Race Prep** (race-simulering i block: 4 varv 1000 m + Sled Push och 4 varv 1000 m + Wall Balls), **5 km** och **10 km Löpning** samt **Hybrid Styrka + Kondition**.
- PT:ns passbyggare har samma filter i övningsbanken. Övningsväljaren har egna grupper för Löpning och Hyrox, och de fälls ut när intressena pekar dit.

**Adaptiva fält** (`src/components/workouts/adaptive-fields.tsx`):
- Bara de fält som hör till övningen visas:
  - **Styrka:** Set × Reps × Vikt.
  - **Löpning:** Intervaller × Distans (km) × Tempo (min/km) × Vila.
  - **Kondition/Hyrox:** Varv × Distans (m) × Reps/kal.
- Standardmålen följer med när en övning läggs till, till exempel SkiErg 1000 m, Sled Push 50 m, Burpee Broad Jumps 80 m och Wall Balls 100.
- Ett tömt fält blir blankt (`""`) och faller aldrig tillbaka på 1. Valideringen sker först när passet sparas.
- Passloggern loggar distans och tid per intervall eller varv och räknar fram tempot på en fast plats, så raden inte hoppar. Löpning och kondition kräver aldrig vikt.

**Block/varv:**
- I passbyggaren kopplas en övning till den ovanför. Blocket visas som "Block A · 4 varv", varven gäller hela blocket och ordningen ändras med drag-and-drop.
- I passloggern visas blockrubriken och en markering på blockets övningar.

Tester: `e2e/training-modes.unit.ts` (53 kontroller: övningar, tider, block, filter och gymlingo på alla språk), `e2e/splits.unit.ts`, `supabase/tests/rls_v58.test.sql` och `e2e/v58-i18n-traning.test.mjs`.

## Nytt i v57: berikningen hittar enskild firma och befattningar via allabolag

När du klickar **Sök i register** på en lead gör motorn så här:
- **Tvättar namnet** (`cleanPersonName`). Instagram-namn som "Anna 🏋️ Andersson | PT Stockholm" och användarnamn som `anna.andersson.pt` blir "Anna Andersson". Utan för- och efternamn görs ingen sökning, eftersom det ger namnes. Motorn ber då om personens namn.
- **Söker först mot allabolag:** `site:allabolag.se "Förnamn Efternamn"` via sök-API:t. Bara om det inte ger något säkert görs en bredare sökning. Det blir högst två sökningar per klick, och aldrig automatiskt.
- **Läser utdragen:**
  - **Enskild näringsidkare/firma** blir enskild firma, låst till referensgrupp eller DM.
  - **Befattning (VD, styrelseledamot, innehavare, delägare …) i ett AB** räknas bara när bolaget håller på med träning, hälsa, coaching, kost eller personlig utveckling. Det avgörs på namn, verksamhet eller SNI-kod (93.1x, 85.51, 96.04, 96.09, 86.90). Org.nr i utdraget bekräftas hos Bolagsverket.
  - **Befattning i ett annat bolag,** till exempel ett byggbolag, räknas inte. Den visas som bevis med förklaringen "ingen koppling till träning".
- **Privat e-post låser B2B.** Ett AB med en privat adress (gmail, hotmail …) blir *AB men låst* och hamnar i Granska med texten "lägg in bolagets adress". Mottagaren är fortfarande en privatperson enligt marknadsföringslagen 19 §. När bolagets adress läggs in och du söker igen låses B2B upp.
- **Begränsning:** PT:er med bara F-skatt, som inte är registrerade i handelsregistret, finns inte i allabolag. De förblir *Okänd* och är därmed låsta, och motorn förklarar varför.
- **Ingen skrapning:** allabolags sidor hämtas inte, bara sök-API:ts utdrag används.

Tester: `e2e/enrichment.unit.ts` (namn, befattningar, bransch, privat adress) och `e2e/v54-berikning.test.mjs` (Moa, Ellen, Rolf). Ingen migration behövs.

## Nytt i v56: flytta pass, måltidsbrickor, receptbanken i Coavira+, stabil layout

**Flytta pass** (`src/lib/workout-move.ts`, `src/components/workouts/move-workout.tsx`):
- **Flytta**-knappen sitter på passkorten på startsidan och i kalendern. Den öppnar en kompakt dagväljare underifrån med idag och 13 dagar framåt.
- Ett tryck på en ledig dag flyttar passet direkt. Har dagen redan ett eget pass erbjuds **Byt plats med [pass]** eller **Lägg båda samma dag**.
- **Drag-and-drop** i kalenderns veckovy: dra i handtaget till en dag i veckoraden. Dagen lyser upp medan man drar över den, och kortet följer med via transform. På mobilen aktiveras draget med en kort långtryckning.
- Allt sparas optimistiskt, och toasten har **Ångra**.
- Bara klientens egna planerade pass kan flyttas (`trainer_id` null). PT:ns pass, bokade tider och påbörjade eller genomförda pass visar ingen knapp; databastriggern från v32 stoppar dem ändå.
- Ny åtgärd `setWorkoutDate` i reducern och i Supabase-källan.

**Måltidsbrickor** (`src/components/nutrition/meal-tiles.tsx`):
- Frukost, Lunch, Middag och Mellanmål visas alltid, även tomma, som mörka glasbrickor (`glass-tile`) med fast höjd.
- Varje bricka visar kcal och en segmenterad makrostapel: protein i lime, kolhydrater och fett i dämpade toner.
- **+** väljer måltiden och lägger markören i sökfältet.
- När mat läggs till räknar kcal upp och ikonen får en ring. Staplarna skalas med `scaleX`.

**Receptbanken i Coavira+**:
- Utan Plus visas Coaviras recept suddiga med ett lås och en banner med **Lås upp**. Ett tryck öppnar uppgraderingsrutan i stället för receptet.
- Egna recept är alltid öppna, och PT:er låses aldrig.
- `PlusFeature` har fått `recipes`, och uppgraderingstexten nämner receptbanken.
- Spärren ligger i gränssnittet. Receptbanken är statiskt innehåll, inte personlig data.

**Ingen hoppande layout**:
- `SyncIndicator` är nu en flytande pill (`position: fixed`, `pointer-events: none`, bara opacity och transform). Tidigare låg den i flödet och tryckte ner sidan vid varje vattenglas eller bockat set.
- En vanlig synk syns inte alls. Pillen kommer bara vid offline, fel eller om synken tar mer än 1,5 s.
- När en övning blir klar i passloggern skrollas nästa övning mjukt i blick (`prefers-reduced-motion` respekteras), eftersom iOS saknar scroll-anchoring.

Tester: `e2e/workout-move.unit.ts` och `e2e/v56-ux.test.mjs`. Ingen migration behövs.

## Nytt i v55: granskningskö, granskning av varje utskick, inga automatiska betalda sökningar

**Granskningskö** (fliken *Granska (N)*, `src/components/crm/review-queue.tsx`):
- Varje lead granskas för hand innan den kan mejlas. Spärren "Inte granskad" gäller i förhandsgranskningen och i kön.
- Kön visar en lead i taget med kontaktuppgifter, länkar och motorns förslag med ledtrådar.
- Beslut tas med en tangent eller ett klick:
  - **A** AB, **E** Enskild firma, **G** Gym-PT, **I** Influencer, **P** Privatperson, **X** Ej aktuell.
  - **S** eller → hoppar över, **←** går tillbaka.
  - **R** söker i företagsregister. Det kostar en sökning och körs bara på tangenttryck eller klick.
  - **W** och **O** öppnar webbplatsen och Instagram.
- Beslutet sparas som en manuell bolagstyp, och regelverket (rättslig grund och mallar) följer med.

**Granskning av utskick** (överst under *Utskick*, `src/components/crm/email-review.tsx`):
- Varje mejl skapas som **Väntar på granskning**, även automatiska uppföljningar, och skickas inte förrän någon har godkänt det.
- Granskningen visar exakt det som går ut: mottagare, ämne, text och sidfoten som läggs till.
- **Godkänn**, **Redigera** eller **Avvisa**.
  - Redigerade mejl märks, och texten får inte innehålla kvarglömda `{{variabler}}` eller `[platshållare]`.
  - *Godkänn alla* kräver en bekräftelse om att allt är läst.
- Vem som godkände och när sparas på varje utskick (`approved_by`, `approved_at`, `edited_at`).
- Databasen spärrar köade eller skickade utskick utan godkännande, och kön (`crm_claim_due_emails`) plockar bara godkända.
- Ett godkänt mejl kontrolleras ännu en gång precis innan det skickas (avregistrering, spärrlista, svar).

**Inga automatiska körningar som kostar:**
- Sök-API:t används aldrig automatiskt. Det körs bara via *Sök i register* i granskningskön eller lead-panelen.
- Automatiska körningar använder bara gratis källor: leadens uppgifter, webbplatsen och Bolagsverket. Det gäller nya leads, ändringar och *Auto-berika nya*.
- Den schemalagda kön (`/api/crm/queue`) berikar ingenting längre.
- Prospekteringsjobb ("Hitta PT:er", Apify) startas fortfarande bara för hand. Den schemalagda kön fortsätter ett jobb som redan är startat, inom dess kostnadstak.

**Kör migrationen** `supabase/migrations/20261126000000_v55_crm_approval.sql`.
- Den lägger till statusen `pending_approval` och kolumnerna `approved_at`, `approved_by` och `edited_at`.
- Den lägger till spärren och den nya `crm_claim_due_emails`.
- Befintliga utskick räknas som godkända.
- RLS är oförändrad.

Test:
- `node e2e/v55-granskning.test.mjs` (34 kontroller)
- Databas: `supabase/tests/rls_v55.test.sql`

## Nytt i v54: berikningsmotorn – bolagstyp och roll helt automatiskt

När en lead läggs till eller får nya kontaktuppgifter avgör motorn **bolagstyp och roll** och kopplar den direkt till rätt regelverk. Importerade leads berikas i omgångar.

**Bolagstyper** (`crm_leads.company_type`), som badges i tabellen:
- *AB*
- *Enskild firma*
- *Gym-PT*, som visas med kedjans namn, till exempel "SATS PT"
- *Influencer*
- *Privatperson*
- *Okänd*

En grön bock på badgen betyder att uppgiften är bekräftad hos Bolagsverket.

**Källor**, i ordning. En källa hoppas över när svaret redan är säkert. Kod: `src/lib/crm/enrichment/`.
1. **Leadens egna fält:**
   - e-post på en gymkedjas domän (@sats.se …) räknas som kedjans, alltså bolagets, adress,
   - gym, segment, antal följare och ett angivet organisationsnummer.
2. **Egen webbplats:**
   - leadens adress, eller e-postens domän om det inte är en gratistjänst,
   - startsidan och kontakt-/om-sidan läses, med samma hänsyn som förut (robots.txt, paus mellan anrop, inga interna adresser),
   - organisationsnummer, "… AB", "aktiebolag", "enskild firma" och "ingen F-skatt" letas upp.
   - En lead som läggs till från en webbsida läses inte en gång till.
3. **Företagsregistrens utdrag via sök-API:t** (Brave, `BRAVE_SEARCH_API_KEY`):
   - söker på "Förnamn Efternamn" + ort tillsammans med organisationsnummer/enskild firma/aktiebolag,
   - bara registrens egna utdrag i sökresultatet används; inga registersidor hämtas eller skrapas,
   - en träff räknas bara om både för- och efternamn finns med, och samma ort ger högre vikt, så att namnar inte blandas ihop.
4. **Bolagsverket** (öppna API:t "Värdefulla datamängder"):
   - ett hittat organisationsnummer slås upp för att bekräfta att det är ett aktivt aktiebolag. Ett avregistrerat bolag räknas inte,
   - det finns ingen namnsökning, därför används källorna ovan för att hitta numret,
   - kräver `BOLAGSVERKET_CLIENT_ID` och `BOLAGSVERKET_CLIENT_SECRET` (gratis klient på portal.api.bolagsverket.se); utan dem hoppas steget över,
   - **inte verifierat mot Bolagsverket:** deras dokumentation gick inte att nå från utvecklingsmiljön. Anropet `POST /organisationer` med `identitetsbeteckning` bygger på tredjepartsbeskrivningar, och svaret tolkas tolerant. Ett oväntat svar ger "inget besked", aldrig ett påhittat AB.
   - Valfritt: `BOLAGSVERKET_TOKEN_URL`, `BOLAGSVERKET_API_BASE` (testmiljö) och `BOLAGSVERKET_SCOPE`.

**Organisationsnummer:**
- Kontrollsiffran (Luhn) kontrolleras alltid.
- 5… är ett aktiebolag.
- Ett **personnummer** (ÅÅMMDD-NNNN) i rollen som "org.nr" betyder enskild firma. Det används bara som signal och sparas aldrig: inte i fälten, inte i bevisen och inte i loggar. Databasen spärrar det dessutom med en check-constraint.

**Beslut och regelverk** (`decide.ts`):
- Varje källa ger bevis med en vikt 0–100, och minst 70 krävs för att något ska räknas som säkert.
- **Säljande B2B-mejl** tillåts bara för *AB* och för *Gym-PT på kedjans adress*. Grunden blir *Företagsadress* och B2B-mallen väljs.
- **Allt annat låses** till den icke-säljande referensgruppsmallen eller Instagram-DM (grunden *Icke-säljande förfrågan*, marknadsföringslagen 19 §): enskild firma, privatperson, influencer utan AB, gym-PT på privat adress och okänt.
- Osäkra fall får status *Granska* men är låsta under tiden.
- **Samtycke ändras aldrig.**

**Manuellt:**
- En bolagstyp som sätts för hand i lead-panelen ändras aldrig av motorn.
- *Automatisk* lämnar tillbaka beslutet till motorn.

**Gränssnittet:**
- Kolumnen *Bolag & roll* med badges. Medan motorn arbetar sveper ett ljus över badgen.
- Knappen ✦ per rad kör motorn för en lead.
- **"Auto-berika nya (N)"** kör alla väntande i omgångar om tre och visar förloppet.
- I lead-panelen syns slutsatsen, säkerheten i procent och varje bevis med källa och länk, plus vilka källor som hoppades över och varför.
- *Kör igen* visar en laddningsanimation per källa.

**Schemalagt:** `/api/crm/queue` berikar också upp till tre väntande leads per anrop, till exempel från CSV-import eller prospektering.

**Kör migrationen** `supabase/migrations/20261125000000_v54_crm_enrichment.sql`.
- Den lägger till kolumnerna `company_type`, `company_type_manual`, `enrichment_status`, `enrichment`, `enriched_at` och `verified_at`. Kolumnen `org_number` finns sedan v53.
- Den spärrar personnummer i bevisen.
- Befintliga leads får en typ utifrån det som redan är bedömt, och en bolagsform som någon satt räknas som manuell.
- RLS är oförändrad: bara administratörer.

Test:
- `npx tsx --tsconfig tsconfig.json e2e/enrichment.unit.ts` (46 kontroller)
- `node e2e/v54-berikning.test.mjs` (38 kontroller, mockade källor inklusive Bolagsverket)
- Databas: `supabase/tests/rls_v54.test.sql`

## Nytt i v53: CRM:et byggt för konvertering – bolagsform, referensgrupp, uppföljningar och "Att göra"

**Granskningen hittade:**
- Inget skilde aktiebolag från enskilda firmor. Rättslig grund sattes för hand, och mallarna hade platshållaren "[ditt namn]" som stoppade varje utskick.
- Det fanns ingen uppföljning: ett obesvarat mejl blev liggande.
- Instagram-DM och samtal kunde bara loggas som fritext i anteckningar, och ingenting visade vad som borde göras härnäst.
- Statusflödet slutade vid "Svarat"; bokade samtal fanns inte.
- Ingen statistik per mall, och "Konverterade PT:er" sattes bara för hand.

**Bolagsform och svensk compliance** (`src/lib/crm/compliance.ts`):
- Varje lead har en bolagsform: **Aktiebolag (AB)**, **Enskild firma** eller **Inte bedömd**.
- Bolagsformen föreslås automatiskt från webbsidor och Instagram-bior:
  - ett organisationsnummer som börjar på 5 betyder aktiebolag,
  - "… AB" i namnet betyder aktiebolag,
  - texten "enskild firma" betyder enskild firma,
  - en gymkedja är alltid ett bolag.
- En enskild firmas "organisationsnummer" är ägarens personnummer. Det sparas aldrig, och databasen spärrar det.
- Bolagsformen väljer rättslig grund automatiskt:
  - **Enskild firma → *Icke-säljande förfrågan*.** Bara referensgruppsmallen (typ *research*) får gå ut, eller ett Instagram-DM. Ingen automatisk uppföljning.
  - **Aktiebolag → *Företagsadress*.** B2B-mallarna med en diskret uppföljning.
  - **Samtycke** ändras aldrig och tillåter alla mallar.
- En icke-säljande mall kontrolleras innan den skickas: pris, erbjudanden, länkar och uppmaningar att registrera sig spärrar den.
- Allt detta är en försiktig tolkning av marknadsföringslagen 19–21 §§ och GDPR art. 14 och 21. Det är inte juridisk rådgivning.

**Mallar** (`src/lib/crm/templates.ts`):
- Startmallarna läggs in automatiskt per nyckel, även i ett CRM som redan har egna mallar. En startmall som tas bort arkiveras och kommer inte tillbaka.
- Mallarna är:
  - **Referensgrupp för nytt svenskt PT-verktyg**: den fastställda, icke-säljande mallen. Standardval för enskilda firmor.
  - **PT med aktiebolag**,
  - **PT på gymkedja** (SATS, Nordic Wellness m.fl.),
  - **Onlinecoach / PT-influencer**.
- B2B-mallarna har en uppföljning efter fyra dagar.
- `{{avsändare}}` fylls i från `CRM_SENDER_NAME`, annars från namnet i `CRM_FROM_EMAIL` ("Max på Coavira <…>" ger Max). Saknas namnet stoppas utskicket.

**Automatiska uppföljningar:**
- När första mejlet har gått iväg köas uppföljningen N dagar senare (2–14, standard 4), i nästa utskicksfönster.
- Den går genom samma kö med samma takt och dygnstak.
- Den **pausas** om leaden svarar på mejl eller DM, bokar samtal, blir kund, avregistrerar sig, eller om första mejlet studsar. Det kontrolleras både när händelsen loggas och igen precis innan uppföljningen skickas.

**Att göra (Next Best Action)** (`src/lib/crm/next-action.ts`):
- För varje lead föreslås nästa steg, i den här prioritetsordningen:
  1. Förfallna påminnelser.
  2. Svar som väntar på ett bokat samtal.
  3. Samtal att förbereda eller logga.
  4. Registreringslänk efter ett genomfört samtal.
  5. Bolagsform att bedöma.
  6. DM till enskilda firmor.
  7. Första mejlet.
  8. Uppföljning i en annan kanal efter en vecka utan svar.
- Heta leads markeras: hög poäng, nyss svarat, eller öppnat flera gånger om öppningar spåras.
- Listan finns som egen flik och som en kompakt ruta överst i listvyn.

**Snabbloggning** i lead-panelen:
- Ett klick för *DM skickat*, *Svar på DM*, *Svar på mejl*, *Samtal klart*, *Uteblev* och *Blev PT*, plus *Boka samtal* (tid) och *Påminn mig* (tid och text).
- Statusen går bara framåt, och svar eller bokningar pausar alla köade mejl till leaden.
- Panelen har en färdig DM-text i referensgruppsform att kopiera. Instagram tillåter inte automatiska DM, så det skickas för hand.
- Statusflödet har ett nytt steg: **Samtal bokat**.

**Konverteringar:**
- När CRM:et öppnas matchas leads mot registrerade PT-konton (samma e-post) av `crm_sync_conversions()`. Matchade leads blir kunder automatiskt.

**Statistik** (fliken *Statistik*, `src/lib/crm/stats.ts`):
- Tratten: kontaktade, svarat, bokade samtal och registrerade PT:er.
- Per mall: skickade, levererade, studsar, svarsfrekvens, samtal och PT:er.
- Instagram-DM och automatiska uppföljningar visas för sig.
- **Öppningsgrad visas bara om öppningar faktiskt spåras.**
  - Mejlen har inga spårpixlar.
  - Enligt IMY kräver spårning i e-post samtycke, så öppningsspårning i Resend bör vara avstängd.
  - Webhooken räknar ändå `email.opened` om ni slår på den.

**Domänrykte:** samma kö som förut:
- ett mejl i taget, minst 90 s emellan, högst 40 per dygn, vardagar kl. 8–17,
- `List-Unsubscribe` med ett klick, och adresser som studsar eller anmäls spärras.
- Nytt: en studs avbryter också uppföljningen.

**Kör migrationen** `supabase/migrations/20261124000000_v53_crm_conversion.sql`.
- Den lägger till bolagsform, organisationsnummer, kanal, påminnelse, samtal och konvertering på `crm_leads`.
- Den lägger till statussteget `meeting` och den rättsliga grunden `research`.
- Den lägger till malltyp, bolagsform och uppföljning på mallarna, och steg och uppföljning på utskicken.
- Den skapar tabellen `crm_activities` och funktionen `crm_sync_conversions()`.
- RLS: allt kräver `is_admin()`, och anon har ingen åtkomst.

Valfri miljövariabel: `CRM_SENDER_NAME` (avsändarens förnamn i mejlen).

Test:
- `npx tsx --tsconfig tsconfig.json e2e/crm-conversion.unit.ts` (74 kontroller)
- `node e2e/v53-crm-konvertering.test.mjs` (52 kontroller, samma server som v47)
- Databas: `supabase/tests/rls_v53.test.sql`

## Nytt i v52: upplägg med flyttbara vilodagar, Strava borta, bottenmeny för PT, belöningar, historik och klickbara KPI-kort

**Upplägg i stället för splits** (`src/components/workouts/split-builder.tsx`, `next-workout.tsx`, `src/lib/active-split.ts`):
- Klienten ser ordet *Upplägg* överallt: sidan, knapparna och profilen. Biblioteket presenteras som tips att utgå från ("Testa"), inte som låsta scheman.
- **Vilodagar** är egna dagar i upplägget (`rest: true`). Ett färdigt upplägg läggs ut på en vecka med vilodagar emellan, till exempel Push · Vila · Pull · Vila · Legs · Vila · Vila.
- Dagarna flyttas med drag-and-drop i handtaget, eller pil upp/ned på handtaget. Det gäller både när man bygger upplägget och i det aktiva upplägget. Vilodagar kan läggas till och tas bort; ett upplägg är högst sju dagar.
- *Nästa pass* hoppar över vilodagar, och passet som står på tur är detsamma efter en flytt.
- Ingen databasändring behövs: vilodagen ryms i `client_splits.days` (jsonb).

**Strava är borttaget:**
- Koden (`/api/strava/*`, `src/lib/activity/strava.ts`), knapparna, texterna på landningssidan och i integritetstexten, samt testerna är borta. Apple Hälsa (HealthKit) och Health Connect är orörda.
- **Kör migrationen** `supabase/migrations/20261123000000_v52_remove_strava.sql`:
  - Strava-anslutningar och deras tokens raderas.
  - Pass som redan synkats från Strava **behålls** som klientens historik, med källan *Manuellt*.
  - Databasen spärrar Strava som källa och anslutning framåt.
- Efter migrationen kan `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` och `STRAVA_API_BASE` tas bort ur Vercel, och appen kan tas bort i Stravas API-inställningar.

**Bottenmeny i PT-appen** (`src/components/pt/pt-shell.tsx`):
- Fast meny längst ner under 1024 px med fem flikar: Översikt, Kalender, Passbyggare, Kostscheman och Meddelanden. Prickar visar olästa meddelanden och väntande bokningsförfrågningar.
- Menyn tar hänsyn till telefonens hemindikator (safe area), och sidornas innehåll får luft så att inget hamnar bakom den.
- *Min profil*, inställningar och utloggning nås som förut via menyn uppe till vänster. På dator gäller sidomenyn.
- Klientappen hade redan en bottenmeny och är oförändrad.

**Små belöningar** (`src/components/rewards.tsx`):
- En limegrön bricka med ikon, ring och tre gnistor, plus en kort saklig text.
- Visas när vattenmålet nås (en gång per dag), när en måltid bockas av, och när alla dagens måltider är klara (en gång per dag).
- Sammanfattningen efter passet visar utmärkelser för det som faktiskt hände: *Nytt rekord*, *Veckans mål* och *N veckor i rad*.
- Bara transform och opacity; med "minska rörelse" visas brickan stilla.

**Grön bock och historik** (`src/components/workouts/workout-history-dialog.tsx`):
- Avklarade pass har grön bock på översikten och i kalendern. Kalendern visar nu även avklarade egna pass.
- Ett tryck på ett avklarat pass öppnar en modal med varje övning och varje genomfört set (vikt × reps), antal set, volym och kommentarer, plus en länk till hela passet.

**Klickbara KPI-kort på PT-översikten** (`src/components/pt/kpi-dialogs.tsx`):
- *Aktiva klienter* filtrerar klientlistan på aktiva och rullar dit.
- *Loggade pass* öppnar veckans pass: inbokade pass och bokningar de kommande sju dagarna, per dag och klient, samt de pass som loggats de senaste sju.
- *Snittföljsamhet* öppnar en graf över följsamhet per vecka i tolv veckor (med tabellvy) och läget per klient.

Test:
- `npx tsx --tsconfig tsconfig.json e2e/active-split.unit.ts` (vilodagar)
- `npx tsx --tsconfig tsconfig.json e2e/adherence.unit.ts`
- `node e2e/v52-navigering.test.mjs`
- Databas: `supabase/tests/rls_v52.test.sql`

## Nytt i v51: planera i förväg, PT-länkar, nya diagram och sammanfattning efter passet

**Klickbara dagar på Idag** (`src/components/client/day-planner.tsx`):
- Varje dag i veckoremsan är en knapp. Pilarna bläddrar fyra veckor bakåt och framåt, och piltangenterna flyttar en dag i taget.
- Vald dag är limegrön. Idag har en ring. Dagar med pass eller mat har en liten limegrön prick, och en bock när alla pass är klara.
- Väljer man en annan dag än idag glider dagens innehåll in:
  - Pass den dagen.
  - **Planera pass:** en dag ur det aktiva schemat eller en sparad mall läggs på datumet. Turordningen i schemat ändras inte.
  - **Bygg eget pass** med datumet förvalt.
  - Kostgenvägen öppnar Kost på just den dagen (`/klient/kost?datum=`). Kost kan planeras upp till en vecka framåt och loggas en månad bakåt, samma gränser som förut.
- Ett planerat eget pass som inte har påbörjats kan tas bort direkt på dagen.

**PT:ns hemsida och Instagram:**
- Två nya fält under *Min profil → Hemsida och Instagram*.
- Det PT:n skriver normaliseras: `dinsida.se` blir `https://dinsida.se`, och `@namn` eller en profillänk blir `namn`.
- Felaktiga värden visas direkt och sparas aldrig. Det gäller `javascript:`, andra protokoll än http(s), inloggningsuppgifter i adressen och ogiltiga tecken.
- Länkarna visas som badges på den publika profilen, i förhandsvisningen och under *Mina PT:er* hos klienten.
- Länkarna öppnas i en ny flik med `noopener noreferrer nofollow`, och bara http(s) kan visas.
- Kod: `src/lib/trainer-links.ts` och `src/components/trainer-links.tsx`.
- **Kör migrationen** `supabase/migrations/20261122000000_v51_trainer_links.sql`. Den lägger till kolumnerna `trainers.website_url` och `trainers.instagram`, med check-constraints som speglar appens regler. RLS är oförändrad: PT:n kan bara ändra sin egen rad, och anon har ingen åtkomst.

**Diagrammen** (`src/components/charts/progress-charts.tsx`), samma för klient och PT:
- Staplar med rundade toppar mot en rak bas och ett svagt spår bakom varje stapel. Innevarande vecka visas i full färg med värdet ovanför.
- Rena axlar: inga axellinjer, bara ett svagt streckat rutnät.
- Viktkurvan har en mjuk toning under linjen, och linjer och staplar växer fram när grafen syns.
- Siffrorna i PT:ns översikt räknas upp, och följsamhetsstaplarna fylls mjukt.
- *Framsteg* visar som förut bara de två korten och den stora grafen, utan 1RM.

**Sammanfattning efter passet** (`src/lib/workout-summary.ts`, `src/components/client/workout-summary.tsx`):
- Efter *Spara pass* visas set, volym (kg × reps för avbockade set) och nya rekord.
  - Ett rekord är tyngsta avbockade set mot tidigare bästa i samma övning.
  - Det är inga uppskattningar: ingen 1RM.
- Vyn visar också veckans pass mot schemats mål och vilket pass som står på tur.
- Kommentaren väljs med fasta regler i prioritetsordning: under halva passet, nytt rekord, veckans mål nått, tillbaka efter minst tio dagar, minst tre veckor i rad, första passet, och sist tiden på dygnet.
- Ingen AI, inga utropstecken och inga superlativ. Samma pass ger samma text.
- Vyn stannar tills klienten trycker **Klar**. Tidigare gick den vidare automatiskt.

**Säkerhetskontroll** (`supabase/tests/rls_v51.test.sql`), som körs med de övriga databastesterna. Den fångar framtida misstag:
- RLS är påslagen på **varje** tabell i `public`.
- anon saknar behörighet på alla tabeller.
- Alla `security definer`-funktioner har fast `search_path`.
- Ingen skrivpolicy släpper in alla.

**Redan på plats från tidigare versioner (kontrollerat, inte ombyggt):**
- Kost som egen sida med inkorg och låst sidsvep (v40–v42).
- Inställningarna flyttade från passvyn till profilen (v37). Bara snabbknappen *Vila* finns kvar i passet.
- Passbyggaren med tomma fält, muskelgrupper, egna övningar, de fem övningarna, dagar per vecka och *Nästa pass* (v38/v43).

Test:
- `npx tsx --tsconfig tsconfig.json e2e/workout-summary.unit.ts` (22 kontroller)
- `npx tsx --tsconfig tsconfig.json e2e/trainer-links.unit.ts` (23 kontroller)
- `node e2e/v51-plattform.test.mjs`
- Databas: `supabase/tests/rls_v51.test.sql`

## Nytt i v50: Hitta PT:er automatiskt – bara bra leads

Knappen **Hitta PT:er** i CRM:et startar ett jobb som söker brett på Instagram i många omgångar och **bara sparar konton som klarar alla krav**, tills målet (standard 15) är nått:

1. **Riktig personlig tränare/coach.** Kennlar, salonger, butiker, bagerier, föreningar och gymkedjornas egna konton sorteras bort, även om de skriver "träning" eller "coach" (`NOT_TRAINER`, `isChainAccount` i `src/lib/crm/quality.ts`).
2. **I Sverige:** svensk ort, `.se`, `+46` eller svensk text.
3. **Inte privat och inte redan i CRM:et.**
4. **Direkt e-postadress:** adressen ska innehålla personens namn (eller kontonamnet), eller vara en personlig gratisadress. Rolladresser – `info@`, `kontakt@`, `hej@`, `booking@`, `coach@` m.fl. – godtas aldrig. Saknas adress i profilen letas den upp på personens egen webbplats.
5. **Verifierad:** e-postdomänen tar emot post (MX), och adressen är inte avregistrerad.
6. **Lead Score minst 50** (valbart), och ort om du valt orter.

**Var kontona kommer ifrån:** svenska PT-hashtaggar (förifyllda, går att ändra), kända PT-konton du anger, och – det som ger bäst träffar – de konton Instagram visar som *liknande* till en godkänd PT. Allt som sorteras bort räknas per skäl, så att man ser varför ("Inte en personlig tränare 12", "Bara en gemensam adress 4" …).

**Över tid:** jobbet sparas i databasen (`crm_prospect_jobs`) och går i steg om högst 20 sekunder – var femte sekund medan CRM:et är öppet, och vid varje anrop till `/api/crm/queue` om ett schemalagt jobb är uppsatt. Det fortsätter där det slutade om du laddar om sidan. Ett lås hindrar att två steg körs samtidigt. Räkna med 10–30 minuter för 15 bra leads; de flesta konton sorteras bort.

**Kostnadstak:** högst 300 profiler per jobb som standard (valbart 25–1 000) och högst 60 Apify-körningar; ett jobb åt gången.

**Kör migrationen** `supabase/migrations/20261121000000_v50_crm_prospecting.sql`.

Leadsen får som alltid rättslig grund *Inte bedömd* – inga mejl går ut förrän ni tagit ställning.

Test: `npx tsx --tsconfig tsconfig.json e2e/quality.unit.ts` (27 kontroller av reglerna) och `node e2e/v50-prospektering.test.mjs` (16 kontroller: ett blandat urval med kennelklubb, info@-adress, utländsk coach, privat konto och bageri – bara de tre riktiga svenska PT:erna blir leads). Databas: `supabase/tests/rls_v50.test.sql`.

## Nytt i v49: Instagram-profiler i CRM:et (via Apify)

Fliken **Instagram** under *Lägg till leads* hämtar publika Instagram-profiler via Apifys actor `apify/instagram-scraper`:

- **Profiler:** klistra in konton (`@konto` eller profillänk, högst 50 per körning) → namn, biografi, följare, kategori, länk i bio samt e-post och telefon om de står i profilen.
- **Hashtag:** t.ex. `personligtränare` → kontona bakom de senaste inläggen (högst 100) förs över till Profiler, där du väljer vilka som ska hämtas.
- **Granska:** varje profil visas som ett förslag med Lead Score och varningar (privat konto, nämner inte träning, finns redan i CRM:et). Tydliga tränare är förvalda.
- **Lägg till:** saknas e-post men profilen länkar till en webbplats letas adressen upp där (samma hänsynsfulla hämtning som fliken Webbsida: robots.txt, en sida plus kontaktsidan).
- Leaden får källa *Instagram (Apify)*, profillänken som källa (visas i mejlens sidfot) och följarantalet (`crm_leads.instagram_followers`). Minst 2 000 följare ger +5 i Lead Score ("Räckvidd"); minst 5 000 följare eller "online coach" ger segmentet influencer.

**Sätta upp:** Apify Console → **Settings → API & Integrations** → kopiera din API-token → lägg in den som `APIFY_TOKEN` i CRM-projektets miljövariabler i Vercel → bygg om. Utan `APIFY_TOKEN` finns ingen Instagram-funktion. Kör också migrationen `supabase/migrations/20261120000000_v49_crm_instagram.sql`.

**Kostnad:** Apify tar betalt per resultat. Varje körning har ett tak (`maxItems` = antal konton, högst 50, eller antal inlägg, högst 100), och varje administratör kan starta högst 30 körningar i timmen.

**Teknik:** körningen startas asynkront (`POST /v2/acts/apify~instagram-scraper/runs`) och läses av var fjärde sekund tills den är klar – Instagram-hämtningar tar ofta 30 s–2 min, längre än en serverfunktion får vänta. Token skickas i `Authorization`-rubriken, aldrig i adressen. Valfritt: `APIFY_ACTOR` (annan actor med samma indata), `APIFY_API_BASE` (tester).

**Inte verifierat mot Apify:** fältnamnen i Apifys svar kunde inte kontrolleras från utvecklingsmiljön. Tolkningen (`src/lib/crm/instagram.ts`) läser därför varje fält från flera tänkbara namn (`followersCount`/`followers`/`edge_followed_by.count`, `externalUrl`/`externalUrls`, `businessEmail`/`public_email` …) och letar dessutom e-post och telefon i biografin. Visar första riktiga körningen tomma fält: titta på datasetet i Apify Console och lägg till fältnamnet i `profileToCandidate`.

### Juridik – Instagram

- **Metas användarvillkor** förbjuder automatisk insamling från Instagram utan tillstånd. Apify hämtar bara publika profiler utan inloggning; i USA har domstol (Meta mot Bright Data, 2024) funnit att sådan hämtning inte bröt mot villkoren, men frågan är inte prövad i Sverige. Det är en affärsrisk ni tar – i värsta fall stänger Meta åtkomsten, och kontot hos Apify kan påverkas.
- **GDPR gäller fullt ut:** profilerna är personuppgifter även om de är publika. Spara bara det ni behöver, ange källan vid första kontakten (sidfoten gör det), radera på begäran och rensa leads som inte lett någonstans. Privata konton och följarlistor hämtas inte.
- **Marknadsföringslagen** gäller oförändrat: de flesta PT:er på Instagram har enskild firma, och då krävs **samtycke** innan ni mejlar. Leads från Instagram får därför rättslig grund *Inte bedömd*, och inga mejl går ut förrän ni tagit ställning. Ett tryggare första steg mot en enskild firma är ofta ett DM på Instagram, där ni frågar om ni får skicka information.

Test: `npx tsx --tsconfig tsconfig.json e2e/instagram.unit.ts` (20 enhetstester) och `node e2e/v49-instagram.test.mjs` (19 kontroller mot Apify-attrappen i `e2e/mock-crm.mjs`; servern startas som för v47 plus `APIFY_TOKEN=apify-test-token APIFY_API_BASE=http://localhost:54810`). Databas: `supabase/tests/rls_v49.test.sql`.

## Nytt i v48: CRM:et som egen webbplats (t.ex. `coavira-crm.vercel.app`)

CRM:et kan köras som en **egen driftsättning** från samma repo: en egen adress där bara CRM:et finns. Samma databas, samma konton och samma behörighet (`app_admins`) – men inget av appen.

| | Appen (`ptapp2.vercel.app`) | CRM (`coavira-crm.vercel.app`) |
|---|---|---|
| `/` | landningssida / appens start | leder direkt till `/admin/leads` |
| appen, PT-portalen, landningssidan, appens API | ja | 404 |
| `/admin/leads` | skickas vidare till CRM-adressen (om `CRM_URL` är satt) | ja |
| inloggning | appens | `/logga-in/admin` – går alltid vidare till leads |
| sökmotorer | som förut | aldrig (`robots.txt` stänger allt, `X-Robots-Tag: noindex`) |

### Sätta upp det i Vercel (en gång)

1. Vercel → **Add New → Project** → välj **samma repo** → döp projektet till t.ex. `coavira-crm` (adressen blir `coavira-crm.vercel.app`).
2. **Environment Variables** i det nya projektet:
   - `COAVIRA_DEPLOYMENT` = `crm` ← det enda som gör projektet till ett CRM
   - samma som appen: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`
   - CRM:ets egna (se v47): `CRM_FROM_EMAIL`, och vid behov `CRM_REPLY_TO`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET`, `BRAVE_SEARCH_API_KEY`
   - Stripe-, RevenueCat-, Strava- och app-nycklarna behövs **inte**.
3. **Deploy.**
4. Supabase → **Authentication → URL Configuration → Redirect URLs**: lägg till `https://coavira-crm.vercel.app/**` (behövs för Google/Apple-inloggning; e-post + lösenord fungerar ändå).
5. I **appens** Vercel-projekt: sätt `CRM_URL` = `https://coavira-crm.vercel.app`, så att `/admin` i appen skickar vidare dit. (Valfritt – utan den finns CRM:et kvar även i appen.)
6. Resend → Webhooks: peka på `https://coavira-crm.vercel.app/api/resend/webhook`. Ett schemalagt jobb för kön: `https://coavira-crm.vercel.app/api/crm/queue`.

Avregistreringslänkarna i mejlen pekar på CRM:ets egen adress (`CRM_URL` om den är satt i CRM-projektet, annars Vercels produktionsadress för projektet). Båda projekten bygger automatiskt vid varje push till `main`.

**Inloggning:** samma konto som i appen, inloggat på den nya adressen (inloggningen gäller per adress). Är kontot inte administratör visas "Kontot har inte behörighet" med en utloggningsknapp.

Test: `COAVIRA_DEPLOYMENT=crm npm run build && COAVIRA_DEPLOYMENT=crm CRM_DEMO=1 npm start`, sedan `node e2e/v48-crm-deploy.test.mjs` (29 kontroller: bara CRM:et finns, ingen indexering, säkerhetsheaders).

## Nytt i v47: internt CRM för B2B-prospektering (`/admin/leads`)

Ett internt verktyg för att hitta, kvalificera och kontakta personliga tränare: frilansande PT:er, PT-influencers/onlinecoacher och PT:er på gymkedjor (SATS, Nordic Wellness, STC, Fitness24Seven m.fl.). Alltid i Coaviras mörka palett, oavsett systemtema.

### Kom igång

1. Kör migrationen `supabase/migrations/20261119000000_v47_crm_leads.sql`.
2. Gör ditt konto till administratör i SQL-editorn: `select admin_grant('du@coavira.fit');` (tas bort med `admin_revoke`).
3. Logga in och gå till `/admin/leads`.
4. För utskick: sätt `RESEND_API_KEY` och `CRM_FROM_EMAIL` på servern (se tabellen nedan) och fyll i `[ditt namn]` i mallarna.

### Behörighet och säkerhet

- **Bara administratörer.** `app_admins` + `is_admin()` (security definer). Alla fem CRM-tabeller har RLS med `is_admin()`; klienter, PT:er och anon ser ingenting (testas i `supabase/tests/rls_v47.test.sql`, 36 tester).
- **Tre lager:** `proxy.ts` kräver inloggning för `/admin`, admin-layouten visar 404 för alla som inte är administratörer, och varje API-anrop (`POST /api/admin/crm`) kontrollerar `is_admin()` igen och körs med administratörens egen session så att RLS gäller. Icke-administratörer får 404 från API:t.
- **Demoläge:** utan Supabase är `/admin` avstängt om inte `CRM_DEMO=1` är satt (då påhittad data i minnet).
- **Dubbletter** stoppas av databasen: unika index på normaliserad e-post, Instagram-konto och webbadress (utan protokoll, `www`, frågesträng och avslutande snedstreck).

### Hitta och berika leads (`src/lib/crm/`)

| Sätt | Hur det fungerar |
|---|---|
| **Webbsida** | Ange en PT:s egen webbplats eller länk-i-bio-sida (Linktree, Beacons …). Sidan hämtas en gång – plus högst en kontakt-/om-sida på samma domän – och parsern (`extract.ts`) föreslår namn, roll, e-post, telefon (`+46…`), Instagram, gym, ort och specialiseringar. Du granskar innan något sparas. |
| **Manuellt** | Formulär. E-postdomänen MX-kontrolleras när leaden sparas. |
| **CSV** | Komma, semikolon eller tabb, svenska eller engelska kolumnnamn i valfri ordning. Ogiltiga rader rapporteras med radnummer. |
| **Sök** | Via ett officiellt sök-API (Brave Search, `BRAVE_SEARCH_API_KEY`) – inte genom att skrapa sökmotorer. Träffarna är kandidater som du väljer att granska. |

**Hållbar hämtning (`fetch-public.ts`):** bara sidor en administratör själv angett (ingen crawler), `robots.txt` respekteras, högst en förfrågan varannan sekund per webbplats, tydlig avsändare (`CoaviraBot/1.0` med kontaktadress), högst 1,5 MB och 8 sekunder. **Sociala nätverk (Instagram, Facebook, LinkedIn, TikTok …) hämtas aldrig av vår egen hämtning** – deras villkor förbjuder det; profiler sparas som länk. (Instagram kan sedan v49 hämtas via Apify, se nedan.)

**Säker hämtning (SSRF):** bara http/https på standardportar, värdnamnet slås upp en gång, alla adresser kontrolleras mot privata/reserverade nät och anslutningen görs till exakt den kontrollerade adressen (skydd mot DNS rebinding). Omdirigeringar kontrolleras på samma sätt.

**MX-kontroll (`mx.ts`):** kontrollerar att e-postdomänen tar emot post. Den säger inget om att just den brevlådan finns – det går inte att veta utan att skicka.

**Lead Score 1–100 (`score.ts`):** summan av tydliga delar som visas i sidopanelen. Kontaktbarhet (e-post 20, MX-verifierad +15, telefon 10), närvaro (Instagram 10, webbplats 10, känd källa 5), profil (PT-roll 10, ort 5, gym 5, specialisering 5, för- och efternamn 5). Avdrag för domän utan postserver (−20) och gratisadress utan annan närvaro (−5).

### Dashboarden

KPI-kort (totalt, verifierade e-postadresser, kontaktade, konverterade), snabbfilter på segment, status, Lead Score och ort, fritextsök, **lista** eller **pipeline** (kanban: dra kort mellan kolumnerna), sidopanel per lead (all data, redigering, rättslig grund, anteckningar, utskickshistorik) och fliken **Utskick** med kön. Statusflöde: Ny lead → Kvalificerad → Mail skickat → Svarat / intresserad → Onboarding / kund → Ej aktuell.

### Utskick via Resend

- **Mallar** per segment, redigerbara, med variablerna `{{förnamn}}`, `{{namn}}`, `{{gym_eller_företag}}`, `{{stad}}` och `{{specialisering}}`. Saknas ett värde används ett neutralt reservord ("Hej där"). Okända variabler och kvarglömda platshållare som `[ditt namn]` stoppar utskicket.
- **Förhandsgranska & schemalägg:** visar exakt vilka mejl som går ut, till vem och när – och vilka som hoppas över och varför. Servern räknar om allt när utskicket köas.
- **Kön skyddar domänryktet:** ett mejl i taget, minst 90 s (+ slump) emellan, högst 40 per dygn, vardagar kl. 8–17 svensk tid. Varje körning skickar högst ett mejl, så inget går ut i klump om kön stått still. Kön drivs medan `/admin/leads` är öppen; för att den ska gå annars: schemalägg ett anrop till `GET /api/crm/queue` med `Authorization: Bearer <CRON_SECRET>` (t.ex. Vercel Cron var femte minut – kräver en plan som tillåter det).
- **Status:** när Resend tar emot mejlet flyttas leaden till *Mail skickat* med tidsstämpel. Leveranskvittot (`email.delivered`) sätter utskicket till *Levererat*; en studs eller skräppostanmälan spärrar adressen. Lägg in `https://<appens domän>/api/resend/webhook` i Resend → Webhooks (händelserna delivered, bounced, complained) och sätt `RESEND_WEBHOOK_SECRET`.
- **Avregistrering:** varje mejl har en sidfot som servern alltid lägger till (avsändare, varför mottagaren får mejlet, var uppgifterna kommer ifrån, avregistreringslänk) och rubriken `List-Unsubscribe` för avregistrering med ett klick i mejlklienten. Den som avregistrerar sig **raderas** ur CRM:et, och en SHA-256 av adressen sparas på en spärrlista så att den inte kan importeras och mejlas igen.

### Juridik – läs innan första utskicket

Det här är inte juridisk rådgivning; stäm av med en jurist.

- **Marknadsföringslagen 19 §:** e-postreklam till **fysiska personer kräver samtycke i förväg**. En **enskild firma räknas som fysisk person** – de flesta frilansande PT:er och influencers. Till juridiska personer (aktiebolag m.fl., t.ex. en jobbadress hos en gymkedja eller `info@`) krävs inte samtycke, men avsändare och avregistrering måste framgå.
- Därför har varje lead en **rättslig grund** (*Inte bedömd* / *Företagsadress* / *Samtycke*), och **inga mejl går ut till en lead som inte är bedömd**. Verktyget kan inte avgöra om en adress hör till ett bolag – det är ett beslut ni tar per lead.
- **GDPR:** kontaktuppgifterna är personuppgifter. Ni behöver en rättslig grund (normalt intresseavvägning, som ska dokumenteras), informera den registrerade om var uppgifterna kommer ifrån (art. 14 – sidfoten gör det vid första kontakten, senast inom en månad), och radera på begäran. Rensa leads som inte lett någonstans.
- **Anställda på gymkedjor** kan ha anställningsvillkor som begränsar egna klienter – pitcha med det i åtanke.

### Miljövariabler (bara på servern)

| Variabel | |
|---|---|
| `RESEND_API_KEY` | krävs för utskick (finns redan för nyhetsbrevet) |
| `CRM_FROM_EMAIL` | krävs för utskick, t.ex. `Elin på Coavira <elin@mail.coavira.fit>`. Använd gärna en egen underdomän, så att appens egna mejl inte påverkas om ryktet tar skada. Domänen ska vara verifierad i Resend (SPF/DKIM). |
| `CRM_REPLY_TO` | valfritt – dit svaren går |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` från Resend – för leveranskvitton |
| `CRON_SECRET` | minst 16 tecken – slår på `GET /api/crm/queue` |
| `BRAVE_SEARCH_API_KEY` | valfritt – slår på fliken Sök |
| `CRM_MIN_GAP_SECONDS`, `CRM_DAILY_CAP`, `CRM_WINDOW_START_HOUR`, `CRM_WINDOW_END_HOUR`, `CRM_SEND_WEEKENDS` | valfritt – standard 90 s, 40/dygn, vardagar 8–17 |
| `SUPABASE_SERVICE_ROLE_KEY` | finns redan – används av kön, webhooken och avregistreringen |

Bara för tester: `CRM_DEMO`, `CRM_FETCH_MOCK_ORIGIN`, `CRM_MX_MOCK`, `CRM_SEARCH_API_BASE`, `RESEND_API_BASE`. Sätt dem aldrig i produktion.

### Test

```
npx tsx --tsconfig tsconfig.json e2e/crm.unit.ts   # 55 enhetstester: parser, poäng, mallar, utskicksplan, CSV
bash scripts/test-db.sh                            # inkl. rls_v47.test.sql (36 tester)
node e2e/mock-crm.mjs &                            # webbplatser, Resend och sök-API på :54810
node e2e/v47-crm.test.mjs                          # 61 kontroller, se filhuvudet för serverns miljövariabler
```

**Inte testat mot riktiga tjänster:** `SupabaseStore` (frågorna mot PostgREST) är typkontrollerad och RLS är testad i Postgres, men flödet är bara kört från början till slut i demoläge. Resend, Brave Search och riktig DNS (MX) är testade mot en lokal testserver, inte mot tjänsterna själva.

## Nytt i v46: mikroanimationer och tomma lägen i appen

Ingen ombyggnad och ingen ny affärslogik – samma data, actions, RLS och beräkningar som förut. Det som ändras är hur appen *svarar* när man gör något.

**Regler (gäller nya animationer i appen):**

- Bara `transform` och `opacity` (kompositorn). Staplar fylls med `translate`, inte `width`. Inga canvas-element, inga partiklar och inga ändlösa loopar.
- Engångsrörelser som svarar på en handling. Allt stängs av med "minska rörelse" (regeln i `@layer base` i `globals.css`, och `prefersReducedMotion()` där JavaScript räknar).
- Tre kurvor i `:root`: `--ease-out-soft` (mjuk inbromsning), `--ease-spring` (landar med lätt fjäder) och `--ease-sheet` (ark och vyer som glider in, samma kurva som iOS).
- Tal räknar i en textnod via `requestAnimationFrame` (`AnimatedNumber`) – inga React-renderingar per bildruta.

**Byggstenar** (`src/components/motion.tsx` och `globals.css`):

| Byggsten | Vad den gör |
|---|---|
| `AnimatedNumber` | Tal som räknar mjukt till sitt nya värde (kalorier, liter, makron) |
| `FillBar` | Stapel som fylls med transform och växer fram när den syns |
| `DrawnCheck` + `.check-draw` | Bock som ritas från vänster till höger (två motriktade transform-animationer) |
| `ring-burst` | En ring som vidgas och tonar ut en gång – kvittot på att något blev klart |
| `rise-in`, `settle-in`, `row-flash` | Intoning, landning med fjäder, och en ny rad som lyser till en gång |
| `page-push` | Detaljvy (konversation, pass) som glider in från höger som i en native-app |
| `useDrawOnce`, `TOOLTIP_MOTION` (`ui/chart.tsx`) | Grafer ritas ut första gången (900 ms) och rutan följer fingret tätt (160 ms) |

**Var det märks:**

- **Vatten:** glasen fylls med en vätskerörelse, glas för glas när man lägger till flera (flaska 500 ml = två glas i tur och ordning). Litrarna räknar upp. När dagens mål nås ritas en bock och droppen får en ring. Halvfulla glas visas halvfulla.
- **Pass:** avbockat set → bocken ritas och knappen får en ring; setet som står på tur markeras så att ögat hittar det. När övningens sista set bockas av får övningens bricka samma kvitto. "Spara pass" visar ett kort kvitto ("Snyggt jobbat!") och går sedan vidare till startsidan av sig själv (direkt med "minska rörelse").
- **Kost:** kalorierna och "kvar" räknar mjukt mot dagens mål och stapeln glider dit. Över målet byter "kvar" till "över" i varningsfärg. En nyloggad rad lyser till en gång.
- **Framsteg:** kurvorna ritas ut mjukt när sidan laddas (planen först, sedan uppdaterad prognos och faktiska vägningar). Rutan med värden följer fingret tätt när man drar längs grafen.
- **Dra-och-släpp (splits och pass):** kortet lyfts (lätt förstoring + skugga) och glider på plats med en mjuk fjäder; korten runt om flyttar sig med samma kurva.
- **"Nästa pass":** knappen svarar på trycket, veckans avklarade pass fylls i ett i taget.
- **Tomma lägen:** `EmptyState` har nu en valfri nästa handling (`action`), en avklarad ton (`tone="done"`) och ett kompakt läge. Används i inkorgen (inga olästa → "Visa alla konversationer"), utan PT ("Hitta din PT"), PT utan klienter ("Bjud in en klient"), vilodag på startsidan, tom matlogg, aviseringar och PT:ns "Behöver uppmärksamhet".
- **Övergångar:** bottenark och övningsväljaren på mobil glider upp med iOS-kurvan (stängningen är fortsatt snabb, 200 ms, så att ett nytt tryck direkt efteråt alltid tar).

**Mörkt läge = paletten:** appens mörka tema använder nu exakt samma värden som landningssidan: bakgrund `#131916`, text `#f9fbf8`, accent `#84cc16`. Ytor är bakgrunden i ljusare steg. Makro- och vattenfärgerna är kvar (de bär betydelse tillsammans med en textetikett). Ljust läge är oförändrat – appen följer fortfarande systemtemat.

Test: `node e2e/v46-mikro.test.mjs` (demo, 390 px, mörkt läge) kontrollerar mellanlägen (att rörelsen sker), slutvärden, att datan sparas som förut och att "minska rörelse" stänger av rörelsen.

## Säkerhetsgranskning v44 (penetrationstest)

Genomförd som en penetrationstestare med giltiga konton: en kopia av databasen med alla migrationer, inloggad som klient, som PT och oinloggad (anon), samt genomgång av alla 24 API-rutter. Inga attacker mot produktionen. Attackerna finns kvar som regressionstest i `supabase/tests/rls_v44.test.sql`.

**Utfall:** 65 attacker. Ingen kritisk eller hög risk. 64 stoppades redan före åtgärderna. En informationsläcka (L1) täpptes till i v44.

| Risk | Fynd | Åtgärd |
|---|---|---|
| Medium | Inga säkerhetsheaders – appen kunde bäddas in i en iframe på annan sajt (clickjacking mot t.ex. "Radera konto") | `next.config.ts`: `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (kamera/mikrofon bara för appen), HSTS |
| Medium | Lösenordskrav (minst 8 tecken) och brute force-skydd finns bara i formuläret – Supabase Auth anropas direkt från webbläsaren | **Görs i Supabase:** Authentication → Providers → Email: minsta lösenordslängd 8. Attack Protection: CAPTCHA (Turnstile/hCaptcha) och "Leaked password protection". Granska Rate Limits |
| Medium | TURN-uppgifter i `NEXT_PUBLIC_ICE_SERVERS` hamnar i webbläsarkoden – vem som helst kan använda TURN-servern | **Rekommendation:** korttidsuppgifter från en server-route (TURN REST API / leverantörens API) i stället för statiska |
| Låg | `has_health_consent(id)` svarade för vilken användare som helst (om personen är klient och gett hälsosamtycke) | v44: bara för en själv, sina relationer och servern |
| Låg | Certifikatfelet pekade på certifiering@**coavira.com** (appen använder coavira.fit) – personuppgifter kunde skickas till fel domän | v44: rätt adress |
| Låg | Sökord byggdes in i ett PostgREST-filter (`.or()`) med ofullständig sanering (användarens egen session – ingen åtkomst utöver RLS) | `food-cache.ts`: bara bokstäver, siffror och bindestreck |
| Låg | anon hade Supabases standardbehörigheter på alla tabeller (ingen policy släppte in anon) | v44: alla tabellbehörigheter för anon borttagna, även för framtida tabeller |
| Låg | Stripe-verifieringen (3 rutter) saknade rate limit | 30 per minut och användare |
| Info | Fitbit-verifieringen jämförde koden med `===` | `timingSafeEqual` |
| Info | Rate limiting "fail open" om databasen inte svarar | Medvetet (tillgänglighet). Ingen ändring |

**Redan skyddat (verifierat med attacker):**
- RLS på alla tabeller. Tabeller utan policyer (OAuth-tokens, utbetalningskonton, butikskvitton, rate limits) nås bara av servern.
- Rollen kan inte ändras: kolumnbehörigheter på `profiles`, och PT-konton skapas bara av Coavira.
- Betalningar, köp, Plus, Boost, Stripe-status, certifikat och kundursprung (avgift 5/10 %) kan inte manipuleras.
- Ingen IDOR i pass, chatt, vikt, mål, relationer eller bokningar.
- Kalendertoken har 256 bitar. PT-koder har spärr efter 10 försök i timmen.
- OAuth `state` skyddar mot CSRF. Webhooks har signaturer. Inga öppna omdirigeringar (`safeNext`).
- Uppladdningar kontrolleras och kodas om, och sökvägen valideras.
- Service role-nyckeln används bara i serverkod (`server-only`), och bygget stoppas om den används som publik nyckel.
- Ingen rå SQL i koden. Dynamisk SQL i migrationerna använder `format(%I)`.

## Nytt i v43: passbyggaren, övningsbanken och förenklat schema

**1. Tomma fält.** Raderar man siffran i set (eller reps) blir fältet helt tomt – det faller aldrig tillbaka till 1. Användaren skriver sina egna siffror från grunden. Tomma fält kontrolleras först när schemat sparas: de markeras (`aria-invalid`) och sparandet stoppas med ett tydligt besked.
- Splitbyggaren (`split-builder.tsx`): `EditExercise.sets` är `number | undefined`, och `incompleteExercises()` kontrollerar innan schemat sparas.
- `NumberInput` och passbyggarna (PT:ns pass och eget pass) tillät redan tomma fält.

**2. Skapa egen övning i passbyggaren.**
- Varje dag i splitbyggaren har knappen **Skapa egen övning**. Övningslistan har samma knapp, där det man sökt på blir namnet och muskelgruppsfiltret blir förvald grupp.
- Muskelgruppen väljs bland samma grupper som i listan (Bröst, Rygg, Axlar, Biceps, Triceps, Underarmar, Ben, Baksida lår, Säte, Vader, Mage, Helkropp, Kondition).
- Övningen sparas i användarens övningsbibliotek (`custom_exercises.display_group`) och läggs direkt i dagen.

**3. Övningsbanken** (`src/lib/exercise-library.json`, `supabase/seed.sql`):
- nya: **EZ-Bar Curl** (Biceps), **Axelpress i maskin** (Axlar), **Hip Thrust i maskin** (Säte), **Kickbacks** (Triceps);
- **Bulgarian Split Squats** heter så, utan hantlar eller skivstång;
- övningsbanken kommer alltid från källan, även i sparad demodata.

**4. Schemat: antal dagar per vecka** (`src/lib/active-split.ts`, tabellen `client_splits`).
- Klienten väljer split och hur många dagar i veckan (2–6). Fälten för veckodagar, startdatum och antal veckor är borttagna.
- Schemat sparas som det aktiva schemat (ett per klient). Passen ligger i ordning och roterar.
- Träningsschema visar passen i ordning, vilket som står på tur, och dagar per vecka (går att ändra). Där finns också Byt schema och Avsluta schemat.

**5. Nästa pass.**
- En stor knapp överst på startsidan startar passet som står på tur: dagens pass skapas av schemats dag och öppnas direkt.
- Är ett pass redan påbörjat öppnas det igen, i stället för att ett nytt skapas. När det är klart står nästa dag på tur.
- Under knappen visas veckans pass mot målet, t.ex. "2 av 4 pass denna vecka".

**Databas:** `supabase/migrations/20261117000000_v43_splits_exercises.sql`:
- övningsbanken: 4 nya övningar och nytt namn på `e-bss`;
- `custom_exercises.display_group`;
- ny tabell `client_splits` med RLS: klienten äger sin rad, klientens aktiva PT:er kan läsa, och det kopplade passet måste vara klientens eget.
- Test: `supabase/tests/rls_v43.test.sql`.

## Nytt i v42: inkorg, egen kostsida och låst sidledssvep

**1. Inkorgen med olästa meddelanden** (`src/lib/chat/inbox.ts`, vy `src/components/chat/inbox.tsx`)
- `/klient/chatt` och `/pt/meddelanden` är nu inkorgar med en rad per konversation: avatar, namn, tid och förhandsvisning av senaste meddelandet. Samtal och bilder skrivs ut som text, t.ex. "Missat videosamtal" eller "Bild".
- Olästa konversationer ligger överst, står i fetstil, har en prick på avataren och en bricka med antalet. Filtret "Olästa" visar bara dem.
- Ett tryck öppnar konversationen på en egen adress: `/klient/chatt/[ptId]` eller `/pt/meddelanden/[klientId]`.
  - Mobil: ren chattvy i helskärm (tillbaka-pil, namn, samtalsknappar, meddelanden, skrivfält längst ned).
  - Dator (PT): inkorgen till vänster och konversationen till höger.
- Meddelandena markeras som lästa när konversationen öppnas (`markThreadRead`, samma `read_at` som tidigare).
- På PT-översikten leder "Olästa meddelanden" till inkorgen.
- Den gamla flikraden med PT:er i klientens chatt är ersatt av inkorgen.

**2. Kost som egen sida** (`/klient/kost`, `src/components/nutrition/nutrition-page.tsx`, logik `src/lib/nutrition/quick-log.ts`)
- **Navigering:** Kost har en egen flik i bottenmenyn och Recept ligger under samma flik (växeln Dagbok/Recept överst).
- **Idag:** visar bara dagens kalorier mot målet och en Logga-genväg i stället för hela kostrutan.
- **Snabbloggning:**
  - måltiden är förvald efter klockslaget;
  - Snabbval loggar samma mängd som förra gången med ett tryck (med Ångra i toasten);
  - sökträffarna visas i sidans flöde i stället för i en svävande dropdown (`FoodPicker inline`);
  - "Bara kalorier" för snabba uppskattningar;
  - dagens poster grupperas per måltid.
- **Djuplänk från recepten:** `/klient/kost?datum=YYYY-MM-DD`.

**3. Sidledssvep låst**
- CSS (`src/app/globals.css`): `overflow-x: hidden` på html, `overflow-x: clip` på body (sticky-sidhuvudet fungerar fortfarande), `overscroll-behavior-x: none` och `touch-action: pan-y pinch-zoom`. Horisontella chip-rader är egna scrollbehållare och kan fortfarande svepas.
- Capacitor (`capacitor.config.ts`): `zoomEnabled: false`.
- iOS (`ios/App/App/SceneDelegate.swift`, `CoaviraViewController`): scrollvyn studsar aldrig i sidled, och svepgester för bakåt/framåt är avstängda.
- Android (`MainActivity.java`): `OVER_SCROLL_NEVER` och ingen horisontell rullningslist.
- Kör `npx cap sync` efter uppdateringen så att konfigurationen kommer med i apparna.

Ingen databasändring.

## Nytt i v41: Mål-fliken med samma rena vy

- **Mål-fliken (`/klient/profil/mal`)** börjar nu med samma två kort som Framsteg, Viktnedgång (eller Tappat fett) och Ökad muskelmassa, med den stora kurvan direkt under (`ProgressOverview`).
- Den gamla rutan "Din kurva" är borta, och med den den grå informationsrutan med förbränning, aktiv förbränning och pass per vecka. Samma uppgifter står nu på källraden under grafen.
- Formulären för mål, mått, aktivitetsnivå och kostplan finns kvar under grafen, så målen kan fortfarande ändras.
- PT:ns sammanfattning av klientens mål (`goal-summary-card`) är oförändrad.
- Ingen databasändring.

## Nytt i v40: Framsteg – två kort och en stor graf

- **Framsteg (`/klient/framsteg`) innehåller bara:**
  - Två kort högst upp (`src/lib/goals/progress-summary.ts`, vy `src/components/progress/progress-overview.tsx`):
    - **Viktnedgång** – de faktiska vägningarna sedan start, med förlopp och "X kg kvar" till målvikten. Visas vid viktnedgångsmål eller när inga mål är valda. Vid andra mål visas i stället **Tappat fett**, den beräknade fettförändringen enligt kurvan.
    - **Ökad muskelmassa** – den beräknade muskeltillväxten enligt kurvan fram till idag, skalad med faktiska pass per vecka. Markeras med ≈.
  - En stor graf direkt under: planen, vägningarna och den uppdaterade kurvan. Den räknas om med kaloriförbränning (Apple Hälsa, Health Connect, Strava) och passen i appen (`adaptiveProjection`).
  - Källorna och friskrivningen står som en diskret textrad under grafen. Inga andra paneler.
- **Borttaget:**
  - lyft-KPI:er (styrka), veckovolym per muskelgrupp, Styrkeutveckling och Träningsfrekvens;
  - statistikrutorna, målkorten från v35, övnings- och passlistorna.
  - Kod: `kpis.tsx`, `goal-overview.tsx`, `lib/goals/overview.ts`, `liftKpis`, `weeklySetsByMuscle`.
- **Flyttat:**
  - Logga vikt är nu en knapp i grafens rubrik.
  - Övningshistoriken nås via "Historik" vid övningen i passet ("Förra gången"). Tillbaka leder till passet.
  - Passhistoriken finns i kalendern. Min data och sekretess finns i logomenyn.
  - PT:ns klientvy har kvar sina styrke- och frekvensgrafer.
- Ingen databasändring.

## Nytt i v39: inga uppskattade maxlyft (1RM) – bara faktiska lyft

- **Formlerna är borttagna:** Brzycki och Epley (`estimateOneRepMax`), e1RM-serien, relativ styrka (e1RM / kroppsvikt) och alla e1RM-fält.
- **All statistik bygger nu på det som faktiskt lyfts** (`src/lib/training.ts`):
  - `heavierSet`: tyngsta setet är det med högst vikt, och vid lika vikt flest reps;
  - `topSetSeries`: tyngsta set per pass;
  - `exerciseHistory`: varje tillfälles set, tyngsta set, volym och personbästa – tyngre än allt tidigare, eller samma vikt med fler reps;
  - `liftKpis`: senaste tyngsta set, bästa set senaste 4 veckorna och förändringen i vikt.
- **Gränssnittet visar tyngsta set (kg × reps):**
  - Framsteg: styrkekortet och styrkegrafen;
  - övningshistoriken: personbästa, kurva och listan med alla set;
  - PT:ns klientvy;
  - mätpunkterna för Styrkelyft (`top_squat`, `top_bench`, `top_deadlift`);
  - målkorten för Body recomposition och Styrka.
- Progressionen (v32/v34) använde redan bara faktiska set och raka set.

## Nytt i v38: smidigare övningar i splits och pass

- **Övningslistan grupperas efter muskelgrupp** (`src/lib/exercises/groups.ts`, `src/components/exercises/exercise-picker.tsx`):
  - Grupperna är Bröst, Rygg, Axlar, Biceps, Triceps, Underarmar, Ben, Baksida lår, Säte, Vader, Mage, Helkropp och Kondition. Indelningen görs utifrån övningens namn; databasen ändras inte.
  - Snabbfilter med en chip per muskelgrupp. Grupperna fälls ut och in med ett tryck och visar antal övningar.
  - Sökning ger träffar i muskelgruppsordning, med gruppen utskriven.
  - Samma lista används i splitbyggaren, i passets "Lägg till övning" och i "Logga eget pass". På mobilen öppnas den som ett ark från nederkanten.
- **Byt övning i en split med ett tryck på namnet:** den nuvarande övningen är markerad i sin grupp. Set, reps och vila ligger kvar; startvikten nollställs.
- **Drag-and-drop** av övningar i splitbyggaren, under passet och nu även i "Logga eget pass" (tidigare med pilar). Dra i handtaget, eller fokusera det och tryck pil upp/ned.

## Nytt i v37: mobilstädning – samma funktioner, mindre brus

All funktionalitet finns kvar. Det som ändrats är var saker ligger och hur tätt de sitter på mobilen.

- **Kort på mobil** (`src/components/ui/card.tsx`): under 640 px är padding och avstånd 16 px i stället för 24 px. Datorvyn är oförändrad, och kort med egen padding eller eget avstånd påverkas inte.
- **Träningsvyn:**
  - Viktfältet visar hela vikten (t.ex. 87,5) på små skärmar.
  - Dagens mål, PT:ns anteckning, video och förra gången ligger i en samlad ruta. Förklaringen till målet visas under "Varför?".
  - "Som förra passet" är en liten knapp ("Förra") i set-rubriken.
  - "Ta bort passet" (egna pass) ligger längst ned i stället för i sidhuvudet.
  - Inga nya inställningar har lagts i passets menyer.
- **Profilen samlar inställningarna** (`src/components/settings/client-profile.tsx`, `settings-list.tsx`):
  - kompakt kort för profilbild och namn;
  - "Mina mål" som ett kort med genväg till Mål;
  - gruppen "Träning": vilotid (i en dialog), hälsosynk och anslutningar, schema och splits, nyhetsbrev och alla inställningar.

  Vilotiden går fortfarande att ändra mitt i passet via "Vila".
- **Inställningar:** en lista med genvägar, inklusive Träning (som leder till profilen), och "Preferenser" (personliga erbjudanden och nyhetsbrev) som rader i stället för separata kort.
- **Hemskärmen:** "Logga eget pass" och "Schema och splits" ligger sida vid sida.

## Nytt i v36: fråga befintliga användare om nyhetsbrev

- **Vem som får frågan:** konton som registrerade sig innan nyhetsbrevet fanns i onboardingen och som aldrig valt får en pop-up vid nästa inloggning (`src/components/settings/marketing-prompt.tsx`). Det gäller både klienter och PT:er.
- **Valen i rutan:**
  - **Ja tack** → kontakten läggs i rätt Resend-segment ("Klient - Nyhetsbrev" eller "PT - Nyhetsbrev").
  - **Nej tack** → inget skickas till Resend. Svaret loggas.
  - **Fråga mig senare** → frågan kommer igen vid nästa inloggning.

  Inget är förkryssat. Efter ett ja eller nej frågar appen aldrig igen; valet kan ändras under Inställningar.
- **Var den inte visas:** under pågående pass, i intro-flödet och i PT-onboardingen. Nya användare väljer redan i avtalssteget, och en tom ruta där räknas också som ett val.

## Nytt i v35: hälsning efter klockan, mål i Framsteg och nyhetsbrev via Resend

- **Hälsning på hemskärmen** (`src/lib/greeting.ts`, `src/hooks/use-day-part.ts`). Hälsningen följer enhetens klocka:
  - 05–10: "God morgon Sara"
  - 10–18: "Hej Sara!"
  - 18–05: "God kväll Sara"

  Den byter av sig själv när klockan passerar gränserna och när appen kommer tillbaka från bakgrunden. PT:ns översikt hälsar på samma sätt.
- **Framsteg visar bara målen** (`src/lib/goals/overview.ts`, `src/components/goals/goal-overview.tsx`). Intresse-mätpunkterna och "Ändra mätpunkter" är borta. I stället finns ett kort per valt mål:

  | Mål | Kortet visar |
  |---|---|
  | Viktnedgång | kg sedan start och kvar till målvikten, med förlopp |
  | Ökad muskelmassa | kg sedan start och pass per vecka |
  | Bodybuilding | pass per vecka och avbockade set |
  | Body recomposition | tyngsta set i baslyften (kg) och vikt |
  | Styrka | utveckling i tyngsta set i baslyften |
  | Kondition och Hälsa | aktiva minuter mot 150 min/vecka |
- **Resend-segment för nyhetsbrev** (`src/lib/marketing/resend.ts`, `POST /api/marketing/sync`). Den som kryssar i nyhetsbrevet (i onboarding eller Inställningar) läggs som kontakt hos Resend:
  - klienter i segmentet **`Klient - Nyhetsbrev`**, PT:er i segmentet **`PT - Nyhetsbrev`** (namnen jämförs utan hänsyn till skiftläge, mellanslag och typ av bindestreck);
  - kryss bort → kontakten avregistreras och tas bort ur segmentet;
  - raderat konto → kontakten tas bort helt.

  Servern läser roll och samtycke ur databasen, aldrig från webbläsaren. Appen skapar aldrig segment – saknas ett loggas ett tydligt fel.
  - **Serverhemligheter:** `RESEND_API_KEY` krävs. Valfritt: `RESEND_SEGMENT_CLIENT_ID` och `RESEND_SEGMENT_PT_ID`, om segmenten heter något annat.
  - **Synka samtycken från före v35:** `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… RESEND_API_KEY=… npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/sync-resend-segments.mts` (lägg till `--dry-run` för att först se listan).

## Nytt i v34: dynamisk viktkurva, drag-and-drop och ett användaravtal

- **Dynamisk viktkurva** (`src/lib/goals/adaptive.ts`, enhetstest `e2e/adaptive.unit.ts`). Kurvan under Mål, Framsteg och hos PT:n räknas om löpande:
  - **Förbränning per dag** (senaste 28 dagarna, sedan målets start):
    - med telefonens dagssumma (Apple Hälsa / Health Connect): BMR × 1,1 + aktiv energi;
    - annars: BMR × 1,2 + passens kalorier (Strava och pass loggade i appen; styrkepass som redan synkats räknas inte igen).
  - **Förtroende:** fullt efter 14 dagars data. Innan dess vägs det uppmätta ihop med planens aktivitetsnivå.
  - **Träningsfrekvensen** (pass/vecka) skalar muskeltillväxten: 3 pass/vecka eller fler ger full effekt.
  - **Förankring:** kurvan utgår från senaste vägningen och simuleras framåt vecka för vecka. Planen ritas ljust bredvid, den uppdaterade prognosen streckad.
- **Drag-and-drop** (`src/components/workouts/sortable-list.tsx`) av övningar under passet och i splitbyggaren.
  - Dra i handtaget med finger eller mus. Med tangentbordet: fokusera handtaget och tryck pil upp/ned.
  - Klienten kan ändra ordningen även i PT:ns pass.
  - Splitbyggaren redigerar set, reps och startvikt per övning.
  - I egna pass går det att ta bort set.
- **Ingen automatisk stegring mellan seten:** alla set får dagens mål (raka set).
  - En vikt du själv fyller i följer med till nästa set.
  - "Som förra passet" fyller i seten ur historiken.
- **Användaravtal** (`src/components/onboarding/agreement-step.tsx`, `/avtal`, `/avtal/pt`):
  - Ett obligatoriskt godkännande sist i klientens intro-flöde och som PT:ns steg 3.
  - Klienter godkänner användarvillkor + integritetspolicy; PT:er även PT-avtalet och GDPR-åtagandet.
  - Nyhetsbrev, erbjudanden och produktnyheter är ett valfritt kryss som aldrig är förkryssat och kan ändras under Inställningar.
  - Samtycket till hälsodata vid registreringen ligger kvar, eftersom databasen kräver det för klientkonton.

## Nytt i v32: progressiv överbelastning, splits, Strava och hälsosynk

- **Progressiv överbelastning** (`src/lib/progression.ts`, enhetstest `e2e/progression.unit.ts`). Dubbel progression per övning:
  - Repintervallet läses ur PT:ns mål ("8" → 6–8).
  - Klarar toppsetet max-reps → nästa viktsteg och min-reps (140 × 8 → 142,5 × 6).
  - Annars samma vikt +1 rep; två pass i rad under min-reps → deload 10 %.
  - Viktsteget beror på utrustningen: skivstång 2,5, hantel 2, kettlebell 4, maskin 2,5 (ben 5), kroppsvikt = fler reps.
  - Seten är raka set på dagens mål (v34).
- **Splits** (`src/lib/splits.ts`, `/klient/schema`, PT: "Nytt pass → Från split"): PPL (3 och 6 dagar), Upper/Lower, 4-split, Bro split och Full Body. Alla kan anpassas. Klienten lägger ut passen i kalendern på valda veckodagar; PT:n får en mall per dag.
- **Vilotid** (`src/lib/rest-timer.ts`): 45 s–3 min eller eget värde, som standard (Inställningar) eller under passet. Notis på låsskärmen i appen (`@capacitor/local-notifications`).
- **Lägg till set / övning** under passet, även i PT:ns pass. PT:ns egna övningar kan inte tas bort eller ändras (databasregeln `exercises_only_extended`).
- **Strava** – **borttaget i v52** (koden, API-vägarna och anslutningarna finns inte längre; texten nedan är historik):
  - OAuth på servern, med state-cookie.
  - Tokens sparas bara med service role (`wearable_tokens`).
  - Synkar de senaste 30 dagarna.
  - Kalorier tas från Stravas egna värden, därefter från kilojoule, annars uppskattas de med MET.
  - Kräver `STRAVA_CLIENT_ID` och `STRAVA_CLIENT_SECRET` (serverhemligheter). Ange Authorization Callback Domain = er domän i Stravas API-inställningar.
- **Apple Hälsa / Health Connect** (`src/lib/native/health.ts`, `@capgo/capacitor-health`):
  - Bara i mobilappen.
  - Läser aktiv energi, aktiva minuter, steg och träningspass.
  - Kräver ett nytt appbygge. iOS behöver HealthKit-capability (`App.entitlements`). Android kräver minSdk 26 och Health Connect-deklarationen i Play Console.
- **Kalorimätaren** visas på Idag, i kostdagboken (ätit / förbränt / netto), under Anslutningar och hos PT:n.
  - Dagens summa är det största av telefonens dagssumma och summan av passen.
  - Dubbletter tas bort: samma start ±5 min och längd ±20 %.
- **Profilen** visar bara namn, profilbild, valda mål som piller och PT:er. Intressena (mätpunkterna) väljs under Framsteg.

## Nytt i v31: rollbaserat intro-flöde, avtal och tvingad utloggning

- **Tvingad utloggning och flaggan.**
  - `profiles.onboarding_completed` är false tills intro-flödet är klart. En trigger speglar flaggan i JWT:n (`app_metadata.onboarding_completed`).
  - Migrationen sätter flaggan till false för alla konton och tömmer `auth.sessions` och `auth.refresh_tokens`. Inloggningar kan då inte förnyas, så alla loggas in på nytt (redan utfärdade åtkomsttoken gäller som längst sin livslängd, standard 1 h) och går igenom det nya flödet.
  - `proxy.ts` styr på flaggan.
  - Appens skal läser dessutom flaggan från profilen, som skydd när en äldre token saknar den.
  - Bara `finish_onboarding()` kan sätta flaggan. Användaren kan inte ändra den själv.
- **Steg 1 för alla** (`ProfileStepFields`): förnamn, efternamn och profilbild.
  - Bilden laddas upp via servern och granskas av bildfiltret (v29). En stoppad bild visas med ett tydligt besked vid bilden.
  - Länkalternativet är borttaget. Databasen godtar bara bilder i den egna mappen (`avatars/{uid}/`), så filtret går inte att kringgå.
  - PT:er måste ha en profilbild. För klienter är den valfri.
- **Rollroutern** (`nextOnboardingStep` i `src/lib/onboarding.ts`):
  - **Klient:** profil → mål och kostplan (`/klient/intro`).
  - **PT:** profil (inklusive presentation) → Stripe Connect med delad betalning (`application_fee_amount`) → villkor och avtal (`/pt/onboarding`).
- **Avtal för PT:** användarvillkor, integritetspolicy, PT-avtal (`/villkor/pt`, utkast) och GDPR-åtagandet för hälsodata.
  - Godkännandena sparas med version i `legal_acceptances`.
  - PT:ns spärr (`pt_ready`), och därmed synligheten i Hitta PT, kräver nu även godkända avtal.
  - Höjs `legal_version()` måste alla PT:er godkänna den nya versionen.
- **Välkomststeget** frågar inte längre efter namnet. Det anges i steg 1.
- **Framsteg:** med satta mål ersätts den gamla viktgrafen av de nya interaktiva graferna. De visar planen från startdagen med de faktiska vägningarna ovanpå (före eller efter planen) och friskrivningen under.

## Nytt i v30: intro-flöde och mål (kalorimål, takt och prognos)

- **Intro-flödet** (`/klient/intro`) visas efter välkomststeget och går att hoppa över. Klienter utan mål får i stället ett kort på startsidan. Flödet har fyra steg:
  1. Mått: vikt, längd, ålder och kön.
  2. Aktivitetsnivå.
  3. Mål. Flera kan väljas: viktnedgång, ökad muskelmassa, body recomposition, styrkeökning, kondition & uthållighet och hälsosam livsstil.
  4. Din plan.
- **Beräkningar** (`src/lib/goals/metabolism.ts`, enhetstest i `e2e/goals.unit.ts`):
  - **BMR:** Mifflin-St Jeor. "Annat kön" räknar med medelvärdet.
  - **TDEE:** BMR × aktivitetsfaktor (1,2 / 1,375 / 1,55 / 1,725).
  - **Takt:** reglaget i kg per vecka blir ett dagligt underskott (× 7 700 kcal/kg) eller överskott (× 5 500 kcal/kg).
  - **Energigolv:** intaget går aldrig under BMR eller 1 200 kcal för kvinnor, 1 500 för män och 1 350 för "annat". Slår golvet till visas den takt som faktiskt blir av.
  - **Protein:** 1,2–2,2 g/kg beroende på mål. Vid BMI över 30 räknas på referensvikten vid BMI 27,5.
  - **Fett och kolhydrater:** fett 25–30 % av energin. Vid kondition får kolhydraterna minst ungefär 5 g/kg.
- **Reglaget** styr kostplanen i realtid. Intervallet beror på målen:
  - **Nedgång:** skonsam −0,25, standard −0,5, intensiv −1,0 kg/vecka.
  - **Ökning:** +0,1 till +0,5 kg/vecka.
  - **Rekomp:** 0 till −0,5 kg/vecka.
  - **Energibalans:** kondition, styrka och hälsa har inget reglage.
- **Framtidsgrafen** simulerar vecka för vecka. Energibehovet räknas om med den nya vikten, så kurvan planar ut.
  - Målet viktnedgång visar vikten.
  - Målet muskelmassa visar muskelmassan.
  - Fett- och muskelmål samtidigt ger två linjer i samma diagram: fettmassa och muskelmassa.
  - Med målvikt visas när den nås.
- **Profil → Mål** (`/klient/profil/mal`): ändra mål, vikt, mått, aktivitet, reglage och målvikt. Kalorimål och graf uppdateras medan man ändrar. En ny vikt loggas också i viktkurvan.
- **Kostdagboken:** utan kostschema från en PT gäller det beräknade dagsmålet. Ett schema från PT:n går alltid före. PT:n ser klientens mål, kalorimål och prognos under klientens Progress-flik.
- **Friskrivningen** visas längst ned i intro-flödet och i Profil → Mål.

## Nytt i v29: bildfilter, Mealprep och passmallar

- **Bildfilter.** Profilbilder och bilder i chatten granskas på servern innan de sparas (`/api/uploads/image`). Granskningen använder [nsfwjs](https://github.com/infinitered/nsfwjs) (MobileNetV2, MIT-licens), som körs i Node med TensorFlow.js. Ingen tredje part ser bilderna. Bedömningen tar ungefär 1 s, plus ungefär 1 s första gången modellen laddas.
  - **Stoppas** (svar 422 med ett vänligt felmeddelande): `Porn` ≥ 0,7, `Hentai` ≥ 0,7 eller summan av dem ≥ 0,8.
  - **Flaggas** (sparas men loggas): `Porn`/`Hentai` ≥ 0,4 eller `Sexy` ≥ 0,95. Klassen `Sexy` stoppar aldrig ensam, eftersom vanliga porträtt och träningsbilder kan få höga värden där.
  - Händelserna loggas i `moderation_events`, som bara servern och administratören kan läsa.
  - Kan bilden inte granskas sparas den inte (503, "fail closed").
  - Servern kodar om bilden till WebP, så EXIF-data som GPS-position följer inte med. Bilden laddas upp med service role i användarens egen mapp.
  - Storage-reglerna (v29) stoppar direkta bilduppladdningar från webbläsaren, så filtret går inte att kringgå. PDF och video i chatten laddas upp som förut.
  - **E2E:** `MODERATION_TEST_BLOCK_COLOR=ff00ff` gör att en enfärgad magentabild räknas som olämplig. Variabeln ignoreras när `VERCEL_ENV=production`.
- **Kostsökningen** stängs när man trycker utanför sökpanelen eller trycker Escape. "Logga recept" stängs vid tryck på bakgrunden.
- **Mealprep** är en ny receptkategori.
  - Fyra nya matlådor har granskade Pexels-foton som visar just de lådorna: falafellådor (1640771), kikärtscurry (1640769), linslådor (1640775) och quinoasallad i burk (1640767).
  - Sex storkok har fått kategorin och en rad om hållbarhet: kycklingbowl med ris, bolognese, tikka masala, chili, ugnsbakad kyckling och burrito bowl.
  - Generatorn skriver nu bibliotekets seed i v29-migrationen. v26 och v28 är frysta. Pexels-länkar uppdateras, men foton som laddats upp till Storage skrivs aldrig över.
- **Passmallar.** Både PT:er och klienter kan spara ett pass som mall och läsa in det igen:
  - **Spara som mall** i passvyn, för både genomförda och planerade pass. De vikter som faktiskt lyftes blir mallens startvikter.
  - **Spara som mall** i Eget pass och i PT:ns passbyggare.
  - Om en mall med samma namn redan finns erbjuds **Ersätt**.
  - I Eget pass läses en mall in med ett tryck på dess chip. I passbyggaren finns **Nytt pass → Ny från mall**.
  - En mall ägs av antingen en PT (`trainer_id`) eller en klient (`client_id`), aldrig båda. Den får innehålla högst 60 övningar.

## Nytt i v28: matfoton i receptbiblioteket

- 34 av 40 recept har ett riktigt matfoto från Pexels (fri licens, även kommersiellt; ingen attribution krävs men pop-upen visar "Foto: Pexels" med länk). Varje foto är granskat för att visa just den rätten – sex rätter utan ett tillräckligt likt foto (riskakor med banan, energibollar, proteinshake, chili sin carne, salladswraps, havregrynsgröt) visar reservbilden tills ett eget foto laddas upp med `scripts/set-recipe-images.mjs`.
- Fotona anges i `src/lib/recipes/library-source.ts` (`image: pexels(<id>)`); generatorn skriver dem i `library.json`, seed-SQL:en och v28-migrationen.
- Listan laddar en liten version (200/320 px), pop-upen 1200 px.

## Nytt i v27: kompakt receptlista och riktiga matfoton

- **Kompakta kort:** kvadratisk miniatyr till vänster, titel (högst två rader, aldrig under stjärnan) och små piller med ikon för kcal, protein, kolhydrater, fett och tid. 6–7 recept syns på en mobilskärm, utan horisontell overflow (testat på 320 och 390 px).
- **Kategori-chips** rullar i sidled och ligger kvar överst (sticky) när listan rullar – byt mål direkt.
- **Bilder:** `object-fit: cover` i fasta format – kvadrat i listan, 16:9 i pop-upen. Saknas fotot eller går det inte att ladda visas en minimalistisk gradient med en ikon för receptets mål. Pop-upen rullar inuti sig själv (`overscroll-contain`, `touch-pan-y`) så att sidan bakom står still i Capacitor.
- **Riktiga matfoton:** de illustrerade bilderna är borttagna. Foton laddas upp till Supabase Storage och kopplas till rätt rätt med ett skript:
  1. Lägg ett foto per rätt i en mapp, med receptets slug som filnamn (`kycklingbowl-jasminris-broccoli.jpg` …). Listan med slug, namn och motiv finns i `supabase/recipe-photos.csv`. JPEG/WebP/PNG, högst 2 MB, gärna minst 1600 × 900 px.
  2. `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/set-recipe-images.mjs <mapp>`
  3. Skriptet laddar upp till `recipe-images`, sätter `library_recipes.image_url`, skriver länken i CSV-filen och kör generatorn så att `library.json` och seed-SQL:en får samma foton. En ny seed skriver aldrig över ett uppladdat foto.
  Använd foton du har rätt att använda (egna, köpta eller med fri licens, t.ex. Unsplash/Pexels) och som visar just den rätten.

## Nytt i v26: färdigt receptbibliotek (ingen webbskrapning)

- **Inga externa anrop:** importen från webben (v25) är borttagen – ingen API-route, ingen skrapning. Alla recept kommer från Supabase (`library_recipes`) eller appen själv.
- **40 träningsanpassade recept** med färdiga makron per portion (kcal, protein, kolhydrater, fett), bild, tillagningstid, metriska mått (g/dl/msk/tsk/krm/st) och steg. Källan är `src/lib/recipes/library-source.ts`, där varje ingrediens pekar på livsmedelsbasen så att makrona räknas ur samma näringsvärden som resten av appen. `node scripts/gen-recipe-library.mjs` skriver `src/lib/recipes/library.json`, bilderna i `public/recipes/` och seed-SQL:en i v26-migrationen.
- **Flikar per träningsmål:** Högt protein (31), Kalorisnålt (17), Före passet (13), Efter passet (20), Snabbt & enkelt (24, ≤ 20 min). Ett recept kan ligga i flera flikar (`src/lib/recipes/goals.ts`).
- **Bilder:** se v27 – riktiga matfoton via Supabase Storage (de illustrerade bilderna är borttagna).
- **Pop-up:** ett tryck på ett recept öppnar det som en panel (bottenpanel på mobilen) med stor bild, makrobadges, skalbara ingredienser, numrerade steg, favoritstjärna och *Logga i kostdagboken* (datum, måltid, portioner → `food_entries`). Panelen stängs efter loggningen så att länken i bekräftelsen syns.
- **Skapa eget recept från scratch:** namn, kategori (minst en), portioner, tid, ingredienser i gram/dl (fritt eller från livsmedelsbasen), steg och makron per portion – egna värden eller uträknade ur ingredienserna. Sparas i `client_recipes`.
- Snabbfilter *Mina favoriter* och *Mina egna*, plus sök på namn och ingrediens. Demoläget läser biblioteket ur `library.json`; med Supabase används tabellen (och JSON-filen om v26 inte är körd än).

## Nytt i v25: recept, favoriter och kostdagbok

- Favoriter (`user_favorite_recipes`, RLS `auth.uid() = user_id`), träningsmålskategorier och *Logga i kostdagboken* med datum, måltid (`food_entries.meal_type`) och portioner. Dagens kost kan bläddras och djuplänkas (`/klient?datum=…#dagens-kost`).
- *(Importen av recept från webben som infördes i v25 är borttagen i v26.)*

## Nytt i v24: loggning, recept och framsteg för alla

- **Navigering:** chatten ligger uppe till höger i headern (bredvid varukorg, aviseringar och profil). Bottenmenyns femte flik är **Recept** (`/klient/recept`).
- **Recept:** klientens egna recept med ingredienser ur livsmedelsbasen, antal portioner och automatiskt uträknade kalorier, protein, kolhydrater och fett (totalt och per portion). *Logga en portion* lägger receptet i Dagens kost. Import från webben kommer senare.
- **Ingen betalvägg i Idag/Kost:** matloggningen är ren och öppen. Utan kostcoaching visas dagens intag och en diskret länk till PT:er som erbjuder kostschema; sömnlåset (Plus) är en enkel rad.
- **Framsteg gratis för alla:** tyngsta set per lyft (vikt × reps), utveckling i vikt mot 4–8 veckor sedan och veckovolym (effektiva set per muskelgrupp senaste 7 dagarna, riktmärke 10–20). Sedan v39 räknas inga uppskattade maxlyft fram. "Djupgående grafer" är inte längre en Plus-funktion – Plus = full historik, sömn och export. (v40: borttaget från Framsteg – se ovan.)
- **Engelska övningsnamn** enligt branschnorm. De svenska namnen finns kvar som sökord (`src/lib/exercises/search.ts`) – "knäböj" hittar Back Squat.
- **Tömbara sifferfält:** `NumberInput` och loggerns fält kan tömmas helt och få valfritt värde; inget hoppar tillbaka till ett standardvärde. Valideringen sker när setet bockas av eller passet/mallen sparas (`src/lib/exercises/draft.ts`).
- **Rep-mål per set** (`WorkoutExercise.setReps`, t.ex. 12/10/8) i passbyggaren, eget pass och loggern – förslaget för varje set följer setets mål.
- **Ordning:** pilknappar (och dra-och-släpp i passbyggaren) flyttar övningar; i loggern även i PT:ns pass (innehållet är fortfarande låst).
- **Redigera genomförda pass:** *Redigera* i passvyn rättar vikter, reps, set, ordning och kommentar (i egna pass även övningar och namn) via `edit_completed_workout()`. Pass som PT:n klarmarkerat är låsta.

## Nytt i v23: säkerhetsgranskning

- **Samtycke för hälsodata även via API:t** (GDPR art. 9): restriktiva policies (`has_health_consent`) på vikt, sömn, vatten, mätpunkter, mat, måltider, pass och kostscheman. Tidigare kunde ett konto utan valt kontotyp och samtycke skriva hälsodata direkt mot Supabase. Radering fungerar alltid.
- `has_call_access` / `has_nutrition_access` svarar bara parterna själva.
- `TRUNCATE`, `TRIGGER` och `REFERENCES` borttagna för `anon`/`authenticated` (TRUNCATE går förbi RLS).
- **Rate limiting** (`src/lib/rate-limit.ts`, räknare i databasen via `hit_rate_limit`): kassor 10/min, Stripe Connect 10/10 min, kontoradering 5/h, livsmedelssök 60/min per IP, synk av köp och wearables. 429 med `Retry-After`.
- **zod-validering** av alla POST-bodies (`src/lib/validation.ts`): kassan, kontoradering och RevenueCat-webhooken.
- **CSRF**: `proxy.ts` avvisar skrivande `/api/*`-anrop med ett främmande `Origin` (403). Webhooks undantas; de verifieras med signatur.
- **Kontoradering** tar nu även bort PT:ns Stripe Connect-konto och kunden hos RevenueCat (bästa försök, loggas vid fel).
- Mock-wearables bara utanför produktion.

## Landningssidan (/)

Landningssidan på `coavira.fit` leder bara till nedladdning (App Store och Google Play) och har inga inloggnings-, registrerings- eller portallänkar. Appen och webbportalen ligger på `ptapp2.vercel.app` och börjar på `/kom-igang` (se "Domäner" nedan).

| Fil | Innehåll |
|---|---|
| `store-badges.tsx` | App Store-/Google Play-brickor ("Hämta i App Store", "Ladda ned på Google Play"), sidans primära CTA. Med `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` länkar de till butiken, annars öppnas en "Släpps snart"-ruta (med PT-ansökan och kontakt). |
| `nav.tsx` | Fast meny som blir glas vid scroll, ankarlänkar, "Ladda ned" (scrollar till brickorna) och mobilmeny med brickorna |
| `hero.tsx` | Rubrik med ord-för-ord-animation, butiksbrickor, 3D-telefon med "Dagens kost" och "Schemalagda pass", brickor, och en stilla faktarad med appens kärna (träningssplits, hälsosynk, chatt och videosamtal, verifierade PT:er) |
| `bento.tsx` | Funktioner (#funktioner): PT ↔ klient, kostschema med appens riktiga enhetslogik, kalendersynk och passgräns, verifierade PT:er, betalning och hälsosynk – Apple Hälsa, Health Connect och Strava (de två sista bara från md) |
| `goals.tsx` | "Vad vill du uppnå?" (#mal): välj mål ur `INTERESTS` och se Framsteg-vyn byggas om |
| `chat-showcase.tsx` | Chatt och samtal (#kommunikation): missat samtal, demo-videosamtal med flyttbar kameraruta |
| `pricing.tsx` | Priser (#priser): appen 0 kr, exempel på PT-tjänster med mersälj av kostcoaching, PT-ansökan |
| `final-cta.tsx` | Avslutande CTA (#ladda-ned) med butiksbrickor och en horisont som följer scrollen, och sidfot med Support, Sekretesspolicy, Användarvillkor och Kontakt |
| `primitives.tsx` | Gemensamt: rörelsekurvan `EASE`, Reveal/Stagger, GlassCard, SpotlightCard (ljus vid pekaren), ScrollRise (scrollkopplad telefon), PhoneFrame, FloatingBadge |

- **När apparna publiceras:** sätt `NEXT_PUBLIC_APP_STORE_URL` (t.ex. `https://apps.apple.com/se/app/coavira/id…`) och `NEXT_PUBLIC_PLAY_STORE_URL` (`https://play.google.com/store/apps/details?id=com.coavira.app`) i Vercel och bygg om. Brickorna länkar då direkt till butikerna. `NEXT_PUBLIC_APP_STORE_ID` aktiverar dessutom Safaris Smart App Banner.
- **Officiella brickor:** brickorna är ritade i App Store-/Google Play-stil. Apple och Google kräver att man använder deras officiella badge-grafik (Apple Marketing Guidelines, Google Play badge-generatorn). Byt till de officiella SVG-filerna innan lansering.
- **Sidor som butikerna kräver:** `/support` (Support URL), `/integritet` (Privacy Policy) och `/villkor` (Terms). Integritet och villkor är utkast som ska granskas juridiskt.
- **E-post:** `support@coavira.fit`, `kontakt@coavira.fit` och `certifiering@coavira.fit` (`src/lib/brand.ts`). Brevlådorna måste finnas.
- **Tema och animationer:** alltid mörkt (`.landing` i `globals.css`) och framer-motion 13.5.1. `MotionConfig reducedMotion="user"`.
- **Palett (v45, strikt):** bakgrund `#131916`, text `#f9fbf8`, accent `#84cc16`. Ytor (kort `#1a221e`, popover `#1f2823`) är bakgrunden ett steg ljusare och dämpad text (`#a3aba6`, 7,6:1) är textfärgen nedtonad. Inga gradienter i rubriker och inga andra kulörer. Undantag: appens egna färger inne i mockuperna (makrofärgerna, "missat samtal") och butikernas logotyper.
- **Rörelse (v45):** en enda kurva (`EASE` = `--landing-ease`, `cubic-bezier(0.22, 1, 0.36, 1)`), bara `transform` och `opacity`. Saker tonar in och glider på plats en gång (0,8 s, 20 px). Ingenting svävar, pulserar eller snurrar som dekor: bort med rutnät, norrsken, stjärnor, roterande ringar, pulserande sken, rullande faktaband, 3D-lutande kort och konfetti (canvas). Det som fortfarande rör sig visar något: demoerna (synk, skanning, samtal) och svar på det besökaren gör. Hover: korten lyfter 2–4 px och får ett svagt neutralt ljus vid pekaren.
- **Prestanda (regler för nya animationer):**
  - Inga ändlösa loopar som dekor. De få som finns inne i demoerna görs i CSS (`landing-float`, `bento-travel` i `globals.css`, Tailwinds `animate-ping`/`animate-bounce`), aldrig med framer-motion `repeat: Infinity`. De animerar bara `transform`/`opacity` och stängs av med "minska rörelse".
  - Inga canvas-element.
  - Inga `filter: blur()`-sken: använd radiella gradienter (`GlowOrb`). `backdrop-blur` bara från `md:` (stängs dessutom av för allt under `.landing` på telefoner).
  - `whileInView` alltid med `viewport={{ once: true }}`. Scroll-parallax och `ScrollRise` (`useScroll`) monteras bara från md, så att telefoner inte har några scroll-lyssnare som mäter layout. Scrollkopplade element har viloläget som utgångspunkt (det servern skickar), så att de står rätt med "minska rörelse" och utan JavaScript.
  - `transform-gpu`/`will-change-transform` bara på element som rör sig hela tiden. Engångsanimationer i CSS använder `fill-mode-backwards`, så att inga lager blir kvar.
  - Mobil: sekundära block döljs under md (`hidden md:block`), sektioner har `py-12` på mobil.
  - Mät med `BASE_URL=http://localhost:3000 node e2e/landing-perf.mjs` (390×844, CPU strypt 4×): sektionshöjder, huvudtråden i vila och bildrutetider vid scroll.
  - Mätning v45 mot föregående version (samma skript, samma maskin): animationer som går i vila på fem ställen på sidan 6/3/1/1/2 → 1/1/0/0/0, scroll på nyladdad sida p95 35,3 → 30,8 ms och bildrutor över 33 ms 15 → 8, scroll på uppvärmd sida p95 28,3 → 23,7 ms. Mobilsidan blev 190 px längre (8 914 → 9 104 px), mest för att faktaraden under hjälten är två rader i stället för ett rullande band.
- **Fakta:** inga påhittade siffror, betyg eller avgifter. "0 kr" gäller appen och kontot, och inga gratispass utlovas (kontrolleras i `e2e/landing.test.mjs`).

## SEO och Google Analytics (coavira.fit)

- **Metadata** (`src/lib/seo.ts`, `src/app/page.tsx`): titel, beskrivning, nyckelord, kanonisk adress `https://coavira.fit`, `robots: index, follow`, Open Graph och Twitter-kort (`summary_large_image`).
- **Delningsbild:** `public/og-image.png` (1200×630) visar appens riktiga hemskärm. Skapa om den när hero ändras: starta sidan och kör `BASE_URL=http://localhost:3000 node scripts/og-image.mjs`.
- **Strukturerad data (JSON-LD):** `Organization`, `WebSite` och `MobileApplication` (iOS och Android, gratis, `HealthApplication`). När `NEXT_PUBLIC_APP_STORE_URL`/`NEXT_PUBLIC_PLAY_STORE_URL` sätts läggs butikslänkarna till och tillgängligheten blir `InStock`. Inga betyg eller recensioner förrän det finns riktiga. Testa med [Rich Results Test](https://search.google.com/test/rich-results).
- **robots.txt/sitemap.xml:** `src/app/robots.ts` (Allow: /, stänger appen, API och inloggningen) och `src/app/sitemap.ts` (de fyra publika sidorna med `lastmod` = `LAST_UPDATED` i `src/lib/seo.ts`). Skicka in `https://coavira.fit/sitemap.xml` i Google Search Console.
- **Cookie-ruta och Google Analytics 4** (`G-23NXJ2VS0B`, kan ändras med `NEXT_PUBLIC_GA_ID`): `src/components/cookie-banner.tsx`, `src/components/google-analytics.tsx` och samtyckeslogiken i `src/lib/consent.ts`, monterade i `src/app/layout.tsx`:
  - Bara på `coavira.fit`/`www.coavira.fit`: aldrig i appen/webbportalen (`ptapp2.vercel.app`), i mobilappen, på localhost eller i förhandsversioner.
  - "Godkänn alla" sparar `coavira_cookie_consent = "granted"` i localStorage och startar GA4 direkt (utan omladdning). "Endast nödvändiga" sparar `"denied"` och GA4 laddas aldrig. Knapparna är lika stora och lika tydliga (LEK/GDPR, IMY). Finns ett sparat val visas rutan inte igen; valet ändras via "Cookie-inställningar" i sidfoten eller på `/integritet#cookies`.
  - `next/script` med `afterInteractive` (påverkar inte första renderingen). Inga annonsfunktioner: `ad_*` nekas och Google signals är avstängt. Vid återkallat samtycke tas `_ga`-cookies bort.
  - Testas i `e2e/seo.test.mjs` (även att ingen GA-kod laddas före samtycke).

## Domäner: coavira.fit (landningssidan) och ptapp2.vercel.app (appen)

Samma Vercel-projekt och samma bygge svarar på båda adresserna. `src/proxy.ts` delar upp trafiken efter värdnamn (`hostRoute` i `src/lib/site.ts`):

| Värd | Visar | Omdirigeringar |
|---|---|---|
| `coavira.fit`, `www.coavira.fit` (`SITE_URL`) | Bara landningssidan: `/`, `/support`, `/integritet`, `/villkor` | Alla app-sidor (`/kom-igang`, `/logga-in`, `/klient/…`, `/pt/…`, `/auth/…`) och e-postlänkar med `?code`/`?token_hash` → samma sökväg på appens domän (307) |
| `ptapp2.vercel.app` (`APP_URL`) | Appen/webbportalen. `X-Robots-Tag: noindex` (syns inte i Google) | `/` → `/kom-igang`; inloggade skickas vidare till sin startsida |
| Övriga (localhost, förhandsversioner) | Båda delarna | Inga |

- **Fungerar på båda domänerna utan omdirigering:** `/api/*` (Stripe-webhook, kalenderprenumerationer, wearables), `/.well-known/*`, `robots.txt`, `sitemap.xml`, ikoner och delningsbilder. POST omdirigeras aldrig.
- **Mobilappen** laddar `APP_URL`. Äldre byggen som laddar `coavira.fit` (user agent `CoaviraApp`) fungerar som förut.
- **Byta appdomän** (t.ex. `app.coavira.fit`): lägg till domänen i Vercel, sätt `NEXT_PUBLIC_APP_URL` och repo-variabeln `APP_URL`, och bygg om webben och apparna.

1. **Vercel → Project → Settings → Domains:** lägg till `coavira.fit` och `www.coavira.fit` (välj en som primär och låt den andra omdirigera dit). `ptapp2.vercel.app` finns kvar som produktionsadress.
2. **DNS hos domänleverantören** (Vercel visar exakta värden när domänen läggs till):

   | Typ | Namn | Värde |
   |---|---|---|
   | A | `@` (coavira.fit) | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` (eller det projektspecifika värde Vercel visar) |

   - Ta bort gamla A/AAAA-poster för `@` och `www` som pekar någon annanstans. **Behåll MX- och TXT-poster** för e-post.
   - Har domänen CAA-poster: lägg till `0 issue "letsencrypt.org"` så att Vercel kan utfärda certifikatet.
3. **Vercel → Settings → Environment Variables:** inget krävs (standardvärdena är `https://coavira.fit` och `https://ptapp2.vercel.app`). Vill ni sätta dem uttryckligen: `NEXT_PUBLIC_SITE_URL=https://coavira.fit` och `NEXT_PUBLIC_APP_URL=https://ptapp2.vercel.app`, och bygg om. `NEXT_PUBLIC_CANONICAL_REDIRECT` används inte längre och kan tas bort.
4. **Supabase → Authentication → URL Configuration:**
   - *Site URL*: `https://ptapp2.vercel.app` (appens adress – e-postmallarna använder `{{ .SiteURL }}`).
   - *Redirect URLs*: `https://ptapp2.vercel.app/**`, `com.coavira.app://**`, `http://localhost:3000/**` och förhandsversionerna. Behåll `https://coavira.fit/**` – länkar som redan skickats dit vidarebefordras till appen.
   - Inloggningslänkar byggs från adressen användaren är på (`window.location.origin`), så PKCE-nyckeln och sessionen hör alltid till samma domän.
5. **Stripe:** `success_url` och `cancel_url` byggs från domänen användaren köper på (`request.nextUrl.origin` i `/api/checkout`), alltså appens domän. Webhooken fungerar på båda domänerna; rekommenderad adress är `https://ptapp2.vercel.app/api/stripe/webhook`.
6. **Google/Apple-inloggning:** Supabase-callbacken (`https://<projekt>.supabase.co/auth/v1/callback`) ändras inte.
7. **Wearables:** callback-adressen byggs från appens domän: `https://ptapp2.vercel.app/api/wearables/<leverantör>/callback`.
8. **Mobilappen:** laddar `https://ptapp2.vercel.app` som standard (`capacitor.config.ts`, `.github/workflows/mobile.yml`). Repo-variabeln `APP_URL` eller `CAPACITOR_SERVER_URL` skriver över den.

## Mobilapp (iOS och Android) med Capacitor

Native-apparna finns i `ios/` och `android/` (Capacitor 8) och byggs i GitHub Actions. Ingen Mac eller Android Studio behövs.

- **Så fungerar det:** appen använder SSR, API-routes, auth-callbacks och `proxy.ts` och kan därför inte exporteras statiskt. Native-appen laddar i stället den driftsatta webbtjänsten i en WebView (`server.url` i `capacitor.config.ts`). Webben byggs och driftsätts på Vercel exakt som förut; `.vercelignore` håller native-mapparna utanför Vercel.
- **App-id och namn:** `com.coavira.app`, "Coavira". Version 1.0 (Android `versionCode` 1).
- **Serveradress:** `CAPACITOR_SERVER_URL`. Standard är appens domän `https://ptapp2.vercel.app` (inte landningssidan). I GitHub kan den ändras med repo-variablerna `APP_URL`/`CAPACITOR_SERVER_URL` eller när arbetsflödet körs manuellt.
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
- **Utseende och rörelse:**
  - **Designsystemet** i `components/ui`: kort med `rounded-2xl` och mjuk skugga (`shadow-card`, mörkare i mörkt läge), knappar som trycks ner (`active:scale-95`), glaseffekt på sidhuvud, bottenmeny, menyer och notiser.
  - **Appbakgrund:** `.app-backdrop` med mjuka färgfält i stället för platt vitt eller svart.
  - **Sidbyten** tonar in via `app/klient/template.tsx` och `app/pt/template.tsx`. Aktiv flik markeras med en "pill" som växer in.
  - **Laddning:** skeleton loaders (`components/ui/skeleton.tsx`, `components/app-skeleton.tsx`) i stället för spinnrar när data hämtas.
  - **Bekräftelser** visas i appens egen dialog (`confirmDialog` i `components/ui/confirm.tsx`) i stället för `window.confirm`.
  - Allt följer *Minska rörelse*.
- **Stängknappar (v23):** dialoger och sidopaneler (`components/ui/dialog.tsx`, `sheet.tsx`) håller sig inom safe area; alla kryss är minst 44 × 44 px, runda och med bakgrund (`components/ui/close-button.tsx`). Små dölj-/ta bort-kryss i listor får 44 px träffyta med `touch-target` (globals.css).
- **Helskärm och safe area:** `viewport-fit=cover`; sidhuvuden, bottenmeny, samtalsvy och inloggningssidor lägger till `--safe-top`/`--safe-bottom` (från `env(safe-area-inset-*)` och Capacitors `--safe-area-inset-*` på Android). Android kör kant till kant (`EdgeToEdge`). På webben är marginalerna 0.
- **Betalning (v22):** Stripe Checkout öppnas i appen med `@capacitor/browser` (`src/lib/native/checkout.ts`): en Safari-vy med **Klar**, så att man alltid kan avbryta. Appens WebView lämnar aldrig appen.
  - Från appen (user agent `CoaviraApp`) sätter servern `success_url`/`cancel_url` till `/app-retur/<sida>` (`src/lib/app-return.ts`). Sidan skickar vidare till `com.coavira.app://<sida>`; `NativeBridge` (`appUrlOpen`) stänger vyn och öppnar kvittot/sidan i appen.
  - Stänger man vyn själv (`browserFinished`) slutar knappen snurra. Betalda köp registreras ändå av webhooken.
  - Stripe kräver https-adresser, därför går returen via `/app-retur` i stället för direkt till URL-schemat. Schemat `com.coavira.app` finns redan i appen, så inget nytt bygge krävs. `allowNavigation` för Stripe är borttaget ur `capacitor.config.ts` och försvinner vid nästa bygge.
  - Andra externa länkar (bilagor, Google Kalender) öppnas också i webbläsarvyn.
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
- **Samtycket gäller även API:t** (v23): hälsodata kan bara sparas för en klient med samtycke, oavsett om anropet kommer från appen eller direkt mot Supabase.
- **Radering** (art. 17): *Radera mitt konto* (`POST /api/account/delete`) tar bort filerna i Storage, PT:ns Stripe Connect-konto och kunden hos RevenueCat, och raderar sedan användaren med `auth.admin.deleteUser`. Allt i databasen raderas via kaskad.
- **Filer**: chattbilagor och övningsvideor ligger i privata buckets med RLS och visas via signerade länkar. Profilbilder ligger i en publik bucket, men utan listning.
- **API:t**: zod-validering, rate limiting och Origin-kontroll (se v23). Hemliga nycklar finns bara i serverkod (`server-only`); `scripts/check-secrets.mjs` kontrollerar byggd webbläsarkod.
- **Mobilappen** laddar webbappen från dess egen domän. Sessionen är en cookie i appens egen WKWebView/WebView-lagring (iOS Data Protection/Android-sandlåda), och lokal data rensas vid utloggning.
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
npx tsx --tsconfig tsconfig.json e2e/site-url.unit.ts  # domänuppdelningen (enhetstest)
node e2e/host-split.test.mjs     # domänuppdelningen mot servern (Host-huvuden; i Supabase-läge även inloggning)
node e2e/seo.test.mjs            # metadata, Open Graph, JSON-LD, robots/sitemap och GA4 med samtycke
node e2e/v15-app-demo.test.mjs  # mobilappen (låtsas-Capacitor): djuplänkar, kall start, push, safe area, webben opåverkad
node e2e/v15-app-oauth.test.mjs # mobilappen i Supabase-läge: Google i systemwebbläsaren, PKCE, tillbaka via com.coavira.app://
node e2e/v14-regler.test.mjs    # Kostschema-filter/tagg, logiska enheter, tidsspärr, vikter krävs, uppvärmning/nedvarvning, samtalslås
node e2e/v12-multi-pt.test.mjs  # logomeny, flera PT:er, chatt per PT, missat samtal, kostval, kost-PT, intressen → Framsteg
node e2e/v16-varukorg-boost.test.mjs # varukorg (flera PT:er, mersälj, kassa per PT, sparas), PT Boost, Utvald i Hitta PT och klockan
node e2e/v16-supabase.test.mjs  # Supabase-läge: cart_items (+ antal), kassa med antal och serviceavgift, Boost via Stripe, webhook
node e2e/v18-plus-referral.test.mjs # Plus-lås, uppgraderingsrutan, inbjudningsvyn (klient/PT), inlösen, /ref/KOD
node e2e/v18-supabase.test.mjs  # Supabase-läge: my_account, referrals, inlösen i välkomststeget, Plus via Stripe, webhook
node e2e/v19-ovningar-ptkod.test.mjs # egna övningar (klient + PT), Bjud in existerande klient, kod i Inställningar, avgift 5/10 %
node e2e/v19-supabase.test.mjs  # Supabase-läge: custom_exercises, create_pt_invite, redeem_pt_invite (Inställningar + välkomststeget), Stripe 5/10 %
node e2e/v20-lansering.test.mjs # Radera mitt konto (klient/PT), obligatorisk bockruta, /privacy /terms, 404, inga digitala köp i iOS-appen
node e2e/v20-supabase.test.mjs  # Supabase-läge: kontoradering via Auth admin-API + Storage, felvy när data inte kan laddas
node e2e/mock-revenuecat.mjs &  # (krävs av v21) RevenueCats REST-API på :54600
node e2e/v21-supabase.test.mjs  # Köp i appen: RevenueCat-webhook (Plus, Boost, återbetalning), synk, köpvyn i iPhone-appen
node e2e/v22-app-checkout.test.mjs # (demo) Vilotimer −15/+15 s, /app-retur, djuplänk från Stripe stänger webbläsarvyn
node e2e/v22-supabase.test.mjs  # Stripe i appen: retur via /app-retur, Browser.open med Klar, knappen släpper när vyn stängs
node e2e/v23-safe-area.test.mjs # (demo) Stängknappar ≥ 44 px under statusfältet i dialoger/paneler, sitemap.xml-headers
node e2e/connect-onboarding-demo.test.mjs # (demo) PT-onboardingen med simulerad Stripe-koppling
npx tsx --tsconfig tsconfig.json e2e/goals.unit.ts # BMR/TDEE, reglaget, energigolv, makron och prognos
npx tsx --tsconfig tsconfig.json e2e/progression.unit.ts # progressiv överbelastning och pyramid
npx tsx --tsconfig tsconfig.json e2e/splits.unit.ts      # splits och schemaläggning
npx tsx --tsconfig tsconfig.json e2e/activity.unit.ts    # kalorimätaren: dubbletter, dagssumma, MET
npx tsx --tsconfig tsconfig.json e2e/adaptive.unit.ts    # dynamiska viktkurvan: förbränning, förtroende, frekvens, förankring
npx tsx --tsconfig tsconfig.json e2e/v35.unit.ts # hälsningen (05/10/18)
npx tsx --tsconfig tsconfig.json e2e/progress-summary.unit.ts # Framstegskorten: Viktnedgång/Tappat fett och Ökad muskelmassa
node e2e/v40-framsteg.test.mjs # (demo, 390 px) bara två kort + stor graf, logga vikt i grafen, Historik från passet
npx tsx --tsconfig tsconfig.json e2e/chat-inbox.unit.ts # inkorgen: olästa, sortering, förhandsvisning, adresser
npx tsx --tsconfig tsconfig.json e2e/quick-log.unit.ts  # snabbloggningen: måltid efter klockan, snabbval, gruppering
npx tsx --tsconfig tsconfig.json e2e/active-split.unit.ts # aktivt schema: Nästa pass, rotation, veckans pass
node e2e/v43-passbyggare.test.mjs # (demo, 390 px) tomma fält, egen övning i passbyggaren, nya övningar, dagar/vecka, Nästa pass
node e2e/v46-mikro.test.mjs      # (demo, 390 px, mörkt läge) mikroanimationer, kvitton, tomma lägen, minska rörelse
node e2e/v47-crm.test.mjs        # (demo + e2e/mock-crm.mjs) internt CRM: berikning, spärrar, dubbletter, kö, webhook, avregistrering
node e2e/v48-crm-deploy.test.mjs # (COAVIRA_DEPLOYMENT=crm) CRM som egen webbplats: bara CRM:et finns, ingen indexering
node e2e/v49-instagram.test.mjs  # (demo + Apify-attrapp) Instagram-profiler och hashtaggar via Apify
node e2e/v50-prospektering.test.mjs # (demo + Apify-attrapp) automatisk prospektering med kvalitetskrav
node e2e/v42-chatt-kost.test.mjs # (demo, 390 px, touch) inkorg → konversation → svar, Kost-sidan, låst sidledssvep
node e2e/v35-demo.test.mjs     # (demo) God morgon/Hej/God kväll med falsk klocka, byte utan omladdning, Framsteg med bara mål
node e2e/mock-resend.mjs &     # (krävs av v35-supabase) Resends API på :54800 (RESEND_API_KEY=re_test RESEND_API_BASE=http://localhost:54800)
npx tsx --tsconfig tsconfig.json e2e/exercise-groups.unit.ts # muskelgrupperna (Biceps/Triceps, Baksida lår/Säte/Vader …)
node e2e/v38-ovningar.test.mjs # (demo) byt övning i split, muskelgrupper/filter/sök, drag-and-drop i split och eget pass, Lägg till övning i passet
node e2e/v52-navigering.test.mjs # (demo, 390 px) upplägg och vilodagar, Strava borta, PT:ns bottenmeny, belöningar, historik, KPI-kort
node e2e/v51-plattform.test.mjs # (demo, 390 px) klickbara dagar och planering, PT-länkar, diagram, sammanfattning efter passet
node e2e/v37-mobil.test.mjs   # (demo, 360 px) ingen overflow, viktfältet, Varför?, Ta bort passet längst ned, profilen som inställningsnav
node e2e/v36-supabase.test.mjs # Pop-upen: syns bara för den som aldrig valt, Fråga mig senare → nästa inloggning, Ja → Resend-segmentet, Nej → ingen kontakt
node e2e/v35-supabase.test.mjs # Nyhetsbrev → Resend: klient → "Klient - Nyhetsbrev", PT → "PT - Nyhetsbrev", kryss bort → avregistrerad, inget samtycke → ingen kontakt
node e2e/v34-demo.test.mjs     # (demo) Avtalet i intro-flödet, nyhetsbrev, dynamisk kurva, drag-and-drop i pass och split, raka set, /avtal
node e2e/v32-traning-demo.test.mjs # (demo) Progression i passet, vilotid, lägg till set/övning, splits (klient + PT), kalorimätaren, rensad profil
node e2e/v31-intro-demo.test.mjs # (demo, MODERATION_TEST_BLOCK_COLOR=ff00ff) Välkomststeget utan namn, steg 1 med bildfiltret, klientens mål, Framsteg mot plan
node e2e/v31-supabase.test.mjs  # Befintliga konton tvingas genom intro-flödet; klient: steg 1 → mål → klar; PT: steg 1 → villkor → aktiverat
node e2e/v30-mal-intro.test.mjs  # (demo) Intro-flödet, reglaget räknar om i realtid, två grafer, Profil → Mål, PT:ns vy, friskrivning
node e2e/v30-supabase.test.mjs   # Intro-flödet sparar i client_goals (eget id, födelseår, kalorimål) och loggar vikten
node e2e/v29-filter-mealprep-mallar.test.mjs # (demo, MODERATION_TEST_BLOCK_COLOR=ff00ff) Bildfiltret, kostsökningen stängs utanför, Mealprep, spara/läsa in mallar
node e2e/v29-supabase.test.mjs  # (MODERATION_TEST_BLOCK_COLOR=ff00ff) Uppladdning via servern (WebP, egen mapp), moderation_events, chattbehörighet, klientmall med client_id
node e2e/connect-onboarding.test.mjs # Supabase-läge: onboardingspärren, profil + Stripe Connect, callback, delad betalning, account.updated
node scripts/build-email-templates.mjs --check # e-postmallarna i supabase/templates/ är genererade från scripts/build-email-templates.mjs
node e2e/email-templates.test.mjs # Mallarna renderas med Go html/template (som Supabase), länkar, storlek, mobil/mörkt läge; med BASE_URL även klick-genom
node scripts/check-secrets.mjs  # inga hemliga nycklar i .next/static (bygg först med hemligheterna satta)
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
