-- ============================================================================
-- v43: passbyggaren, övningsbanken och det förenklade träningsschemat.
--
-- 1. Övningsbanken: EZ-Bar Curl, Kickbacks, Axelpress i maskin och Hip Thrust
--    i maskin läggs till; Bulgarian Split Squat heter nu "Bulgarian Split
--    Squats" utan utrustning (varken hantlar eller skivstång). Samma rader som
--    supabase/seed.sql (genererad från src/lib/exercise-library.json).
-- 2. Egna övningar: display_group – muskelgruppen i övningslistan som
--    användaren valt (Biceps, Säte, Vader …). Valfri; saknas den räknas den
--    fram ur namnet som tidigare.
-- 3. client_splits: klientens aktiva träningsschema. En rad per klient med
--    splitens dagar (övningar, set, reps), antal dagar per vecka och vilken
--    dag som står på tur. Inga veckodagar, inget startdatum, inget antal
--    veckor – "Nästa pass" skapar dagens pass av dagen på tur.
--    Klienten läser och ändrar sin egen rad; klientens aktiva PT:er kan läsa den.
--
-- Körs efter 20261116000000_v36_marketing_prompt.sql.
-- ============================================================================

-- ====================================================== 1. övningsbanken ===
insert into exercises (id, name, muscle_group, equipment) values
  ('e-bss', 'Bulgarian Split Squats', 'ben', ''),
  ('e-machine-hipthrust', 'Hip Thrust i maskin', 'ben', 'Maskin'),
  ('e-machine-ohp', 'Axelpress i maskin', 'axlar', 'Maskin'),
  ('e-ezcurl', 'EZ-Bar Curl', 'armar', 'EZ-stång'),
  ('e-kickback', 'Kickbacks', 'armar', 'Hantlar/kabel')
on conflict (id) do update
  set name = excluded.name, muscle_group = excluded.muscle_group, equipment = excluded.equipment
  where exercises.owner_id is null;

-- ================================================= 2. egna övningar ===
alter table custom_exercises add column if not exists display_group text
  check (display_group is null or display_group in
    ('brost', 'rygg', 'axlar', 'biceps', 'triceps', 'underarmar', 'ben', 'baksida', 'sate', 'vader', 'mage', 'helkropp', 'kondition'));
grant update (display_group) on custom_exercises to authenticated;

-- =================================================== 3. client_splits ===
create table if not exists client_splits (
  client_id          uuid primary key references profiles on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 60),
  short              text not null default '' check (char_length(short) <= 20),
  split_key          text not null default 'custom' check (char_length(split_key) between 1 and 30),
  -- [{ name, focus, exercises: [{ exerciseId, sets, reps, restSec, … }] }, …]
  days               jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) between 1 and 7),
  days_per_week      int not null default 3 check (days_per_week between 1 and 7),
  next_day           int not null default 0 check (next_day between 0 and 6),
  -- Passet som senast startades från schemat (öppnas igen tills det är klart).
  current_workout_id uuid references scheduled_workouts on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint client_splits_next_day_in_days check (next_day < jsonb_array_length(days)),
  -- Rimlig storlek (högst 7 dagar × ~15 övningar).
  constraint client_splits_size_check check (pg_column_size(days) < 65536)
);

alter table client_splits enable row level security;

drop policy if exists "splits: client own" on client_splits;
create policy "splits: client own" on client_splits for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists "splits: trainer read" on client_splits;
create policy "splits: trainer read" on client_splits for select to authenticated
  using (is_active_trainer_of(client_id));

-- Det aktuella passet måste vara klientens eget.
create or replace function client_splits_check() returns trigger language plpgsql as $$
begin
  if new.current_workout_id is not null
     and not exists (select 1 from scheduled_workouts w where w.id = new.current_workout_id and w.client_id = new.client_id) then
    raise exception 'Passet hör inte till klienten' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists client_splits_check on client_splits;
create trigger client_splits_check before insert or update on client_splits for each row execute function client_splits_check();

revoke all on client_splits from anon;
grant select, insert, update, delete on client_splits to authenticated;
