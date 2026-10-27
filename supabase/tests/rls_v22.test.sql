-- Tester för v22: Stripe Connect – obligatorisk PT-onboarding, utbetalningar och synlighet.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('connect-klient@test.se', '{"role":"client","full_name":"Klara Connect","health_data_consent":true}', '{}'),
  ('connect-pt@test.se', '{"role":"trainer","full_name":"Pia Connect"}', '{"role":"trainer"}'),
  ('demo-pt@test.se', '{"role":"trainer","full_name":"Dana Demo"}', '{"role":"trainer"}');
select id as klient from auth.users where email = 'connect-klient@test.se' \gset
select id as pt from auth.users where email = 'connect-pt@test.se' \gset
select id as demo from auth.users where email = 'demo-pt@test.se' \gset

-- ------------------------------------------------------ befintliga PT:er ---
select test.eq((select count(*) from trainers where is_published), 0::bigint, 'publicerade profiler utan Stripe döljs vid uppgraderingen');
select test.eq((select count(*) > 0 from trainers where publish_when_ready), true, 'och visas igen när Stripe är kopplat (publish_when_ready)');
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'false', 'ny PT: spärren står i JWT:n (pt_ready = false)');

-- ----------------------------------------------------------- skydd ---
select test.login('connect-pt@test.se');
select test.fails($$update trainers set stripe_onboarding_complete = true where id = auth.uid()$$, 'PT:n kan inte markera onboardingen som klar själv');
select test.fails($$update trainers set publish_when_ready = true where id = auth.uid()$$, 'PT:n kan inte ändra publish_when_ready');
select test.fails($$select * from trainer_payout_accounts$$, 'Stripe-kontona är dolda för användare');
select test.fails($$select attach_stripe_account(auth.uid(), 'acct_fusk123')$$, 'PT:n kan inte koppla ett konto själv');
select test.fails($$select apply_stripe_account('acct_fusk123', true, true, true)$$, 'PT:n kan inte godkänna sitt konto själv');
select test.fails($$select admin_mark_pt_onboarded('connect-pt@test.se')$$, 'PT:n kan inte undanta sig själv');
select test.eq((my_payout_status())->>'profile_complete', 'false', 'tom profil är inte färdig');
select test.eq((my_payout_status())->>'connected', 'false', 'inget Stripe-konto än');

-- Steg 1: profilen.
update trainers set bio = 'Kort', specialties = '{hyrox}', avatar_url = 'https://cdn.test/pia.jpg', price_per_session = 700 where id = auth.uid();
select test.eq((my_payout_status())->>'profile_complete', 'false', 'presentationen måste vara minst 40 tecken');
update trainers set bio = 'Jag tränar Hyrox-atleter och nybörjare med fokus på teknik och hållbar progression.' where id = auth.uid();
select test.eq((my_payout_status())->>'profile_complete', 'true', 'namn, presentation, inriktning och bild: profilen är färdig');
select test.eq((my_payout_status())->>'pt_ready', 'false', 'men portalen är stängd tills Stripe är kopplat');
select test.fails($$update trainers set is_published = true where id = auth.uid()$$, 'profilen kan inte publiceras utan utbetalningar');
select test.logout();
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'false', 'JWT-spärren står kvar efter steg 1');

-- ------------------------------------------------- steg 2: Stripe ---
set role service_role;
select test.eq(attach_stripe_account(:'pt', 'acct_1PiaConnect'), 'acct_1PiaConnect', 'servern kopplar Stripe-kontot');
select test.eq(attach_stripe_account(:'pt', 'acct_1Annat'), 'acct_1PiaConnect', 'ett befintligt konto behålls (inga dubbletter vid omförsök)');
select test.fails($$select attach_stripe_account('$$ || :'klient' || $$', 'acct_1Klient')$$, 'klienter kan inte få utbetalningskonto');
select test.eq(apply_stripe_account('acct_1PiaConnect', true, false, false, '{individual.verification.document}') ->> 'complete', 'false',
  'uppgifter inskickade men kort inte aktiverat: inte klart');
reset role;
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'false', 'väntar på Stripe: portalen fortfarande stängd');
select test.login('connect-pt@test.se');
select test.eq((my_payout_status())->>'details_submitted', 'true', 'PT:n ser att uppgifterna är inskickade');
select test.eq((my_payout_status())->>'requirements_due', '1', 'och att Stripe vill ha mer');
select test.logout();

set role service_role;
select apply_stripe_account('acct_1PiaConnect', true, true, true, '{}') as godkand \gset
select test.eq(apply_stripe_account('acct_1Okant', true, true, true), null::jsonb, 'okänt Stripe-konto ignoreras');
reset role;
select test.eq((:'godkand'::jsonb) ->> 'complete', 'true', 'Stripe godkänt: onboardingen är klar');
select test.eq((:'godkand'::jsonb) ->> 'pt_ready', 'true', 'profil + Stripe: portalen öppnas');
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'true', 'spärren i JWT:n släpps (pt_ready = true)');
select test.eq((select raw_app_meta_data ->> 'role' from auth.users where id = :'pt'), 'trainer', 'rollen i app_metadata är orörd');
select test.eq((select onboarded_at is not null from trainer_payout_accounts where trainer_id = :'pt'), true, 'tidpunkten sparas');

