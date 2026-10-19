-- Tester för v12: flera PT:er, lämna PT, ett aktivt kostschema, PT-utbud,
-- intressen och mätpunkter. Körs efter v11-testerna (pt11/c12 m.fl. finns).
\set ON_ERROR_STOP on
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('pt12@test.se', '{"role":"trainer","full_name":"Kost Karin"}', '{"role":"trainer"}'),
  ('pt13@test.se', '{"role":"trainer","full_name":"Cykel Calle"}', '{"role":"trainer"}'),
  ('c14@test.se', '{"role":"client","full_name":"Klient Fjorton","health_data_consent":true}', '{}');

-- ---------------------------------------------------------- PT-utbud ---
select test.login('pt12@test.se');
update trainers set is_published = true, price_per_session = 900, city = 'Lund', offers_training = false where id = auth.uid();
select test.fails($$update trainers set offers_nutrition = false where id = auth.uid()$$, 'en PT måste erbjuda träning eller kost');
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (auth.uid(), 'package', 'Pass', 5, 3000)$$,
  'kost-PT kan inte sälja träningspass');
insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, price_sek) values (auth.uid(), 'nutrition', 'Kostcoaching', 0, true, 1200);
select test.logout();

select test.login('pt13@test.se');
update trainers set is_published = true, price_per_session = 700, city = 'Malmö', offers_nutrition = false where id = auth.uid();
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, price_sek) values (auth.uid(), 'nutrition', 'Kost', 0, true, 900)$$,
  'tränings-PT kan inte sälja kost');
insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (auth.uid(), 'package', 'Cykelprogram', 4, 2400);
select test.logout();

-- pt11 (har både träning och kost sedan v11) slutar erbjuda kost → kosttjänsterna pausas.
select test.login('pt11@test.se');
update trainers set offers_nutrition = false where id = auth.uid();
select test.eq((select count(*) from trainer_services where trainer_id = auth.uid() and includes_nutrition and active), 0::bigint,
  'kosttjänster pausas när PT:n slutar erbjuda kost');
update trainers set offers_nutrition = true where id = auth.uid();
update trainer_services set active = true where trainer_id = auth.uid();
select test.logout();

-- ------------------------------------------------- flera PT:er samtidigt ---
-- c12 är aktiv klient hos pt11 (v11). Köper också hos pt12 (kost) och pt13 (cykel).
select test.login('c12@test.se');
select (create_checkout(array(select id from trainer_services where trainer_id = test.uid('pt12@test.se'))))->>'checkout_id' as co_k \gset
select test.logout();
set role service_role;
select mark_checkout_paid(:'co_k', 'cs_k', 'pi_k', 1200);
reset role;
select test.login('c12@test.se');
select (create_checkout(array(select id from trainer_services where trainer_id = test.uid('pt13@test.se'))))->>'checkout_id' as co_c \gset
select test.logout();
set role service_role;
select mark_checkout_paid(:'co_c', 'cs_c', 'pi_c', 2400);
reset role;
select test.eq((select count(*) from coaching_relationships where client_id = test.uid('c12@test.se') and status = 'active'), 3::bigint,
  'klienten kan ha tre aktiva PT:er samtidigt');

-- Varje PT ändrar bara sina egna pass, men ser klientens träning.
select test.login('pt13@test.se');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (test.uid('c12@test.se'), auth.uid(), 'Intervaller', current_date + 1, '[]');
select test.eq((select count(*) > 1 from scheduled_workouts where client_id = test.uid('c12@test.se')), true, 'PT ser klientens pass från andra PT:er');
update scheduled_workouts set name = 'Kapad' where client_id = test.uid('c12@test.se') and trainer_id = test.uid('pt11@test.se');
select test.eq((select count(*) from scheduled_workouts where name = 'Kapad'), 0::bigint, 'PT kan inte ändra en annan PT:s pass');
select test.logout();

