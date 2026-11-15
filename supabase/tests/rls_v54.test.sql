-- Tester för v54: berikningsfälten, skyddet mot personnummer och att bara
-- administratörer kommer åt något.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v54-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}', '{}'),
  ('v54-pt@test.se', '{"role":"trainer","full_name":"Petra PT"}', '{"role":"trainer"}');
select admin_grant('v54-admin@test.se');

select test.login('v54-admin@test.se');
insert into crm_leads (name, segment) values ('Nina Ny', 'freelance') returning id as lead \gset
select test.eq((select company_type || ':' || enrichment_status || ':' || company_type_manual::text from crm_leads where id = :'lead'), 'unknown:pending:false', 'en ny lead väntar på berikning');
update crm_leads set company_type = 'ab', company_form = 'ab', org_number = '559123-4567', enrichment_status = 'done',
  enrichment = '{"evidence":[{"source":"website","kind":"ab","weight":90,"detail":"Org.nr 559123-4567 på webbplatsen"}],"confidence":90,"summary":"AB","skipped":[]}',
  enriched_at = now(), verified_at = now()
  where id = :'lead';
select test.eq((select enrichment->>'confidence' from crm_leads where id = :'lead'), '90', 'bevisen sparas (ett aktiebolags org.nr går bra)');
select test.fails(format($$update crm_leads set enrichment = '{"detail":"Org.nr 850101-1234"}' where id = %L$$, :'lead'), 'ett personnummer kan inte sparas i bevisen');
select test.fails(format($$update crm_leads set enrichment = '{"detail":"19850101-1234"}' where id = %L$$, :'lead'), 'inte heller med sekel');
select test.fails(format($$update crm_leads set enrichment = '[]' where id = %L$$, :'lead'), 'bevisen måste vara ett objekt');
select test.fails(format($$update crm_leads set company_type = 'gissning' where id = %L$$, :'lead'), 'okänd bolagstyp stoppas');
select test.fails(format($$update crm_leads set enrichment_status = 'kanske' where id = %L$$, :'lead'), 'okänd status stoppas');
update crm_leads set company_type = 'gym_anstalld' where id = :'lead';
select test.eq((select company_type from crm_leads where id = :'lead'), 'gym_anstalld', 'alla bolagstyper går att spara');
select test.logout();

select test.login('v54-pt@test.se');
select test.eq((select count(*) from crm_leads), 0::bigint, 'PT ser inga leads eller bevis');
update crm_leads set company_type = 'ab';
select test.logout();
select test.eq((select company_type from crm_leads where name = 'Nina Ny'), 'gym_anstalld', 'PT:ns ändring träffade ingenting');

set role anon;
select test.fails('select enrichment from crm_leads limit 1', 'anon: ingen åtkomst');
reset role;

select test.eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'RLS påslagen på alla tabeller i public');
