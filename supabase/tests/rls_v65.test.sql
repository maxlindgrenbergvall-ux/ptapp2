-- Tester för v65: communityregler i avtalet, rapportering, avstängning och bilagegräns.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v65-pt@test.se', '{"role":"trainer","full_name":"Petra PT"}', '{"role":"trainer"}'),
  ('v65-klient@test.se', '{"role":"client","full_name":"Klara Klient","health_data_consent":true}', '{}'),
  ('v65-annan@test.se', '{"role":"client","full_name":"Anna Annan","health_data_consent":true}', '{}'),
  ('v65-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}', '{}');
insert into app_admins (user_id) values (test.uid('v65-admin@test.se'));
insert into coaching_relationships (trainer_id, client_id, status)
values (test.uid('v65-pt@test.se'), test.uid('v65-klient@test.se'), 'active');

-- ------------------------------------------------------------- avtalet ---
select test.eq(legal_version(), '2026-12', 'avtalets version höjd till 2026-12');
select test.eq(required_documents('client'), array['terms', 'privacy', 'community'], 'klienter godkänner communityreglerna');
select test.eq(required_documents('trainer'), array['terms', 'privacy', 'community', 'pt_agreement', 'gdpr_dpa'], 'PT:er godkänner communityreglerna');
-- En klient som godkände förra versionen har inte godkänt den nya.
insert into legal_acceptances (user_id, document, version)
values (test.uid('v65-klient@test.se'), 'terms', '2026-11'), (test.uid('v65-klient@test.se'), 'privacy', '2026-11');
select test.eq(terms_accepted(test.uid('v65-klient@test.se')), false, 'befintliga användare behöver godkänna det uppdaterade avtalet');
select test.login('v65-klient@test.se');
select accept_legal_documents(array['terms', 'privacy', 'community']);
select test.logout();
select test.eq(terms_accepted(test.uid('v65-klient@test.se')), true, 'godkännandet av version 2026-12 sparas');

-- ---------------------------------------------------------- meddelande ---
select test.login('v65-pt@test.se');
insert into messages (client_id, trainer_id, sender_id, body)
values (test.uid('v65-klient@test.se'), auth.uid(), auth.uid(), 'Olämpligt meddelande');
select test.logout();

-- ------------------------------------------------------------ rapporter ---
select test.login('v65-klient@test.se');
insert into content_reports (reported_user_id, message_id, category, details)
select test.uid('v65-pt@test.se'), m.id, 'harassment', 'Kränkande ton'
  from messages m where m.body = 'Olämpligt meddelande';
select test.eq((select count(*) from content_reports), 1::bigint, 'klienten kan rapportera PT:ns meddelande och ser sin rapport');
select test.fails(format($$insert into content_reports (reported_user_id, category) values (%L, 'spam')$$, test.uid('v65-annan@test.se')),
  'man kan inte rapportera någon man inte har en relation med');
select test.fails($$insert into content_reports (reported_user_id, category) values (auth.uid(), 'spam')$$, 'man kan inte rapportera sig själv');
select test.fails(format($$insert into content_reports (reported_user_id, category, status) values (%L, 'spam', 'dismissed')$$, test.uid('v65-pt@test.se')),
  'rapporten kan inte skapas som redan hanterad');
select test.fails($$update content_reports set status = 'dismissed'$$, 'rapportören kan inte ändra sin rapport');
select test.logout();

select test.login('v65-pt@test.se');
select test.eq((select count(*) from content_reports), 0::bigint, 'den rapporterade ser inte rapporten');
select test.logout();
select id as v65_msg from messages where body = 'Olämpligt meddelande' \gset
select test.login('v65-annan@test.se');
select test.fails(format($$insert into content_reports (reported_user_id, message_id, category) values (%L, %L, 'spam')$$, test.uid('v65-pt@test.se'), :'v65_msg'),
  'man kan inte rapportera ett meddelande i någon annans chatt');
select test.logout();

-- --------------------------------------------------------- adminåtgärder ---
select test.login('v65-klient@test.se');
select test.fails(format($$select admin_suspend_account(%L, 'Försöker stänga av min PT')$$, test.uid('v65-pt@test.se')), 'vanliga användare kan inte stänga av konton');
select test.fails($$insert into account_actions (user_id, action, reason) values (auth.uid(), 'lift', 'Häver min egen avstängning')$$, 'användare kan inte skriva i åtgärdsloggen');
select test.fails($$select * from admin_list_reports()$$, 'vanliga användare kan inte lista rapporter');
select test.logout();

select test.login('v65-admin@test.se');
select test.eq((select count(*) from content_reports where status = 'open'), 1::bigint, 'administratören ser öppna rapporter');
select test.eq((select message_body from admin_list_reports('open') limit 1), 'Olämpligt meddelande', 'administratören ser det rapporterade meddelandet');
select test.eq((select count(*) from messages), 0::bigint, 'men kan inte läsa chattarna i övrigt');
select test.fails(format($$select admin_suspend_account(%L, 'kort')$$, test.uid('v65-pt@test.se')), 'skälet måste vara minst 10 tecken');
select admin_suspend_account(test.uid('v65-pt@test.se'), 'Trakasserier i chatten, se rapport från klient.', null,
  (select id from content_reports limit 1));
