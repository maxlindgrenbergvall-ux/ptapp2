-- Tester för v18: Coavira Plus, inbjudningskoder och belöningar (klient: 1 månad Plus, PT: 7 dagars Boost).
\set ON_ERROR_STOP on
grant usage on schema test to service_role, anon;
grant execute on all functions in schema test to service_role, anon;

-- ----------------------------------------------------------------- koder ---
select test.eq((select count(*) from profiles where referral_code !~ '^[A-HJ-NP-Z2-9]{8}$'), 0::bigint, 'alla befintliga profiler har fått en kod (8 tecken, inga 0/O/1/I/L)');
select test.eq((select count(distinct referral_code) = count(*) from profiles), true, 'koderna är unika');

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('ref-a@test.se', '{"role":"client","full_name":"Anna Inbjuder","health_data_consent":true}', '{}'),
  ('ref-b@test.se', '{"role":"client","full_name":"Bo Ny","health_data_consent":true}', '{}'),
  ('ref-c@test.se', '{"role":"client","full_name":"Cia Ny","health_data_consent":true}', '{}'),
  ('ref-d@test.se', '{"role":"client","full_name":"Dan Gammal","health_data_consent":true}', '{}'),
  ('pt-ref@test.se', '{"role":"trainer","full_name":"Per Värvare"}', '{"role":"trainer"}'),
  ('pt-ny@test.se', '{"role":"trainer","full_name":"Nina Ny PT"}', '{"role":"trainer"}');
insert into auth.users (email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data) values
  ('ref-obekraftad@test.se', null, '{"role":"client","full_name":"Ej Bekräftad","health_data_consent":true}', '{}');
select test.eq((select referral_code is not null from profiles where id = test.uid('ref-b@test.se')), true, 'nya konton får en kod direkt');
select referral_code as code_a from profiles where id = test.uid('ref-a@test.se') \gset
select referral_code as code_pt from profiles where id = test.uid('pt-ref@test.se') \gset

-- ------------------------------------------------------ kolumnskydd ---
select test.login('ref-a@test.se');
select test.eq((select full_name from profiles where id = auth.uid()), 'Anna Inbjuder', 'appens vanliga profilfält går att läsa');
update profiles set interests = '{styrkelyft}' where id = auth.uid();
select test.eq((my_account())->>'referral_code', :'code_a', 'användaren ser sin egen kod (my_account)');
select test.eq((my_account())->>'is_plus', 'false', 'ingen Plus från början');
select test.fails($$update profiles set coavira_plus_until = now() + interval '10 years' where id = auth.uid()$$, 'kan inte ge sig själv Plus');
select test.fails($$update profiles set is_coavira_plus = true where id = auth.uid()$$, 'kan inte sätta Plus utan slutdatum');
select test.fails($$update profiles set referral_code = 'AAAAAAAA' where id = auth.uid()$$, 'kan inte byta kod');
select test.fails($$select referral_code from profiles where id = auth.uid()$$, 'koden läses bara via my_account (kolumnskydd)');
select test.fails($$select has_plus(auth.uid())$$, 'has_plus är intern');
select test.logout();
-- En PT som ser sin klients profil ser inte klientens kod eller Plus.
select test.login('pt16@test.se');
select test.eq((select count(*) from profiles where id = test.uid('c17@test.se')), 1::bigint, 'PT:n ser sin klients profil');
select test.fails($$select coavira_plus_until from profiles where id = test.uid('c17@test.se')$$, 'men inte klientens Plus-status');
select test.fails($$select referral_code from profiles where id = test.uid('c17@test.se')$$, 'och inte klientens kod');
select test.logout();
set role anon;
select test.fails($$select full_name from profiles$$, 'anonyma kan inte läsa profiler');
reset role;

