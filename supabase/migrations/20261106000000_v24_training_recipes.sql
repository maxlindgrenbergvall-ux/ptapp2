-- ============================================================================
-- v24: loggning, recept och internationella övningsnamn.
--
-- 1. Övningsbanken byter till engelska facktermer (Romanian Deadlift, Bench
--    Press, Bulgarian Split Squat …). Id:n behålls, så pass och historik
--    påverkas inte. De svenska namnen finns kvar som sökord i appen.
-- 2. Klienten får ändra ORDNINGEN på övningarna i PT:ns pass (samma övningar
--    med samma innehåll – programmet i sig går fortfarande inte att ändra).
-- 3. edit_completed_workout(): klienten redigerar ett genomfört pass i
--    efterhand (vikter, reps, set, ordning, kommentar; övningar i egna pass).
--    Allt i en transaktion med klientens egna rättigheter (RLS + triggers).
-- 4. Ett klarmarkerat pass (verified_at) är låst: inga set kan ändras efteråt.
-- 5. Recept för klienter (client_recipes) och antal portioner på recept.
--
-- Rep-mål per set (t.ex. pyramid 12/10/8) ligger i övningens JSON
-- (setReps) och behöver ingen kolumn.
--
-- Körs efter 20261105000000_v23_security_hardening.sql.
-- ============================================================================

