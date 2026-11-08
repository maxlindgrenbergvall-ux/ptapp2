-- Tester för v44: säkerhetshärdning + regressionstest från penetrationstestet.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v44-pt@test.se', '{"role":"trainer","full_name":"Säker PT"}', '{"role":"trainer"}'),
  ('v44-klient@test.se', '{"role":"client","full_name":"Säker Klient","health_data_consent":true}', '{}'),
  ('v44-angripare@test.se', '{"role":"client","full_name":"Ange Ripare","health_data_consent":true}', '{}'),
  ('v44-ond-pt@test.se', '{"role":"trainer","full_name":"Ond PT"}', '{"role":"trainer"}');
select id as pt from auth.users where email = 'v44-pt@test.se' \gset
select id as klient from auth.users where email = 'v44-klient@test.se' \gset
select id as atk from auth.users where email = 'v44-angripare@test.se' \gset
select id as ondpt from auth.users where email = 'v44-ond-pt@test.se' \gset
insert into coaching_relationships (client_id, trainer_id, status) values (:'klient', :'pt', 'active'), (:'atk', :'ondpt', 'active');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises, status) values (:'klient', null, 'Offrets pass', current_date, '[]', 'planned') returning id as w \gset
insert into weight_entries (client_id, date, kg) values (:'klient', current_date, 70);

-- ------------------------------------------- 1. has_health_consent ---
select test.login('v44-angripare@test.se');
select test.eq(has_health_consent(:'klient'), false, 'främmande användares hälsosamtycke går inte att läsa ut');
select test.eq(has_health_consent(auth.uid()), true, 'eget samtycke syns');
select test.logout();
select test.login('v44-pt@test.se');
select test.eq(has_health_consent(:'klient'), true, 'PT:n ser sin klients samtycke');
select test.logout();
select test.eq(has_health_consent(:'klient'), true, 'servern (utan inloggning) ser samtycket');
-- Hälsodata kan fortfarande loggas av klienten och klientens PT (policyerna från v23).
select test.login('v44-klient@test.se');
insert into weight_entries (client_id, date, kg) values (auth.uid(), current_date - 1, 70.4);
select test.eq((select count(*) from weight_entries where client_id = auth.uid()), 2::bigint, 'klienten loggar sin vikt som tidigare');
select test.logout();

-- ------------------------------------------- 2. certifikatadressen ---
select test.login('v44-ond-pt@test.se');
do $$ begin
  update trainers set certifications = array['Fejk'] where id = auth.uid();
  raise exception 'FAIL: certifikat kunde ändras';
exception when insufficient_privilege then
  if sqlerrm not like '%certifiering@coavira.fit%' then raise exception 'FAIL: fel adress i meddelandet: %', sqlerrm; end if;
  raise notice 'ok   certifikat kan inte ändras av PT:n – meddelandet pekar på certifiering@coavira.fit';
end $$;
select test.logout();

-- ------------------------------------------------ 3. anon ---
set role anon;
select test.fails('select 1 from profiles limit 1', 'anon: ingen åtkomst till profiler');
select test.fails('select 1 from trainers limit 1', 'anon: ingen åtkomst till PT-tabellen');
select test.fails('select 1 from messages limit 1', 'anon: ingen åtkomst till meddelanden');
select test.fails('select 1 from weight_entries limit 1', 'anon: ingen åtkomst till hälsodata');
select test.fails($$insert into food_products (name, kcal_100g, source) values ('x', 1, 'custom')$$, 'anon: kan inte skriva');
select test.eq((select count(*) from calendar_feed(repeat('0', 64))), 0::bigint, 'anon: kalenderprenumerationen fungerar (fel token ger inget)');
reset role;

-- ------------------------------ 4. regression: attacker från penetrationstestet ---
select test.login('v44-angripare@test.se');
select test.fails($$update profiles set role = 'trainer' where id = auth.uid()$$, 'klient kan inte göra sig till PT');
select test.fails($$update profiles set coavira_plus_until = now() + interval '10 years' where id = auth.uid()$$, 'klient kan inte ge sig själv Plus');
select test.fails($$insert into trainers (id) values (auth.uid())$$, 'klient kan inte skapa en PT-rad');
select test.fails($$select complete_onboarding('trainer', 'Fake', '0701234567', true)$$, 'klient kan inte registrera sig som PT');
select test.eq((select count(*) from scheduled_workouts where client_id = :'klient'), 0::bigint, 'IDOR: främmande pass syns inte');
select test.eq((select count(*) from weight_entries where client_id = :'klient'), 0::bigint, 'IDOR: främmande vikt syns inte');
update scheduled_workouts set name = 'hackad' where id = :'w';
select test.fails($$insert into purchases (checkout_id, client_id, trainer_id, kind, title, price_sek, status, sessions) values (gen_random_uuid(), auth.uid(), (select id from trainers limit 1), 'session', 'x', 0, 'paid', 100)$$, 'klient kan inte skapa ett betalt köp');
select test.fails(format($$insert into coaching_relationships (client_id, trainer_id, status) values (auth.uid(), %L, 'active')$$, :'pt'), 'klient kan inte skapa en aktiv relation utan betalning');
select test.fails(format($$insert into reviews (trainer_id, author_id, rating, text, author_name) values (%L, auth.uid(), 1, 'Bluff', 'X')$$, :'pt'), 'falska omdömen stoppas');
select test.logout();
select test.eq((select name from scheduled_workouts where id = :'w'), 'Offrets pass', 'IDOR: främmande pass kan inte ändras');
select test.login('v44-ond-pt@test.se');
select test.fails($$update trainers set boosted_until = now() + interval '1 year' where id = auth.uid()$$, 'PT kan inte ge sig själv Boost');
select test.fails($$update trainers set stripe_onboarding_complete = true where id = auth.uid()$$, 'PT kan inte kringgå Stripe-onboardingen');
select test.fails($$update coaching_relationships set acquisition_type = 'EXISTING_CLIENT' where trainer_id = auth.uid()$$, 'PT kan inte sänka avgiften (10 % → 5 %)');
select test.eq((select count(*) from weight_entries where client_id = :'klient'), 0::bigint, 'PT ser inte andra PT:ers klienters hälsodata');
select test.logout();