-- ------------------------------------------- klient: 1 månad + 1 månad ---
select test.login('ref-b@test.se');
select test.fails($$select redeem_referral('ZZZZZZZZ')$$, 'okänd kod avvisas');
select test.fails($$select redeem_referral((my_account())->>'referral_code')$$, 'egen kod avvisas');
select test.fails($$select redeem_referral('$$ || :'code_pt' || $$')$$, 'en klient kan inte använda en PT-kod');
select redeem_referral(lower(:'code_a')) as r1 \gset
select test.eq((:'r1'::jsonb)->>'status', 'COMPLETED', 'klientinbjudan blir klar direkt (koden fungerar även med små bokstäver)');
select test.eq((my_account())->>'is_plus', 'true', 'den nya klienten har Plus');
select test.eq(((my_account())->>'coavira_plus_until')::timestamptz between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', true,
  'den nya klienten får 1 månad (30 dagar)');
select test.fails($$select redeem_referral('$$ || :'code_a' || $$')$$, 'en kod kan bara lösas in en gång per konto');
select test.eq((select count(*) from referrals), 1::bigint, 'den inbjudna ser sin inbjudan');
select test.logout();

select test.login('ref-a@test.se');
select test.eq((my_account())->>'is_plus', 'true', 'inbjudaren har fått Plus');
select test.eq((select type::text || ':' || status::text || ':' || referrer_rewarded::text from referrals), 'CLIENT_PLUS:COMPLETED:true',
  'inbjudaren ser sin inbjudan och belöningen');
select test.fails($$insert into referrals (referrer_id, referred_id, type, status, code) values (auth.uid(), test.uid('ref-d@test.se'), 'CLIENT_PLUS', 'COMPLETED', 'X')$$,
  'användare kan inte skapa inbjudningar själva');
select test.logout();
select test.login('c17@test.se');
select test.eq((select count(*) from referrals), 0::bigint, 'andra ser inte inbjudningarna');
select test.logout();

-- En andra vän: inbjudarens Plus förlängs med ytterligare 30 dagar.
select coavira_plus_until as a_until from profiles where id = test.uid('ref-a@test.se') \gset
select test.login('ref-c@test.se');
select redeem_referral(:'code_a');
select test.logout();
select test.eq((select coavira_plus_until from profiles where id = test.uid('ref-a@test.se')), :'a_until'::timestamptz + interval '30 days',
  'ny inbjudan förlänger inbjudarens Plus med 30 dagar');

-- Missbruksskydd.
alter table profiles disable trigger user;
update profiles set created_at = now() - interval '20 days' where id = test.uid('ref-d@test.se');
alter table profiles enable trigger user;
select test.login('ref-d@test.se');
select test.fails($$select redeem_referral('$$ || :'code_a' || $$')$$, 'koder gäller bara nya konton (14 dagar)');
select test.eq((my_account())->>'can_redeem', 'false', 'my_account visar att kontot inte kan lösa in');
select test.logout();
select test.login('ref-obekraftad@test.se');
select test.fails($$select redeem_referral('$$ || :'code_a' || $$')$$, 'obekräftad e-post kan inte lösa in');
select test.logout();
-- Tak: högst 12 belöningar per år för en inbjudare.
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data)
select 'tak' || g || '@test.se', '{"role":"client","full_name":"Tak","health_data_consent":true}', '{}' from generate_series(1, 12) g;
insert into referrals (referrer_id, referred_id, type, status, code, referrer_rewarded, completed_at)
select test.uid('ref-d@test.se'), test.uid('tak' || g || '@test.se'), 'CLIENT_PLUS', 'COMPLETED', 'X', true, now() from generate_series(1, 12) g;
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ('tak13@test.se', '{"role":"client","full_name":"Tretton","health_data_consent":true}', '{}');
select referral_code as code_d from profiles where id = test.uid('ref-d@test.se') \gset
select test.login('tak13@test.se');
select redeem_referral(:'code_d');
select test.eq((my_account())->>'is_plus', 'true', 'den nya klienten får alltid sin månad');
select test.logout();
select test.eq((select referrer_rewarded from referrals where referred_id = test.uid('tak13@test.se')), false, 'inbjudaren belönas högst 12 gånger per år');
select test.eq((select coavira_plus_until from profiles where id = test.uid('ref-d@test.se')), null::timestamptz,
  'inbjudarens Plus förlängs inte över taket');

