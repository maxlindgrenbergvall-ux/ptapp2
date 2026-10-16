-- Tester för kalender och bokning (v4): lediga tider, bokningsförfrågan,
-- bekräftelse, avbokning, blockeringar, dubbelbokningsskydd och integritet.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('pt7@test.se', '{"role":"trainer","full_name":"PT Sju"}', '{"role":"trainer"}'),
  ('c7@test.se', '{"role":"client","full_name":"Klient Sju","health_data_consent":true}', '{}'),
  ('c8@test.se', '{"role":"client","full_name":"Klient Åtta","health_data_consent":true}', '{}'),
  ('c9@test.se', '{"role":"client","full_name":"Klient Nio","health_data_consent":true}', '{}');

-- Testdag D = om tio dagar (långt bortom minsta framförhållning), i PT:ns tidszon.
select (current_date + 10) as d, extract(isodow from current_date + 10)::int as dow,
       extract(isodow from current_date + 1)::int as tomorrow_dow \gset

create function test.at(p_day date, p_time time) returns timestamptz language sql immutable as $$
  select (p_day + p_time) at time zone 'Europe/Stockholm'
$$;
grant execute on function test.at(date, time) to authenticated;

-- ---------------------------------------------------- tillgänglighet ---
select test.login('pt7@test.se');
update trainers set is_published = true, price_per_session = 750, city = 'Göteborg' where id = auth.uid();
insert into availability_rules (trainer_id, weekday, start_local, end_local, slot_minutes)
values (auth.uid(), :dow, '08:00', '12:00', 60);
select test.logout();

select test.login('c7@test.se');
select test.eq((select count(*) from available_slots(test.uid('pt7@test.se'), test.at(:'d', '00:00'), test.at(:'d', '23:59'))),
  4::bigint, 'veckoregel 08–12 med 60 min ger fyra lediga tider');
select test.eq((select min(start_time) from available_slots(test.uid('pt7@test.se'), test.at(:'d', '00:00'), test.at(:'d', '23:59'))),
  test.at(:'d', '08:00'), 'första lediga tid är 08:00 lokal tid (Europe/Stockholm)');
select test.eq((select count(*) from availability_rules), 0::bigint, 'klienter kan inte läsa PT:ns regler direkt');
select test.logout();

-- Datumregel ersätter veckoregeln den dagen.
select test.login('pt7@test.se');
insert into availability_rules (trainer_id, date, start_local, end_local, slot_minutes)
values (auth.uid(), :'d', '14:00', '16:00', 30);
select test.eq((select count(*) from available_slots(auth.uid(), test.at(:'d', '00:00'), test.at(:'d', '23:59'))),
  4::bigint, 'datumregel 14–16 med 30 min ersätter veckoregeln (fyra tider)');
delete from availability_rules where date is not null;
select test.logout();

-- ------------------------------------------------- bokningsförfrågan ---
select test.login('c7@test.se');
insert into coaching_relationships (trainer_id, client_id) values (test.uid('pt7@test.se'), auth.uid());
insert into calendar_events (trainer_id, client_id, title, start_time, end_time, notes)
values (test.uid('pt7@test.se'), auth.uid(), 'PT-pass', test.at(:'d', '09:00'), test.at(:'d', '10:00'), 'Första passet');
select test.eq((select count(*) from available_slots(test.uid('pt7@test.se'), test.at(:'d', '00:00'), test.at(:'d', '23:59'))),
  3::bigint, 'bokad tid försvinner från lediga tider');
select test.fails($$update calendar_events set status = 'confirmed'$$, 'klient kan inte bekräfta sin egen bokning');
-- (Sedan v5 får klienten föreslå en annan LEDIG tid för sin förfrågan, men aldrig en tid utanför schemat.)
select test.fails($$update calendar_events set start_time = start_time + interval '30 minutes', end_time = end_time + interval '30 minutes'$$,
  'klient kan inte flytta en bokning till en tid som inte är ledig');
select test.logout();

select test.login('c8@test.se');
select test.fails($$insert into calendar_events (trainer_id, client_id, start_time, end_time)
  values (test.uid('pt7@test.se'), auth.uid(), test.at((current_date + 10), '09:00'), test.at((current_date + 10), '10:00'))$$,
  'samma tid kan inte bokas två gånger');
select test.fails($$insert into calendar_events (trainer_id, client_id, start_time, end_time)
  values (test.uid('pt7@test.se'), auth.uid(), test.at((current_date + 10), '08:30'), test.at((current_date + 10), '09:30'))$$,
  'kan bara boka PT:ns lediga tider (inte 08:30)');
select test.fails($$insert into calendar_events (trainer_id, client_id, start_time, end_time, mode)
  values (test.uid('pt7@test.se'), auth.uid(), test.at((current_date + 10), '10:00'), test.at((current_date + 10), '11:00'), 'remote')$$,
  'kan inte boka distans hos en PT som bara tränar på plats');
select test.fails($$insert into calendar_events (trainer_id, client_id, status, start_time, end_time)
  values (test.uid('pt7@test.se'), auth.uid(), 'confirmed', test.at((current_date + 10), '10:00'), test.at((current_date + 10), '11:00'))$$,
  'klient kan inte skapa en redan bekräftad bokning');
insert into calendar_events (trainer_id, client_id, start_time, end_time)
values (test.uid('pt7@test.se'), auth.uid(), test.at(:'d', '10:00'), test.at(:'d', '11:00'));
select test.eq((select count(*) from calendar_events), 1::bigint, 'klient ser bara sina egna bokningar');
select test.eq((select status::text from coaching_relationships where trainer_id = test.uid('pt7@test.se')), 'pending',
  'första bokningen skapar en coachingförfrågan automatiskt');
