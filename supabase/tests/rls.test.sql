-- RLS- och regeltester. Körs av scripts/test-db.sh efter migration + seed.
-- Varje block körs som en viss användare (roll `authenticated` + JWT-sub).
\set ON_ERROR_STOP on
\set QUIET on

create schema test;
grant usage on schema test to anon, authenticated;

create function test.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  execute 'set role authenticated';
end $$;

create function test.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create function test.eq(actual anyelement, expected anyelement, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % (fick %, väntade %)', msg, actual, expected;
  end if;
  raise notice 'ok   %', msg;
end $$;

create function test.fails(p_sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok   % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (borde ha misslyckats)', msg;
end $$;

-- Slå upp användar-id via e-post (security definer: auth.users är inte läsbar för användare).
create function test.uid(p_email text) returns uuid language sql security definer as $$
  select id from auth.users where email = p_email
$$;

grant execute on all functions in schema test to anon, authenticated;
\set QUIET off

-- ---------------------------------------------------------------- konton ---
insert into auth.users (email, raw_user_meta_data) values
  ('pt@test.se',  '{"role":"trainer","full_name":"Elin PT"}'),
  ('pt2@test.se', '{"role":"trainer","full_name":"Annan PT"}'),
  ('c1@test.se',  '{"role":"client","full_name":"Sara Klient","health_data_consent":true}'),
  ('c2@test.se',  '{"role":"client","full_name":"Jonas Klient","health_data_consent":true}');

select test.eq((select count(*) from profiles), 4::bigint, 'profil skapas vid registrering');
select test.eq((select count(*) from trainers), 2::bigint, 'PT-rad skapas för PT-konton');
select test.fails($$insert into auth.users (email, raw_user_meta_data) values ('nej@test.se', '{"role":"client","full_name":"Utan samtycke"}')$$,
  'klient utan hälsodatasamtycke kan inte registreras');

-- ----------------------------------------------------------- anonym läsning ---
set role anon;
select test.eq((select count(*) from trainers), 0::bigint, 'anonym ser inga PT-profiler');
select test.eq((select count(*) from exercises), 0::bigint, 'anonym ser inte övningsbanken');
reset role;

-- --------------------------------------------- PT-profil, lediga tider, sök ---
select test.login('pt@test.se');
update trainers set city = 'Stockholm', specialties = '{styrkelyft,hyrox}', price_per_session = 850, is_published = true where id = auth.uid();
insert into availability_rules (trainer_id, weekday, start_local, end_local) values (auth.uid(), 1, '08:00', '12:00');
select test.fails($$update profiles set role = 'client' where id = auth.uid()$$, 'roll kan inte ändras');
select test.fails($$insert into availability_rules (trainer_id, weekday, start_local, end_local) values (test.uid('pt2@test.se'), 1, '08:00', '12:00')$$,
  'PT kan inte lägga tider åt annan PT');
select test.logout();

select test.login('c1@test.se');
select test.eq((select count(*) from trainers), 1::bigint, 'klient ser bara publicerade PT:er');
select test.eq((select full_name from profiles where id = test.uid('pt@test.se')), 'Elin PT', 'klient ser namn på publicerad PT');
select test.eq((select count(*) from profiles where id = test.uid('c2@test.se')), 0::bigint, 'klient ser inte andra klienters profiler');
select test.eq((select count(*) from exercises), 127::bigint, 'inloggad ser globala övningsbanken');

-- Förfrågan + vikt innan PT:n accepterat.
insert into coaching_relationships (trainer_id, client_id, goal) values (test.uid('pt@test.se'), auth.uid(), '100 kg knäböj');
select test.fails($$insert into coaching_relationships (trainer_id, client_id, status) values (test.uid('pt2@test.se'), auth.uid(), 'active')$$,
  'klient kan inte skapa en aktiv relation själv');
insert into weight_entries (client_id, date, kg) values (auth.uid(), current_date, 68.5);
select test.logout();

-- --------------------------------------- pending PT ser namn men ingen hälsodata ---
select test.login('pt@test.se');
select test.eq((select full_name from profiles where id = test.uid('c1@test.se')), 'Sara Klient', 'PT ser namn på klient med förfrågan');
select test.eq((select count(*) from weight_entries), 0::bigint, 'PT med obesvarad förfrågan ser ingen hälsodata');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (test.uid('c1@test.se'), auth.uid(), 'X', current_date, '[]')$$,
  'PT kan inte schemalägga innan förfrågan accepterats');

select test.fails($$update coaching_relationships set client_id = test.uid('c2@test.se') where client_id = test.uid('c1@test.se')$$,
  'PT kan inte peka om en relation till en annan klient');
update coaching_relationships set status = 'active', started_at = current_date where client_id = test.uid('c1@test.se');
select test.eq((select count(*) from weight_entries), 1::bigint, 'aktiv PT ser klientens vikt');

insert into scheduled_workouts (id, client_id, trainer_id, name, date, exercises)
values ('11111111-1111-1111-1111-111111111111', test.uid('c1@test.se'), auth.uid(), 'Underkropp A', current_date,
        '[{"id":"we1","exerciseId":"e-squat","sets":3,"reps":"5","restSec":180}]');
insert into nutrition_plans (trainer_id, client_id, name, kcal, protein_g, carbs_g, fat_g)
values (auth.uid(), test.uid('c1@test.se'), 'Uppbyggnad', 2400, 140, 280, 80);
select test.fails($$insert into nutrition_plans (trainer_id, client_id, name, kcal, protein_g, carbs_g, fat_g) values (auth.uid(), test.uid('c1@test.se'), 'Två aktiva', 2000, 100, 200, 60)$$,
  'högst en aktiv kostplan per klient');
select test.logout();

select test.login('pt2@test.se');
select test.eq((select count(*) from scheduled_workouts), 0::bigint, 'annan PT ser inte klientens pass');
select test.eq((select count(*) from weight_entries), 0::bigint, 'annan PT ser inte klientens vikt');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (test.uid('c1@test.se'), auth.uid(), 'Intrång', current_date, '[]')$$,
  'annan PT kan inte schemalägga pass åt klienten');
