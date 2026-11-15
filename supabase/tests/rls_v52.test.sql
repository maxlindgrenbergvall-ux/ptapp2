-- Tester för v52: Strava är borttaget – historiken finns kvar, åtkomsten är borta.
\set ON_ERROR_STOP on

select test.eq((select count(*) from wearable_connections where provider::text = 'strava'), 0::bigint, 'inga Strava-anslutningar kvar');
select test.eq((select count(*) from wearable_tokens where provider::text = 'strava'), 0::bigint, 'inga Strava-tokens kvar');
select test.eq((select count(*) from activity_logs where source = 'strava'), 0::bigint, 'inga pass med källan Strava');
select test.eq(
  (select source || ':' || external_id || ':' || kcal from activity_logs where client_id = test.uid('v52-klient@test.se') and name = 'Morgonlöpning'),
  'manual:imp-9001:380', 'det synkade passet finns kvar som manuellt pass');
select test.eq((select count(*) from pg_proc where proname = 'remove_strava_activities'), 0::bigint, 'städfunktionen för Strava är borttagen');

select test.fails($$insert into wearable_connections (user_id, provider, external_user_id) values (test.uid('v52-klient@test.se'), 'strava', 'x')$$, 'Strava kan inte kopplas igen');
select test.fails($$insert into activity_logs (client_id, source, external_id, sport, started_at, date, duration_sec) values (test.uid('v52-klient@test.se'), 'strava', 's', 'Run', now(), current_date, 60)$$, 'pass med källan Strava kan inte sparas');

-- Klienten äger sin historik (RLS oförändrad): läser, och kan ta bort det importerade passet.
select test.login('v52-klient@test.se');
select test.eq((select count(*) from activity_logs where external_id = 'imp-9001'), 1::bigint, 'klienten ser sitt pass');
insert into activity_logs (client_id, source, external_id, sport, started_at, date, duration_sec) values (auth.uid(), 'apple_health', 'hk-1', 'Run', now(), current_date, 600);
select test.eq((select count(*) from activity_logs where client_id = auth.uid()), 2::bigint, 'Apple Hälsa fungerar som förut');
select test.logout();

-- Vilodagar i ett upplägg (v52) ryms i befintligt schema: en dag utan övningar med rest = true.
select test.login('v52-klient@test.se');
insert into client_splits (client_id, name, days, days_per_week, next_day) values (
  auth.uid(), 'Mitt upplägg',
  '[{"name":"Push","focus":"","exercises":[{"exerciseId":"e-bench","sets":3,"reps":"8"}]},{"name":"Vila","focus":"","rest":true,"exercises":[]},{"name":"Pull","focus":"","exercises":[{"exerciseId":"e-row","sets":3,"reps":"8"}]}]',
  2, 0);
select test.eq((select (days -> 1 ->> 'rest') from client_splits where client_id = auth.uid()), 'true', 'vilodag sparas i upplägget');
select test.logout();

-- Säkerhetskontrollen från v51 gäller fortfarande.
select test.eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'RLS påslagen på alla tabeller i public');
