-- Tester för v32: lägg till set/övningar i PT:ns pass, Bodybuilding och aktivitetssynk (Strava, Apple Hälsa, Health Connect).
\set ON_ERROR_STOP on

-- ------------------------------------------ utöka PT:ns pass live ---
select w.id as wid, (select email from auth.users where id = w.client_id) as cmail, w.client_id as cid
from scheduled_workouts w join profiles p on p.id = w.client_id
where w.trainer_id is not null and w.verified_at is null and p.health_data_consent_at is not null and jsonb_array_length(w.exercises) > 0
order by w.id limit 1 \gset
select (exercises -> 0 ->> 'sets')::int as sets0 from scheduled_workouts where id = :'wid' \gset

select test.login(:'cmail');
update scheduled_workouts set exercises = jsonb_set(exercises, '{0,sets}', to_jsonb(:sets0 + 1)) where id = :'wid';
select test.eq((select (exercises -> 0 ->> 'sets')::int from scheduled_workouts where id = :'wid'), :sets0 + 1, 'klienten lägger till ett set i PT:ns övning');
update scheduled_workouts set exercises = exercises || '[{"id":"x1","exerciseId":"e-hipthrust","sets":3,"reps":"8–12","restSec":90,"extra":true}]' where id = :'wid';
select test.eq((select exercises -> -1 ->> 'id' from scheduled_workouts where id = :'wid'), 'x1', 'klienten lägger till en extra övning i PT:ns pass');
update scheduled_workouts set exercises = jsonb_set(exercises, '{-1,sets}', '5') where id = :'wid';
select test.eq((select (exercises -> -1 ->> 'sets')::int from scheduled_workouts where id = :'wid'), 5, 'den egna extra-övningen kan ändras');
select test.fails($$update scheduled_workouts set exercises = jsonb_set(exercises, '{0,sets}', to_jsonb(1)) where id = '$$ || :'wid' || $$'$$,
  'färre set än PT:n bestämt stoppas');
select test.fails($$update scheduled_workouts set exercises = jsonb_set(exercises, '{0,reps}', '"1"') where id = '$$ || :'wid' || $$'$$,
  'PT:ns reps kan inte ändras');
select test.fails($$update scheduled_workouts set exercises = exercises - 0 where id = '$$ || :'wid' || $$'$$,
  'PT:ns övningar kan inte tas bort');
select test.fails($$update scheduled_workouts set exercises = exercises || '[{"id":"x2","exerciseId":"e-dip","sets":3,"reps":"8","restSec":90}]' where id = '$$ || :'wid' || $$'$$,
  'nya övningar måste vara märkta som extra');
select test.fails($$update scheduled_workouts set exercises = jsonb_set(exercises, '{0,sets}', '21') where id = '$$ || :'wid' || $$'$$,
  'högst 20 set');
update scheduled_workouts set exercises = (select jsonb_agg(x) from jsonb_array_elements(exercises) x where x ->> 'id' <> 'x1') where id = :'wid';
select test.eq((select count(*) from jsonb_array_elements((select exercises from scheduled_workouts where id = :'wid')) x where x ->> 'id' = 'x1'), 0::bigint,
  'den egna extra-övningen kan tas bort igen');
select test.logout();

-- ------------------------------------------------------- bodybuilding ---
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v32-klient@test.se', '{"role":"client","full_name":"Akt Ivitet","health_data_consent":true}', '{}'),
  ('v32-annan@test.se', '{"role":"client","full_name":"Annan Klient","health_data_consent":true}', '{}');
select id as k from auth.users where email = 'v32-klient@test.se' \gset
select id as annan from auth.users where email = 'v32-annan@test.se' \gset
select test.login('v32-klient@test.se');
insert into client_goals (client_id, goals, sex, birth_year, height_cm, start_weight_kg, current_weight_kg, activity_level, weekly_change_kg,
  target_kcal, target_protein_g, target_carbs_g, target_fat_g)
values (auth.uid(), '{bodybuilding,weight_loss}', 'male', 1994, 182, 88, 88, 'very', -0.25, 2900, 176, 330, 80);
select test.eq((select goals from client_goals where client_id = auth.uid()), '{bodybuilding,weight_loss}'::text[], 'målet Bodybuilding kan väljas');

-- ----------------------------------------------------- aktivitetssynk ---
insert into activity_days (client_id, date, source, active_kcal, active_minutes, steps) values (auth.uid(), current_date, 'apple_health', 620, 55, 9400);
insert into activity_logs (client_id, source, external_id, sport, name, started_at, date, duration_sec, distance_m, kcal)
values (auth.uid(), 'apple_health', 'hk-1', 'running', '', now(), current_date, 1800, 5000, 360);
select test.eq((select active_kcal from activity_days where client_id = auth.uid()), 620, 'appen sparar dagens aktiva energi från Apple Hälsa');
insert into activity_logs (client_id, source, external_id, sport, name, started_at, date, duration_sec, kcal)
values (auth.uid(), 'apple_health', 'hk-1', 'running', '', now(), current_date, 1800, 380)
on conflict (client_id, source, external_id) do update set kcal = excluded.kcal;
select test.eq((select kcal from activity_logs where client_id = auth.uid() and external_id = 'hk-1'), 380, 'samma pass synkas om utan dubbletter');
select test.fails($$insert into activity_logs (client_id, source, external_id, sport, started_at, date, duration_sec) values (auth.uid(), 'strava', 's-1', 'Run', now(), current_date, 1800)$$,
  'Strava-pass kan bara sparas av servern');
select test.fails($$insert into activity_days (client_id, date, source, active_kcal) values ('$$ || :'annan' || $$', current_date, 'google_fit', 100)$$,
  'man kan inte spara aktivitet åt någon annan');
select test.fails($$insert into activity_days (client_id, date, source, active_kcal) values (auth.uid(), current_date, 'google_fit', 50000)$$, 'orimlig energi stoppas');
select test.logout();
-- Servern (Strava-synk) skriver Strava-pass.
insert into wearable_connections (user_id, provider, external_user_id) values (:'k', 'strava', '12345');
insert into activity_logs (client_id, source, external_id, sport, name, started_at, date, duration_sec, distance_m, kcal)
values (:'k', 'strava', '987', 'Run', 'Morgonlöpning', now(), current_date, 1900, 5400, 382);
select test.login('v32-annan@test.se');
select test.eq((select count(*) from activity_logs) + (select count(*) from activity_days), 0::bigint, 'andra klienter ser ingen aktivitet');
select test.logout();
select test.login('v32-klient@test.se');
select test.eq((select count(*) from activity_logs where source = 'strava'), 1::bigint, 'klienten ser sina Strava-pass');
delete from activity_logs where source = 'strava';
select test.eq((select count(*) from activity_logs where source = 'strava'), 1::bigint, 'Strava-pass tas inte bort av klienten (koppla från i stället)');
select test.logout();
delete from wearable_connections where user_id = :'k' and provider = 'strava';
select test.eq((select count(*) from activity_logs where client_id = :'k' and source = 'strava'), 0::bigint, 'koppla från Strava tar bort passen därifrån');
select test.eq((select count(*) from activity_logs where client_id = :'k' and source = 'apple_health'), 1::bigint, 'telefonens pass ligger kvar');

select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');
\warn 'ALLA V32-TESTER (PASS, MÅL, AKTIVITET) GODKÄNDA'
