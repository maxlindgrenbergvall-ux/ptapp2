-- ============================================================================
-- v32: träning under passet, mål och aktivitetssynk.
--
-- 1. Lägg till set och övningar mitt i PT:ns pass: klienten får nu utöka
--    passet (fler set, extra övningar märkta "extra": true) men aldrig ta bort
--    eller ändra PT:ns övningar. Egna extra-övningar får tas bort igen.
-- 2. Målet "bodybuilding" (muskelvolym/estetik) i client_goals.
-- 3. Aktivitetssynk: Strava (OAuth, servern) samt Apple Health (HealthKit) och
--    Health Connect (Android) från appen.
--      activity_logs  – enskilda pass (löpning, cykel …) med kalorier och tid.
--      activity_days  – dagens totala aktiva energi, aktiva minuter och steg
--                       från telefonens hälsodata (inkluderar klockans pass).
--    Klienten läser och skriver sina egna rader från telefonen; Strava-rader
--    skrivs bara av servern. Klientens aktiva PT:er kan läsa.
--
-- Körs efter 20261113000000_v31_onboarding_roles.sql.
-- ============================================================================

-- =============================================== 1. utöka PT:ns pass ===
/**
 * Är p_new bara en utökning av p_old? Alla PT:ns övningar finns kvar med samma
 * innehåll (ordningen får ändras), antalet set får bara öka (max 20) och nya
 * övningar är märkta "extra". Extra-övningar får ändras och tas bort fritt.
 */
create or replace function exercises_only_extended(p_new jsonb, p_old jsonb)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p_new) = 'array'
    and jsonb_array_length(p_new) <= 40
    and not exists (
      select 1 from jsonb_array_elements(p_old) o
      where not coalesce((o ->> 'extra')::boolean, false)
        and not exists (
          select 1 from jsonb_array_elements(p_new) n
          where n ->> 'id' = o ->> 'id'
            and (n - 'sets' - 'setReps') = (o - 'sets' - 'setReps')
            and (n ->> 'sets')::int between (o ->> 'sets')::int and 20
            and coalesce(n -> 'setReps', '[]'::jsonb) @> coalesce(o -> 'setReps', '[]'::jsonb)
        )
    )
    and not exists (
      select 1 from jsonb_array_elements(p_new) n
      where not exists (select 1 from jsonb_array_elements(p_old) o where o ->> 'id' = n ->> 'id' and not coalesce((o ->> 'extra')::boolean, false))
        and not coalesce((n ->> 'extra')::boolean, false)
    );
$$;

create or replace function guard_client_workout_update()
returns trigger language plpgsql set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if new.client_id is distinct from old.client_id
     or new.trainer_id is distinct from old.trainer_id
     or new.event_id is distinct from old.event_id and v_uid is distinct from old.trainer_id then
    raise exception 'Passets klient, PT och kalenderkoppling kan inte ändras' using errcode = '42501';
  end if;

  if new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.trainer_comment is distinct from old.trainer_comment then
    if old.trainer_id is null or v_uid is distinct from old.trainer_id then
      raise exception 'Bara passets PT kan klarmarkera passet' using errcode = '42501';
    end if;
    new.verified_by := case when new.verified_at is null then null else v_uid end;
  end if;

  if v_uid = old.client_id then
    if old.verified_at is not null then
      raise exception 'Passet är klarmarkerat av din PT och kan inte ändras' using errcode = '42501';
    end if;
    -- PT:ns pass: status, kommentar, ordning – och (v32) fler set och extra övningar.
    if old.trainer_id is not null
       and (new.template_id is distinct from old.template_id
            or new.name is distinct from old.name
            or new.date is distinct from old.date
            or not exercises_only_extended(new.exercises, old.exercises)) then
      raise exception 'I PT:ns pass kan du lägga till set och övningar, men inte ändra eller ta bort PT:ns' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ======================================================= 2. bodybuilding ===
alter table client_goals drop constraint if exists client_goals_goals_check;
alter table client_goals add constraint client_goals_goals_check
  check (cardinality(goals) between 1 and 7
     and goals <@ array['weight_loss', 'muscle_gain', 'recomp', 'strength', 'endurance', 'health', 'bodybuilding']::text[]);

-- ================================================== 3. aktivitetssynk ===
alter type wearable_provider add value if not exists 'strava';

create table if not exists activity_logs (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references profiles on delete cascade,
  source          text not null check (source in ('strava', 'apple_health', 'google_fit', 'manual')),
  external_id     text not null check (char_length(external_id) between 1 and 200),
  sport           text not null check (char_length(sport) between 1 and 40),
  name            text not null default '' check (char_length(name) <= 200),
  started_at      timestamptz not null,
  date            date not null,
  duration_sec    int not null check (duration_sec between 0 and 172800),
  distance_m      numeric(10,1) check (distance_m is null or distance_m between 0 and 1000000),
  kcal            int check (kcal is null or kcal between 0 and 20000),
  -- Uppskattad (MET × vikt × tid) när källan inte har kalorier.
  kcal_estimated  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, source, external_id)
);
create index if not exists activity_logs_client_date_idx on activity_logs (client_id, date desc);

create table if not exists activity_days (
  client_id       uuid not null references profiles on delete cascade,
  date            date not null,
  source          text not null check (source in ('apple_health', 'google_fit')),
  active_kcal     int not null check (active_kcal between 0 and 20000),
  active_minutes  int check (active_minutes is null or active_minutes between 0 and 1440),
  steps           int check (steps is null or steps between 0 and 300000),
  updated_at      timestamptz not null default now(),
  primary key (client_id, date, source)
);

alter table activity_logs enable row level security;
alter table activity_days enable row level security;

drop policy if exists "activity: client read" on activity_logs;
create policy "activity: client read" on activity_logs for select to authenticated
  using (client_id = auth.uid() or is_active_trainer_of(client_id));
-- Telefonens hälsodata och manuella pass skriver klienten själv; Strava bara servern.
drop policy if exists "activity: client writes device data" on activity_logs;
create policy "activity: client writes device data" on activity_logs for all to authenticated
  using (client_id = auth.uid() and source in ('apple_health', 'google_fit', 'manual'))
  with check (client_id = auth.uid() and source in ('apple_health', 'google_fit', 'manual'));

drop policy if exists "activity days: read" on activity_days;
create policy "activity days: read" on activity_days for select to authenticated
  using (client_id = auth.uid() or is_active_trainer_of(client_id));
drop policy if exists "activity days: client writes" on activity_days;
create policy "activity days: client writes" on activity_days for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

-- Koppla från Strava: anslutningen tas bort (tokens följer med) – och passen därifrån.
create or replace function remove_strava_activities()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.provider::text = 'strava' then
    delete from activity_logs where client_id = old.user_id and source = 'strava';
  end if;
  return old;
end;
$$;
drop trigger if exists wearable_connections_strava_cleanup on wearable_connections;
create trigger wearable_connections_strava_cleanup after delete on wearable_connections
  for each row execute function remove_strava_activities();
