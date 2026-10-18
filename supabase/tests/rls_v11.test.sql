-- Tester för v11: tjänster, köp, passgräns, kostlås, recept och certifikat.
-- Körs efter att v1–v10-testerna skapat data och migration v11 körts ovanpå
-- (som i produktion), så att även övergången för befintliga klienter testas.
\set ON_ERROR_STOP on
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

-- ---------------------------------------------------- befintliga klienter ---
select test.eq((select count(*) > 0 from purchases where kind = 'legacy' and status = 'paid'), true,
  'befintliga relationer får ett köp för redan schemalagda pass');
select test.eq((select bool_and(b.remaining = 0) from purchases p cross join lateral session_balance(p.trainer_id, p.client_id) b where p.kind = 'legacy'), true,
  'befintliga klienter har inga extra pass – nya pass kräver köp');

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('pt11@test.se', '{"role":"trainer","full_name":"Maja Tränare"}', '{"role":"trainer"}'),
  ('c12@test.se', '{"role":"client","full_name":"Klient Tolv","health_data_consent":true}', '{}'),
  ('c13@test.se', '{"role":"client","full_name":"Klient Tretton","health_data_consent":true}', '{}');

-- ------------------------------------------------------------ certifikat ---
select test.login('pt11@test.se');
update trainers set is_published = true, price_per_session = 800, city = 'Göteborg', specialties = '{hyrox}' where id = auth.uid();
select test.fails($$update trainers set certifications = '{"Påhittad licens"}' where id = auth.uid()$$,
  'PT kan inte lägga till certifikat själv');
select test.fails($$select admin_set_certifications('pt11@test.se', '{"X"}')$$, 'PT kan inte anropa admin-funktionen');
select test.logout();
select admin_set_certifications('pt11@test.se', array['PT-licens', '  ', 'Kostrådgivare']);
select test.eq((select certifications from trainers where id = test.uid('pt11@test.se')), array['PT-licens', 'Kostrådgivare'],
  'admin sätter verifierade certifikat');

-- -------------------------------------------------------------- tjänster ---
select test.login('pt11@test.se');
insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, price_sek) values
  (auth.uid(), 'single', 'Enstaka pass', 1, false, 800),
  (auth.uid(), 'package', 'Program 5 pass', 5, false, 3500),
  (auth.uid(), 'nutrition', 'Kostcoaching', 0, true, 900),
  (auth.uid(), 'full', 'Helhetspaket', 6, true, 5500);
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (auth.uid(), 'single', 'Gratis', 1, 0)$$,
  'tjänster kan inte vara gratis');
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (auth.uid(), 'package', 'Fel paket', 1, 100)$$,
  'ett paket måste ha minst två pass');
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, price_sek) values (auth.uid(), 'nutrition', 'Kost med pass', 3, true, 100)$$,
  'ren kostcoaching har inga pass');
select test.logout();

select test.login('c12@test.se');
select test.eq((select count(*) from trainer_services where trainer_id = test.uid('pt11@test.se')), 4::bigint, 'klienten ser PT:ns tjänster');
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (test.uid('pt11@test.se'), 'single', 'Hack', 1, 1)$$,
  'klienten kan inte skapa tjänster');
select test.fails($$insert into purchases (checkout_id, client_id, trainer_id, kind, title, sessions, price_sek, status)
  values (gen_random_uuid(), auth.uid(), test.uid('pt11@test.se'), 'package', 'Fejk', 50, 0, 'paid')$$, 'klienten kan inte skapa betalda köp');

-- ------------------------------------------------------------------ köp ---
select (create_checkout(array(select id from trainer_services where trainer_id = test.uid('pt11@test.se') and kind = 'package')))->>'checkout_id' as co1 \gset
select test.eq((select status::text from purchases where checkout_id = :'co1'), 'pending', 'kassan skapas som obetald');
select test.eq((select price_sek from purchases where checkout_id = :'co1'), 3500, 'priset hämtas från tjänsten');
select test.fails($$update purchases set status = 'paid'$$, 'klienten kan inte markera köp som betalda');
select test.fails($$select mark_checkout_paid('$$ || :'co1' || $$', null, null, null)$$, 'klienten kan inte anropa betalningsfunktionen');
select test.eq((select count(*) from coaching_relationships where client_id = auth.uid()), 0::bigint, 'ingen relation före betalning');
select test.logout();

select test.login('pt11@test.se');
select test.eq((select count(*) from purchases where checkout_id = :'co1'), 1::bigint, 'PT:n ser klientens köp');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (test.uid('c12@test.se'), auth.uid(), 'Pass', current_date, '[]')$$,
  'PT kan inte schemalägga pass för en klient som inte betalat');
select test.logout();

-- Webhooken (service role) markerar kassan som betald.
set role service_role;
select test.fails($$select mark_checkout_paid('$$ || :'co1' || $$', 'cs_1', 'pi_1', 100)$$, 'fel belopp avvisas');
select test.eq(mark_checkout_paid(:'co1', 'cs_1', 'pi_1', 3500), 1, 'kassan markeras som betald');
select test.eq(mark_checkout_paid(:'co1', 'cs_1', 'pi_1', 3500), 0, 'betalningen är idempotent');
reset role;

select test.eq((select status::text from coaching_relationships where client_id = test.uid('c12@test.se') and trainer_id = test.uid('pt11@test.se')),
  'active', 'betalningen gör klienten till aktiv klient hos PT:n');