-- ------------------------------------------------------- PT: 7 dagars Boost ---
select test.login('pt-ref@test.se');
update trainers set is_published = true, price_per_session = 700, city = 'Lund', specialties = '{rehab}' where id = auth.uid();
select test.fails($$update trainers set boosted_until = now() + interval '7 days' where id = auth.uid()$$, 'PT:n kan fortfarande inte boosta sig själv');
select test.logout();
select test.login('pt-ny@test.se');
select test.fails($$select redeem_referral('$$ || :'code_a' || $$')$$, 'en PT kan inte använda en klientkod');
select redeem_referral(:'code_pt') as r2 \gset
select test.eq((:'r2'::jsonb)->>'status', 'PENDING', 'PT-värvningen väntar på verifiering');
select test.logout();
select test.eq((select boosted_until from trainers where id = test.uid('pt-ref@test.se')), null::timestamptz, 'ingen Boost före verifieringen');
select test.login('pt-ref@test.se');
select test.eq((select type::text || ':' || status::text from referrals), 'PT_BOOST:PENDING', 'den värvande PT:n ser den väntande värvningen');
select test.fails($$select admin_link_trainer_referral('pt-ny@test.se', '$$ || :'code_pt' || $$')$$, 'PT kan inte anropa admin-funktionen');
select test.logout();
-- Coavira verifierar den nya PT:n (certifiering@) → den värvande PT:n får 7 dagar.
select admin_set_certifications('pt-ny@test.se', array['Licensierad PT']);
select test.eq((select status::text from referrals where referred_id = test.uid('pt-ny@test.se')), 'COMPLETED', 'värvningen blir klar vid verifieringen');
select test.eq((select boosted_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from trainers where id = test.uid('pt-ref@test.se')), true,
  'den värvande PT:n får 7 dagars Boost (199 kr)');
select admin_set_certifications('pt-ny@test.se', array['Licensierad PT', 'Kostrådgivare']);
select test.eq((select boosted_until < now() + interval '7 days 1 hour' from trainers where id = test.uid('pt-ref@test.se')), true, 'belöningen ges bara en gång');

-- ------------------------------------------------------------ Plus-köp ---
select test.login('ref-d@test.se');
select test.fails($$select create_plus_checkout()$$, 'utan plan kan Plus inte köpas än');
select test.fails($$insert into plus_plans (days, price_sek) values (30, 3)$$, 'användare kan inte sätta priset');
select test.logout();
insert into plus_plans (days, price_sek) values (30, 79);
select test.login('pt-ref@test.se');
select test.fails($$select create_plus_checkout()$$, 'Plus finns för klienter');
select test.logout();
select test.login('ref-d@test.se');
select create_plus_checkout() as pp \gset
select test.eq((:'pp'::jsonb)->>'price_sek', '79', 'priset kommer från planen');
select attach_plus_session(((:'pp'::jsonb)->>'purchase_id')::uuid, 'cs_plus_1');
select test.fails($$select mark_plus_paid('$$ || ((:'pp'::jsonb)->>'purchase_id') || $$', null, null, 79)$$, 'klienten kan inte markera Plus som betalt');
select test.logout();
set role service_role;
select test.fails($$select mark_plus_paid('$$ || ((:'pp'::jsonb)->>'purchase_id') || $$', 'cs_plus_1', 'pi_plus_1', 1)$$, 'fel belopp avvisas');
select mark_plus_paid(((:'pp'::jsonb)->>'purchase_id')::uuid, 'cs_plus_1', 'pi_plus_1', 79) as plus_until \gset
select test.eq(:'plus_until'::timestamptz between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', true, 'köpt Plus gäller 30 dagar');
select test.eq(mark_plus_paid(((:'pp'::jsonb)->>'purchase_id')::uuid, 'cs_plus_1', 'pi_plus_1', 79), :'plus_until'::timestamptz, 'betalningen är idempotent');
select test.eq(mark_plus_refunded('pi_plus_1'), 1, 'återbetalning registreras');
reset role;
select test.eq((select coavira_plus_until from profiles where id = test.uid('ref-d@test.se')), null::timestamptz, 'återbetalt Plus tas bort');

\warn 'ALLA V18-TESTER (COAVIRA PLUS, INBJUDNINGAR) GODKÄNDA'
