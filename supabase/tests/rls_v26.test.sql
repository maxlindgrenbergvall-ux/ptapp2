-- Tester för v26: färdigt receptbibliotek (läsbart, inte skrivbart), favoriter
-- för både biblioteksrecept och egna recept, och loggning av biblioteksrecept.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v26-a@test.se', '{"role":"client","full_name":"Bibliotek A","health_data_consent":true}', '{}'),
  ('v26-b@test.se', '{"role":"client","full_name":"Bibliotek B","health_data_consent":true}', '{}');

select test.eq((select count(*) >= 40 from library_recipes), true, 'biblioteket har minst 40 recept');
select test.eq((select count(*) from library_recipes where nutrition is null or jsonb_array_length(steps) = 0 or total_minutes is null), 0::bigint,
  'alla recept har makron, tid och steg');
select test.eq((select bool_and((select count(*) from library_recipes l where g = any (l.goal_types)) >= 8)
  from unnest(array['high_protein','weight_loss','pre_workout','post_workout','quick_easy']) g), true, 'minst 8 recept i varje kategori');
select id as lib from library_recipes where slug = 'kycklingbowl-jasminris-broccoli' \gset

select test.login('v26-a@test.se');
select test.eq((select count(*) >= 40 from library_recipes), true, 'inloggade läser biblioteket');
select test.fails($$insert into library_recipes (id, slug, name, servings, total_minutes, items, steps, nutrition) values (gen_random_uuid(), 'fusk', 'Fusk', 1, 1, '[{}]', '["x"]', '{"kcal":1,"protein":1,"carbs":1,"fat":1}')$$,
  'användare kan inte lägga till biblioteksrecept');
select test.fails($$update library_recipes set name = 'Kapat' where id = '$$ || :'lib' || $$'$$, 'användare kan inte ändra biblioteket');
select test.fails($$delete from library_recipes where id = '$$ || :'lib' || $$'$$, 'användare kan inte ta bort biblioteksrecept');

-- Favoriter: biblioteksrecept och eget recept.
insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), :'lib');
insert into client_recipes (client_id, name, items, servings, nutrition, macros_source, goal_types)
values (auth.uid(), 'Mitt eget', '[{"name":"Havregryn","unit":"dl","qty":2,"grams":70,"kcal":0,"protein":0,"carbs":0,"fat":0}]', 1,
  '{"kcal":400,"protein":30,"carbs":45,"fat":10}', 'manual', '{high_protein}') returning id as own \gset
insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), :'own');
select test.eq((select count(*) from user_favorite_recipes), 2::bigint, 'favoriter: biblioteksrecept och eget recept');
select test.fails($$insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), gen_random_uuid())$$, 'okända recept kan inte favoritmarkeras');

-- Logga biblioteksrecept i kostdagboken.
insert into food_entries (client_id, date, name, kcal, protein_g, carbs_g, fat_g, meal_type, library_recipe_id)
values (auth.uid(), current_date, 'Kycklingbowl (1 portion)', 533, 43.9, 60.7, 11.4, 'lunch', :'lib');
select test.eq((select library_recipe_id from food_entries where name like 'Kycklingbowl%'), :'lib'::uuid, 'biblioteksrecept loggas med koppling');
select test.logout();

select test.login('v26-b@test.se');
select test.fails($$insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), '$$ || :'own' || $$')$$, 'andras egna recept kan inte favoritmarkeras');
insert into user_favorite_recipes (user_id, recipe_id) values (auth.uid(), :'lib');
select test.eq((select count(*) from user_favorite_recipes), 1::bigint, 'var och en ser bara sina favoriter');
select test.logout();

-- Raderat eget recept tar med sig favoriten.
select test.login('v26-a@test.se');
delete from client_recipes where id = :'own';
select test.eq((select count(*) from user_favorite_recipes where recipe_id = :'own'), 0::bigint, 'favoriten försvinner med det egna receptet');
select test.eq((select count(*) from user_favorite_recipes where recipe_id = :'lib'), 1::bigint, 'bibliotekets favorit finns kvar');
select test.logout();

select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');

\warn 'ALLA V26-TESTER (RECEPTBIBLIOTEK) GODKÄNDA'
