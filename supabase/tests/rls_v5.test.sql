-- Tester för v5: ombokning av preliminära pass, aviseringar och PT-erbjudanden.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data) values
  ('pt10@test.se', '{"role":"trainer","full_name":"PT Tio"}'),
  ('c10@test.se',  '{"role":"client","full_name":"Klient Tio","health_data_consent":true}'),
  ('c11@test.se',  '{"role":"client","full_name":"Klient Elva","health_data_consent":true}');

select (current_date + 12) as d, extract(isodow from current_date + 12)::int as dow \gset

create or replace function test.at(p_day date, p_time time) returns timestamptz language sql immutable as $$
  select (p_day + p_time) at time zone 'Europe/Stockholm'
$$;
grant execute on function test.at(date, time) to authenticated;

-- Hjälpare: antal aviseringar av en viss typ för inloggad användare.
create function test.notes(p_kind text) returns bigint language sql as $$
  select count(*) from notifications where kind::text = p_kind
$$;
grant execute on function test.notes(text) to authenticated;

select test.login('pt10@test.se');
update trainers set is_published = true, price_per_session = 750, city = 'Malmö', specialties = '{hyrox}' where id = auth.uid();
insert into availability_rules (trainer_id, weekday, start_local, end_local, slot_minutes)
values (auth.uid(), :dow, '08:00', '12:00', 60);
select test.logout();

-- --------------------------------------------------- förfrågan → avisering ---
select test.login('c10@test.se');
insert into calendar_events (trainer_id, client_id, title, start_time, end_time)
values (test.uid('pt10@test.se'), auth.uid(), 'PT-pass', test.at(:'d', '09:00'), test.at(:'d', '10:00'));
select test.eq((select awaiting::text from calendar_events), 'trainer', 'klientens förfrågan väntar på PT:n');
select test.fails($$update calendar_events set status = 'confirmed'$$, 'klient kan inte bekräfta en förfrågan som väntar på PT:n');
select test.eq(test.notes('booking_requested'), 0::bigint, 'avsändaren får ingen avisering om sin egen förfrågan');
select test.logout();

select test.login('pt10@test.se');
select test.eq(test.notes('booking_requested'), 1::bigint, 'PT:n aviseras om ny förfrågan');
select test.eq((select payload->>'actor_name' from notifications where kind = 'booking_requested'), 'Klient Tio',
  'aviseringen visar vem som bokat');

-- ------------------------------------------------- PT flyttar preliminärt pass ---
update calendar_events set start_time = test.at(:'d', '10:00'), end_time = test.at(:'d', '11:00')
where client_id = test.uid('c10@test.se');
select test.eq((select awaiting::text from calendar_events where client_id = test.uid('c10@test.se')), 'client',
  'flyttat preliminärt pass väntar nu på klienten');
select test.eq((select previous_start from calendar_events where client_id = test.uid('c10@test.se')), test.at(:'d', '09:00'),
  'tidigare tid sparas vid flytt');
update calendar_events set awaiting = 'trainer', previous_start = null;
select test.eq((select awaiting::text || previous_start::text from calendar_events where client_id = test.uid('c10@test.se')),
  'client' || test.at(:'d', '09:00')::text, 'awaiting och tidigare tid styrs av databasen (kan inte sättas fritt)');
select test.logout();

select test.login('c10@test.se');
select test.eq(test.notes('event_rescheduled'), 1::bigint, 'klienten aviseras om ombokningen');
select test.eq((select (payload->>'previous_start')::timestamptz from notifications where kind = 'event_rescheduled'),
  test.at(:'d', '09:00'), 'ombokningsaviseringen innehåller den gamla tiden');
select test.fails($$update calendar_events set title = 'Gratispass'$$, 'klient kan inte ändra passets innehåll');
select test.fails($$update calendar_events set start_time = test.at((current_date + 12), '10:30'), end_time = test.at((current_date + 12), '11:30')$$,
  'klient kan inte föreslå en tid som inte finns i schemat');

