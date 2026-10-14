-- ============================================================================
-- Forma: initialt schema (Supabase / Postgres 15+)
--
-- Speglar src/types/domain.ts. Kör i ett Supabase-projekt i EU-region
-- (t.ex. eu-north-1 Stockholm), antingen via `supabase db push` eller genom
-- att klistra in filen i SQL-editorn. Därefter supabase/seed.sql.
--
-- Säkerhetsmodell: Row Level Security på ALLA tabeller och alla policyer
-- gäller bara inloggade (`to authenticated`). Hälsodata (vikt, träning, kost,
-- meddelanden) är känsliga personuppgifter enligt GDPR art. 9 och kan bara
-- läsas av klienten själv och klientens aktiva PT. En PT med status
-- 'pending' (obesvarad förfrågan) ser namnet men ingen hälsodata.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ================================================================ profiler ===
create type user_role as enum ('client', 'trainer');

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        user_role not null,
  full_name   text not null check (char_length(full_name) between 1 and 120),
  created_at  timestamptz not null default now(),
  -- Uttryckligt samtycke till behandling av hälsodata (art. 9.2 a). Krävs för klienter.
  health_data_consent_at timestamptz,
  constraint clients_must_consent check (role = 'trainer' or health_data_consent_at is not null)
);

create type specialty as enum (
  'hyrox', 'styrkelyft', 'viktminskning', 'rehab',
  'kalisthenics', 'postnatal', 'lopning', 'bodybuilding'
);

-- PT-profil. Publiceras i sökningen först när PT:n själv slår på is_published.
create table trainers (
  id                uuid primary key references profiles on delete cascade,
  city              text not null default '',
  specialties       specialty[] not null default '{}',
  bio               text not null default '' check (char_length(bio) <= 2000),
  years_experience  int not null default 0 check (years_experience between 0 and 80),
  price_per_session int not null default 0 check (price_per_session between 0 and 100000), -- SEK
  offers_remote     boolean not null default false,
  is_published      boolean not null default false
);
create index trainers_specialties_idx on trainers using gin (specialties);

create table trainer_availability (
  trainer_id  uuid not null references trainers on delete cascade,
  slot        timestamptz not null,
  primary key (trainer_id, slot)
);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references trainers on delete cascade,
  author_id   uuid references profiles on delete set null,
  -- Visningsnamn sparas på omdömet så att författarens profil inte behöver vara läsbar.
  author_name text not null check (char_length(author_name) between 1 and 60),
  rating      smallint not null check (rating between 1 and 5),
  text        text not null check (char_length(text) <= 2000),
  created_at  timestamptz not null default now(),
  unique (trainer_id, author_id)
);

