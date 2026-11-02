-- Tester för v25: importerade recept (kategorier, bild, steg, makron per portion),
-- favoriter med RLS och loggning av recept i kostdagboken.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v25-a@test.se', '{"role":"client","full_name":"Recept A","health_data_consent":true}', '{}'),
  ('v25-b@test.se', '{"role":"client","full_name":"Recept B","health_data_consent":true}', '{}');

-- --------------------------------------------------- importerat recept ---
select test.login('v25-a@test.se');
insert into client_recipes (client_id, name, items, servings, goal_types, image_url, source_url, source_name, steps, total_minutes, nutrition, macros_source)
values (auth.uid(), 'High-Protein Chicken Bowl with Rice and Broccoli (Meal Prep)', '[{"name":"chicken breast","grams":454,"unit":"g","kcal":0,"protein":0,"carbs":0,"fat":0}]', 4,
  '{high_protein,post_workout}', 'https://example.com/bowl.jpg', 'https://example.com/bowl', 'example.com',
  '["Koka riset.","Stek kycklingen."]', 25, '{"kcal":520,"protein":45,"carbs":55,"fat":12}', 'site')
returning id as rid \gset
select test.eq((select goal_types from client_recipes where id = :'rid'), '{high_protein,post_workout}'::text[], 'recept sparas med träningsmål');
select test.eq((select (nutrition->>'protein')::numeric from client_recipes where id = :'rid'), 45::numeric, 'makron per portion sparas');
select test.fails($$insert into client_recipes (client_id, name, goal_types) values (auth.uid(), 'Fel kategori', '{bulking}')$$, 'okända kategorier stoppas');
select test.fails($$insert into client_recipes (client_id, name, image_url) values (auth.uid(), 'Fel bild', 'javascript:alert(1)')$$, 'bara http(s)-bilder');
select test.fails($$insert into client_recipes (client_id, name, nutrition) values (auth.uid(), 'Fel makron', '{"kcal":"mycket"}')$$, 'makron måste vara tal');
select test.fails($$insert into client_recipes (client_id, name, macros_source) values (auth.uid(), 'Fel källa', 'gissat')$$, 'okänd makrokälla stoppas');

-- ---------------------------------------------------------- favoriter ---
insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), :'rid');
select test.eq((select count(*) from user_favorite_recipes), 1::bigint, 'klienten stjärnmarkerar sitt recept');
select test.fails($$insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), '$$ || :'rid' || $$')$$, 'samma favorit bara en gång');
select test.logout();

select test.login('v25-b@test.se');
select test.eq((select count(*) from user_favorite_recipes), 0::bigint, 'andras favoriter syns inte');
select test.fails($$insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), '$$ || :'rid' || $$')$$, 'man kan inte favoritmarkera andras recept');
select test.fails($$insert into user_favorite_recipes (user_id, recipe_id) values (test.uid('v25-a@test.se'), '$$ || :'rid' || $$')$$, 'man kan inte lägga favoriter åt någon annan');
delete from user_favorite_recipes where recipe_id = :'rid';
select test.logout();
select test.eq((select count(*) from user_favorite_recipes where recipe_id = :'rid'), 1::bigint, 'andra kan inte ta bort ens favoriter');

-- ------------------------------------------ logga receptet i kostdagboken ---
select test.login('v25-a@test.se');
insert into food_entries (client_id, date, name, kcal, protein_g, carbs_g, fat_g, meal_type, recipe_id)
values (auth.uid(), current_date, 'Chicken Bowl (1,5 portioner)', 780, 67.5, 82.5, 18, 'lunch', :'rid');
select test.eq((select meal_type from food_entries where recipe_id = :'rid'), 'lunch', 'receptet loggas som lunch');
select test.fails($$insert into food_entries (client_id, date, name, meal_type) values (auth.uid(), current_date, 'X', 'fika')$$, 'okänd måltidstyp stoppas');
delete from user_favorite_recipes where recipe_id = :'rid';
select test.eq((select count(*) from user_favorite_recipes), 0::bigint, 'klienten tar bort sin favorit');
select test.logout();

select test.login('v25-b@test.se');
select test.fails($$insert into food_entries (client_id, date, name, kcal, recipe_id) values (auth.uid(), current_date, 'Lånat', 100, '$$ || :'rid' || $$')$$,
  'man kan inte koppla en matpost till någon annans recept');
select test.logout();

-- Raderas receptet finns matposten kvar (utan koppling).
select test.login('v25-a@test.se');
insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), :'rid');
delete from client_recipes where id = :'rid';
select test.eq((select count(*) from food_entries where name like 'Chicken Bowl%' and recipe_id is null), 1::bigint, 'loggad mat finns kvar när receptet raderas');
select test.eq((select count(*) from user_favorite_recipes), 0::bigint, 'favoriten försvinner med receptet');
select test.logout();

select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');

\warn 'ALLA V25-TESTER (RECEPTIMPORT, FAVORITER, KOSTDAGBOK) GODKÄNDA'