-- ==================================================== 1. övningsnamn ===
insert into exercises (id, name, muscle_group, equipment) values
  ('e-squat', 'Back Squat', 'ben', 'Skivstång'),
  ('e-frontsquat', 'Front Squat', 'ben', 'Skivstång'),
  ('e-goblet', 'Goblet Squat', 'ben', 'Kettlebell/hantel'),
  ('e-boxsquat', 'Box Squat', 'ben', 'Skivstång'),
  ('e-pausesquat', 'Pause Squat', 'ben', 'Skivstång'),
  ('e-hacksquat', 'Hack Squat', 'ben', 'Maskin'),
  ('e-legpress', 'Leg Press', 'ben', 'Maskin'),
  ('e-bss', 'Bulgarian Split Squat', 'ben', 'Hantlar'),
  ('e-lunge', 'Dumbbell Lunge', 'ben', 'Hantlar'),
  ('e-walklunge', 'Walking Lunge', 'ben', 'Hantlar'),
  ('e-revlunge', 'Reverse Lunge', 'ben', 'Hantlar'),
  ('e-stepup', 'Box Step-Up', 'ben', 'Hantlar'),
  ('e-legext', 'Leg Extension', 'ben', 'Maskin'),
  ('e-pistol', 'Pistol Squat', 'ben', 'Kroppsvikt'),
  ('e-wallsit', 'Wall Sit', 'ben', 'Kroppsvikt'),
  ('e-rdl', 'Romanian Deadlift', 'ben', 'Skivstång'),
  ('e-sldl', 'Stiff-Leg Deadlift', 'ben', 'Skivstång'),
  ('e-db-rdl', 'Dumbbell Romanian Deadlift', 'ben', 'Hantlar'),
  ('e-hipthrust', 'Barbell Hip Thrust', 'ben', 'Skivstång'),
  ('e-glutebridge', 'Glute Bridge', 'ben', 'Kroppsvikt'),
  ('e-legcurl', 'Lying Leg Curl', 'ben', 'Maskin'),
  ('e-seatedcurl', 'Seated Leg Curl', 'ben', 'Maskin'),
  ('e-nordic', 'Nordic Hamstring Curl', 'ben', 'Kroppsvikt'),
  ('e-kbswing', 'Kettlebell Swing', 'helkropp', 'Kettlebell'),
  ('e-goodmorning', 'Good Morning', 'ben', 'Skivstång'),
  ('e-calfraise', 'Standing Calf Raise', 'ben', 'Maskin/hantlar'),
  ('e-seatedcalf', 'Seated Calf Raise', 'ben', 'Maskin'),
  ('e-abduction', 'Hip Abduction Machine', 'ben', 'Maskin'),
  ('e-adduction', 'Hip Adduction Machine', 'ben', 'Maskin'),
  ('e-copenhagen', 'Copenhagen Plank', 'bål', 'Bänk'),
  ('e-deadlift', 'Conventional Deadlift', 'rygg', 'Skivstång'),
  ('e-sumodl', 'Sumo Deadlift', 'rygg', 'Skivstång'),
  ('e-trapbar', 'Trap Bar Deadlift', 'rygg', 'Trap bar'),
  ('e-row', 'Barbell Row', 'rygg', 'Skivstång'),
  ('e-pendlay', 'Pendlay Row', 'rygg', 'Skivstång'),
  ('e-db-row', 'Single-Arm Dumbbell Row', 'rygg', 'Hantlar'),
  ('e-cablerow', 'Seated Cable Row', 'rygg', 'Kabel'),
  ('e-tbarrow', 'T-Bar Row', 'rygg', 'Maskin'),
  ('e-chestrow', 'Chest-Supported Row', 'rygg', 'Hantlar/maskin'),
  ('e-pullup', 'Pull-Up', 'rygg', 'Kroppsvikt'),
  ('e-chinup', 'Chin-Up', 'rygg', 'Kroppsvikt'),
  ('e-assistpull', 'Assisted Pull-Up', 'rygg', 'Maskin/band'),
  ('e-latpull', 'Lat Pulldown', 'rygg', 'Kabel'),
  ('e-straightarm', 'Straight-Arm Pulldown', 'rygg', 'Kabel'),
  ('e-invrow', 'Inverted Row', 'rygg', 'Kroppsvikt'),
  ('e-backext', 'Back Extension', 'rygg', 'Bänk'),
  ('e-shrug', 'Shrug', 'rygg', 'Skivstång/hantlar'),
  ('e-rackpull', 'Rack Pull', 'rygg', 'Skivstång'),
  ('e-bench', 'Bench Press', 'bröst', 'Skivstång'),
  ('e-closegrip', 'Close-Grip Bench Press', 'armar', 'Skivstång'),
  ('e-inclinebb', 'Incline Bench Press', 'bröst', 'Skivstång'),
  ('e-db-bench', 'Dumbbell Bench Press', 'bröst', 'Hantlar'),
  ('e-incline', 'Incline Dumbbell Press', 'bröst', 'Hantlar'),
  ('e-declinebench', 'Decline Bench Press', 'bröst', 'Skivstång'),
  ('e-pausebench', 'Paused Bench Press', 'bröst', 'Skivstång'),
  ('e-dbfly', 'Dumbbell Fly', 'bröst', 'Hantlar'),
  ('e-cablefly', 'Cable Crossover', 'bröst', 'Kabel'),
  ('e-pecdeck', 'Pec Deck', 'bröst', 'Maskin'),
  ('e-chestpress', 'Machine Chest Press', 'bröst', 'Maskin'),
  ('e-pushup', 'Push-Up', 'bröst', 'Kroppsvikt'),
  ('e-dip', 'Dip', 'bröst', 'Kroppsvikt'),
  ('e-ohp', 'Overhead Press', 'axlar', 'Skivstång'),
  ('e-db-ohp', 'Seated Dumbbell Shoulder Press', 'axlar', 'Hantlar'),
  ('e-pushpress', 'Push Press', 'axlar', 'Skivstång'),
  ('e-arnold', 'Arnold Press', 'axlar', 'Hantlar'),
  ('e-landmine', 'Landmine Press', 'axlar', 'Skivstång'),
  ('e-lateral', 'Lateral Raise', 'axlar', 'Hantlar'),
  ('e-cablelateral', 'Cable Lateral Raise', 'axlar', 'Kabel'),
  ('e-frontraise', 'Front Raise', 'axlar', 'Hantlar'),
  ('e-reardelt', 'Reverse Fly', 'axlar', 'Hantlar'),
  ('e-facepull', 'Face Pull', 'axlar', 'Kabel'),
  ('e-uprightrow', 'Upright Row', 'axlar', 'Skivstång/kabel'),
  ('e-handstandpu', 'Handstand Push-Up', 'axlar', 'Kroppsvikt'),
  ('e-curl', 'Dumbbell Curl', 'armar', 'Hantlar'),
  ('e-bbcurl', 'Barbell Curl', 'armar', 'Skivstång'),
  ('e-hammer', 'Hammer Curl', 'armar', 'Hantlar'),
  ('e-preacher', 'Preacher Curl', 'armar', 'Skivstång/maskin'),
  ('e-inclinecurl', 'Incline Dumbbell Curl', 'armar', 'Hantlar'),
  ('e-cablecurl', 'Cable Curl', 'armar', 'Kabel'),
  ('e-pushdown', 'Triceps Pushdown', 'armar', 'Kabel'),
  ('e-ohext', 'Overhead Triceps Extension', 'armar', 'Kabel/hantel'),
  ('e-skullcrusher', 'Skull Crusher', 'armar', 'Skivstång'),
  ('e-benchdip', 'Bench Dip', 'armar', 'Bänk'),
  ('e-wristcurl', 'Wrist Curl', 'armar', 'Hantlar'),
  ('e-plank', 'Plank', 'bål', 'Kroppsvikt'),
  ('e-sideplank', 'Side Plank', 'bål', 'Kroppsvikt'),
  ('e-pallof', 'Pallof Press', 'bål', 'Kabel/band'),
  ('e-deadbug', 'Dead Bug', 'bål', 'Kroppsvikt'),
  ('e-birddog', 'Bird Dog', 'bål', 'Kroppsvikt'),
  ('e-hlr', 'Hanging Leg Raise', 'bål', 'Räckhäck'),
  ('e-kneeraise', 'Hanging Knee Raise', 'bål', 'Räckhäck'),
  ('e-abwheel', 'Ab Wheel Rollout', 'bål', 'Magrulle'),
  ('e-cablecrunch', 'Cable Crunch', 'bål', 'Kabel'),
  ('e-crunch', 'Crunch', 'bål', 'Kroppsvikt'),
  ('e-russian', 'Russian Twist', 'bål', 'Kroppsvikt/vikt'),
  ('e-hollow', 'Hollow Hold', 'bål', 'Kroppsvikt'),
  ('e-woodchop', 'Cable Woodchop', 'bål', 'Kabel'),
  ('e-suitcase', 'Suitcase Carry', 'bål', 'Kettlebell/hantel'),
  ('e-clean', 'Power Clean', 'helkropp', 'Skivstång'),
  ('e-hangclean', 'Hang Clean', 'helkropp', 'Skivstång'),
  ('e-snatch', 'Power Snatch', 'helkropp', 'Skivstång'),
  ('e-thruster', 'Thruster', 'helkropp', 'Skivstång/hantlar'),
  ('e-kbcleanpress', 'Kettlebell Clean & Press', 'helkropp', 'Kettlebell'),
  ('e-tgu', 'Turkish Get-Up', 'helkropp', 'Kettlebell'),
  ('e-farmers', 'Farmer''s Walk', 'helkropp', 'Hantlar/kettlebells'),
  ('e-sandbag', 'Sandbag Lunge', 'helkropp', 'Sandsäck'),
  ('e-wallball', 'Wall Ball', 'helkropp', 'Medicinboll'),
  ('e-sledpush', 'Sled Push', 'helkropp', 'Släde'),
  ('e-sledpull', 'Sled Pull', 'helkropp', 'Släde'),
  ('e-burpee', 'Burpee', 'helkropp', 'Kroppsvikt'),
  ('e-burpee-bj', 'Burpee Broad Jump', 'helkropp', 'Kroppsvikt'),
  ('e-boxjump', 'Box Jump', 'helkropp', 'Låda'),
  ('e-battleropes', 'Battle Ropes', 'helkropp', 'Rep'),
  ('e-mountain', 'Mountain Climber', 'helkropp', 'Kroppsvikt'),
  ('e-musclup', 'Muscle-Up', 'helkropp', 'Räckhäck/ringar'),
  ('e-run', 'Running', 'kondition', '—'),
  ('e-intervals', 'Interval Running', 'kondition', '—'),
  ('e-treadmill', 'Treadmill', 'kondition', 'Löpband'),
  ('e-row-erg', 'Rowing Machine', 'kondition', 'Roddmaskin'),
  ('e-skierg', 'SkiErg', 'kondition', 'SkiErg'),
  ('e-bikeerg', 'Bike Erg', 'kondition', 'Cykel'),
  ('e-airbike', 'Air Bike', 'kondition', 'Airbike'),
  ('e-crosstrainer', 'Elliptical', 'kondition', 'Crosstrainer'),
  ('e-stairs', 'Stair Climber', 'kondition', 'Trappmaskin'),
  ('e-jumprope', 'Jump Rope', 'kondition', 'Hopprep'),
  ('e-swim', 'Swimming', 'kondition', 'Bassäng'),
  ('e-walk', 'Incline Walk', 'kondition', '—')
