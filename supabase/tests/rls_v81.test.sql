-- Tester för v81: aktiveringsspärren (Stripe + minst ett paket), verifiering av
-- friskvårdsportaler och passets längd.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v81-pt@test.se', '{"full_name":"Agnes Aktiv"}', '{"role":"trainer"}'),
  ('v81-annan@test.se', '{"full_name":"Bo Bredvid"}', '{"role":"trainer"}');
insert into auth.users (email, raw_user_meta_data) values
  ('v81-klient@test.se', '{"role":"client","full_name":"Klas Klient","health_data_consent":true}'),
  ('v81-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}');
insert into app_admins (user_id) values (test.uid('v81-admin@test.se'));

-- Granskad, färdig profil med pris – men varken Stripe eller paket än.
select set_config('coavira.system', 'on', false);
update trainers set certifications = array['PT-certifikat'], price_per_session = 700, bio = repeat('Erfaren PT. ', 6),
  specialties = '{styrkelyft}', avatar_url = 'https://cdn.test/agnes.jpg'
where id in (test.uid('v81-pt@test.se'), test.uid('v81-annan@test.se'));
select set_config('coavira.system', '', false);

-- ------------------------------------------------------ 1. aktivering ---
select test.eq((select is_pt_activated from trainers where id = test.uid('v81-pt@test.se')), false, 'ny PT är inte aktiverad');
select test.login('v81-pt@test.se');
select test.eq((my_activation_status() ->> 'stripe_charges_enabled')::boolean, false, 'checklistan: Stripe inte klart');
select test.eq((my_activation_status() ->> 'active_packages_count')::int, 0, 'checklistan: inga paket');
select test.fails('update trainers set is_pt_activated = true where id = auth.uid()', 'PT:n kan inte aktivera sig själv');
select test.fails('update trainers set is_published = true where id = auth.uid()', 'utan aktivering syns profilen inte i Hitta PT');
select test.fails($$select create_pt_invite('Kund')$$, 'utan aktivering kan PT:n inte bjuda in klienter');
-- Ett paket räcker inte utan Stripe.
insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (auth.uid(), 'package', 'Fem pass', 5, 3000);
select test.eq((select is_pt_activated from trainers where id = auth.uid()), false, 'paket utan Stripe: fortfarande inte aktiverad');
select test.logout();

-- Stripe godkänner kontot (webhooken via servern).
insert into trainer_payout_accounts (trainer_id, stripe_account_id, details_submitted, charges_enabled)
values (test.uid('v81-pt@test.se'), 'acct_v81agnes01', true, true);
select set_config('coavira.system', 'on', false);
update trainers set stripe_onboarding_complete = true where id = test.uid('v81-pt@test.se');
select set_config('coavira.system', '', false);
select test.eq((select is_pt_activated from trainers where id = test.uid('v81-pt@test.se')), true, 'Stripe + ett aktivt paket = aktiverad');

select test.login('v81-pt@test.se');
select test.eq((my_activation_status() ->> 'is_pt_activated')::boolean, true, 'checklistan: aktiverad');
update trainers set is_published = true where id = auth.uid();
select test.eq((select is_published from trainers where id = auth.uid()), true, 'aktiverad PT kan publicera profilen');
select test.eq((create_pt_invite('Befintlig kund') ->> 'code') like 'EX-%', true, 'aktiverad PT kan bjuda in klienter');
select code as invite_code from pt_invites where pt_id = auth.uid() limit 1 \gset
select test.logout();

select test.login('v81-klient@test.se');
select test.eq((select count(*) from trainers where id = test.uid('v81-pt@test.se')), 1::bigint, 'aktiverad PT syns för klienter');
select test.eq((select count(*) from marketplace_trainers where id = test.uid('v81-pt@test.se')), 1::bigint, 'och i marknadsplatsvyn');
select test.logout();

-- Sista paketet pausas: profilen döljs direkt och inbjudningar låses.
select test.login('v81-pt@test.se');
update trainer_services set active = false where trainer_id = auth.uid();
select test.eq((select is_pt_activated from trainers where id = auth.uid()), false, 'utan aktivt paket: inte längre aktiverad');
select test.eq((select is_published from trainers where id = auth.uid()), false, 'profilen döljs i Hitta PT');
select test.fails($$select create_pt_invite('Till')$$, 'inbjudningar låses igen');
select test.logout();

select test.login('v81-klient@test.se');
select test.eq((select count(*) from trainers where id = test.uid('v81-pt@test.se')), 0::bigint, 'dold PT syns inte för andra klienter');
select test.eq((select count(*) from marketplace_trainers), 0::bigint, 'marknadsplatsvyn är tom');
select test.fails(format($$select redeem_pt_invite(%L)$$, :'invite_code'), 'en kod från en PT som inte är aktiverad kan inte lösas in');
select test.logout();

-- Paketet tillbaka: synlig igen av sig själv.
select test.login('v81-pt@test.se');
update trainer_services set active = true where trainer_id = auth.uid();
select test.eq((select is_pt_activated and is_published from trainers where id = auth.uid()), true, 'aktivt paket igen: aktiverad och synlig igen automatiskt');
select test.logout();

-- Stripe stänger av kort: dold.
update trainer_payout_accounts set charges_enabled = false where trainer_id = test.uid('v81-pt@test.se');
select test.eq((select is_pt_activated or is_published from trainers where id = test.uid('v81-pt@test.se')), false, 'Stripe tar inte emot kort: dold och inte aktiverad');
update trainer_payout_accounts set charges_enabled = true where trainer_id = test.uid('v81-pt@test.se');
select test.eq((select is_published from trainers where id = test.uid('v81-pt@test.se')), true, 'Stripe tillbaka: synlig igen');

