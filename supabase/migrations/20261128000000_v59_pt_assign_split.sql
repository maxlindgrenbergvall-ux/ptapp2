-- v59: samma passbyggare för klient och PT. PT:n kan tilldela ett upplägg som
-- klientens aktiva schema (client_splits) – bara till sina AKTIVA klienter.
--
-- Körs i en transaktion (som Supabase SQL Editor). Kräver v43 (client_splits)
-- och v58 (valid_v58_exercise_fields).

-- ============================================================ kolumnen ===
alter table client_splits
  add column if not exists assigned_by uuid references profiles on delete set null;
comment on column client_splits.assigned_by is 'v59: PT:n som tilldelade upplägget (null = klientens eget).';

-- ======================================================== hjälpfunktion ===
-- Aktiv (inte pausad) relation mellan inloggad PT och klienten.
create or replace function is_active_coach_of(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coaching_relationships
    where client_id = p_client and trainer_id = auth.uid() and status = 'active'
  );
$$;
revoke all on function is_active_coach_of(uuid) from public, anon;
grant execute on function is_active_coach_of(uuid) to authenticated;

-- ============================================================= policyer ===
-- Klienten: som förut ("splits: client own"). PT: läsa (v43) + tilldela/ändra.
drop policy if exists "splits: trainer assign" on client_splits;
create policy "splits: trainer assign" on client_splits for insert to authenticated
  with check (is_active_coach_of(client_id) and assigned_by = auth.uid());

drop policy if exists "splits: trainer update" on client_splits;
create policy "splits: trainer update" on client_splits for update to authenticated
  using (is_active_coach_of(client_id))
  with check (is_active_coach_of(client_id) and assigned_by = auth.uid());

-- ================================================================ skydd ===
/*
 * - En PT som skriver måste stå som assigned_by (kan inte låtsas vara någon annan).
 * - Klienten kan behålla eller ta bort PT-märkningen, men inte sätta någon annan.
 * - Dagarnas övningar följer samma regler som passen (v58: trackingType, distans …).
 */
create or replace function client_splits_guard_v59() returns trigger language plpgsql set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day jsonb;
begin
  if v_uid is not null and v_uid <> new.client_id then
    if new.assigned_by is distinct from v_uid then
      raise exception 'En PT som tilldelar ett upplägg står som avsändare' using errcode = '42501';
    end if;
  elsif v_uid is not null and v_uid = new.client_id and new.assigned_by is not null
        and (tg_op = 'INSERT' or new.assigned_by is distinct from old.assigned_by) then
    raise exception 'Bara PT:n kan märka upplägget som tilldelat' using errcode = '42501';
  end if;
  for v_day in select * from jsonb_array_elements(new.days) loop
    if v_day ? 'exercises' and not valid_v58_exercise_fields(v_day -> 'exercises') then
      raise exception 'Ogiltiga övningsfält i upplägget' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists client_splits_guard_v59 on client_splits;
create trigger client_splits_guard_v59 before insert or update on client_splits
  for each row execute function client_splits_guard_v59();