-- Klienten föreslår en annan ledig tid.
update calendar_events set start_time = test.at(:'d', '11:00'), end_time = test.at(:'d', '12:00');
select test.eq((select awaiting::text from calendar_events), 'trainer', 'klientens motförslag väntar på PT:n');
select test.eq((select status::text from calendar_events), 'pending', 'motförslaget är fortfarande preliminärt');
-- En tid som överlappar passets egen gamla tid räknas som ledig.
update calendar_events set start_time = test.at(:'d', '10:00'), end_time = test.at(:'d', '11:00');
select test.eq((select start_time from calendar_events), test.at(:'d', '10:00'),
  'klient kan flytta förfrågan till en tid intill/överlappande den egna gamla tiden');
select test.logout();

select test.login('pt10@test.se');
select test.eq(test.notes('event_rescheduled'), 2::bigint, 'PT:n aviseras om klientens motförslag');
update calendar_events set start_time = test.at(:'d', '08:00'), end_time = test.at(:'d', '09:00')
where client_id = test.uid('c10@test.se');
select test.logout();

-- ------------------------------------------------------------ acceptera ---
select test.login('c10@test.se');
update calendar_events set status = 'confirmed';
select test.eq((select status::text from calendar_events), 'confirmed', 'klient kan acceptera PT:ns föreslagna tid');
select test.eq((select awaiting from calendar_events), null::event_party, 'bekräftat pass väntar inte på någon');
select test.fails($$update calendar_events set start_time = test.at((current_date + 12), '11:00'), end_time = test.at((current_date + 12), '12:00')$$,
  'bekräftat pass kan inte flyttas av klienten');
select test.logout();

select test.login('pt10@test.se');
select test.eq(test.notes('reschedule_accepted'), 1::bigint, 'PT:n aviseras när klienten accepterar');
-- Krock: en blockering över en preliminär flytt stoppas.
insert into calendar_events (trainer_id, kind, status, title, start_time, end_time)
values (auth.uid(), 'block', 'confirmed', 'Lunch', test.at(:'d', '11:00'), test.at(:'d', '12:00'));
select test.logout();

-- ------------------------------------------------------------- avbokning ---
select test.login('c10@test.se');
select test.fails($$update calendar_events set status = 'cancelled', start_time = start_time + interval '1 hour', end_time = end_time + interval '1 hour'$$,
  'avboka och flytta samtidigt går inte');
update calendar_events set status = 'cancelled' where status = 'confirmed';
select test.logout();

select test.login('pt10@test.se');
select test.eq(test.notes('event_cancelled'), 1::bigint, 'PT:n aviseras när klienten avbokar');
select test.eq((select payload->>'actor_name' from notifications where kind = 'event_cancelled'), 'Klient Tio',
  'avbokningsaviseringen visar vem som avbokade');

-- PT:ns preliminära pass till klienten.
insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time)
values (auth.uid(), test.uid('c10@test.se'), 'pending', 'Provpass', test.at(:'d', '09:00'), test.at(:'d', '10:00'));
select test.eq((select awaiting::text from calendar_events where title = 'Provpass'), 'client', 'PT:ns preliminära pass väntar på klienten');
select test.fails($$update calendar_events set start_time = test.at((current_date + 12), '11:00'), end_time = test.at((current_date + 12), '12:00') where title = 'Provpass'$$,
  'preliminärt pass kan inte flyttas in i en blockering');
select test.fails($$insert into calendar_events (trainer_id, status, title, start_time, end_time)
  values (auth.uid(), 'pending', 'Utan klient', test.at((current_date + 13), '09:00'), test.at((current_date + 13), '10:00'))$$,
  'preliminärt pass måste ha en klient');
select test.logout();

select test.login('c10@test.se');
select test.eq(test.notes('booking_proposed'), 1::bigint, 'klienten aviseras om PT:ns preliminära pass');
select test.logout();

