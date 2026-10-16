-- Tester för v8: PT-konton loggar bara in med e-post (ingen Apple/Google).
\set ON_ERROR_STOP on

-- Admin skapar PT med bara e-post (Supabase lägger till en email-identitet).
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('pt-epost@test.se', '{"full_name":"Epost PT"}', '{"role":"trainer"}');
insert into auth.identities (user_id, provider) select id, 'email' from auth.users where email = 'pt-epost@test.se';
select test.eq((select count(*) from auth.identities i join auth.users u on u.id = i.user_id where u.email = 'pt-epost@test.se'), 1::bigint,
  'PT-konto har en e-postidentitet');

select test.fails($$insert into auth.identities (user_id, provider) select id, 'google' from auth.users where email = 'pt-epost@test.se'$$,
  'Google kan inte kopplas till ett PT-konto');
select test.fails($$insert into auth.identities (user_id, provider) select id, 'apple' from auth.users where email = 'pt-epost@test.se'$$,
  'Apple kan inte kopplas till ett PT-konto');
select test.fails($$update auth.identities set provider = 'google' where user_id = (select id from auth.users where email = 'pt-epost@test.se')$$,
  'en befintlig identitet kan inte bytas till Google för en PT');

-- Konto som gjorts till PT via admin_make_trainer omfattas också.
insert into auth.users (email) values ('dash-pt@test.se');
insert into auth.identities (user_id, provider) select id, 'email' from auth.users where email = 'dash-pt@test.se';
select admin_make_trainer('dash-pt@test.se', 'Dash PT');
select test.fails($$insert into auth.identities (user_id, provider) select id, 'google' from auth.users where email = 'dash-pt@test.se'$$,
  'Google kan inte kopplas till en PT skapad via dashboard');

-- Ett Google-konto kan inte göras till PT.
insert into auth.users (email, raw_user_meta_data) values ('g-konto@test.se', '{"name":"G Konto"}');
insert into auth.identities (user_id, provider) select id, 'google' from auth.users where email = 'g-konto@test.se';
select test.fails($$select admin_make_trainer('g-konto@test.se')$$, 'konto kopplat till Google kan inte bli PT');

-- Klienter kan fortfarande använda Apple och Google.
insert into auth.users (email, raw_user_meta_data) values ('klient-apple@test.se', '{"role":"client","full_name":"Klient Apple","health_data_consent":true}');
insert into auth.identities (user_id, provider) select id, 'apple' from auth.users where email = 'klient-apple@test.se';
select test.eq((select count(*) from auth.identities i join auth.users u on u.id = i.user_id where u.email = 'klient-apple@test.se' and provider = 'apple'), 1::bigint,
  'klienter kan koppla Apple');

select test.login('pt-epost@test.se');
select test.fails($$select is_trainer_account(auth.uid())$$, 'hjälpfunktionen är inte åtkomlig för användare');
select test.logout();

\warn 'ALLA V8-TESTER (PT ENDAST E-POST) GODKÄNDA'
