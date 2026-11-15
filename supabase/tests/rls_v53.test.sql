-- Tester för v53: bolagsform, aktiviteter, uppföljningar och konverteringar.
-- Bara administratörer kommer åt något.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v53-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}', '{}'),
  ('v53-pt@test.se', '{"role":"trainer","full_name":"Petra Ny"}', '{"role":"trainer"}'),
  ('v53-klient@test.se', '{"role":"client","full_name":"Kalle Klient","health_data_consent":true}', '{}');
select admin_grant('v53-admin@test.se');

select test.login('v53-admin@test.se');
insert into crm_leads (name, email, segment, company_form, org_number) values ('Ab Aktiv', 'ab@aktiv.se', 'freelance', 'ab', '559123-4567') returning id as ab \gset
insert into crm_leads (name, email, segment, company_form, legal_basis) values ('Ella Enskild', 'ella@enskild.se', 'freelance', 'enskild', 'research') returning id as ef \gset
-- Leaden som har samma adress som PT-kontot (skiftläge spelar ingen roll).
insert into crm_leads (name, email, segment) values ('Petra Ny', 'V53-PT@test.se', 'freelance') returning id as pt_lead \gset
select test.eq((select legal_basis::text from crm_leads where id = :'ef'), 'research', 'ny rättslig grund: icke-säljande förfrågan');
select test.fails($$update crm_leads set org_number = '19900101-1234' where name = 'Ab Aktiv'$$, 'personnummer kan inte sparas som organisationsnummer');
select test.fails($$update crm_leads set org_number = '559123-4567' where name = 'Ella Enskild'$$, 'enskild firma får inget organisationsnummer');
select test.fails($$update crm_leads set preferred_channel = 'fax' where name = 'Ab Aktiv'$$, 'okänd kanal stoppas');
update crm_leads set status = 'meeting', meeting_at = now() + interval '2 days' where id = :'ab';
select test.eq((select status::text from crm_leads where id = :'ab'), 'meeting', 'nytt steg: Samtal bokat');

insert into crm_activities (lead_id, kind, body) values (:'ab', 'call_booked', 'Torsdag 10:00');
select test.fails($$insert into crm_activities (lead_id, kind) values ((select id from crm_leads limit 1), 'spam')$$, 'okänd aktivitet stoppas');

insert into crm_email_templates (template_key, name, subject, body, kind, company_form, followup_days, followup_subject, followup_body)
  values ('test-ab', 'AB', 'Hej', 'Text', 'intro', 'ab', 4, 'Hej', 'Påminnelse') returning id as tpl \gset
select test.fails($$insert into crm_email_templates (name, subject, body, followup_days) values ('X', 'Y', 'Z', 4)$$, 'uppföljning kräver en text');
select test.fails($$insert into crm_email_templates (name, subject, body, followup_days, followup_body) values ('X', 'Y', 'Z', 30, 'B')$$, 'uppföljning högst 14 dagar');
select test.fails($$insert into crm_email_templates (name, subject, body, kind) values ('X', 'Y', 'Z', 'spam')$$, 'okänd malltyp stoppas');
select test.fails($$insert into crm_email_templates (template_key, name, subject, body) values ('test-ab', 'X', 'Y', 'Z')$$, 'mallnyckeln är unik');

insert into crm_email_logs (lead_id, template_id, to_email, subject, body, scheduled_at) values (:'ab', :'tpl', 'ab@aktiv.se', 'Hej', 'Text', now()) returning id as first \gset
insert into crm_email_logs (lead_id, template_id, to_email, subject, body, scheduled_at, step, parent_id) values (:'ab', :'tpl', 'ab@aktiv.se', 'Hej', 'Påminnelse', now() + interval '4 days', 2, :'first');
select test.fails(format($$insert into crm_email_logs (lead_id, to_email, subject, body, scheduled_at, step, parent_id) values (%L, 'ab@aktiv.se', 'Hej', 'Igen', now(), 2, %L)$$, :'ab', :'first'), 'högst en uppföljning per mejl');
select test.fails(format($$insert into crm_email_logs (lead_id, to_email, subject, body, scheduled_at, step) values (%L, 'ab@aktiv.se', 'Hej', 'X', now(), 2)$$, :'ab'), 'en uppföljning måste höra till ett mejl');

select test.eq(crm_sync_conversions(), 1, 'en lead matchar ett registrerat PT-konto');
select test.eq((select status::text || ':' || (converted_user_id = test.uid('v53-pt@test.se'))::text from crm_leads where id = :'pt_lead'), 'customer:true', 'leaden blir kund och kopplas till kontot');
select test.eq((select count(*) from crm_activities where lead_id = :'pt_lead' and kind = 'converted'), 1::bigint, 'konverteringen loggas som aktivitet');
select test.eq(crm_sync_conversions(), 0, 'andra körningen: inget nytt');
select test.logout();

-- ------------------------------------------------- bara administratörer ---
select test.login('v53-klient@test.se');
select test.eq((select count(*) from crm_activities), 0::bigint, 'klient ser inga aktiviteter');
select test.fails($$insert into crm_activities (lead_id, kind) values (gen_random_uuid(), 'dm_sent')$$, 'klient kan inte logga aktiviteter');
select test.fails('select crm_sync_conversions()', 'klient kan inte köra konverteringssynken');
select test.logout();

select test.login('v53-pt@test.se');
select test.eq((select count(*) from crm_leads), 0::bigint, 'PT ser inga leads (inte heller sin egen)');
select test.fails('select crm_sync_conversions()', 'PT kan inte köra konverteringssynken');
select test.logout();

set role anon;
select test.fails('select 1 from crm_activities limit 1', 'anon: ingen åtkomst till aktiviteter');
select test.fails('select crm_sync_conversions()', 'anon kan inte köra konverteringssynken');
reset role;

-- Säkerhetskontrollen från v51 gäller fortfarande.
select test.eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'RLS påslagen på alla tabeller i public');
select test.eq(
  (select coalesce(string_agg(tablename, ', ' order by tablename), '')
     from pg_tables t
    where schemaname = 'public' and tablename like 'crm\_%'
      and not exists (select 1 from pg_policies p where p.tablename = t.tablename and p.qual like '%is_admin()%')),
  '', 'varje CRM-tabell har en policy som kräver is_admin()');
