-- Tester för v23: säkerhetsgranskningen (samtycke för hälsodata, relationsfrågor,
-- rättigheter och rate limiting).
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('sak-klient@test.se', '{"role":"client","full_name":"Säker Klient","health_data_consent":true}', '{}'),
  ('sak-ingen-roll@test.se', '{"name":"Utan Roll"}', '{}'),
  ('sak-pt@test.se', '{"role":"trainer","full_name":"Säker PT"}', '{"role":"trainer"}'),
  ('sak-annan@test.se', '{"role":"client","full_name":"Annan Klient","health_data_consent":true}', '{}');
select id as klient from auth.users where email = 'sak-klient@test.se' \gset
select id as ingen from auth.users where email = 'sak-ingen-roll@test.se' \gset
select id as pt from auth.users where email = 'sak-pt@test.se' \gset

-- ------------------------------------------- hälsodata kräver samtycke ---
select test.eq((select role is null and health_data_consent_at is null from profiles where id = :'ingen'), true, 'kontot utan roll har inget samtycke');
select test.login('sak-ingen-roll@test.se');
select test.fails($$insert into weight_entries (client_id, date, kg) values (auth.uid(), current_date, 80)$$, 'utan samtycke: vikt sparas inte');
select test.fails($$insert into sleep_logs (client_id, date, hours) values (auth.uid(), current_date, 7)$$, 'utan samtycke: sömn sparas inte');
select test.fails($$insert into water_logs (client_id, date, ml) values (auth.uid(), current_date, 500)$$, 'utan samtycke: vatten sparas inte');
select test.fails($$insert into food_entries (client_id, date, name, kcal) values (auth.uid(), current_date, 'Gröt', 300)$$, 'utan samtycke: mat sparas inte');
select test.fails($$insert into progress_entries (client_id, metric, value, date) values (auth.uid(), 'weight', 80, current_date)$$, 'utan samtycke: mätpunkter sparas inte');
select test.logout();

select test.login('sak-klient@test.se');
insert into weight_entries (client_id, date, kg) values (auth.uid(), current_date, 80);
insert into sleep_logs (client_id, date, hours) values (auth.uid(), current_date, 7);
insert into food_entries (client_id, date, name, kcal) values (auth.uid(), current_date, 'Gröt', 300);
update weight_entries set kg = 79.5 where client_id = auth.uid();
select test.eq((select kg from weight_entries where client_id = auth.uid()), 79.5::numeric, 'med samtycke: klienten sparar och ändrar sin hälsodata');
delete from food_entries where client_id = auth.uid();
select test.eq((select count(*) from food_entries where client_id = auth.uid()), 0::bigint, 'radering fungerar alltid (art. 17)');
select test.logout();

-- Vardagsflödet påverkas inte: PT:n ändrar pass och kostschema för sina klienter
-- (som alltid har samtycke), och klienten uppdaterar sitt pass.
select w.id as wid, w.trainer_id as wpt, w.client_id as wcl,
       (select email from auth.users where id = w.trainer_id) as wpt_mail,
       (select email from auth.users where id = w.client_id) as wcl_mail
from scheduled_workouts w join profiles p on p.id = w.client_id
where p.health_data_consent_at is not null and w.trainer_id is not null limit 1 \gset
select test.login(:'wpt_mail');
update scheduled_workouts set name = name || ' (uppdaterad)' where id = :'wid';
select test.eq((select name like '%(uppdaterad)' from scheduled_workouts where id = :'wid'), true, 'PT:n ändrar ett pass för sin klient');
select test.logout();
select n.id as nid, (select email from auth.users where id = n.trainer_id) as npt_mail
from nutrition_plans n join profiles p on p.id = n.client_id where p.health_data_consent_at is not null limit 1 \gset
select test.login(:'npt_mail');
update nutrition_plans set name = name || '.' where id = :'nid';
select test.eq((select name like '%.' from nutrition_plans where id = :'nid'), true, 'PT:n ändrar sin klients kostschema');
select test.logout();
select test.login(:'wcl_mail');
select test.eq((select count(*) from scheduled_workouts where id = :'wid'), 1::bigint, 'klienten ser sitt pass');
select test.logout();

-- ------------------------------------- relationsfrågor bara för parterna ---
insert into purchases (checkout_id, client_id, trainer_id, kind, title, sessions, includes_nutrition, price_sek, status, paid_at)
values (gen_random_uuid(), :'klient', :'pt', 'nutrition', 'Kost', 0, true, 900, 'paid', now());
select test.login('sak-annan@test.se');
select test.eq(has_nutrition_access(:'pt', :'klient'), false, 'en utomstående kan inte se om någon köpt kostcoaching');
select test.eq(has_call_access(:'klient', :'pt'), false, 'en utomstående kan inte se om två personer har en relation');
select test.logout();
select test.login('sak-klient@test.se');
select test.eq(has_nutrition_access(:'pt', :'klient'), true, 'klienten ser sin egen kostcoaching');
select test.logout();
select test.login('sak-pt@test.se');
select test.eq(has_nutrition_access(:'pt', :'klient'), true, 'PT:n ser sin egen klients kostcoaching');
select test.logout();
select test.eq(has_nutrition_access(:'pt', :'klient'), true, 'systemet (utan inloggning) får svar');

-- ------------------------------------------------------- rättigheter ---
select test.eq((select count(*) from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')), 0::bigint,
  'ingen TRUNCATE/TRIGGER/REFERENCES för anon/authenticated');
select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');

-- ---------------------------------------------------- rate limiting ---
select test.login('sak-klient@test.se');
select test.fails($$select hit_rate_limit('x', 1, 60)$$, 'användare kan inte anropa rate limiting');
select test.fails($$select * from rate_limits$$, 'räknarna är dolda');
select test.logout();
set role service_role;
select test.eq(hit_rate_limit('test:a', 2, 60), true, 'första anropet släpps igenom');
select test.eq(hit_rate_limit('test:a', 2, 60), true, 'andra anropet släpps igenom');
select test.eq(hit_rate_limit('test:a', 2, 60), false, 'tredje anropet inom fönstret stoppas');
select test.eq(hit_rate_limit('test:b', 2, 60), true, 'andra nycklar räknas för sig');
reset role;
update rate_limits set window_start = now() - interval '2 minutes' where key = 'test:a';
set role service_role;
select test.eq(hit_rate_limit('test:a', 2, 60), true, 'nytt fönster: släpps igenom igen');
reset role;

\warn 'ALLA V23-TESTER (SÄKERHET) GODKÄNDA'
