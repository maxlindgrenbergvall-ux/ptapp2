-- Tester för v21: köp i appen (App Store via RevenueCat) – Plus-prenumeration och PT Boost.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('iap-klient@test.se', '{"role":"client","full_name":"Ida Iap","health_data_consent":true}', '{}'),
  ('iap-pt@test.se', '{"role":"trainer","full_name":"Per Iap"}', '{"role":"trainer"}');
select id as klient from auth.users where email = 'iap-klient@test.se' \gset
select id as pt from auth.users where email = 'iap-pt@test.se' \gset

-- ------------------------------------------------------- bara servern ---
select test.login('iap-klient@test.se');
select test.fails($$select apply_store_plus(auth.uid(), now() + interval '1 year', true, 'coavira_plus_yearly')$$, 'användare kan inte ge sig själva Plus');
select test.fails($$update profiles set store_plus_until = now() + interval '1 year' where id = auth.uid()$$, 'butiksprenumerationen kan inte ändras direkt');
select test.fails($$select * from store_transactions$$, 'butikstransaktionerna är dolda');
select test.eq((my_account())->>'is_plus', 'false', 'ingen Plus från början');
select test.logout();
select test.login('iap-pt@test.se');
select test.fails($$select apply_store_boost(auth.uid(), 'tx-fusk', 'coavira_pt_boost_7d', 7)$$, 'PT:n kan inte ge sig själv Boost');
select test.fails($$select revoke_store_boost('tx-1')$$, 'återbetalning kan inte anropas av användare');
select test.logout();
set role anon;
select test.fails($$select apply_store_plus(null, null, false, null)$$, 'anonyma: ingen åtkomst');
reset role;

-- ------------------------------------------------- Plus-prenumeration ---
set role service_role;
select apply_store_plus(:'klient', now() + interval '30 days', true, 'coavira_plus_monthly');
reset role;
select test.login('iap-klient@test.se');
select test.eq((my_account())->>'is_plus', 'true', 'köpt i appen: klienten har Plus');
select test.eq((my_account())->>'store_plus_renews', 'true', 'prenumerationen förnyas automatiskt');
select test.eq((my_account())->>'store_plus_product', 'coavira_plus_monthly', 'produkten visas');
select test.eq(((my_account())->>'coavira_plus_until')::timestamptz > now() + interval '29 days', true, 'slutdatumet visas');
select test.logout();

-- Plus från inbjudan (v18) och från butiken skriver inte över varandra.
select extend_plus(:'klient', 60);
set role service_role;
select apply_store_plus(:'klient', now() + interval '10 days', false, 'coavira_plus_monthly');
reset role;
select test.eq((select coavira_plus_until > now() + interval '59 days' from profiles where id = :'klient'), true, 'Plus från inbjudan finns kvar');
select test.login('iap-klient@test.se');
select test.eq(((my_account())->>'coavira_plus_until')::timestamptz > now() + interval '59 days', true, 'appen visar det senaste slutdatumet');
select test.eq((my_account())->>'store_plus_renews', 'false', 'uppsagd prenumeration förnyas inte');
select test.logout();

-- Återbetald/avslutad prenumeration: butiksdelen nollställs.
set role service_role;
select apply_store_plus(:'klient', null, false, null);
reset role;
select test.eq((select store_plus_until is null and store_plus_product is null and not store_plus_renews from profiles where id = :'klient'), true,
  'avslutad prenumeration tas bort');
update profiles set coavira_plus_until = null where id = :'klient';
select test.eq(has_plus(:'klient'), false, 'utan prenumeration och inbjudan: ingen Plus');
set role service_role;
select test.fails($$select apply_store_plus(gen_random_uuid(), now(), true, 'x')$$, 'okänd användare avvisas');
reset role;

-- ---------------------------------------------------------- PT Boost ---
set role service_role;
select apply_store_boost(:'pt', 'tx-1', 'coavira_pt_boost_7d', 7) as b1 \gset
select apply_store_boost(:'pt', 'tx-1', 'coavira_pt_boost_7d', 7) as b1_igen \gset
reset role;
select test.eq(:'b1'::timestamptz between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', true, 'Boost köpt i appen: 7 dagar');
select test.eq(:'b1_igen'::timestamptz, :'b1'::timestamptz, 'samma transaktion räknas bara en gång');
set role service_role;
select apply_store_boost(:'pt', 'tx-2', 'coavira_pt_boost_7d', 7) as b2 \gset
reset role;
select test.eq(:'b2'::timestamptz - :'b1'::timestamptz between interval '6 days 23 hours' and interval '7 days 1 hour', true, 'ett nytt köp läggs efter den pågående boosten');
set role service_role;
select test.fails($$select apply_store_boost('$$ || :'klient' || $$', 'tx-3', 'coavira_pt_boost_7d', 7)$$, 'klienter kan inte få Boost');
select revoke_store_boost('tx-2') as r2 \gset
select test.eq(revoke_store_boost('tx-2'), null::timestamptz, 'återbetalningen räknas bara en gång');
reset role;
select test.eq(abs(extract(epoch from (:'r2'::timestamptz - :'b1'::timestamptz))) < 5, true, 'återbetalt köp drar av 7 dagar');
set role service_role;
select revoke_store_boost('tx-1');
reset role;
select test.eq((select boosted_until from trainers where id = :'pt'), null::timestamptz, 'allt återbetalt: ingen boost (aldrig bakåt i tiden)');

-- ------------------------------------------------------------- övrigt ---
select test.eq((select rowsecurity from pg_tables where tablename = 'store_transactions'), true, 'store_transactions har RLS');
select test.eq((select count(*) from plus_plans where active), 1::bigint, 'en aktiv webbplan');
select test.eq((select days || ':' || price_sek from plus_plans where active), '30:49', 'webben: Plus 49 kr för 30 dagar');
-- Kontoradering tar även bort butikstransaktionerna.
select test.login('iap-pt@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from store_transactions where user_id = :'pt'), 0::bigint, 'kontoradering tar bort butikstransaktionerna');

\warn 'ALLA V21-TESTER (KÖP I APPEN) GODKÄNDA'
