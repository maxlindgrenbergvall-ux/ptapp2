-- RLS-tester för v2 (bilagor, trackers, wearables, Storage, samtal).
-- Körs efter rls.test.sql och återanvänder test.*-hjälparna därifrån.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('pt3@test.se', '{"role":"trainer","full_name":"PT Tre"}', '{"role":"trainer"}'),
  ('c3@test.se', '{"role":"client","full_name":"Klient Tre","health_data_consent":true}', '{}'),
  ('c4@test.se', '{"role":"client","full_name":"Klient Fyra","health_data_consent":true}', '{}');

select test.eq((select coaching_mode::text from trainers where id = test.uid('pt3@test.se')), 'onsite', 'ny PT får coaching_mode onsite');

-- Relation pt3 ↔ c3 (aktiv).
select test.login('c3@test.se');
insert into coaching_relationships (trainer_id, client_id) values (test.uid('pt3@test.se'), auth.uid());
select test.logout();
select test.login('pt3@test.se');
update coaching_relationships set status = 'active' where client_id = test.uid('c3@test.se');
update trainers set coaching_mode = 'both', certifications = '{"Licensierad PT","Kettlebell nivå 1"}', avatar_url = 'https://x/y.png' where id = auth.uid();
select test.eq((select coaching_mode::text from trainers where id = auth.uid()), 'both', 'PT kan sätta coaching-typ');
select test.logout();

-- ------------------------------------------------------------ trackers ---
select test.login('c3@test.se');
insert into food_entries (client_id, date, name, kcal, protein_g) values (auth.uid(), current_date, 'Proteinbar', 210, 20);
insert into water_logs (client_id, date, ml) values (auth.uid(), current_date, 750)
  on conflict (client_id, date) do update set ml = excluded.ml;
insert into water_logs (client_id, date, ml) values (auth.uid(), current_date, 1000)
  on conflict (client_id, date) do update set ml = excluded.ml;
select test.eq((select ml from water_logs), 1000, 'vatten: en rad per dag, upsert uppdaterar');
insert into sleep_logs (client_id, date, hours, quality) values (auth.uid(), current_date, 7.5, 4);
select test.fails($$insert into sleep_logs (client_id, date, hours) values (auth.uid(), current_date - 1, 30)$$, 'sömn: orimligt antal timmar nekas');
select test.fails($$insert into food_entries (client_id, date, name) values (test.uid('c4@test.se'), current_date, 'Intrång')$$, 'kan inte logga mat åt någon annan');
select test.logout();

select test.login('pt3@test.se');
select test.eq((select count(*) from food_entries), 1::bigint, 'aktiv PT ser klientens extra mat');
select test.eq((select count(*) from water_logs), 1::bigint, 'aktiv PT ser klientens vatten');
select test.eq((select count(*) from sleep_logs), 1::bigint, 'aktiv PT ser klientens sömn');
select test.fails($$insert into water_logs (client_id, date, ml) values (test.uid('c3@test.se'), current_date - 1, 500)$$, 'PT kan inte skriva klientens vatten');
select test.logout();

select test.login('c4@test.se');
select test.eq((select count(*) from food_entries) + (select count(*) from water_logs) + (select count(*) from sleep_logs), 0::bigint,
  'annan klient ser inga trackers');
select test.logout();

-- ----------------------------------------------------------- wearables ---
-- Servern (service role) ansluter Fitbit åt c3.
insert into wearable_connections (user_id, provider, external_user_id) values (test.uid('c3@test.se'), 'fitbit', 'FB123');
insert into wearable_tokens (user_id, provider, access_token, refresh_token) values (test.uid('c3@test.se'), 'fitbit', 'hemlig', 'hemlig2');
select test.login('c3@test.se');
select test.eq((select count(*) from wearable_connections), 1::bigint, 'användaren ser sin wearable-anslutning');
select test.fails($$select * from wearable_tokens$$, 'tokens är oläsbara för inloggade');
select test.fails($$insert into wearable_connections (user_id, provider) values (auth.uid(), 'google_fit')$$, 'användaren kan inte skapa anslutningar själv');
delete from wearable_connections where provider = 'fitbit';
select test.logout();
select test.eq((select count(*) from wearable_tokens), 0::bigint, 'koppla från raderar tokens');

