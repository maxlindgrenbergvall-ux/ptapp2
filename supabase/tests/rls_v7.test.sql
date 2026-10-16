-- Tester för v7: PT-konton kan bara skapas av administratörer.
\set ON_ERROR_STOP on

-- Försök att registrera sig som PT med signUp-metadata (går att skicka från webbläsaren).
insert into auth.users (email, raw_user_meta_data) values
  ('fejk-pt@test.se', '{"role":"trainer","full_name":"Fejk PT"}');
select test.eq((select role from profiles p join auth.users u on u.id = p.id where u.email = 'fejk-pt@test.se'), null::user_role,
  'roll "trainer" i user_metadata ger inget PT-konto');
select test.eq((select count(*) from trainers t join auth.users u on u.id = t.id where u.email = 'fejk-pt@test.se'), 0::bigint,
  'ingen PT-profil skapas vid självregistrering');

select test.login('fejk-pt@test.se');
select test.fails($$select complete_onboarding('trainer', 'Fejk PT', '0701234567', false)$$, 'välkomststeget kan inte skapa PT-konton');
select test.fails($$insert into trainers (id) values (auth.uid())$$, 'användare kan inte skapa en PT-profil själva');
select test.fails($$select admin_make_trainer('fejk-pt@test.se')$$, 'inloggade användare kan inte anropa admin-funktionen');
select test.fails($$update profiles set role = 'trainer' where id = auth.uid()$$, 'användare kan inte sätta PT-rollen själva');
select test.logout();

set role anon;
select test.fails($$select admin_make_trainer('fejk-pt@test.se')$$, 'anonyma kan inte anropa admin-funktionen');
reset role;

-- Väg 1: Admin-API:t (service role) sätter app_metadata.role = trainer.
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('riktig-pt@test.se', '{"full_name":"Riktig PT"}', '{"role":"trainer"}');
select test.eq((select p.role::text || ':' || (p.onboarded_at is not null)::text from profiles p join auth.users u on u.id = p.id where u.email = 'riktig-pt@test.se'),
  'trainer:true', 'konto skapat av admin med app_metadata blir PT direkt');
select test.eq((select count(*) from trainers t join auth.users u on u.id = t.id where u.email = 'riktig-pt@test.se'), 1::bigint,
  'admin-skapad PT får en PT-profil');

-- Väg 2: Dashboard → Add user, sedan admin_make_trainer() i SQL Editor.
insert into auth.users (email) values ('dashboard-pt@test.se');
select admin_make_trainer('Dashboard-PT@test.se', 'Dashboard PT', '070 111 22 33');
select test.eq((select p.role::text || ':' || p.full_name || ':' || p.phone from profiles p join auth.users u on u.id = p.id where u.email = 'dashboard-pt@test.se'),
  'trainer:Dashboard PT:+46701112233', 'admin_make_trainer gör ett dashboard-skapat konto till PT');
select test.eq((select raw_app_meta_data->>'role' from auth.users where email = 'dashboard-pt@test.se'), 'trainer',
  'PT-rollen speglas i app_metadata (som användaren inte kan ändra)');
select test.fails($$select admin_make_trainer('finns-inte@test.se')$$, 'okänd e-post ger fel');

-- Ett klientkonto kan inte göras om till PT.
select test.fails($$select admin_make_trainer('c1@test.se')$$, 'befintligt klientkonto kan inte bli PT');

-- Klientregistrering fungerar som förut.
select test.login('fejk-pt@test.se');
select complete_onboarding('client', 'Inte PT', '0701234567', true);
select test.eq((select role::text from profiles where id = auth.uid()), 'client', 'självregistrerade blir klienter');
select test.logout();
select test.eq((select raw_app_meta_data->>'role' from auth.users where email = 'fejk-pt@test.se'), 'client',
  'klientrollen speglas i app_metadata');
select test.eq((select count(*) from auth.users u join profiles p on p.id = u.id where p.role is not null and u.raw_app_meta_data->>'role' is distinct from p.role::text), 0::bigint,
  'alla konton har rollen i app_metadata efter migreringen');

\warn 'ALLA V7-TESTER (PT-KONTON SKAPAS AV ADMIN) GODKÄNDA'
