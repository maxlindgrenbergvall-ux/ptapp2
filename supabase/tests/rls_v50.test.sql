-- Tester för v50: prospekteringsjobb är bara åtkomliga för administratörer.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v50-admin@test.se', '{"role":"client","full_name":"Ola Admin","health_data_consent":true}', '{}'),
  ('v50-pt@test.se', '{"role":"trainer","full_name":"Pia PT"}', '{"role":"trainer"}');
select admin_grant('v50-admin@test.se');

select test.login('v50-admin@test.se');
insert into crm_prospect_jobs (config, state) values ('{"target":15}', '{}') returning id as job \gset
select test.eq((select status from crm_prospect_jobs where id = :'job'), 'running', 'administratören skapar ett jobb');
select test.fails($$update crm_prospect_jobs set status = 'okänd'$$, 'okänd status stoppas');
select test.logout();

select test.login('v50-pt@test.se');
select test.eq((select count(*) from crm_prospect_jobs), 0::bigint, 'PT ser inga jobb');
update crm_prospect_jobs set status = 'stopped';
select test.fails($$insert into crm_prospect_jobs (config, state) values ('{}', '{}')$$, 'PT kan inte skapa jobb');
select test.logout();
select test.eq((select status from crm_prospect_jobs where id = :'job'), 'running', 'PT:ns update träffade ingenting');

set role anon;
select test.fails('select 1 from crm_prospect_jobs limit 1', 'anon: ingen åtkomst');
reset role;