-- ------------------------------------------------------------- passgräns ---
select test.login('pt11@test.se');
select test.eq((select remaining from session_balance(auth.uid(), test.uid('c12@test.se'))), 5, '5 betalda pass kvar');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises)
select test.uid('c12@test.se'), auth.uid(), 'Pass ' || g, current_date + g, '[]' from generate_series(1, 4) g;
-- Ett femte pass som bokad tid i kalendern (utan kopplat träningspass).
insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time)
values (auth.uid(), test.uid('c12@test.se'), 'confirmed', 'PT-pass', now() + interval '20 days', now() + interval '20 days 1 hour')
returning id as ev5 \gset
select test.eq((select remaining from session_balance(auth.uid(), test.uid('c12@test.se'))), 0, 'alla 5 pass använda');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (test.uid('c12@test.se'), auth.uid(), 'Pass 6', current_date, '[]')$$,
  'pass 6 kan inte schemaläggas');
select test.fails($$insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time)
  values (auth.uid(), test.uid('c12@test.se'), 'pending', 'Extra', now() + interval '21 days', now() + interval '21 days 1 hour')$$,
  'pass 6 kan inte bokas i kalendern');
-- Egna pass utan klient och blockeringar påverkas inte.
insert into calendar_events (trainer_id, kind, status, title, start_time, end_time)
values (auth.uid(), 'block', 'confirmed', 'Lunch', now() + interval '22 days', now() + interval '22 days 1 hour');
-- Avbokning ger tillbaka passet; att återuppliva ett avbokat pass kräver ett ledigt pass.
update calendar_events set status = 'cancelled' where id = :'ev5';
select test.eq((select remaining from session_balance(auth.uid(), test.uid('c12@test.se'))), 1, 'avbokat pass ger tillbaka ett pass');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (test.uid('c12@test.se'), auth.uid(), 'Pass 5', current_date, '[]');
select test.fails($$update calendar_events set status = 'confirmed' where id = '$$ || :'ev5' || $$'$$, 'avbokat pass kan inte återupplivas utan pass kvar');
select test.logout();

select test.login('c13@test.se');
select test.eq((select count(*) from session_balance(test.uid('pt11@test.se'), test.uid('c12@test.se'))), 0::bigint, 'andra ser inte parets saldo');
select test.logout();

-- ---------------------------------------------------------------- kostlås ---
select test.login('pt11@test.se');
select test.fails($$insert into nutrition_plans (trainer_id, client_id, name, kcal, protein_g, carbs_g, fat_g) values (auth.uid(), test.uid('c12@test.se'), 'Plan', 2000, 150, 200, 60)$$,
  'kostplan kräver köpt kostcoaching');
select test.logout();

select test.login('c12@test.se');
select (create_checkout(array(select id from trainer_services where trainer_id = test.uid('pt11@test.se') and kind = 'nutrition')))->>'checkout_id' as co2 \gset
select test.logout();
set role service_role;
select mark_checkout_paid(:'co2', 'cs_2', 'pi_2', 900);
reset role;

select test.login('pt11@test.se');
insert into nutrition_plans (trainer_id, client_id, name, kcal, protein_g, carbs_g, fat_g) values (auth.uid(), test.uid('c12@test.se'), 'Plan', 2000, 150, 200, 60);
select test.eq((select remaining from session_balance(auth.uid(), test.uid('c12@test.se'))), 0, 'kostcoaching ger inga extra pass');
select test.logout();
select test.login('c12@test.se');
select test.eq((select count(*) from nutrition_plans), 1::bigint, 'klienten ser kostplanen efter köp');
select test.logout();

-- Återbetalning: kosten låses igen.
set role service_role;
select test.eq(mark_checkout_refunded('pi_2'), 1, 'återbetalning registreras');
reset role;
select test.login('c12@test.se');
select test.eq((select count(*) from nutrition_plans), 0::bigint, 'kostplanen låses efter återbetalning');
select test.logout();

-- ------------------------------------------------------- en PT i taget ---
select test.login('pt10@test.se');
update trainers set is_published = true where id = auth.uid();
insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (auth.uid(), 'single', 'Pass hos PT Tio', 1, 750);
select test.logout();
select test.login('c12@test.se');
select test.fails($$select create_checkout(array(select id from trainer_services where trainer_id = test.uid('pt10@test.se')))$$,
  'kassa hos en annan PT nekas när man redan har en aktiv PT');
select test.fails($$select create_checkout('{}')$$, 'tom kassa nekas');
select test.logout();
select test.login('pt11@test.se');
select test.fails($$select create_checkout(array(select id from trainer_services where trainer_id = auth.uid()))$$, 'PT:er kan inte köpa');
select test.logout();

-- ----------------------------------------------------------------- recept ---
select test.login('pt11@test.se');
insert into recipes (trainer_id, name, items) values (auth.uid(), 'Proteinfrukost', '[{"name":"Ägg","grams":120,"unit":"st","qty":2}]');
select test.eq((select count(*) from recipes), 1::bigint, 'PT sparar ett recept');
select test.logout();
select test.login('pt10@test.se');
select test.eq((select count(*) from recipes), 0::bigint, 'andra PT:er ser inte receptet');
select test.fails($$insert into recipes (trainer_id, name) values (test.uid('pt11@test.se'), 'Hack')$$, 'kan inte skapa recept åt någon annan');
select test.logout();

\warn 'ALLA V11-TESTER (TJÄNSTER, KÖP, PASSGRÄNS, KOST) GODKÄNDA'