on conflict (id) do update
  set name = excluded.name, muscle_group = excluded.muscle_group, equipment = excluded.equipment
  where exercises.owner_id is null;

-- ============================================ 2. klientens behörighet ===
/** Samma övningar (id + innehåll) oavsett ordning. */
create or replace function same_exercises(a jsonb, b jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce((select jsonb_agg(x order by x->>'id') from jsonb_array_elements(a) x), '[]')
       = coalesce((select jsonb_agg(x order by x->>'id') from jsonb_array_elements(b) x), '[]');
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
    -- Klarmarkerat av PT:n = låst för klienten.
    if old.verified_at is not null then
      raise exception 'Passet är klarmarkerat av din PT och kan inte ändras' using errcode = '42501';
    end if;
    -- PT:ns pass: klienten får ändra status, kommentar och ordningen på övningarna.
    if old.trainer_id is not null
       and (new.template_id is distinct from old.template_id
            or new.name is distinct from old.name
            or new.date is distinct from old.date
            or not same_exercises(new.exercises, old.exercises)) then
      raise exception 'Klienter kan bara ändra status, kommentar och ordning på PT:ns pass' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ================================================ 4. låst efter kontroll ===
create or replace function workout_is_open(p_workout uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select verified_at is null from scheduled_workouts where id = p_workout), true);
$$;
revoke all on function workout_is_open(uuid) from public, anon;
grant execute on function workout_is_open(uuid) to authenticated;