select test.logout();

-- ----------------------------------------------------- PT hanterar ---
select test.login('pt7@test.se');
select test.eq((select count(*) from calendar_events where status = 'pending'), 2::bigint, 'PT ser båda förfrågningarna');
select test.eq((select full_name from profiles where id = test.uid('c8@test.se')), 'Klient Åtta', 'PT ser namnet på den som bokar');
update calendar_events set status = 'confirmed' where client_id = test.uid('c7@test.se');
select test.eq((select count(*) from calendar_events where status = 'confirmed'), 1::bigint, 'PT kan bekräfta en förfrågan');
update calendar_events set status = 'cancelled' where client_id = test.uid('c8@test.se');
select test.eq((select cancelled_by from calendar_events where client_id = test.uid('c8@test.se')), auth.uid(), 'nekad förfrågan registrerar vem som nekade');
select test.fails($$update calendar_events set client_id = test.uid('c9@test.se') where client_id = test.uid('c7@test.se')$$,
  'PT kan inte flytta en bokning till en annan klient');
select test.fails($$insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time)
  values (auth.uid(), test.uid('c7@test.se'), 'confirmed', 'Dubbel', test.at((current_date + 10), '09:30'), test.at((current_date + 10), '10:30'))$$,
  'PT kan inte dubbelboka sig själv');
select test.fails($$insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time)
  values (auth.uid(), test.uid('c9@test.se'), 'confirmed', 'Okänd', test.at((current_date + 11), '09:00'), test.at((current_date + 11), '10:00'))$$,
  'PT kan inte boka in någon som inte är klient');
-- Blockering: lunch 11–12 tar bort den tiden från de lediga.
insert into calendar_events (trainer_id, kind, status, title, start_time, end_time)
values (auth.uid(), 'block', 'confirmed', 'Lunch', test.at(:'d', '11:00'), test.at(:'d', '12:00'));
select test.eq((select count(*) from available_slots(auth.uid(), test.at(:'d', '00:00'), test.at(:'d', '23:59'))),
  2::bigint, 'bokning och lunchblockering tar bort tider; nekad tid är ledig igen (08 och 10 kvar)');
select test.fails($$insert into calendar_events (trainer_id, client_id, kind, status, title, start_time, end_time)
  values (auth.uid(), test.uid('c7@test.se'), 'block', 'confirmed', 'X', test.at((current_date + 12), '09:00'), test.at((current_date + 12), '10:00'))$$,
  'en blockering kan inte ha en klient');
-- Eget pass utan klient, och manuellt inbokad klient.
insert into calendar_events (trainer_id, status, title, start_time, end_time, mode)
values (auth.uid(), 'confirmed', 'Gruppass', test.at(:'d', '17:00'), test.at(:'d', '18:00'), 'onsite');
update coaching_relationships set status = 'active' where client_id = test.uid('c7@test.se');
insert into scheduled_workouts (id, client_id, trainer_id, name, date, exercises)
values ('22222222-2222-2222-2222-222222222222', test.uid('c7@test.se'), auth.uid(), 'Underkropp', :'d', '[]');
insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time, workout_id)
values (auth.uid(), test.uid('c7@test.se'), 'confirmed', 'Teknikpass', test.at((current_date + 11), '07:00'), test.at((current_date + 11), '08:00'),
        '22222222-2222-2222-2222-222222222222');
select test.eq((select count(*) from calendar_events where workout_id is not null), 1::bigint, 'PT kan boka in klient manuellt med kopplat pass');
select test.logout();

select test.login('c7@test.se');
select test.eq((select count(*) from calendar_events), 2::bigint, 'klienten ser sina bekräftade pass men inte PT:ns blockering eller gruppass');
select test.eq((select count(*) from calendar_events where status = 'confirmed'), 2::bigint, 'bekräftelsen syns direkt för klienten');
update calendar_events set status = 'cancelled' where start_time = test.at(:'d', '09:00');
select test.eq((select cancelled_by from calendar_events where start_time = test.at(:'d', '09:00')), auth.uid(), 'klient kan avboka; avbokningen registreras');
select test.eq((select count(*) from available_slots(test.uid('pt7@test.se'), test.at(:'d', '00:00'), test.at(:'d', '23:59'))),
  3::bigint, 'avbokad tid blir ledig igen (08, 09 och 10)');
select test.eq((select count(*) from next_available_slots(array[test.uid('pt7@test.se')])), 1::bigint, 'nästa lediga tid hittas för PT-sökningen');
select test.logout();

-- -------------------------------------------- framförhållning och åtkomst ---
select test.login('pt7@test.se');
insert into availability_rules (trainer_id, weekday, start_local, end_local) values (auth.uid(), :tomorrow_dow, '00:00', '23:00');
update trainers set min_notice_minutes = 10080 where id = auth.uid();
select test.eq((select count(*) from available_slots(auth.uid(), now(), now() + interval '2 days')), 0::bigint,
  'minsta framförhållning (7 dagar) döljer tider i morgon');
update trainers set min_notice_minutes = 120 where id = auth.uid();
select test.logout();

select test.login('c9@test.se');
-- Opublicerad PT syns inte för okända klienter.
select test.eq((select count(*) from available_slots(test.uid('pt3@test.se'), now(), now() + interval '30 days')), 0::bigint,
  'opublicerad PT visar inga lediga tider för utomstående');
select test.logout();

set role anon;
select test.fails($$select * from available_slots((select id from trainers limit 1), now(), now() + interval '1 day')$$, 'anonyma kan inte läsa lediga tider');
reset role;

\warn 'ALLA V4-TESTER (KALENDER) GODKÄNDA'
