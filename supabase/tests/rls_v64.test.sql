-- Tester för v64: bildfiltret i chatten kan inte kringgås, och exercise-videos tar inte emot uppladdningar.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v64-pt@test.se', '{"role":"trainer","full_name":"Petra PT"}', '{"role":"trainer"}'),
  ('v64-klient@test.se', '{"role":"client","full_name":"Klara Klient","health_data_consent":true}', '{}'),
  ('v64-annan@test.se', '{"role":"client","full_name":"Anna Annan","health_data_consent":true}', '{}');
insert into coaching_relationships (trainer_id, client_id, status)
values (test.uid('v64-pt@test.se'), test.uid('v64-klient@test.se'), 'active');

-- Servern (service role) har laddat upp en granskad bild i chatten.
set role service_role;
insert into storage.objects (bucket_id, name) values ('chat-attachments', test.uid('v64-klient@test.se') || '/m-ok/bild.webp');
-- …och en granskad bild i en ANNAN chatt.
insert into storage.objects (bucket_id, name) values ('chat-attachments', test.uid('v64-annan@test.se') || '/m-x/bild.webp');
reset role;

-- --------------------------------------------- PT: kringgå bildfiltret ---
select test.login('v64-pt@test.se');
-- Direktuppladdning med fel filändelse (tillåten av lagringsregeln, ägare = PT).
insert into storage.objects (bucket_id, name) values ('chat-attachments', test.uid('v64-klient@test.se') || '/m-bad/bild.pdf');

select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body, attachments) values (%L, auth.uid(), auth.uid(), '',
  '[{"id":"a","name":"bild.pdf","mime":"image/webp","size":10,"kind":"image","ref":"storage:chat-attachments/%s/m-bad/bild.pdf"}]')$$,
  test.uid('v64-klient@test.se'), test.uid('v64-klient@test.se')),
  'en egen, ogranskad uppladdning kan inte visas som bild i chatten');
select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body, attachments) values (%L, auth.uid(), auth.uid(), '',
  '[{"id":"a","name":"bild.pdf","mime":"application/pdf","size":10,"kind":"image","ref":"storage:chat-attachments/%s/m-bad/bild.pdf"}]')$$,
  test.uid('v64-klient@test.se'), test.uid('v64-klient@test.se')),
  'kind "image" räcker för att kräva granskning (oavsett MIME)');
select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body, attachments) values (%L, auth.uid(), auth.uid(), '',
  '[{"id":"a","name":"x.webp","mime":"image/webp","size":10,"kind":"image","ref":"https://evil.example/x.webp"}]')$$,
  test.uid('v64-klient@test.se')),
  'en extern bildlänk avvisas');
select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body, attachments) values (%L, auth.uid(), auth.uid(), '',
  '[{"id":"a","name":"bild.webp","mime":"image/webp","size":10,"kind":"image","ref":"storage:chat-attachments/%s/m-x/bild.webp"}]')$$,
  test.uid('v64-klient@test.se'), test.uid('v64-annan@test.se')),
  'en granskad bild från en annan chatt kan inte återanvändas');

-- Det vanliga flödet: den granskade bilden går bra.
insert into messages (client_id, trainer_id, sender_id, body, attachments)
select test.uid('v64-klient@test.se'), auth.uid(), auth.uid(), '',
  jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'bild.jpg', 'mime', 'image/jpeg', 'size', 10, 'kind', 'image',
    'ref', 'storage:chat-attachments/' || test.uid('v64-klient@test.se') || '/m-ok/bild.webp'));
-- PDF:er och filer laddas fortfarande upp direkt och skickas som vanligt.
insert into messages (client_id, trainer_id, sender_id, body, attachments)
select test.uid('v64-klient@test.se'), auth.uid(), auth.uid(), 'Programmet',
  jsonb_build_array(jsonb_build_object('id', 'b', 'name', 'program.pdf', 'mime', 'application/pdf', 'size', 10, 'kind', 'pdf',
    'ref', 'storage:chat-attachments/' || test.uid('v64-klient@test.se') || '/m-bad/bild.pdf'));
select test.logout();
select test.eq((select count(*) from messages where client_id = test.uid('v64-klient@test.se')), 2::bigint, 'granskad bild och PDF skickades');

-- Klienten kan läsa och markera som läst som tidigare (triggern rör bara bilagor).
select test.login('v64-klient@test.se');
update messages set read_at = now() where client_id = auth.uid() and sender_id <> auth.uid();
select test.logout();
select test.eq((select count(*) from messages where client_id = test.uid('v64-klient@test.se') and read_at is not null), 2::bigint, 'markera som läst fungerar');

-- ------------------------------------------------------- exercise-videos ---
select test.login('v64-klient@test.se');
select test.fails($$insert into storage.objects (bucket_id, name) values ('exercise-videos', auth.uid() || '/stor.mp4')$$,
  'klienter kan inte ladda upp i exercise-videos');
select test.logout();
select test.login('v64-pt@test.se');
select test.fails($$insert into storage.objects (bucket_id, name) values ('exercise-videos', auth.uid() || '/ny.mp4')$$,
  'PT kan inte heller ladda upp (funktionen är borttagen sedan v61)');
select test.logout();
-- Gamla filer kan fortfarande tas bort av ägaren.
set role service_role;
insert into storage.objects (bucket_id, name, owner) values ('exercise-videos', test.uid('v64-pt@test.se') || '/gammal.mp4', test.uid('v64-pt@test.se'));
reset role;
select test.login('v64-pt@test.se');
delete from storage.objects where bucket_id = 'exercise-videos' and name = test.uid('v64-pt@test.se') || '/gammal.mp4';
select test.logout();
select test.eq((select count(*) from storage.objects where bucket_id = 'exercise-videos' and name like '%/gammal.mp4'), 0::bigint, 'PT kan radera sina gamla videor');
