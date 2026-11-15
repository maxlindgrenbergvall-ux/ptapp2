-- Tester för v47: CRM-tabellerna är bara åtkomliga för administratörer, och
-- dubbletter stoppas av databasen.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v47-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}', '{}'),
  ('v47-klient@test.se', '{"role":"client","full_name":"Kalle Klient","health_data_consent":true}', '{}'),
  ('v47-pt@test.se', '{"role":"trainer","full_name":"Petra PT"}', '{"role":"trainer"}');
select id as admin from auth.users where email = 'v47-admin@test.se' \gset
select admin_grant('V47-Admin@test.se');

-- ---------------------------------------------- 1. bara administratörer ---
select test.login('v47-klient@test.se');
select test.eq(is_admin(), false, 'klient är inte administratör');
select test.fails($$insert into crm_leads (name, email) values ('Intrång', 'x@exempel.se')$$, 'klient kan inte skapa leads');
select test.fails($$select admin_grant('v47-klient@test.se')$$, 'klient kan inte göra sig själv till administratör');
select test.fails($$insert into app_admins (user_id) values (auth.uid())$$, 'klient kan inte skriva i app_admins');
select test.fails($$select * from crm_claim_due_emails(5)$$, 'klient kan inte köra köns arbetare');
select test.logout();

select test.login('v47-admin@test.se');
select test.eq(is_admin(), true, 'admin_grant gör kontot till administratör (skiftläge i adressen spelar ingen roll)');
insert into crm_leads (name, email, instagram, website_url, segment) values
  ('Elin Exempel', 'Elin@Exempel.se', 'Elin.PT', 'https://www.elinpt.se/', 'freelance') returning id as lead \gset
insert into crm_notes (lead_id, author_id, body) values (:'lead', auth.uid(), 'Ringde, återkommer v. 48');
insert into crm_email_templates (name, subject, body) values ('Test', 'Hej {{förnamn}}', 'Text') returning id as tpl \gset
insert into crm_email_logs (lead_id, template_id, to_email, subject, body, scheduled_at) values
  (:'lead', :'tpl', 'elin@exempel.se', 'Hej Elin', 'Text', now() - interval '1 minute') returning id as log \gset
insert into crm_suppressions (email_hash) values (encode(sha256('borta@exempel.se'::bytea), 'hex'));
select test.eq((select count(*) from crm_leads), 1::bigint, 'administratören ser och skapar leads');
select test.logout();

select test.login('v47-klient@test.se');
select test.eq((select count(*) from crm_leads), 0::bigint, 'klient ser inga leads');
select test.eq((select count(*) from crm_notes), 0::bigint, 'klient ser inga anteckningar');
select test.eq((select count(*) from crm_email_logs), 0::bigint, 'klient ser inga utskick');
select test.eq((select count(*) from crm_email_templates), 0::bigint, 'klient ser inga mallar');
select test.eq((select count(*) from crm_suppressions), 0::bigint, 'klient ser inga avregistreringar');
update crm_leads set status = 'customer';
delete from crm_leads;
select test.logout();
select test.login('v47-pt@test.se');
select test.eq(is_admin(), false, 'PT är inte administratör');
select test.eq((select count(*) from crm_leads), 0::bigint, 'PT ser inga leads');
select test.fails($$insert into crm_notes (lead_id, body) select id, 'x' from crm_leads$$ || $$ union all select gen_random_uuid(), 'x'$$, 'PT kan inte skriva anteckningar');
select test.logout();
select test.eq((select status::text from crm_leads where id = :'lead'), 'new', 'klientens update/delete träffade ingenting (leaden är orörd)');

set role anon;
select test.fails('select 1 from crm_leads limit 1', 'anon: ingen åtkomst till leads');
select test.fails('select 1 from crm_email_logs limit 1', 'anon: ingen åtkomst till utskick');
select test.fails('select is_admin()', 'anon: kan inte anropa is_admin');
reset role;

-- ------------------------------------------------------- 2. dubbletter ---
select test.login('v47-admin@test.se');
select test.fails($$insert into crm_leads (name, email) values ('Dubblett', 'ELIN@exempel.SE')$$, 'samma e-postadress (annat skiftläge) stoppas');
select test.fails($$insert into crm_leads (name, instagram) values ('Dubblett', 'elin.pt')$$, 'samma Instagram-konto stoppas');
select test.fails($$insert into crm_leads (name, website_url) values ('Dubblett', 'http://elinpt.se')$$, 'samma webbadress (utan www, utan snedstreck, http) stoppas');
select test.fails($$insert into crm_leads (name, website_url) values ('Dubblett', 'https://elinpt.se/?utm=1')$$, 'samma webbadress med frågesträng stoppas');
insert into crm_leads (name, website_url) values ('Annan sida', 'https://elinpt.se/kontakt');
select test.eq((select count(*) from crm_leads), 2::bigint, 'en annan sida på samma domän är en egen lead');
insert into crm_leads (name) values ('Utan kontaktuppgifter'), ('Också utan');
select test.eq((select count(*) from crm_leads), 4::bigint, 'leads utan e-post/Instagram/webb krockar inte med varandra');

-- ------------------------------------------------------- 3. regler ---
select test.fails($$insert into crm_leads (name, email) values ('Fel', 'inte-en-adress')$$, 'ogiltig e-postadress stoppas');
select test.fails($$insert into crm_leads (name, phone) values ('Fel', '070-123 45 67')$$, 'telefon måste vara i formatet +46…');
select test.fails($$insert into crm_leads (name, score) values ('Fel', 101)$$, 'lead score över 100 stoppas');
select test.fails($$insert into crm_leads (name, instagram) values ('Fel', '@med snabel-a')$$, 'Instagram sparas som rent kontonamn');
select status_changed_at as changed from crm_leads where id = :'lead' \gset
select pg_sleep(0.02);
update crm_leads set gym = 'SATS' where id = :'lead';
select test.eq((select status_changed_at from crm_leads where id = :'lead'), :'changed'::timestamptz, 'status_changed_at ändras inte av andra ändringar');
update crm_leads set status = 'qualified' where id = :'lead';
select test.eq((select status_changed_at > :'changed'::timestamptz from crm_leads where id = :'lead'), true, 'status_changed_at sätts när statusen ändras');
select test.logout();

-- ------------------------------------------------- 4. köns arbetare ---
select test.eq((select count(*) from crm_claim_due_emails(5)), 1::bigint, 'servern hämtar utskicket som är dags');
select test.eq((select status::text from crm_email_logs where id = :'log'), 'sending', 'det hämtade utskicket är låst (sending)');
select test.eq((select count(*) from crm_claim_due_emails(5)), 0::bigint, 'samma utskick hämtas aldrig två gånger');

-- Radering av en lead tar med anteckningar och utskick.
delete from crm_leads where id = :'lead';
select test.eq((select count(*) from crm_notes) + (select count(*) from crm_email_logs), 0::bigint, 'raderad lead: anteckningar och utskick följer med');
select test.eq((select count(*) from crm_suppressions), 1::bigint, 'avregistreringar ligger kvar även när leads raderas');
