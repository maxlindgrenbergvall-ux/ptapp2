-- Tester för v29: bildfilter (bilder bara via servern), mealprep och klienternas passmallar.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v29-a@test.se', '{"role":"client","full_name":"Mall A","health_data_consent":true}', '{}'),
  ('v29-b@test.se', '{"role":"client","full_name":"Mall B","health_data_consent":true}', '{}');
select id as a from auth.users where email = 'v29-a@test.se' \gset

-- --------------------------------------------------------- bildfilter ---
select test.login('v29-a@test.se');
select test.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '$$ || :'a' || $$/avatar.webp')$$,
  'profilbilder kan inte laddas upp direkt (bara via servern och bildfiltret)');
select test.fails($$insert into storage.objects (bucket_id, name) values ('chat-attachments', '$$ || :'a' || $$/m1/bild.jpg')$$,
  'chattbilder kan inte laddas upp direkt');
select test.fails($$insert into storage.objects (bucket_id, name) values ('chat-attachments', '$$ || :'a' || $$/m1/BILD.PNG')$$,
  'inte heller med versaler i filändelsen');
insert into storage.objects (bucket_id, name) values ('chat-attachments', :'a' || '/m1/kvitto.pdf');
select test.eq((select count(*) from storage.objects where name = :'a' || '/m1/kvitto.pdf'), 1::bigint, 'PDF i chatten laddas upp som förut');
select test.fails($$select * from moderation_events$$, 'loggen över stoppade bilder är dold för användare');
select test.fails($$insert into moderation_events (user_id, bucket, action) values (auth.uid(), 'avatars', 'blocked')$$, 'användare kan inte skriva i loggen');
select test.logout();
insert into moderation_events (user_id, bucket, action, reason, scores) values (:'a', 'avatars', 'blocked', 'porn 0.91', '{"Porn":0.91}');
select test.eq((select count(*) from moderation_events), 1::bigint, 'servern loggar stoppade bilder');
select test.fails($$insert into moderation_events (bucket, action) values ('avatars', 'okänd')$$, 'bara blocked/flagged');

-- ---------------------------------------------------------- mealprep ---
select test.login('v29-a@test.se');
insert into client_recipes (client_id, name, goal_types) values (auth.uid(), 'Matlådor', '{meal_prep,high_protein}');
select test.eq((select goal_types from client_recipes where name = 'Matlådor'), '{meal_prep,high_protein}'::text[], 'egna recept kan vara Mealprep');
select test.logout();
select test.eq((select count(*) >= 8 from library_recipes where 'meal_prep' = any(goal_types)), true, 'biblioteket har minst 8 Mealprep-recept');
select test.eq((select count(*) from library_recipes where 'meal_prep' = any(goal_types) and image_url is null), 1::bigint, 'alla Mealprep-recept utom chilin har foto');
select test.eq((select image_url from library_recipes where slug = 'falafellador-ris-rotfrukter'),
  'https://images.pexels.com/photos/1640771/pexels-photo-1640771.jpeg?auto=compress&cs=tinysrgb&w=1200', 'falafellådorna har sitt Pexels-foto');
select test.eq((select servings from library_recipes where slug = 'burrito-bowl-svarta-bonor')::int, 4, 'storkoken är uppskalade till 4 portioner');

-- ---------------------------------------------------- klientens mallar ---
select test.login('v29-a@test.se');
insert into workout_templates (client_id, name, exercises) values (auth.uid(), 'Mitt benpass', '[{"id":"x","exerciseId":"e-squat","sets":3,"reps":"8","restSec":120}]');
select test.eq((select count(*) from workout_templates where client_id = auth.uid()), 1::bigint, 'klienten sparar ett pass som mall');
update workout_templates set name = 'Benpass A' where client_id = auth.uid();
select test.eq((select name from workout_templates where client_id = auth.uid()), 'Benpass A', 'klienten byter namn på sin mall');
select test.fails($$insert into workout_templates (client_id, name) values (test.uid('v29-b@test.se'), 'Fusk')$$, 'mallar kan bara sparas på det egna kontot');
select test.fails($$insert into workout_templates (client_id, trainer_id, name) values (auth.uid(), auth.uid(), 'Båda')$$, 'en mall har exakt en ägare');
select test.logout();
select test.login('v29-b@test.se');
select test.eq((select count(*) from workout_templates where client_id is not null), 0::bigint, 'andras mallar syns inte');
select test.logout();
select test.fails($$insert into workout_templates (name) values ('Ingen ägare')$$, 'en mall utan ägare stoppas');
select test.fails($$insert into workout_templates (client_id, name, exercises) values ('$$ || :'a' || $$', 'För stor', (select jsonb_agg('{}'::jsonb) from generate_series(1, 61)))$$, 'högst 60 övningar per mall');

\warn 'ALLA V29-TESTER (BILDFILTER, MEALPREP, MALLAR) GODKÄNDA'