select test.login('connect-pt@test.se');
update trainers set is_published = true where id = auth.uid();
select test.eq((select is_published from trainers where id = auth.uid()), true, 'med utbetalningar kan profilen publiceras');
insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, price_sek) values (auth.uid(), 'single', 'Hyrox-pass', 1, false, 700);
select id as tjanst from trainer_services where trainer_id = auth.uid() \gset
select test.logout();

-- Köp: klienten köper av en PT som tar emot betalningar.
select test.login('connect-klient@test.se');
select test.eq((select count(*) from trainers where id = :'pt'), 1::bigint, 'publicerad PT syns i Hitta PT');
select test.eq((create_checkout(array[:'tjanst'::uuid]) ->> 'trainer_id')::uuid, :'pt'::uuid, 'kassan startar hos en PT med Stripe');
select test.logout();

-- Stripe stänger av kort (t.ex. ny verifiering): dold och går inte att köpa – men portalen är öppen.
set role service_role;
select apply_stripe_account('acct_1PiaConnect', true, false, false, '{external_account}');
reset role;
select test.eq((select is_published or not publish_when_ready from trainers where id = :'pt'), false, 'kort avstängda: profilen döljs och visas igen sen');
select test.eq((select stripe_onboarding_complete from trainers where id = :'pt'), true, 'onboardingen är fortfarande klar (PT:n låses inte ute)');
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'true', 'portalen är fortfarande öppen');
select test.login('connect-klient@test.se');
select test.eq((select count(*) from trainers where id = :'pt'), 0::bigint, 'dold PT syns inte i Hitta PT');
select test.eq((select count(*) from trainer_services where trainer_id = :'pt'), 0::bigint, 'och tjänsterna syns inte');
select test.logout();
set role service_role;
select apply_stripe_account('acct_1PiaConnect', true, true, true, '{}');
reset role;
select test.eq((select is_published and not publish_when_ready from trainers where id = :'pt'), true, 'kort aktiverade igen: profilen visas igen');

-- Profilen blir ofullständig: portalen stängs tills den är färdig igen.
update trainers set avatar_url = null where id = :'pt';
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'false', 'utan profilbild: tillbaka till onboardingen');
update trainers set avatar_url = 'https://cdn.test/pia.jpg' where id = :'pt';
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'true', 'bild tillbaka: portalen öppen igen');
update profiles set full_name = ' ' where id = :'pt';
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'false', 'namnet räknas också');
update profiles set full_name = 'Pia Connect' where id = :'pt';

-- ------------------------------------------- PT utan Stripe kan inte sälja ---
-- (t.ex. klient sedan tidigare hos en PT som inte kopplat Stripe än)
insert into coaching_relationships (client_id, trainer_id, status) values (:'klient', :'demo', 'active');
select test.login('demo-pt@test.se');
insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, price_sek) values (auth.uid(), 'single', 'Demopass', 1, false, 500);
select id as demotjanst from trainer_services where trainer_id = auth.uid() \gset
select test.logout();
select test.login('connect-klient@test.se');
select test.fails($$select create_checkout(array['$$ || :'demotjanst' || $$'::uuid])$$, 'PT utan godkända utbetalningar kan inte ta betalt');
select test.logout();

-- ----------------------------------------------- admin: demokonto ---
update trainers set bio = 'Demokonto för granskning med exempelpass, kostschema och bokning i appen.', specialties = '{styrkelyft}',
  avatar_url = 'https://cdn.test/demo.jpg', price_per_session = 500 where id = :'demo';
select test.eq(admin_mark_pt_onboarded('demo-pt@test.se'), true, 'admin: demokontot räknas som klart');
select test.eq((select exempt and stripe_account_id is null from trainer_payout_accounts where trainer_id = :'demo'), true, 'undantaget utan Stripe-konto');
select test.eq(trainer_payouts_ready(:'demo'), true, 'demokontot kan ta emot betalningar (till Coavira)');
select test.login('connect-klient@test.se');
select test.eq((create_checkout(array[:'demotjanst'::uuid]) ->> 'trainer_id')::uuid, :'demo'::uuid, 'kassan fungerar för demokontot');
select test.logout();
select test.fails($$select admin_mark_pt_onboarded('connect-klient@test.se')$$, 'klienter kan inte göras till demo-PT');

-- ------------------------------------------------------------- övrigt ---
select test.eq((select rowsecurity from pg_tables where tablename = 'trainer_payout_accounts'), true, 'trainer_payout_accounts har RLS');
select test.login('connect-pt@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from trainer_payout_accounts where trainer_id = :'pt'), 0::bigint, 'kontoradering tar bort utbetalningskontot');

\warn 'ALLA V22-TESTER (STRIPE CONNECT) GODKÄNDA'
