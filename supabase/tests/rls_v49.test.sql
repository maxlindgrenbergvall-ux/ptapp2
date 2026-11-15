-- Tester för v49: Instagram-fält i CRM:et. RLS från v47 gäller oförändrat.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v49-admin@test.se', '{"role":"client","full_name":"Ida Admin","health_data_consent":true}', '{}'),
  ('v49-klient@test.se', '{"role":"client","full_name":"Klas Klient","health_data_consent":true}', '{}');
select admin_grant('v49-admin@test.se');

select test.login('v49-admin@test.se');
insert into crm_leads (name, instagram, instagram_followers, source, source_url) values ('Insta PT', 'insta.pt', 12300, 'instagram', 'https://www.instagram.com/insta.pt/');
select test.eq((select instagram_followers from crm_leads where instagram = 'insta.pt'), 12300, 'följarantalet sparas');
select test.eq((select source from crm_leads where instagram = 'insta.pt'), 'instagram', 'källan instagram är tillåten');
select test.fails($$insert into crm_leads (name, instagram_followers) values ('Fel', -1)$$, 'negativt följarantal stoppas');
select test.fails($$insert into crm_leads (name, source) values ('Fel', 'okänd')$$, 'okända källor stoppas fortfarande');
select test.fails($$insert into crm_leads (name, instagram) values ('Dubblett', 'INSTA.PT')$$, 'dubblettskyddet gäller även Instagram-leads');
select test.logout();

select test.login('v49-klient@test.se');
select test.eq((select count(*) from crm_leads), 0::bigint, 'klient ser fortfarande inga leads');
select test.logout();