select test.login('pt10@test.se');
update calendar_events set status = 'cancelled' where title = 'Provpass';
select test.logout();

select test.login('c10@test.se');
select test.eq(test.notes('event_cancelled'), 1::bigint, 'klienten aviseras när PT:n avbokar');
-- Ny förfrågan som PT:n nekar.
insert into calendar_events (trainer_id, client_id, title, start_time, end_time)
values (test.uid('pt10@test.se'), auth.uid(), 'PT-pass', test.at(:'d', '10:00'), test.at(:'d', '11:00'));
select test.logout();

select test.login('pt10@test.se');
update calendar_events set status = 'cancelled' where status = 'pending';
select test.logout();

-- -------------------------------------------------- aviseringarnas regler ---
select test.login('c10@test.se');
select test.eq(test.notes('booking_declined'), 1::bigint, 'klienten aviseras när förfrågan nekas');
select test.fails($$insert into notifications (user_id, kind) values (auth.uid(), 'event_cancelled')$$,
  'användare kan inte skapa aviseringar själva');
select test.fails($$insert into notifications (user_id, kind) values (test.uid('pt10@test.se'), 'event_cancelled')$$,
  'användare kan inte skicka aviseringar till andra');
select test.fails($$update notifications set kind = 'booking_confirmed'$$, 'bara read_at kan ändras på en avisering');
update notifications set read_at = now();
select test.eq((select count(*) from notifications where read_at is null), 0::bigint, 'mottagaren kan markera aviseringar som lästa');
select test.logout();

select test.login('c11@test.se');
select test.eq((select count(*) from notifications), 0::bigint, 'andra ser inga aviseringar');
update notifications set read_at = null;
select test.logout();
select test.login('c10@test.se');
select test.eq((select count(*) from notifications where read_at is null), 0::bigint, 'andra kan inte ändra mina aviseringar');
delete from notifications where kind = 'booking_declined';
select test.eq(test.notes('booking_declined'), 0::bigint, 'mottagaren kan ta bort sina aviseringar');
select test.logout();

-- ---------------------------------------------------------- erbjudanden ---
select test.login('pt10@test.se');
select test.fails($$insert into trainer_offers (trainer_id, category, title) values (auth.uid(), 'styrkelyft', 'Styrkepaket')$$,
  'erbjudandets kategori måste vara en av PT:ns specialiteter');
insert into trainer_offers (trainer_id, category, title, description, discount_percent)
values (auth.uid(), 'hyrox', 'Hyrox-start', 'Tre pass inför loppet', 20);
insert into trainer_offers (trainer_id, category, title, active) values (auth.uid(), 'hyrox', 'Pausat erbjudande', false);
insert into trainer_offers (trainer_id, category, title, valid_until) values (auth.uid(), 'hyrox', 'Gammalt erbjudande', current_date - 1);
select test.eq((select count(*) from trainer_offers), 3::bigint, 'PT:n ser alla sina erbjudanden');
select test.logout();

select test.login('c11@test.se');
select test.eq((select count(*) from trainer_offers), 1::bigint, 'klienter ser bara aktiva och giltiga erbjudanden');
select test.fails($$insert into trainer_offers (trainer_id, category, title) values (test.uid('pt10@test.se'), 'hyrox', 'Falskt')$$,
  'klienter kan inte skapa erbjudanden åt en PT');
update trainer_offers set discount_percent = 100;
select test.logout();

select test.login('pt10@test.se');
select test.eq((select discount_percent from trainer_offers where title = 'Hyrox-start'), 20::smallint, 'klienter kan inte ändra erbjudanden');
update trainers set is_published = false where id = auth.uid();
select test.logout();
select test.login('c11@test.se');
select test.eq((select count(*) from trainer_offers), 0::bigint, 'opublicerad PT:s erbjudanden syns inte');
select test.logout();

\warn 'ALLA V5-TESTER (OMBOKNING, AVISERINGAR, ERBJUDANDEN) GODKÄNDA'