-- Ny användare i auth.users → profil (+ PT-rad). Metadata kommer från signUp().
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'client')::user_role;
begin
  insert into profiles (id, role, full_name, health_data_consent_at)
  values (
    new.id,
    v_role,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    case when (new.raw_user_meta_data->>'health_data_consent')::boolean then now() end
  );
  if v_role = 'trainer' then
    insert into trainers (id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ===================================================== PT–klient-relation ===
create type client_status as enum ('pending', 'active', 'paused', 'ended');

create table coaching_relationships (
  trainer_id  uuid not null references trainers on delete cascade,
  client_id   uuid not null references profiles on delete cascade,
  status      client_status not null default 'pending',
  goal        text not null default '' check (char_length(goal) <= 300),
  started_at  date,
  created_at  timestamptz not null default now(),
  primary key (trainer_id, client_id)
);
create index coaching_relationships_client_idx on coaching_relationships (client_id);

-- Parterna i en relation kan aldrig bytas ut. Annars skulle en PT kunna peka om
-- en relation till en annan klient och få åtkomst till dennes hälsodata.
create or replace function guard_relationship_update()
returns trigger language plpgsql as $$
begin
  if new.trainer_id is distinct from old.trainer_id
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Parterna i en relation kan inte ändras' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger coaching_relationships_guard
  before update on coaching_relationships
  for each row execute function guard_relationship_update();

-- Är inloggad användare aktiv (eller pausad) PT för klienten? Används av RLS.
-- security definer så att policyer på andra tabeller inte rekurserar.
create or replace function is_active_trainer_of(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coaching_relationships
    where client_id = p_client and trainer_id = auth.uid() and status in ('active', 'paused')
  );
$$;

-- ================================================================ träning ===
create type muscle_group as enum ('ben','bröst','rygg','axlar','armar','bål','helkropp','kondition');

create table exercises (
  -- text-id så att den globala övningsbanken kan ha stabila id:n ("e-squat").
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  muscle_group  muscle_group not null,
  equipment     text not null default '',
  video_url     text,
  owner_id      uuid references trainers on delete cascade -- null = global övningsbank
);

create table workout_templates (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references trainers on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  exercises   jsonb not null default '[]' check (jsonb_typeof(exercises) = 'array'), -- WorkoutExercise[]
  updated_at  timestamptz not null default now()
);

create type workout_status as enum ('planned', 'in_progress', 'completed', 'skipped');

-- Schemalagt pass. `exercises` är en kopia av mallen vid tilldelningen, så att
-- ändringar i mallen inte skriver om historiken.
create table scheduled_workouts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references profiles on delete cascade,
  trainer_id     uuid not null references trainers on delete cascade,
  template_id    uuid references workout_templates on delete set null,
  name           text not null,
  date           date not null,
  exercises      jsonb not null check (jsonb_typeof(exercises) = 'array'),
  status         workout_status not null default 'planned',
  completed_at   timestamptz,
  client_comment text check (char_length(client_comment) <= 1000)
);
create index scheduled_workouts_client_date_idx on scheduled_workouts (client_id, date desc);

-- Klienten får bara ändra status, tidpunkt och kommentar på sina pass, inte
-- själva programmet. (Kolumnbehörighet räcker inte: PT och klient har samma DB-roll.)
create or replace function guard_client_workout_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() = old.client_id and not is_active_trainer_of(old.client_id) then
    if new.client_id is distinct from old.client_id
       or new.trainer_id is distinct from old.trainer_id
       or new.template_id is distinct from old.template_id
       or new.name is distinct from old.name
       or new.date is distinct from old.date
       or new.exercises is distinct from old.exercises then
      raise exception 'Klienter kan bara ändra status och kommentar på ett pass'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger scheduled_workouts_guard
  before update on scheduled_workouts
  for each row execute function guard_client_workout_update();

-- En rad per set. Varje avbockning är en liten idempotent upsert, vilket gör
-- offlinekön i klienten enkel och tål dubbla skick.
create table set_logs (
  workout_id           uuid not null references scheduled_workouts on delete cascade,
  workout_exercise_id  text not null,
  set_index            smallint not null check (set_index between 0 and 99),
  kg                   numeric(6,2) not null check (kg between 0 and 1000),
  reps                 smallint not null check (reps between 0 and 1000),
  done                 boolean not null default true,
  logged_at            timestamptz not null default now(),
  primary key (workout_id, workout_exercise_id, set_index)
);

-- =================================================================== kost ===
create table nutrition_plans (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references trainers on delete cascade,
  client_id   uuid not null references profiles on delete cascade,
  name        text not null,
  kcal        int not null check (kcal between 0 and 10000),
  protein_g   int not null check (protein_g between 0 and 1000),
  carbs_g     int not null check (carbs_g between 0 and 2000),
  fat_g       int not null check (fat_g between 0 and 1000),
  meals       jsonb not null default '[]' check (jsonb_typeof(meals) = 'array'), -- Meal[]
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);
-- Högst en aktiv plan per klient.
create unique index nutrition_plans_one_active on nutrition_plans (client_id) where is_active;

create table meal_checks (
  client_id  uuid not null references profiles on delete cascade,
  date       date not null,
  meal_id    text not null,
  primary key (client_id, date, meal_id)
);

create table weight_entries (
  client_id  uuid not null references profiles on delete cascade,
  date       date not null,
  kg         numeric(5,1) not null check (kg between 25 and 350),
  primary key (client_id, date)
);

