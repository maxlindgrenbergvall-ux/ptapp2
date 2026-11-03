-- ============================================================================
-- v30: klientens mål och kroppsmått (intro-flödet och Profil → Mål).
--
-- En rad per klient. Kalorimålet räknas i appen (src/lib/goals/metabolism.ts:
-- Mifflin-St Jeor × aktivitetsfaktor ± reglagets under-/överskott) och sparas
-- som ögonblicksbild i target_*, så att PT:n ser samma siffror som klienten.
-- Klienten läser och ändrar sin egen rad; klientens aktiva PT:er kan läsa den.
-- Ålder lagras som födelseår så att den stämmer över tid.
--
-- Körs efter 20261111000000_v29_moderation_mealprep_templates.sql.
-- ============================================================================

create table if not exists client_goals (
  client_id         uuid primary key references profiles on delete cascade,
  goals             text[] not null
    check (cardinality(goals) between 1 and 6
       and goals <@ array['weight_loss', 'muscle_gain', 'recomp', 'strength', 'endurance', 'health']::text[]),
  sex               text not null check (sex in ('female', 'male', 'other')),
  birth_year        int not null check (birth_year between 1900 and 2100),
  height_cm         numeric(4,1) not null check (height_cm between 120 and 230),
  start_weight_kg   numeric(4,1) not null check (start_weight_kg between 30 and 300),
  current_weight_kg numeric(4,1) not null check (current_weight_kg between 30 and 300),
  target_weight_kg  numeric(4,1) check (target_weight_kg is null or target_weight_kg between 30 and 300),
  activity_level    text not null check (activity_level in ('sedentary', 'light', 'moderate', 'very')),
  -- Aggressivitetsreglaget: kg per vecka (−1,0 intensiv nedgång … +0,5 snabb ökning).
  weekly_change_kg  numeric(3,2) not null default 0 check (weekly_change_kg between -1 and 0.5),
  started_at        date not null default current_date,
  target_kcal       int not null check (target_kcal between 1000 and 6000),
  target_protein_g  int not null check (target_protein_g between 0 and 500),
  target_carbs_g    int not null check (target_carbs_g between 0 and 1000),
  target_fat_g      int not null check (target_fat_g between 0 and 400),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Rimlig ålder (13–100 år) räknat på innevarande år.
  constraint client_goals_age_check check (birth_year between extract(year from created_at)::int - 100 and extract(year from created_at)::int - 13)
);

alter table client_goals enable row level security;

drop policy if exists "goals: client own" on client_goals;
create policy "goals: client own" on client_goals for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists "goals: trainer read" on client_goals;
create policy "goals: trainer read" on client_goals for select to authenticated
  using (is_active_trainer_of(client_id));

-- updated_at sätts av databasen.
create or replace function client_goals_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists client_goals_touch on client_goals;
create trigger client_goals_touch before update on client_goals for each row execute function client_goals_touch();
