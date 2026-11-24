-- Tester för v76: PT:er registrerar sig själva, introts steg och granskning före Hitta PT.
\set ON_ERROR_STOP on

-- Självregistrering (signUp från appen): allt från steg 1 sparas direkt.
insert into auth.users (email, raw_user_meta_data) values
  ('v76-pt@test.se', jsonb_build_object(
     'pt_signup', true, 'first_name', 'Petra', 'last_name', 'Självreg', 'terms_version', legal_version(),
     'company_name', 'Petra PT AB', 'org_number', '5591234561', 'company_address', 'Gatan 1, 111 22 Stockholm',
     'accepts_epassi', true, 'accepts_edenred', true)),
  ('v76-gammal@test.se', jsonb_build_object('pt_signup', true, 'first_name', 'Gustav', 'last_name', 'Gammal', 'terms_version', '1999-01', 'org_number', '559123-4562')),
  ('v76-fusk@test.se', '{"role":"trainer","full_name":"Fuskar Fredrik"}'),
  ('v76-klient@test.se', '{"role":"client","full_name":"Klara Klient","health_data_consent":true}');
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v76-admin-pt@test.se', '{"full_name":"Ada Adminskapad"}', '{"role":"trainer"}');

select test.eq((select role::text from profiles where id = test.uid('v76-pt@test.se')), 'trainer', 'självregistrering med pt_signup ger ett PT-konto');
select test.eq((select raw_app_meta_data ->> 'role' from auth.users where email = 'v76-pt@test.se'), 'trainer', 'rollen speglas i app_metadata');
select test.eq((select first_name || ' ' || last_name from profiles where id = test.uid('v76-pt@test.se')), 'Petra Självreg', 'för- och efternamn sparas');
select test.eq((select pt_onboarding_step from trainers where id = test.uid('v76-pt@test.se')), 2::smallint, 'steg 1 är klart direkt – nästa steg är utbetalningar');
select test.eq((select pt_onboarding_completed from trainers where id = test.uid('v76-pt@test.se')), false, 'introt är inte klart');
select test.eq((select org_number from trainer_business where trainer_id = test.uid('v76-pt@test.se')), '559123-4561', 'företagsuppgifterna sparas (organisationsnumret normaliserat)');
select test.eq((select accepts_epassi and accepts_edenred and not accepts_benifex from trainers where id = test.uid('v76-pt@test.se')), true, 'portalavtalen sparas');
select test.eq(terms_accepted(test.uid('v76-pt@test.se')), true, 'PT-avtalet godkänt i registreringen (nuvarande version)');
select test.eq(terms_accepted(test.uid('v76-gammal@test.se')), false, 'en gammal avtalsversion räknas inte');
select test.eq((select org_number from trainer_business where trainer_id = test.uid('v76-gammal@test.se')), null::text, 'ogiltigt organisationsnummer sparas inte (registreringen går ändå igenom)');
select test.eq((select role from profiles where id = test.uid('v76-fusk@test.se')), null::user_role, 'en "trainer"-roll i user_metadata (utan pt_signup) ignoreras fortfarande');
select test.eq((select count(*) from trainers where id = test.uid('v76-fusk@test.se')), 0::bigint, 'och ger ingen PT-profil');
select test.eq((select pt_onboarding_completed from trainers t join profiles p on p.id = t.id where p.onboarding_completed limit 1), true,
  'PT:er som redan gjort introt är klara (bakåtkompatibelt)');

-- --------------------------------------------------------------- introt ---
select test.login('v76-pt@test.se');
select test.eq(set_pt_onboarding_step(3), 3, 'PT:n sparar sitt steg');
select test.eq((select pt_onboarding_step from trainers where id = auth.uid()), 3::smallint, 'steget finns kvar (t.ex. efter Stripe)');
select test.fails('update trainers set pt_onboarding_completed = true where id = auth.uid()', 'PT:n kan inte markera introt som klart själv');
select test.fails('select set_pt_onboarding_step(4)', 'okända steg stoppas');
select test.eq((finish_pt_onboarding() ->> 'completed')::boolean, true, 'introt kan avslutas utan Stripe och profilbild');
select test.eq((select pt_onboarding_completed from trainers where id = auth.uid()), true, 'introt är klart');
select test.logout();
select test.eq((select onboarding_completed from profiles where id = test.uid('v76-pt@test.se')), true, 'appen öppnas (flaggan som speglas i JWT:n)');

select test.login('v76-gammal@test.se');
select test.fails('select finish_pt_onboarding()', 'introt kräver godkänt PT-avtal');
select test.logout();

select test.login('v76-klient@test.se');
select test.fails('select set_pt_onboarding_step(2)', 'klienter har inget PT-intro');
select test.fails('select finish_pt_onboarding()', 'klienter kan inte avsluta PT-introt');
select test.logout();

-- Coavira-skapad PT: steg 1 är namn och portalavtal.
select test.login('v76-admin-pt@test.se');
select test.eq(save_pt_account_step('Ada', 'Adminskapad', false, true, false), 2, 'steg 1 för Coavira-skapade PT:er');
select test.eq((select first_name || ' ' || last_name from profiles where id = auth.uid()), 'Ada Adminskapad', 'namnet sparas');
select test.eq((select accepts_benifex from trainers where id = auth.uid()), true, 'portalavtalet sparas');
select test.fails($$select save_pt_account_step('', 'X', false, false, false)$$, 'förnamn krävs');
select test.logout();

-- ------------------------------------------------- granskning före Hitta PT ---
select set_config('coavira.system', 'on', false);
update trainers set stripe_onboarding_complete = true, price_per_session = 700 where id = test.uid('v76-pt@test.se');
select set_config('coavira.system', '', false);
select test.login('v76-pt@test.se');
select test.fails('update trainers set is_published = true where id = auth.uid()', 'profilen kan inte publiceras före granskningen av certifikaten');
select test.logout();
-- Systemet (t.ex. Stripe-webhooken) försöker publicera: profilen hålls dold i stället för ett fel.
update trainers set is_published = true where id = test.uid('v76-pt@test.se');
select test.eq((select is_published from trainers where id = test.uid('v76-pt@test.se')), false, 'systemet publicerar inte en ogranskad PT');
update trainers set certifications = array['PT-certifikat (granskat)'] where id = test.uid('v76-pt@test.se');
select test.login('v76-pt@test.se');
update trainers set is_published = true where id = auth.uid();
select test.eq((select is_published from trainers where id = auth.uid()), true, 'efter granskningen kan PT:n publicera profilen');
select test.logout();