-- ============================================================ meddelanden ===
create table messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references profiles on delete cascade, -- = tråd-id
  sender_id   uuid not null references profiles on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  workout_id  uuid references scheduled_workouts on delete set null,
  sent_at     timestamptz not null default now(),
  read_at     timestamptz
);
create index messages_thread_idx on messages (client_id, sent_at);

-- ================================================================ bokning ===
create type booking_status as enum ('requested', 'confirmed', 'cancelled');

create table bookings (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references trainers on delete cascade,
  client_id   uuid not null references profiles on delete cascade,
  slot        timestamptz not null,
  status      booking_status not null default 'requested',
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
-- Förhindrar dubbelbokning av samma tid (två klienter som bokar samtidigt).
create unique index bookings_no_double on bookings (trainer_id, slot) where status <> 'cancelled';

-- En bokning måste avse en ledig tid. Tiden tas då bort från PT:ns lediga tider,
-- och läggs tillbaka om bokningen avbokas.
create or replace function claim_booking_slot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from trainer_availability where trainer_id = new.trainer_id and slot = new.slot;
  if not found then
    raise exception 'Tiden är inte längre ledig' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger bookings_claim_slot
  before insert on bookings
  for each row execute function claim_booking_slot();

create or replace function release_booking_slot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.slot > now() then
    insert into trainer_availability (trainer_id, slot) values (new.trainer_id, new.slot)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function guard_booking_update()
returns trigger language plpgsql as $$
begin
  if new.trainer_id is distinct from old.trainer_id
     or new.client_id is distinct from old.client_id
     or new.slot is distinct from old.slot then
    raise exception 'Bara status kan ändras på en bokning' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger bookings_guard
  before update on bookings
  for each row execute function guard_booking_update();

create trigger bookings_release_slot
  after update on bookings
  for each row execute function release_booking_slot();

-- ===================================================== radera konto (art. 17) ===
-- Raderar inloggad användare. Allt annat försvinner via `on delete cascade`.
create or replace function delete_my_account()
returns void language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ==================================================================== RLS ===
alter table profiles               enable row level security;
alter table trainers               enable row level security;
alter table trainer_availability   enable row level security;
alter table reviews                enable row level security;
alter table coaching_relationships enable row level security;
alter table exercises              enable row level security;
alter table workout_templates      enable row level security;
alter table scheduled_workouts     enable row level security;
alter table set_logs               enable row level security;
alter table nutrition_plans        enable row level security;
alter table meal_checks            enable row level security;
alter table weight_entries         enable row level security;
alter table messages               enable row level security;
alter table bookings               enable row level security;

-- Profiler: egen profil, motparter i en relation, och publicerade PT:er.
-- Egen profil får uppdateras (namn), men inte rollen (se trigger nedan).
create policy "profiles: read self" on profiles for select to authenticated using (id = auth.uid());
create policy "profiles: update self" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: read counterparts" on profiles for select to authenticated using (
  exists (select 1 from coaching_relationships r
          where (r.client_id = profiles.id and r.trainer_id = auth.uid())
             or (r.trainer_id = profiles.id and r.client_id = auth.uid()))
);
create policy "profiles: read published trainers" on profiles for select to authenticated using (
  exists (select 1 from trainers t where t.id = profiles.id and t.is_published)
);

create or replace function guard_profile_update()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role or new.created_at is distinct from old.created_at then
    raise exception 'Roll kan inte ändras' using errcode = '42501';
  end if;
  -- Samtycke kan återkallas genom att radera kontot, inte genom att nollställa fältet.
  if old.health_data_consent_at is not null and new.health_data_consent_at is null then
    raise exception 'Samtycke återkallas genom att radera kontot' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_update();

