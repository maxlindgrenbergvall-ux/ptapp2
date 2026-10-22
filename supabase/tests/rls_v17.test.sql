-- Tester för v17: antal enstaka pass, serviceavgift 7 % och säkerheten vid öppen registrering.
-- Körs efter v16-testerna (pt16 med tjänster, klienterna c16/c17).
\set ON_ERROR_STOP on
grant usage on schema test to service_role, anon;
grant execute on all functions in schema test to service_role, anon;

select test.eq(service_fee_sek(1000), 70, 'serviceavgift 7 % av 1 000 kr = 70 kr');
select test.eq(service_fee_sek(950), 67, 'avrundas till hela kronor (66,5 → 67)');
select test.eq(service_fee_sek(3150), 221, '7 % av 3 150 kr = 220,5 → 221 kr');

select id as s_single from trainer_services where trainer_id = test.uid('pt16@test.se') and title = 'Enstaka pass' \gset
select id as s_pkg from trainer_services where trainer_id = test.uid('pt16@test.se') and title = 'Program 5 pass' \gset
select id as s_food from trainer_services where trainer_id = test.uid('pt16@test.se') and title = 'Kostcoaching' \gset

-- -------------------------------------------------- antal i varukorgen ---
select test.login('c17@test.se');
insert into cart_items (client_id, service_id, trainer_id, quantity) values (auth.uid(), :'s_single', test.uid('pt16@test.se'), 3);
select test.eq((select quantity from cart_items where service_id = :'s_single'), 3, 'klienten lägger 3 enstaka pass i varukorgen');
update cart_items set quantity = 5 where service_id = :'s_single';
select test.eq((select quantity from cart_items where service_id = :'s_single'), 5, 'klienten ändrar antalet');
select test.fails($$update cart_items set quantity = 21 where service_id = '$$ || :'s_single' || $$'$$, 'högst 20 st');
select test.fails($$update cart_items set quantity = 0 where service_id = '$$ || :'s_single' || $$'$$, 'minst 1 st');
select test.fails($$insert into cart_items (client_id, service_id, trainer_id, quantity) values (auth.uid(), '$$ || :'s_pkg' || $$', test.uid('pt16@test.se'), 2)$$,
  'paket kan inte köpas i flera exemplar');
select test.fails($$update cart_items set reminded_at = now()$$, 'klienten kan bara ändra antalet, inte påminnelsestatus');
select test.fails($$update cart_items set trainer_id = test.uid('pt17@test.se')$$, 'klienten kan inte flytta en rad till en annan PT');
select test.logout();
select test.login('c16@test.se');
update cart_items set quantity = 9 where client_id = test.uid('c17@test.se');
select test.logout();
select test.eq((select quantity from cart_items where client_id = test.uid('c17@test.se') and service_id = :'s_single'), 5,
  'en annan klient kan inte ändra varukorgen');

-- ------------------------------------------------ kassa med antal + avgift ---
select test.login('c17@test.se');
select test.fails($$select create_checkout(array['$$ || :'s_pkg' || $$']::uuid[], array[2])$$, 'antal > 1 bara för enstaka pass i kassan');
select test.fails($$select create_checkout(array['$$ || :'s_single' || $$']::uuid[], array[21])$$, 'högst 20 pass per rad');
select test.fails($$select create_checkout(array['$$ || :'s_single' || $$', '$$ || :'s_food' || $$']::uuid[], array[2])$$, 'antal måste finnas för varje tjänst');
select test.fails($$select create_checkout(array['$$ || :'s_single' || $$', '$$ || :'s_single' || $$']::uuid[])$$, 'samma tjänst två gånger avvisas');
select create_checkout(array[:'s_single', :'s_food']::uuid[], array[3, 1]) as co \gset
select test.eq((:'co'::jsonb)->>'subtotal_sek', '3150', 'deltotal: 3 × 750 + 900 = 3 150 kr');
select test.eq((:'co'::jsonb)->>'service_fee_sek', '221', 'serviceavgift 7 % = 221 kr');
select test.eq((:'co'::jsonb)->>'total_sek', '3371', 'totalt att betala 3 371 kr');
select test.eq((select quantity || ':' || sessions || ':' || price_sek from purchases where checkout_id = ((:'co'::jsonb)->>'checkout_id')::uuid and kind = 'single'),
  '3:3:2250', 'köpet: 3 st, 3 pass, 2 250 kr');
select test.eq((select fee_sek from checkout_fees where checkout_id = ((:'co'::jsonb)->>'checkout_id')::uuid), 221, 'klienten ser sin serviceavgift');
select test.fails($$insert into checkout_fees (checkout_id, client_id, subtotal_sek, fee_percent, fee_sek) values (gen_random_uuid(), auth.uid(), 100, 0, 0)$$,
  'klienten kan inte skriva egna avgifter');
select test.logout();

select test.login('pt16@test.se');
select test.eq((select count(*) from checkout_fees), 0::bigint, 'PT:n ser inte Coaviras serviceavgift');
select test.logout();
select test.login('c16@test.se');
select test.eq((select count(*) from checkout_fees where client_id = test.uid('c17@test.se')), 0::bigint, 'andra klienter ser inte avgiften');
select test.logout();

