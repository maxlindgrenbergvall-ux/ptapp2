-- ============================================================================
-- Coavira v14: buggfixar och regler.
--
-- 1. Profilbild – "new row violates row-level security policy":
--    Appen laddar upp med upsert (x-upsert: true). Storage gör då
--    INSERT … ON CONFLICT DO UPDATE … RETURNING, vilket kräver INSERT, UPDATE
--    OCH SELECT på storage.objects. Bucketen avatars hade ingen SELECT-policy
--    (den är publik för nedladdning via URL, men det gäller inte API:t), och
--    UPDATE saknade WITH CHECK. Nu: egen mapp {uid}/… för alla tre.
-- 2. Kost-PT: offers_nutrition var true som standard för alla PT:er, även de
--    som aldrig sålt kost. Nu false som standard och rättat för befintliga
--    PT:er utifrån om de har en aktiv kosttjänst.
-- 3. Pass kan inte markeras som genomförda (eller klarmarkeras) innan passets
--    tid har inträffat – varken av PT eller klient.
-- 4. Klarmarkering kräver att vikter är ifyllda för alla genomförda set i
--    övningar med vikt (skivstång, hantlar, maskin, kabel …).
-- 5. Samtal kräver köp eller bokat pass mellan klienten och PT:n.
--
-- Körs efter 20261026000000_v13_own_workouts_verify_avatar.sql.
-- ============================================================================

-- ====================================================== 1. profilbild (RLS) ===
drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========================================================= 2. kost-PT:er ===
alter table trainers alter column offers_nutrition set default false;
update trainers t set offers_nutrition = exists (
  select 1 from trainer_services s where s.trainer_id = t.id and s.active and s.includes_nutrition
)
where offers_training;

-- ============================================== 3. inga genomförda pass i förtid ===
/** Har passets tid inträffat? Datum i PT:ns tidszon, och kopplat kalenderpass har börjat. */
create or replace function workout_has_started(p_workout uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select p_date <= (now() at time zone 'Europe/Stockholm')::date
     and not exists (
       select 1 from calendar_events e
       where (e.workout_id = p_workout or e.id = (select event_id from scheduled_workouts where id = p_workout))
         and e.status <> 'cancelled' and e.start_time > now()
     );
$$;

/** Vikter saknas i genomförda set för övningar som görs med vikt? */
create or replace function workout_missing_weights(p_workout uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from scheduled_workouts w
    cross join lateral jsonb_array_elements(w.exercises) ex
    join exercises x on x.id = ex->>'exerciseId'
    join set_logs l on l.workout_id = w.id and l.workout_exercise_id = ex->>'id' and l.done
    where w.id = p_workout
      and x.equipment ~* '(skivstång|hantl|hantel|kettlebell|kabel|släde|trap bar|sandsäck|^maskin)'
      and l.kg <= 0
  ) or not exists (select 1 from set_logs l where l.workout_id = p_workout and l.done);
$$;

create or replace function guard_workout_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and not workout_has_started(new.id, new.date) then
    raise exception 'Passet kan inte markeras som genomfört innan det har ägt rum' using errcode = 'P0001', hint = 'workout_not_started';
  end if;
  if new.verified_at is not null and (tg_op = 'INSERT' or old.verified_at is null) then
    if not workout_has_started(new.id, new.date) then
      raise exception 'Passet kan inte klarmarkeras innan det har ägt rum' using errcode = 'P0001', hint = 'workout_not_started';
    end if;
    if workout_missing_weights(new.id) then
      raise exception 'Fyll i vilka vikter som användes i alla genomförda set innan passet klarmarkeras' using errcode = 'P0001', hint = 'weights_missing';
    end if;
  end if;
  return new;
end;
$$;
create trigger scheduled_workouts_completion
  before insert or update of status, verified_at on scheduled_workouts
  for each row execute function guard_workout_completion();

create or replace function guard_event_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') and new.start_time > now() then
    raise exception 'Passet kan inte markeras som genomfört innan det har börjat' using errcode = 'P0001', hint = 'event_not_started';
  end if;
  return new;
end;
$$;
create trigger calendar_events_completion
  before insert or update of status on calendar_events
  for each row execute function guard_event_completion();

-- ============================================ 5. samtal kräver köp eller bokning ===
/** Har klienten köpt en tjänst av PT:n eller bokat ett pass med hen? */
create or replace function has_call_access(p_client uuid, p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from purchases where client_id = p_client and trainer_id = p_trainer and status = 'paid')
      or exists (
        select 1 from calendar_events
        where client_id = p_client and trainer_id = p_trainer and kind = 'session' and status in ('confirmed', 'completed')
      );
$$;
revoke all on function has_call_access(uuid, uuid) from public, anon;
grant execute on function has_call_access(uuid, uuid) to authenticated;

create or replace function can_access_call(p_topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_client uuid;
  v_trainer uuid;
begin
  if p_topic !~ '^call:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    return false;
  end if;
  v_client := split_part(p_topic, ':', 2)::uuid;
  v_trainer := split_part(p_topic, ':', 3)::uuid;
  if not has_call_access(v_client, v_trainer) then
    return false;
  end if;
  return (v_client = auth.uid() and is_my_trainer(v_trainer))
      or (v_trainer = auth.uid() and is_active_trainer_of(v_client));
end;
$$;