select test.logout();

-- ------------------------------------------------------------ träningslogg ---
select test.login('c1@test.se');
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps)
values ('11111111-1111-1111-1111-111111111111', 'we1', 0, 80, 5)
on conflict (workout_id, workout_exercise_id, set_index) do update set kg = excluded.kg, reps = excluded.reps, done = excluded.done;
-- Samma set igen (t.ex. omskick från offlinekön) ska inte ge dubbletter.
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps)
values ('11111111-1111-1111-1111-111111111111', 'we1', 0, 82.5, 5)
on conflict (workout_id, workout_exercise_id, set_index) do update set kg = excluded.kg, reps = excluded.reps, done = excluded.done;
select test.eq((select kg from set_logs where set_index = 0), 82.50::numeric(6,2), 'upsert av set är idempotent');

update scheduled_workouts set status = 'completed', completed_at = now(), client_comment = 'Tungt idag'
where id = '11111111-1111-1111-1111-111111111111';
select test.eq((select status::text from scheduled_workouts), 'completed', 'klient kan avsluta sitt pass');
select test.fails($$update scheduled_workouts set exercises = '[]' where id = '11111111-1111-1111-1111-111111111111'$$,
  'klient kan inte ändra programmet');
select test.eq((select count(*) from nutrition_plans), 1::bigint, 'klient ser sin kostplan');
update nutrition_plans set kcal = 5000;
select test.eq((select kcal from nutrition_plans), 2400, 'klient kan inte ändra kostplanen');
insert into meal_checks (client_id, date, meal_id) values (auth.uid(), current_date, 'm1');
insert into messages (client_id, sender_id, body) values (auth.uid(), auth.uid(), 'Hej Elin!');
select test.logout();

select test.login('c2@test.se');
select test.eq((select count(*) from scheduled_workouts), 0::bigint, 'annan klient ser inte passen');
select test.eq((select count(*) from set_logs), 0::bigint, 'annan klient ser inte set-loggar');
select test.eq((select count(*) from messages), 0::bigint, 'annan klient ser inte chatten');
select test.fails($$insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps) values ('11111111-1111-1111-1111-111111111111', 'we1', 1, 1, 1)$$,
  'annan klient kan inte logga i någon annans pass');
select test.fails($$insert into messages (client_id, sender_id, body) values (test.uid('c1@test.se'), auth.uid(), 'spam')$$,
  'annan klient kan inte skriva i någon annans tråd');
select test.logout();

-- --------------------------------------------------------------- chatt ---
select test.login('pt@test.se');
select test.eq((select count(*) from set_logs), 1::bigint, 'PT ser klientens loggade set');
select test.eq((select count(*) from messages), 1::bigint, 'PT ser klientens meddelande');
update messages set read_at = now() where sender_id <> auth.uid();
select test.eq((select count(*) from messages where read_at is not null), 1::bigint, 'PT kan markera som läst');
select test.fails($$update messages set body = 'ändrat'$$, 'meddelandetext kan inte ändras');
insert into messages (client_id, sender_id, body, workout_id) values (test.uid('c1@test.se'), auth.uid(), 'Snyggt!', '11111111-1111-1111-1111-111111111111');
select test.logout();

-- ------------------------------------------------------------- bokning ---
-- (Bokningar och kalender testas i rls_v4.test.sql.)
select test.login('c2@test.se');
insert into coaching_relationships (trainer_id, client_id) values (test.uid('pt@test.se'), auth.uid());
select test.logout();

-- ------------------------------------------------------- radera konto ---
select test.login('c1@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from profiles where full_name = 'Sara Klient'), 0::bigint, 'radera konto tar bort profilen');
select test.eq((select count(*) from scheduled_workouts), 0::bigint, 'radera konto tar bort pass (kaskad)');
select test.eq((select count(*) from messages), 0::bigint, 'radera konto tar bort chatten');
select test.eq((select count(*) from weight_entries), 0::bigint, 'radera konto tar bort vikt');

\warn 'ALLA RLS-TESTER GODKÄNDA'
