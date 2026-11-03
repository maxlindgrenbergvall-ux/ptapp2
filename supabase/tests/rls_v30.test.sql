-- Tester för v30: klientens mål och kroppsmått (client_goals).
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v30-klient@test.se', '{"role":"client","full_name":"Mål Klient","health_data_consent":true}', '{}'),
  ('v30-annan@test.se', '{"role":"client","full_name":"Annan Klient","health_data_consent":true}', '{}'),
  ('v30-pt@test.se', '{"role":"trainer","full_name":"Mål PT"}', '{"role":"trainer"}'),
  ('v30-pt2@test.se', '{"role":"trainer","full_name":"Annan PT"}', '{"role":"trainer"}');
select id as klient from auth.users where email = 'v30-klient@test.se' \gset
select id as pt from auth.users where email = 'v30-pt@test.se' \gset
select id as annan from auth.users where email = 'v30-annan@test.se' \gset
insert into coaching_relationships (client_id, trainer_id, status) values (:'klient', :'pt', 'active');

-- ----------------------------------------------------- klienten själv ---
select test.login('v30-klient@test.se');
insert into client_goals (client_id, goals, sex, birth_year, height_cm, start_weight_kg, current_weight_kg, target_weight_kg,
  activity_level, weekly_change_kg, target_kcal, target_protein_g, target_carbs_g, target_fat_g)
values (auth.uid(), '{weight_loss,muscle_gain}', 'female', extract(year from now())::int - 32, 168, 72.5, 72.5, 66,
  'moderate', -0.25, 1890, 150, 180, 55);
select test.eq((select goals from client_goals where client_id = auth.uid()), '{weight_loss,muscle_gain}'::text[], 'klienten sparar flera mål samtidigt');
update client_goals set current_weight_kg = 71.8, weekly_change_kg = -0.5, target_kcal = 1760 where client_id = auth.uid();
select test.eq((select weekly_change_kg from client_goals where client_id = auth.uid()), -0.50::numeric(3,2), 'reglaget (aggressivitet) uppdateras i efterhand');
select test.eq((select updated_at > created_at from client_goals where client_id = auth.uid()), true, 'updated_at sätts av databasen');
select test.fails($$update client_goals set weekly_change_kg = -1.5 where client_id = auth.uid()$$, 'högst −1,0 kg per vecka');
select test.fails($$update client_goals set weekly_change_kg = 0.75 where client_id = auth.uid()$$, 'högst +0,5 kg per vecka');
select test.fails($$update client_goals set goals = '{bantning}' where client_id = auth.uid()$$, 'bara kända mål');
select test.fails($$update client_goals set goals = '{}' where client_id = auth.uid()$$, 'minst ett mål');
select test.fails($$update client_goals set height_cm = 300 where client_id = auth.uid()$$, 'orimlig längd stoppas');
select test.fails($$update client_goals set current_weight_kg = 10 where client_id = auth.uid()$$, 'orimlig vikt stoppas');
select test.fails($$update client_goals set birth_year = extract(year from now())::int - 5 where client_id = auth.uid()$$, 'yngre än 13 år stoppas');
select test.fails($$update client_goals set target_kcal = 400 where client_id = auth.uid()$$, 'orimligt lågt kalorimål stoppas');
select test.fails($$insert into client_goals (client_id, goals, sex, birth_year, height_cm, start_weight_kg, current_weight_kg, activity_level,
  target_kcal, target_protein_g, target_carbs_g, target_fat_g)
  values ('$$ || :'annan' || $$', '{health}', 'male', 1990, 180, 80, 80, 'light', 2400, 100, 300, 80)$$,
  'man kan inte spara mål åt någon annan');
select test.logout();

-- ------------------------------------------------------------- andra ---
select test.login('v30-annan@test.se');
select test.eq((select count(*) from client_goals), 0::bigint, 'andra klienter ser inte målen');
update client_goals set target_kcal = 3000 where client_id = :'klient';
select test.logout();
select test.eq((select target_kcal from client_goals where client_id = :'klient'), 1760, 'andra klienter kan inte ändra målet');

select test.login('v30-pt@test.se');
select test.eq((select target_kcal from client_goals where client_id = :'klient'), 1760, 'klientens aktiva PT ser mål och kalorimål');
update client_goals set target_kcal = 3000 where client_id = :'klient';
select test.logout();
select test.eq((select target_kcal from client_goals where client_id = :'klient'), 1760, 'PT:n kan inte ändra klientens mål');

select test.login('v30-pt2@test.se');
select test.eq((select count(*) from client_goals), 0::bigint, 'en annan PT ser inte målen');
select test.logout();

-- Raderas med kontot.
delete from auth.users where email = 'v30-annan@test.se';
select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');

\warn 'ALLA V30-TESTER (MÅL) GODKÄNDA'