-- Chatt: en tråd per PT. PT:er ser inte varandras meddelanden.
select test.login('c12@test.se');
insert into messages (client_id, sender_id, trainer_id, body) values (auth.uid(), auth.uid(), test.uid('pt11@test.se'), 'Hej styrke-PT');
insert into messages (client_id, sender_id, trainer_id, body) values (auth.uid(), auth.uid(), test.uid('pt13@test.se'), 'Hej cykel-PT');
select test.fails($$insert into messages (client_id, sender_id, trainer_id, body) values (auth.uid(), auth.uid(), test.uid('pt10@test.se'), 'Främling')$$,
  'klienten kan bara skriva till sina egna PT:er');
select test.logout();
select test.login('pt13@test.se');
select test.eq((select string_agg(body, ',') from messages where client_id = test.uid('c12@test.se')), 'Hej cykel-PT', 'PT ser bara sin egen tråd');
insert into messages (client_id, sender_id, body) values (test.uid('c12@test.se'), auth.uid(), 'Svar utan trainer_id');
select test.eq((select trainer_id from messages where body = 'Svar utan trainer_id'), auth.uid(), 'trainer_id sätts automatiskt för PT:ns meddelanden');
select test.logout();

-- Samtal: kanal per par.
select test.login('c12@test.se');
select test.eq(can_access_call('call:' || auth.uid() || ':' || test.uid('pt13@test.se')), true, 'klienten når samtalskanalen med sin PT');
select test.eq(can_access_call('call:' || auth.uid() || ':' || test.uid('pt10@test.se')), false, 'men inte med en främmande PT');
select test.eq(can_access_call('call:' || auth.uid()), false, 'gamla kanalnamn utan PT nekas');
select test.logout();
select test.login('pt13@test.se');
select test.eq(can_access_call('call:' || test.uid('c12@test.se') || ':' || test.uid('pt11@test.se')), false, 'PT kan inte lyssna på en annan PT:s samtal');
select test.logout();

-- ---------------------------------------------------- ett aktivt kostschema ---
-- c12 har kost hos pt11 (v11, återbetald → köp igen) och pt12.
select test.login('c12@test.se');
select (create_checkout(array(select id from trainer_services where trainer_id = test.uid('pt11@test.se') and kind = 'nutrition')))->>'checkout_id' as co_n \gset
select test.logout();
set role service_role;
select mark_checkout_paid(:'co_n', 'cs_n', 'pi_n', 900);
reset role;

select test.login('pt11@test.se');
insert into nutrition_plans (trainer_id, client_id, name, kcal, protein_g, carbs_g, fat_g, is_active)
values (auth.uid(), test.uid('c12@test.se'), 'Styrkekost', 2600, 160, 300, 80, true) returning id as plan_a \gset
select test.logout();
select test.login('pt12@test.se');
insert into nutrition_plans (trainer_id, client_id, name, kcal, protein_g, carbs_g, fat_g, is_active)
values (auth.uid(), test.uid('c12@test.se'), 'Kost från Karin', 2200, 140, 240, 70, true) returning id as plan_b \gset
select test.eq((select is_active from nutrition_plans where id = :'plan_b'), false, 'en andra PT:s schema blir ett förslag (inte aktivt)');
select test.eq((select count(*) from nutrition_plans where client_id = test.uid('c12@test.se') and is_active), 1::bigint, 'andra PT:er ser vilket schema som gäller');
update nutrition_plans set kcal = 1 where id = :'plan_a';
select test.eq((select kcal from nutrition_plans where id = :'plan_a'), 2600, 'PT kan inte ändra en annan PT:s schema');
select test.logout();

select test.login('c12@test.se');
select test.eq((select count(*) from nutrition_plans), 3::bigint, 'klienten ser aktivt schema, tidigare schema och förslag');
select choose_nutrition_plan(:'plan_b');
select test.eq((select string_agg(name, ',') from nutrition_plans where is_active), 'Kost från Karin', 'klienten väljer vilket schema som gäller');
select test.eq((select count(*) from nutrition_plans where is_active), 1::bigint, 'bara ett aktivt kostschema');
select test.logout();