-- PT-profiler: publicerade syns för alla inloggade; den egna PT:n syns alltid för sina klienter.
create policy "trainers: read" on trainers for select to authenticated using (
  is_published
  or id = auth.uid()
  or exists (select 1 from coaching_relationships r where r.trainer_id = trainers.id and r.client_id = auth.uid())
);
create policy "trainers: update own" on trainers for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "availability: read" on trainer_availability for select to authenticated using (true);
create policy "availability: own write" on trainer_availability for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

create policy "reviews: read" on reviews for select to authenticated using (true);
-- Bara klienter som faktiskt tränat med PT:n kan recensera.
create policy "reviews: clients write" on reviews for insert to authenticated with check (
  author_id = auth.uid() and exists (
    select 1 from coaching_relationships r
    where r.trainer_id = reviews.trainer_id and r.client_id = auth.uid() and r.status <> 'pending'
  )
);

create policy "relationships: parties read" on coaching_relationships for select to authenticated
  using (client_id = auth.uid() or trainer_id = auth.uid());
create policy "relationships: client requests" on coaching_relationships for insert to authenticated
  with check (client_id = auth.uid() and status = 'pending');
create policy "relationships: trainer manages" on coaching_relationships for update to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

create policy "exercises: read" on exercises for select to authenticated using (owner_id is null or owner_id = auth.uid());
create policy "exercises: own write" on exercises for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "templates: own" on workout_templates for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- Hälsodata: klienten själv + aktiv PT.
create policy "workouts: client read" on scheduled_workouts for select to authenticated using (client_id = auth.uid());
create policy "workouts: client updates status" on scheduled_workouts for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "workouts: trainer all" on scheduled_workouts for all to authenticated
  using (is_active_trainer_of(client_id))
  with check (is_active_trainer_of(client_id) and trainer_id = auth.uid());

create policy "set_logs: client write" on set_logs for all to authenticated using (
  exists (select 1 from scheduled_workouts w where w.id = workout_id and w.client_id = auth.uid())
) with check (
  exists (select 1 from scheduled_workouts w where w.id = workout_id and w.client_id = auth.uid())
);
create policy "set_logs: trainer read" on set_logs for select to authenticated using (
  exists (select 1 from scheduled_workouts w where w.id = workout_id and is_active_trainer_of(w.client_id))
);

create policy "nutrition: client read" on nutrition_plans for select to authenticated using (client_id = auth.uid());
create policy "nutrition: trainer all" on nutrition_plans for all to authenticated
  using (is_active_trainer_of(client_id))
  with check (is_active_trainer_of(client_id) and trainer_id = auth.uid());

create policy "meal_checks: client" on meal_checks for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "meal_checks: trainer read" on meal_checks for select to authenticated using (is_active_trainer_of(client_id));

create policy "weight: client" on weight_entries for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "weight: trainer read" on weight_entries for select to authenticated using (is_active_trainer_of(client_id));

create policy "messages: parties read" on messages for select to authenticated
  using (client_id = auth.uid() or is_active_trainer_of(client_id));
create policy "messages: parties send" on messages for insert to authenticated with check (
  sender_id = auth.uid() and (client_id = auth.uid() or is_active_trainer_of(client_id))
);
-- Mottagaren får markera som läst. Bara kolumnen read_at är skrivbar (grant nedan).
create policy "messages: mark read" on messages for update to authenticated
  using ((client_id = auth.uid() or is_active_trainer_of(client_id)) and sender_id <> auth.uid());
revoke update on messages from authenticated;
grant update (read_at) on messages to authenticated;

create policy "bookings: parties read" on bookings for select to authenticated
  using (client_id = auth.uid() or trainer_id = auth.uid());
create policy "bookings: client requests" on bookings for insert to authenticated
  with check (client_id = auth.uid() and status = 'requested');
-- Klienten kan bara avboka; PT:n kan bekräfta eller avböja.
create policy "bookings: client cancels" on bookings for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid() and status = 'cancelled');
create policy "bookings: trainer manages" on bookings for update to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ============================================================== realtid ===
-- Chatt, loggade set (PT ser passet live) och bokningar. RLS gäller även realtid.
alter publication supabase_realtime add table messages, set_logs, scheduled_workouts, bookings, coaching_relationships;
