-- Testar att v4 flyttar över bokningar och lediga tider från v1–v3.
-- Körs av scripts/test-db.sh: v1–v3 + denna fil (del 1), sedan v4, sedan del 2.
\set ON_ERROR_STOP on
\if :{?after}
  select count(*) = 3 as ok from calendar_events \gset
  \if :ok \else \warn 'FAIL: tre bokningar skulle flyttas' \quit \endif
  select (select status::text from calendar_events where notes = 'A') = 'pending'
     and (select status::text from calendar_events where notes = 'B') = 'confirmed'
     and (select status::text from calendar_events where notes = 'C') = 'cancelled' as ok \gset
  \if :ok \else \warn 'FAIL: statusar mappas fel' \quit \endif
  select (select end_time - start_time from calendar_events where notes = 'A') = interval '60 minutes' as ok \gset
  \if :ok \else \warn 'FAIL: längd' \quit \endif
  select count(*) = 1 as ok from availability_rules where date is not null and start_local = '10:00' \gset
  \if :ok \else \warn 'FAIL: ledig tid blev inte datumregel' \quit \endif
  select to_regclass('public.bookings') is null and to_regclass('public.trainer_availability') is null as ok \gset
  \if :ok \else \warn 'FAIL: gamla tabeller finns kvar' \quit \endif
  \warn 'MIGRERING V4 GODKÄND'
\else
  insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-4000-8000-000000000001', 'm-pt@test.se', '{"role":"trainer","full_name":"M PT"}'),
    ('a0000000-0000-4000-8000-000000000002', 'm-c@test.se', '{"role":"client","full_name":"M Klient","health_data_consent":true}');
  -- Gamla regeln: en bokning förbrukar en ledig tid, så tiderna måste finnas först.
  insert into trainer_availability (trainer_id, slot)
  select 'a0000000-0000-4000-8000-000000000001', s
  from unnest(array['2030-01-07 09:00+01', '2030-01-08 09:00+01', '2030-01-09 09:00+01']::timestamptz[]) s;
  insert into bookings (trainer_id, client_id, slot, status, note) values
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '2030-01-07 09:00+01', 'requested', 'A'),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '2030-01-08 09:00+01', 'confirmed', 'B'),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '2030-01-09 09:00+01', 'cancelled', 'C');
  insert into trainer_availability (trainer_id, slot) values ('a0000000-0000-4000-8000-000000000001', '2030-01-10 10:00+01');
\endif
