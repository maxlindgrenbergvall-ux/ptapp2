-- Tester för v6: registrering (e-post/telefon, Apple/Google), välkomststeget
-- (kontotyp en gång) och att gratiserbjudanden inte kan skapas.
\set ON_ERROR_STOP on

-- E-post + telefon + lösenord (signUp med metadata, ingen roll).
insert into auth.users (email, raw_user_meta_data) values
  ('ny@test.se', '{"phone":"070-123 45 67"}');
-- Google: namn från leverantören, inget telefonnummer.
insert into auth.users (email, raw_user_meta_data) values
  ('google@test.se', '{"name":"Greta Google","avatar_url":"https://x"}');
-- Apple med dold e-post och utan namn.
insert into auth.users (email, raw_user_meta_data) values
  ('abc123@privaterelay.appleid.com', '{}');

select test.eq((select p.phone from profiles p join auth.users u on u.id = p.id where u.email = 'ny@test.se'), '+46701234567',
  'telefonnumret sparas på profilen i E.164-format');
select test.eq((select role from profiles p join auth.users u on u.id = p.id where u.email = 'ny@test.se'), null::user_role,
  'ny användare har ingen kontotyp innan välkomststeget');
select test.eq((select full_name from profiles p join auth.users u on u.id = p.id where u.email = 'google@test.se'), 'Greta Google',
  'namnet från Google används');
select test.eq((select full_name from profiles p join auth.users u on u.id = p.id where u.email like '%privaterelay%'), 'abc123',
  'Apple utan namn får ett tillfälligt namn');
select test.eq(normalize_phone('+46 70 123 45 67'), '+46701234567', 'nummer med landskod normaliseras');
select test.eq(normalize_phone('0046701234567'), '+46701234567', '00-prefix normaliseras');
select test.eq(normalize_phone('12'), null::text, 'för korta nummer avvisas');

-- ------------------------------------------------------- välkomststeget ---
select test.login('ny@test.se');
select test.fails($$update profiles set role = 'trainer' where id = auth.uid()$$, 'kontotyp kan inte sättas med en vanlig uppdatering');
select test.fails($$select complete_onboarding('client', 'Nils Ny', '0701234567', false)$$, 'klientkonto kräver samtycke till hälsodata');
select test.fails($$select complete_onboarding('client', 'Nils Ny', 'abc', true)$$, 'ogiltigt telefonnummer avvisas');
select test.fails($$select complete_onboarding('client', '  ', '0701234567', true)$$, 'namn krävs');
select complete_onboarding('client', 'Nils Ny', '0701234567', true);
select test.eq((select role::text || ':' || (health_data_consent_at is not null)::text || ':' || (onboarded_at is not null)::text from profiles where id = auth.uid()),
  'client:true:true', 'välkomststeget sätter kontotyp, samtycke och klar-tid');
select test.fails($$select complete_onboarding('trainer', 'Nils Ny', '0701234567', false)$$, 'kontotypen kan bara väljas en gång');
select test.fails($$update profiles set role = 'trainer' where id = auth.uid()$$, 'klient kan inte göra sig till PT');
update profiles set phone = '+46709999999' where id = auth.uid();
select test.eq((select phone from profiles where id = auth.uid()), '+46709999999', 'användaren kan uppdatera sitt telefonnummer');
select test.fails($$update profiles set phone = '0709' where id = auth.uid()$$, 'telefonnummer måste vara giltigt');
select test.logout();
select test.eq((select raw_user_meta_data->>'role' from auth.users where email = 'ny@test.se'), 'client',
  'kontotypen speglas i auth-metadata (för navigeringen)');

select test.login('google@test.se');
select complete_onboarding('trainer', 'Greta Google', '+4687654321', false);
select test.eq((select count(*) from trainers where id = auth.uid()), 1::bigint, 'PT-konto från Google får en PT-profil');
select test.eq((select health_data_consent_at from profiles where id = auth.uid()), null::timestamptz, 'PT behöver inget hälsodatasamtycke');
select test.logout();

set role anon;
select test.fails($$select complete_onboarding('trainer', 'Anonym', '0701234567', false)$$, 'anonyma kan inte slutföra välkomststeget');
reset role;

-- ------------------------------------------------------- inga gratispass ---
select test.login('google@test.se');
update trainers set specialties = '{hyrox}', city = 'Umeå', bio = repeat('x', 50) where id = auth.uid();
select test.fails($$update trainers set is_published = true where id = auth.uid()$$, 'PT utan pris per pass kan inte publiceras');
update trainers set price_per_session = 700, is_published = true where id = auth.uid();
select test.fails($$insert into trainer_offers (trainer_id, category, title, discount_percent) values (auth.uid(), 'hyrox', 'Helt utan kostnad', 100)$$,
  '100 % rabatt går inte');
select test.fails($$insert into trainer_offers (trainer_id, category, title, price_sek) values (auth.uid(), 'hyrox', 'Provpass', 0)$$,
  'erbjudande för 0 kr går inte');
select test.fails($$insert into trainer_offers (trainer_id, category, title) values (auth.uid(), 'hyrox', 'Första passet gratis')$$,
  'erbjudanden kan inte marknadsföras som gratis');
select test.fails($$insert into trainer_offers (trainer_id, category, title, description) values (auth.uid(), 'hyrox', 'Startpaket', 'Kostnadsfritt första pass')$$,
  'inte heller i beskrivningen');
insert into trainer_offers (trainer_id, category, title, discount_percent) values (auth.uid(), 'hyrox', 'Hyrox-start', 20);
select test.eq((select count(*) from trainer_offers where trainer_id = auth.uid()), 1::bigint, 'vanliga erbjudanden fungerar');
select test.logout();

\warn 'ALLA V6-TESTER (INLOGGNING, INGA GRATISPASS) GODKÄNDA'
