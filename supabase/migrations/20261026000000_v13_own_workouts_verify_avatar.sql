-- ============================================================================
-- Coavira v13: klientens egna pass, PT:ns klarmarkering, program kopplade
-- till bokade pass, profilbild för klienter och synkad "Dagens kost".
--
-- * Egna pass: scheduled_workouts.trainer_id kan vara null = klienten har
--   skapat och loggat passet själv. Klientens PT:er ser dem (underlag), men
--   de räknas aldrig som betalda pass och kan bara ändras av klienten.
-- * Klarmarkering: PT:n verifierar vad som faktiskt gjordes (vikter, reps,
--   set) och lämnar en kommentar. verified_at/verified_by/trainer_comment
--   sätts bara av passets PT. PT:n får därför också skriva set_logs för sina
--   egna pass.
-- * Program i kalendern: ett pass kan skapas för ett bokat kalenderpass
--   (event_id). Det ersätter då kalenderpassets plats i passgränsen i stället
--   för att ta ett nytt betalt pass.
-- * profiles.avatar_url: klientens profilbild (PT:er har sin i trainers).
-- * meal_checks i realtid, så att PT:n ser klientens "Dagens kost" direkt.
--
-- Körs efter 20261025000000_v12_multi_pt_interests.sql.
-- ============================================================================

-- ============================================================ egna pass ===
alter table scheduled_workouts
  alter column trainer_id drop not null,
  add column event_id uuid references calendar_events on delete set null,
  add column verified_at timestamptz,
  add column verified_by uuid references profiles on delete set null,
  add column trainer_comment text check (char_length(trainer_comment) <= 1000);
create index scheduled_workouts_event_idx on scheduled_workouts (event_id) where event_id is not null;

create policy "workouts: client creates own" on scheduled_workouts for insert to authenticated
  with check (client_id = auth.uid() and trainer_id is null and event_id is null and verified_at is null);
create policy "workouts: client deletes own" on scheduled_workouts for delete to authenticated
  using (client_id = auth.uid() and trainer_id is null);

/**
 * Klienten får ändra allt i sina egna pass, men bara status och kommentar i
 * PT:ns pass. Ingen utom passets PT kan klarmarkera (verified_*).
 */
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

  if v_uid = old.client_id and old.trainer_id is not null then
    if new.template_id is distinct from old.template_id
       or new.name is distinct from old.name
       or new.date is distinct from old.date
       or new.exercises is distinct from old.exercises then
      raise exception 'Klienter kan bara ändra status och kommentar på PT:ns pass' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Passgräns: egna pass räknas aldrig. Ett pass för ett redan bokat
-- kalenderpass (event_id) tar kalenderpassets plats i stället för ett nytt.
create or replace function enforce_workout_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is null then
    return new;
  end if;
  if new.event_id is not null then
    if not exists (
      select 1 from calendar_events e
      where e.id = new.event_id and e.trainer_id = new.trainer_id and e.client_id = new.client_id and e.kind = 'session'
    ) then
      raise exception 'Kalenderpasset tillhör inte klienten' using errcode = '23514';
    end if;
    if exists (
      select 1 from calendar_events e
      where e.id = new.event_id and e.workout_id is null and e.status in ('pending', 'confirmed', 'completed')
    ) then
      return new;
    end if;
  end if;
  perform require_session_credit(new.trainer_id, new.client_id);
  return new;
end;
$$;

-- PT:n loggar/rättar set när passet klarmarkeras (bara egna pass, aktiv klient).
create policy "set_logs: trainer writes own workouts" on set_logs for all to authenticated
  using (exists (select 1 from scheduled_workouts w where w.id = workout_id and w.trainer_id = auth.uid() and is_active_trainer_of(w.client_id)))
  with check (exists (select 1 from scheduled_workouts w where w.id = workout_id and w.trainer_id = auth.uid() and is_active_trainer_of(w.client_id)));

-- ============================================================ profilbild ===
alter table profiles
  add column avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 1000 and avatar_url ~ '^(https://|data:image/)'));

-- ===================================================== Dagens kost i realtid ===
alter publication supabase_realtime add table meal_checks;
