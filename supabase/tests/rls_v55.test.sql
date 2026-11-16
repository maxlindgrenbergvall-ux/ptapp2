-- Tester för v55: inget utskick kan köas eller skickas utan godkännande.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v55-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}', '{}'),
  ('v55-pt@test.se', '{"role":"trainer","full_name":"Petra PT"}', '{"role":"trainer"}');
select admin_grant('v55-admin@test.se');

select test.login('v55-admin@test.se');
insert into crm_leads (name, email) values ('Gun Granskad', 'gun@granskad.se') returning id as lead \gset
insert into crm_email_logs (lead_id, to_email, subject, body, scheduled_at, status)
  values (:'lead', 'gun@granskad.se', 'Hej', 'Text', now() - interval '1 minute', 'pending_approval') returning id as mail \gset
select test.eq((select status::text from crm_email_logs where id = :'mail'), 'pending_approval', 'nytt utskick väntar på granskning');
select test.fails(format($$update crm_email_logs set status = 'queued' where id = %L$$, :'mail'), 'kan inte köas utan godkännande');
select test.fails(format($$insert into crm_email_logs (lead_id, to_email, subject, body, scheduled_at, status) values (%L, 'gun@granskad.se', 'X', 'Y', now(), 'sent')$$, :'lead'), 'kan inte sparas som skickat utan godkännande');
select test.logout();

-- Kön (service role) plockar inte ett ogodkänt utskick.
set role service_role;
select test.eq((select count(*) from crm_claim_due_emails(20) c where c.id = :'mail'), 0::bigint, 'kön tar inte ogodkända utskick');
reset role;

select test.login('v55-admin@test.se');
update crm_email_logs set status = 'queued', approved_at = now(), approved_by = auth.uid() where id = :'mail';
select test.eq((select approved_by = test.uid('v55-admin@test.se') from crm_email_logs where id = :'mail'), true, 'godkännandet sparar vem som godkände');
select test.logout();
set role service_role;
select test.eq((select count(*) from crm_claim_due_emails(20) c where c.id = :'mail'), 1::bigint, 'godkänt utskick plockas av kön');
reset role;

select test.login('v55-pt@test.se');
select test.eq((select count(*) from crm_email_logs), 0::bigint, 'PT ser inga utskick');
update crm_email_logs set approved_at = now();
select test.logout();

set role anon;
select test.fails('select 1 from crm_email_logs limit 1', 'anon: ingen åtkomst');
reset role;