-- ---------------------------------------- 2. friskvårdsportaler ---
select test.login('v81-pt@test.se');
update trainers set accepts_epassi = true where id = auth.uid();
select test.eq((select wellness_verification_status from trainers where id = auth.uid()), 'none', 'portal påslagen: inte verifierad än');
select test.fails($$update trainers set wellness_verification_status = 'verified' where id = auth.uid()$$, 'PT:n kan inte verifiera sig själv');
insert into storage.objects (bucket_id, name) values ('wellness-verifications', auth.uid() || '/bevis.png');
select test.eq((select count(*) from storage.objects where bucket_id = 'wellness-verifications'), 1::bigint, 'PT:n laddar upp beviset i sin egen mapp och kan läsa det');
select test.fails(format($$insert into storage.objects (bucket_id, name) values ('wellness-verifications', %L)$$, test.uid('v81-annan@test.se') || '/fusk.png'),
  'ingen kan ladda upp i någon annans mapp');
select test.fails(format($$select submit_wellness_verification('Agnes PT', %L, false)$$, auth.uid() || '/bevis.png'), 'intygandet är obligatoriskt');
select test.fails($$select submit_wellness_verification('Agnes PT', 'fel/sokvag.png', true)$$, 'beviset måste finnas i den egna mappen');
select test.fails(format($$select submit_wellness_verification('', %L, true)$$, auth.uid() || '/bevis.png'), 'leverantörs-ID krävs');
select test.eq(submit_wellness_verification('Agnes PT (ePassi-ID 4711)', auth.uid() || '/bevis.png', true), 'pending', 'inskickad: granskas');
select test.eq((select wellness_verification_status from trainers where id = auth.uid()), 'pending', 'statusen är pending');
select test.eq((select wellness_attested_at is not null and portals = array['epassi'] from trainer_wellness_verifications where trainer_id = auth.uid()), true,
  'intygandets tidpunkt och portalerna sparas');
select test.fails($$select * from admin_list_wellness_verifications()$$, 'PT:er kan inte lista verifieringar');
select test.fails(format($$select admin_review_wellness_verification(%L, true)$$, auth.uid()), 'PT:er kan inte godkänna');
select test.logout();

select test.login('v81-annan@test.se');
select test.eq((select count(*) from storage.objects where bucket_id = 'wellness-verifications'), 0::bigint, 'andra PT:er ser inte beviset');
select test.eq((select count(*) from trainer_wellness_verifications), 0::bigint, 'eller verifieringen');
select test.logout();
select test.login('v81-klient@test.se');
select test.eq((select count(*) from storage.objects where bucket_id = 'wellness-verifications'), 0::bigint, 'klienter ser inte beviset');
select test.eq((select count(*) from trainer_wellness_verifications), 0::bigint, 'eller leverantörs-ID:t');
select test.eq((select wellness_verification_status from trainers where id = test.uid('v81-pt@test.se')), 'pending', 'klienter ser bara statusen (för badgen)');
select test.logout();

select test.login('v81-admin@test.se');
select test.eq((select count(*) from storage.objects where bucket_id = 'wellness-verifications'), 1::bigint, 'admin kan läsa beviset');
select test.eq((select count(*) from admin_list_wellness_verifications('pending')), 1::bigint, 'admin ser inskickade verifieringar');
select test.fails(format($$select admin_review_wellness_verification(%L, false, '')$$, test.uid('v81-pt@test.se')), 'nekande kräver ett skäl');
select test.eq(admin_review_wellness_verification(test.uid('v81-pt@test.se'), true), 'verified', 'admin godkänner med ett klick');
select test.logout();
select test.eq((select wellness_verification_status from trainers where id = test.uid('v81-pt@test.se')), 'verified', 'PT:n är verifierad');

-- Ny portal efter granskningen: måste verifieras igen.
select test.login('v81-pt@test.se');
update trainers set accepts_benifex = true where id = auth.uid();
select test.eq((select wellness_verification_status from trainers where id = auth.uid()), 'none', 'ny portal: verifieringen gäller inte längre');
select test.eq(submit_wellness_verification('Agnes PT', auth.uid() || '/bevis.png', true), 'pending', 'skickas in igen med båda portalerna');
select test.eq((select portals from trainer_wellness_verifications where trainer_id = auth.uid()), array['epassi', 'benifex'], 'båda portalerna granskas');
select test.logout();
select test.login('v81-admin@test.se');
select test.eq(admin_review_wellness_verification(test.uid('v81-pt@test.se'), false, 'Skärmdumpen visar inte Benifex'), 'rejected', 'admin kan neka med skäl');
select test.logout();
select test.eq((select status || ':' || review_note from trainer_wellness_verifications where trainer_id = test.uid('v81-pt@test.se')),
  'rejected:Skärmdumpen visar inte Benifex', 'skälet sparas för PT:n');

-- ----------------------------------------------------- 3. passets längd ---
insert into scheduled_workouts (client_id, date, name, exercises)
values (test.uid('v81-klient@test.se'), current_date, 'Ben', '[]');
select test.login('v81-klient@test.se');
update scheduled_workouts set status = 'completed', completed_at = now(), duration_seconds = 2880 where client_id = auth.uid();
select test.eq((select duration_seconds from scheduled_workouts where client_id = auth.uid()), 2880, 'klienten sparar passets längd när passet avslutas');
select test.fails('update scheduled_workouts set duration_seconds = 90000 where client_id = auth.uid()', 'orimlig längd (över 24 h) stoppas');
select test.logout();