select admin_resolve_report((select id from content_reports limit 1), 'actioned');
select test.logout();
select test.eq(is_suspended(test.uid('v65-pt@test.se')), true, 'PT:n är avstängd');
select test.eq((select status from content_reports limit 1), 'actioned', 'rapporten är hanterad');

-- -------------------------------------------------- avstängningens effekt ---
select test.login('v65-pt@test.se');
select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body) values (%L, auth.uid(), auth.uid(), 'Hej igen')$$, test.uid('v65-klient@test.se')),
  'avstängd PT kan inte skicka meddelanden');
select test.fails(format($$insert into storage.objects (bucket_id, name) values ('chat-attachments', %L || '/m/x.pdf')$$, test.uid('v65-klient@test.se')),
  'avstängd PT kan inte ladda upp filer');
update trainers set bio = 'Avstängd men försöker ändra' where id = auth.uid();
select test.eq((select coalesce(bio, '') <> 'Avstängd men försöker ändra' from trainers where id = auth.uid()), true,
  'avstängd PT kan inte ändra eller återpublicera profilen');
select test.eq((my_account_status() ->> 'suspended')::boolean, true, 'PT:n ser att kontot är avstängt');
select test.eq(my_account_status() ->> 'suspension_reason', 'Trakasserier i chatten, se rapport från klient.', 'PT:n ser skälet (beslutsmotivering)');
select test.eq((select count(*) from account_actions where user_id = auth.uid()), 1::bigint, 'PT:n ser åtgärden i loggen');
select test.logout();
-- Klienten påverkas inte.
select test.login('v65-klient@test.se');
insert into messages (client_id, trainer_id, sender_id, body) values (auth.uid(), test.uid('v65-pt@test.se'), auth.uid(), 'Klientens svar');
select test.eq((select count(*) from account_actions), 0::bigint, 'klienten ser inte PT:ns åtgärder');
select test.logout();

-- ------------------------------------------------------------- häv ---
select test.login('v65-admin@test.se');
select admin_lift_suspension(test.uid('v65-pt@test.se'), 'Ärendet utrett, varning räcker.');
select admin_warn_account(test.uid('v65-pt@test.se'), 'Varning: håll en respektfull ton mot klienter.');
select test.logout();
select test.eq(is_suspended(test.uid('v65-pt@test.se')), false, 'avstängningen hävd');
select test.login('v65-pt@test.se');
insert into messages (client_id, trainer_id, sender_id, body) values (test.uid('v65-klient@test.se'), auth.uid(), auth.uid(), 'Ursäkta');
select test.eq((select count(*) from account_actions where user_id = auth.uid()), 3::bigint, 'avstängning, hävning och varning loggade');
select test.logout();

-- Tillfällig avstängning som har gått ut gäller inte längre.
update profiles set suspended_at = now() - interval '8 days', suspended_until = now() - interval '1 day' where id = test.uid('v65-annan@test.se');
select test.eq(is_suspended(test.uid('v65-annan@test.se')), false, 'en tillfällig avstängning upphör av sig själv');

-- ------------------------------------------------------- bilagegränsen ---
set role service_role;
insert into messages (client_id, trainer_id, sender_id, body, attachments)
select test.uid('v65-klient@test.se'), test.uid('v65-pt@test.se'), test.uid('v65-klient@test.se'), '',
  (select jsonb_agg(jsonb_build_object('id', 'v' || g, 'name', 'v.mp4', 'mime', 'video/mp4', 'size', 10, 'kind', 'video',
     'ref', 'storage:chat-attachments/' || test.uid('v65-klient@test.se') || '/m/v' || g || '.mp4')) from generate_series(1, 10) g);
reset role;
select test.login('v65-klient@test.se');
select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body, attachments) values (auth.uid(), %L, auth.uid(), '',
  '[{"id":"x","name":"v.mp4","mime":"video/mp4","size":10,"kind":"video","ref":"storage:chat-attachments/%s/m/x.mp4"}]')$$,
  test.uid('v65-pt@test.se'), test.uid('v65-klient@test.se')),
  'högst 10 videor per dygn');
insert into messages (client_id, trainer_id, sender_id, body, attachments)
select auth.uid(), test.uid('v65-pt@test.se'), auth.uid(), '',
  jsonb_build_array(jsonb_build_object('id', 'p', 'name', 'program.pdf', 'mime', 'application/pdf', 'size', 10, 'kind', 'pdf',
    'ref', 'storage:chat-attachments/' || auth.uid() || '/m/p.pdf'));
select test.logout();
select test.eq((select count(*) from messages where client_id = test.uid('v65-klient@test.se') and attachments @> '[{"kind":"pdf"}]'), 1::bigint, 'videor går fortfarande att skicka, och PDF:er efter videogränsen');