-- ------------------------------------------------------------- bilagor ---
select test.login('c3@test.se');
insert into messages (client_id, sender_id, body, attachments)
values (auth.uid(), auth.uid(), '', '[{"id":"a1","name":"kna.jpg","mime":"image/jpeg","size":1000,"kind":"image","path":"x"}]');
select test.fails($$insert into messages (client_id, sender_id, body) values (auth.uid(), auth.uid(), '')$$, 'tomt meddelande utan bilaga nekas');
insert into storage.objects (bucket_id, name) values ('chat-attachments', test.uid('c3@test.se') || '/m1/kna.jpg');
select test.fails($$insert into storage.objects (bucket_id, name) values ('chat-attachments', test.uid('c4@test.se') || '/m1/x.jpg')$$,
  'kan inte ladda upp i någon annans chatt');
select test.fails($$insert into storage.objects (bucket_id, name) values ('chat-attachments', 'inte-ett-uuid/x.jpg')$$,
  'skräpsökväg nekas utan att krascha');
select test.fails($$insert into storage.objects (bucket_id, name) values ('avatars', test.uid('c4@test.se') || '/a.png')$$,
  'kan inte byta någon annans profilbild');
insert into storage.objects (bucket_id, name) values ('avatars', auth.uid() || '/a.png');
select test.logout();

select test.login('pt3@test.se');
select test.eq((select count(*) from storage.objects where bucket_id = 'chat-attachments'), 1::bigint, 'PT ser klientens bilaga');
insert into storage.objects (bucket_id, name) values ('exercise-videos', auth.uid() || '/knaboj.mp4');
select test.fails($$insert into storage.objects (bucket_id, name) values ('exercise-videos', test.uid('c3@test.se') || '/x.mp4')$$,
  'PT kan bara ladda upp videor i sin egen mapp');
select test.logout();

select test.login('c3@test.se');
select test.eq((select count(*) from storage.objects where bucket_id = 'exercise-videos'), 1::bigint, 'PT:ns klient ser övningsvideon');
select test.logout();
select test.login('c4@test.se');
select test.eq((select count(*) from storage.objects where bucket_id in ('exercise-videos', 'chat-attachments')), 0::bigint,
  'annan klient ser varken videor eller bilagor');
select test.logout();

-- -------------------------------------------------------------- samtal ---
select set_config('realtime.topic', 'call:' || test.uid('c3@test.se'), false);
select test.login('c3@test.se');
insert into realtime.messages (payload) values ('{"type":"ring"}');
select test.logout();
select set_config('realtime.topic', 'call:' || test.uid('c3@test.se'), false);
select test.login('pt3@test.se');
select test.eq((select count(*) from realtime.messages), 1::bigint, 'PT tar emot samtalssignaler från sin klient');
insert into realtime.messages (payload) values ('{"type":"accept"}');
select test.logout();
select set_config('realtime.topic', 'call:' || test.uid('c3@test.se'), false);
select test.login('c4@test.se');
select test.eq((select count(*) from realtime.messages), 0::bigint, 'utomstående kan inte avlyssna samtalskanalen');
select test.fails($$insert into realtime.messages (payload) values ('{"type":"ring"}')$$, 'utomstående kan inte ringa in i kanalen');
select test.logout();
select set_config('realtime.topic', 'call:skräp', false);
select test.login('c3@test.se');
select test.fails($$insert into realtime.messages (payload) values ('{}')$$, 'ogiltigt kanalnamn nekas');
select test.logout();

\warn 'ALLA V2-TESTER GODKÄNDA'