-- PT:n kan inte "ta tillbaka" aktiveringen genom att spara igen.
select test.login('pt11@test.se');
update nutrition_plans set is_active = true, kcal = 2700 where id = :'plan_a';
select test.eq((select is_active from nutrition_plans where id = :'plan_a'), false, 'PT kan inte aktivera sitt schema över klientens val');
select test.logout();

-- -------------------------------------------------------------- lämna PT ---
select test.login('pt12@test.se');
select test.fails($$insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time)
  values (auth.uid(), test.uid('c12@test.se'), 'pending', 'Pass', now() + interval '3 days', now() + interval '3 days 1 hour')$$,
  'kost-PT utan sålda pass kan inte boka träningspass');
select test.logout();
select test.login('c12@test.se');
select end_coaching(test.uid('pt12@test.se'));
select test.eq((select status::text from coaching_relationships where client_id = auth.uid() and trainer_id = test.uid('pt12@test.se')), 'ended', 'klienten kan lämna en PT');
select test.eq((select count(*) from nutrition_plans where is_active), 0::bigint, 'den lämnade PT:ns schema slutar gälla');
select test.fails($$select choose_nutrition_plan('$$ || :'plan_b' || $$')$$, 'ett schema från en lämnad PT kan inte väljas');
select test.fails($$select end_coaching(test.uid('pt12@test.se'))$$, 'går inte att lämna samma PT två gånger');
select test.logout();
select test.login('pt12@test.se');
select test.eq((select count(*) from scheduled_workouts where client_id = test.uid('c12@test.se')), 0::bigint, 'lämnad PT ser ingen träningsdata');
select test.eq((select count(*) from messages where client_id = test.uid('c12@test.se')), 0::bigint, 'lämnad PT ser inte chatten');
select test.fails($$update coaching_relationships set status = 'active' where client_id = test.uid('c12@test.se') and trainer_id = auth.uid()$$,
  'PT kan inte återaktivera en relation som klienten avslutat');
select test.logout();
select test.eq((select status::text from coaching_relationships where client_id = test.uid('c12@test.se') and trainer_id = test.uid('pt12@test.se')), 'ended',
  'relationen förblir avslutad');

-- ------------------------------------------------- intressen och mätpunkter ---
select test.login('c12@test.se');
update profiles set interests = '{cykling,styrkelyft}', focus = 'Under 15 min på milen' where id = auth.uid();
select test.fails($$update profiles set interests = '{"DROP TABLE"}' where id = auth.uid()$$, 'ogiltiga intressen stoppas');
insert into progress_entries (metric, value, date) values ('cykling_10km', 1080, current_date - 7), ('cykling_10km', 1020, current_date);
select test.eq((select min(value) from progress_entries where metric = 'cykling_10km'), 1020.00, 'klienten loggar mätpunkter');
select test.fails($$insert into progress_entries (client_id, metric, value) values (test.uid('c14@test.se'), 'cykling_10km', 1)$$, 'kan inte logga åt någon annan');
select test.logout();
select test.login('pt13@test.se');
select test.eq((select interests from profiles where id = test.uid('c12@test.se')), '{cykling,styrkelyft}'::text[], 'PT ser klientens intressen');
select test.eq((select count(*) from progress_entries where client_id = test.uid('c12@test.se')), 2::bigint, 'PT ser klientens mätpunkter');
select test.logout();
select test.login('pt12@test.se');
select test.eq((select count(*) from progress_entries where client_id = test.uid('c12@test.se')), 0::bigint, 'lämnad PT ser inga mätpunkter');
select test.logout();

\warn 'ALLA V12-TESTER (FLERA PT, KOSTSCHEMA, INTRESSEN) GODKÄNDA'
