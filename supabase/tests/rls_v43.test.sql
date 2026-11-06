-- Tester för v43: övningsbanken, muskelgrupp på egna övningar och det aktiva schemat (client_splits).
\set ON_ERROR_STOP on

-- --------------------------------------------------- 1. övningsbanken ---
select test.eq((select name from exercises where id = 'e-ezcurl'), 'EZ-Bar Curl', 'EZ-Bar Curl finns');
select test.eq((select name from exercises where id = 'e-machine-ohp'), 'Axelpress i maskin', 'Axelpress i maskin finns');
select test.eq((select name from exercises where id = 'e-machine-hipthrust'), 'Hip Thrust i maskin', 'Hip Thrust i maskin finns');
select test.eq((select name || '|' || equipment from exercises where id = 'e-bss'), 'Bulgarian Split Squats|', 'Bulgarian Split Squats – utan hantlar/skivstång');
select test.eq((select name || '|' || muscle_group from exercises where id = 'e-kickback'), 'Kickbacks|armar', 'Kickbacks finns (armar)');

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v43-klient@test.se', '{"role":"client","full_name":"Split Klient","health_data_consent":true}', '{}'),
  ('v43-annan@test.se', '{"role":"client","full_name":"Annan Klient","health_data_consent":true}', '{}'),
  ('v43-pt@test.se', '{"role":"trainer","full_name":"Split PT"}', '{"role":"trainer"}'),
  ('v43-pt2@test.se', '{"role":"trainer","full_name":"Annan PT"}', '{"role":"trainer"}');
select id as klient from auth.users where email = 'v43-klient@test.se' \gset
select id as annan from auth.users where email = 'v43-annan@test.se' \gset
select id as pt from auth.users where email = 'v43-pt@test.se' \gset
insert into coaching_relationships (client_id, trainer_id, status) values (:'klient', :'pt', 'active');

-- ------------------------------------------ 2. egna övningar: muskelgrupp ---
select test.login('v43-klient@test.se');
insert into custom_exercises (name, muscle_group, display_group) values ('Kabelkickback för säte', 'ben', 'sate');
select test.eq((select display_group from custom_exercises where user_id = auth.uid()), 'sate', 'egen övning sparas med vald muskelgrupp (Säte)');
insert into custom_exercises (name, muscle_group) values ('Utan grupp', 'helkropp');
select test.eq((select display_group is null from custom_exercises where name = 'Utan grupp'), true, 'gruppen är valfri');
select test.fails($$insert into custom_exercises (name, muscle_group, display_group) values ('Fel', 'ben', 'vaden')$$, 'okänd muskelgrupp stoppas');
update custom_exercises set display_group = 'vader' where name = 'Utan grupp';
select test.eq((select display_group from custom_exercises where name = 'Utan grupp'), 'vader', 'gruppen kan ändras i efterhand');

-- ---------------------------------------------- 3. aktivt schema (klienten) ---
insert into client_splits (client_id, name, short, split_key, days, days_per_week)
values (auth.uid(), 'Push/Pull/Legs', 'PPL', 'ppl',
  '[{"name":"Push","focus":"","exercises":[{"exerciseId":"e-bench","sets":4,"reps":"6–8","restSec":150}]},
    {"name":"Pull","focus":"","exercises":[{"exerciseId":"e-row","sets":3,"reps":"8–10","restSec":120}]},
    {"name":"Legs","focus":"","exercises":[{"exerciseId":"e-bss","sets":3,"reps":"8–12","restSec":90}]}]', 4);
select test.eq((select days_per_week from client_splits where client_id = auth.uid()), 4, 'klienten sparar sitt schema med antal dagar per vecka');
select test.eq((select next_day from client_splits where client_id = auth.uid()), 0, 'första dagen står på tur');
-- "Nästa pass": dagens pass skapas av dagen på tur och schemat flyttas fram.
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises, status)
values (auth.uid(), null, 'PPL: Push', current_date, '[{"id":"a","exerciseId":"e-bench","sets":4,"reps":"6–8","restSec":150}]', 'planned')
returning id as w \gset
update client_splits set next_day = 1, current_workout_id = :'w' where client_id = auth.uid();
select test.eq((select current_workout_id from client_splits where client_id = auth.uid()), :'w'::uuid, 'det startade passet kopplas till schemat');
select test.eq((select updated_at >= created_at from client_splits where client_id = auth.uid()), true, 'updated_at sätts av databasen');
select test.fails($$update client_splits set days_per_week = 8 where client_id = auth.uid()$$, 'högst 7 dagar per vecka');
select test.fails($$update client_splits set days_per_week = 0 where client_id = auth.uid()$$, 'minst 1 dag per vecka');
select test.fails($$update client_splits set next_day = 3 where client_id = auth.uid()$$, 'dagen på tur måste finnas i schemat');
select test.fails($$update client_splits set days = '[]' where client_id = auth.uid()$$, 'minst en dag');
select test.fails($$insert into client_splits (client_id, name, days) values ('$$ || :'annan' || $$', 'Fusk', '[{"name":"A","focus":"","exercises":[]}]')$$,
  'man kan inte spara ett schema åt någon annan');
select test.logout();

-- Den andra klientens pass kan inte kopplas till schemat.
select test.login('v43-annan@test.se');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises, status)
values (auth.uid(), null, 'Annans pass', current_date, '[]', 'planned')
returning id as w2 \gset
select test.eq((select count(*) from client_splits), 0::bigint, 'andra klienter ser inte schemat');
select test.logout();
select test.login('v43-klient@test.se');
select test.fails($$update client_splits set current_workout_id = '$$ || :'w2' || $$' where client_id = auth.uid()$$, 'bara klientens egna pass kan kopplas');
select test.logout();

-- ------------------------------------------------------------- PT:n ---
select test.login('v43-pt@test.se');
select test.eq((select days_per_week from client_splits where client_id = :'klient'), 4, 'klientens PT ser schemat');
update client_splits set days_per_week = 2 where client_id = :'klient';
select test.eq((select days_per_week from client_splits where client_id = :'klient'), 4, 'PT:n kan inte ändra klientens schema');
select test.logout();
select test.login('v43-pt2@test.se');
select test.eq((select count(*) from client_splits where client_id = :'klient'), 0::bigint, 'en annan PT ser inte schemat');
select test.logout();

-- Passet tas bort → kopplingen nollas, schemat ligger kvar.
delete from scheduled_workouts where id = :'w';
select test.eq((select current_workout_id is null from client_splits where client_id = :'klient'), true, 'borttaget pass nollar kopplingen');
select test.login('v43-klient@test.se');
delete from client_splits where client_id = auth.uid();
select test.eq((select count(*) from client_splits where client_id = auth.uid()), 0::bigint, 'klienten kan avsluta schemat');
select test.logout();
