-- Tester för v10: kalenderlänk (iCal) för PT och klient.
\set ON_ERROR_STOP on

select test.login('c10@test.se');
select calendar_feed_token() as client_token \gset
select test.eq(length(:'client_token'), 64, 'kalenderlänken har en lång hemlig token');
select test.eq(calendar_feed_token(), :'client_token', 'samma token returneras igen');
select test.fails($$insert into calendar_feeds (user_id) values (auth.uid())$$, 'tokens skapas bara via funktionen');
select test.eq((select count(*) from calendar_feeds), 1::bigint, 'användaren ser bara sin egen länk');
select test.logout();

select test.login('pt10@test.se');
select calendar_feed_token() as pt_token \gset
select test.eq((select count(*) from calendar_feeds), 1::bigint, 'PT ser bara sin egen länk');
select test.logout();

-- Flödet nås utan inloggning, med token som enda nyckel.
set role anon;
select test.eq((select count(*) > 0 from calendar_feed(:'pt_token')), true, 'PT:ns flöde innehåller pass');
select test.eq((select bool_and(owner_role = 'trainer') from calendar_feed(:'pt_token')), true, 'flödet hör till rätt konto');
select test.eq((select count(*) from calendar_feed(:'pt_token') where kind = 'block'), 1::bigint, 'PT:ns blockeringar följer med');
select test.eq((select count(*) from calendar_feed(:'client_token') where kind = 'block'), 0::bigint, 'klienten ser aldrig PT:ns blockeringar');
select test.eq((select bool_and(counterpart = 'PT Tio') from calendar_feed(:'client_token')), true, 'klientens pass visar PT:ns namn');
select test.eq((select count(*) from calendar_feed(repeat('0', 64))), 0::bigint, 'okänd token ger inget');
select test.eq((select count(*) from calendar_feed('abc')), 0::bigint, 'felformad token ger inget');
select test.fails($$select * from calendar_feeds$$, 'anonyma kan inte läsa tokens');
select test.fails($$select calendar_feed_token()$$, 'anonyma kan inte skapa länkar');
reset role;

-- Byt länk: den gamla slutar fungera.
select test.login('c10@test.se');
select calendar_feed_token(true) as new_token \gset
select test.eq(:'new_token' <> :'client_token', true, 'ny länk skapas');
select test.logout();
set role anon;
select test.eq((select count(*) from calendar_feed(:'client_token')), 0::bigint, 'den gamla länken slutar fungera');
reset role;

\warn 'ALLA V10-TESTER (KALENDERSYNK) GODKÄNDA'