drop policy if exists "set_logs: open workout insert" on set_logs;
drop policy if exists "set_logs: open workout update" on set_logs;
drop policy if exists "set_logs: open workout delete" on set_logs;
create policy "set_logs: open workout insert" on set_logs as restrictive for insert to authenticated
  with check (workout_is_open(workout_id));
create policy "set_logs: open workout update" on set_logs as restrictive for update to authenticated
  using (workout_is_open(workout_id)) with check (workout_is_open(workout_id));
create policy "set_logs: open workout delete" on set_logs as restrictive for delete to authenticated
  using (workout_is_open(workout_id));

-- ====================================== 3. redigera ett genomfört pass ===
/**
 * Klienten redigerar ett genomfört (ej klarmarkerat) pass: övningarna
 * (ordning; i egna pass även vilka övningar och antal set), alla loggade set
 * och kommentaren. Körs med anroparens rättigheter – RLS och
 * guard_client_workout_update gäller som vanligt – och i en transaktion, så
 * att passet aldrig sparas till hälften.
 *
 * p_logs: [{ "workoutExerciseId": text, "setIndex": int, "kg": num, "reps": int, "done": bool }]
 */
create or replace function edit_completed_workout(
  p_workout uuid,
  p_exercises jsonb,
  p_logs jsonb,
  p_comment text default null,
  p_name text default null
)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_w scheduled_workouts;
begin
  select * into v_w from scheduled_workouts where id = p_workout and client_id = auth.uid();
  if v_w.id is null then
    raise exception 'Passet hittades inte' using errcode = 'P0002';
  end if;
  if v_w.status <> 'completed' then
    raise exception 'Bara genomförda pass kan redigeras i efterhand' using errcode = '22023';
  end if;
  if jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) = 0 or jsonb_array_length(p_exercises) > 60 then
    raise exception 'Passet behöver 1–60 övningar' using errcode = '22023';
  end if;
  if jsonb_typeof(p_logs) <> 'array' or jsonb_array_length(p_logs) > 1000 then
    raise exception 'Ogiltiga set' using errcode = '22023';
  end if;

  update scheduled_workouts set
    exercises = p_exercises,
    client_comment = coalesce(nullif(trim(p_comment), ''), null),
    name = case when v_w.trainer_id is null and nullif(trim(p_name), '') is not null then left(trim(p_name), 80) else name end
  where id = p_workout;

  delete from set_logs where workout_id = p_workout;
  insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps, done, logged_at)
  select p_workout, l->>'workoutExerciseId', (l->>'setIndex')::smallint, (l->>'kg')::numeric, (l->>'reps')::smallint,
         coalesce((l->>'done')::boolean, true), now()
  from jsonb_array_elements(p_logs) l
  -- Bara set som hör till en övning i passet.
  where exists (select 1 from jsonb_array_elements(p_exercises) e where e->>'id' = l->>'workoutExerciseId');
end;
$$;
revoke all on function edit_completed_workout(uuid, jsonb, jsonb, text, text) from public, anon;
grant execute on function edit_completed_workout(uuid, jsonb, jsonb, text, text) to authenticated;

-- =========================================================== 5. recept ===
alter table recipes add column if not exists servings smallint not null default 1 check (servings between 1 and 20);

create table if not exists client_recipes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references profiles on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  notes       text not null default '' check (char_length(notes) <= 2000),
  -- MealItem[] (namn, gram, enhet, näringsvärden per 100 g).
  items       jsonb not null default '[]'
              check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40),
  servings    smallint not null default 1 check (servings between 1 and 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists client_recipes_client_idx on client_recipes (client_id);
drop trigger if exists client_recipes_touch on client_recipes;
create trigger client_recipes_touch before update on client_recipes
  for each row execute function touch_updated_at();

alter table client_recipes enable row level security;
revoke truncate, trigger, references on client_recipes from anon, authenticated;
drop policy if exists "client_recipes: own" on client_recipes;
create policy "client_recipes: own" on client_recipes for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