set role service_role;
select test.fails($$select mark_checkout_paid('$$ || ((:'co'::jsonb)->>'checkout_id') || $$', 'cs_17', 'pi_17', 3150)$$,
  'betalning utan serviceavgiften avvisas');
select test.eq(mark_checkout_paid(((:'co'::jsonb)->>'checkout_id')::uuid, 'cs_17', 'pi_17', 3371), 2, 'betalning inklusive serviceavgift godkänns');
reset role;
select test.eq((select remaining from session_balance(test.uid('pt16@test.se'), test.uid('c17@test.se'))), 3, '3 köpta enstaka pass ger 3 pass att boka');
select test.eq((select count(*) from cart_items where client_id = test.uid('c17@test.se') and service_id = :'s_single'), 0::bigint,
  'betalda pass tas bort ur varukorgen');

-- ===================================== öppen registrering: säkerheten ===
-- Ny användare utan roll (som efter Google/Apple eller e-post) som väljer att bli klient.
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ('ny17@test.se', '{"full_name":"Ny Användare"}', '{}');
select test.login('ny17@test.se');
select test.fails($$select complete_onboarding('trainer', 'Ny Användare', null, false)$$, 'en ny användare kan inte göra sig själv till PT');
select complete_onboarding('client', 'Ny Användare', '0701234567', true);
select test.eq((select role::text from profiles where id = auth.uid()), 'client', 'ny användare blir klient direkt');
-- Bara egen data: inga andras meddelanden, pass, bokningar, köp, kost eller hälsodata.
select test.eq((select count(*) from messages), 0::bigint, 'ser inga meddelanden');
select test.eq((select count(*) from scheduled_workouts), 0::bigint, 'ser inga pass');
select test.eq((select count(*) from set_logs), 0::bigint, 'ser inga loggade set');
select test.eq((select count(*) from calendar_events), 0::bigint, 'ser inga bokningar');
select test.eq((select count(*) from purchases), 0::bigint, 'ser inga köp');
select test.eq((select count(*) from checkout_fees), 0::bigint, 'ser inga avgifter');
select test.eq((select count(*) from cart_items), 0::bigint, 'ser inga varukorgar');
select test.eq((select count(*) from nutrition_plans), 0::bigint, 'ser inga kostscheman');
select test.eq((select count(*) from weight_entries) + (select count(*) from food_entries) + (select count(*) from sleep_logs) + (select count(*) from water_logs), 0::bigint,
  'ser ingen hälsodata');
select test.eq((select count(*) from notifications), 0::bigint, 'ser inga aviseringar');
select test.eq((select count(*) from coaching_relationships), 0::bigint, 'ser inga PT–klient-relationer');
select test.eq((select count(*) from profiles where id <> auth.uid() and role = 'client'), 0::bigint, 'ser inga andra klienters profiler');
select test.eq((select count(*) from trainer_boosts) + (select count(*) from push_tokens), 0::bigint, 'ser inga boostköp eller push-tokens');
select test.fails($$select count(*) from wearable_tokens$$, 'wearable-tokens är helt stängda för användare');
-- PT- och adminfunktioner är låsta.
select test.fails($$select admin_set_certifications('pt16@test.se', '{"X"}')$$, 'kan inte sätta certifikat');
select test.fails($$select admin_make_trainer('ny17@test.se')$$, 'kan inte göra någon till PT');
select test.fails($$select create_boost_checkout()$$, 'kan inte köpa boost');
select test.fails($$select mark_checkout_paid(gen_random_uuid(), null, null, null)$$, 'kan inte markera kassor som betalda');
select test.fails($$select mark_boost_paid(gen_random_uuid(), null, null, null)$$, 'kan inte markera boost som betald');
select test.fails($$select * from abandoned_carts()$$, 'kan inte lista övergivna varukorgar');
select test.fails($$select workout_missing_weights(gen_random_uuid())$$, 'kan inte fråga om andras pass');
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (test.uid('pt16@test.se'), 'single', 'Hack', 1, 1)$$,
  'kan inte skapa tjänster åt en PT');
update trainers set is_published = false, price_per_session = 1 where id = test.uid('pt16@test.se');
select test.logout();
select test.eq((select is_published from trainers where id = test.uid('pt16@test.se')), true, 'kan inte ändra en PT:s profil');

-- Anonyma besökare (bara den publika nyckeln): ingen data och inga hjälpfunktioner.
set role anon;
select test.eq((select count(*) from profiles) + (select count(*) from messages) + (select count(*) from purchases) + (select count(*) from cart_items), 0::bigint,
  'anonyma ser ingen data');
select test.fails($$select can_view_trainer(gen_random_uuid())$$, 'anonyma kan inte anropa RLS-hjälpfunktioner');
select test.fails($$select is_active_trainer_of(gen_random_uuid())$$, 'anonyma kan inte anropa is_active_trainer_of');
select test.fails($$select create_checkout(array[gen_random_uuid()])$$, 'anonyma kan inte skapa kassor');
reset role;

-- Alla tabeller i public har RLS påslagen.
select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'alla tabeller har RLS');

\warn 'ALLA V17-TESTER (ANTAL, SERVICEAVGIFT, ÖPPEN REGISTRERING) GODKÄNDA'
