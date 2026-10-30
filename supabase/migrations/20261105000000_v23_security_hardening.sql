-- ============================================================================
-- v23: säkerhetsgranskning (OWASP / GDPR art. 9 / Supabase).
--
-- 1. Hälsodata (art. 9) kan bara sparas för en klient som gett uttryckligt
--    samtycke (profiles.health_data_consent_at). Tidigare kunde ett konto som
--    inte gjort klart välkomststeget (ingen roll, inget samtycke) skriva vikt,
--    sömn, vatten och mat direkt via API:t. Restriktiva policies läggs ovanpå
--    de befintliga (båda måste vara uppfyllda). Radering påverkas inte.
-- 2. has_call_access / has_nutrition_access svarar bara för den egna
--    relationen. Tidigare kunde vilken inloggad användare som helst fråga om
--    två godtyckliga personer hade köpt pass/kostcoaching av varandra.
-- 3. TRUNCATE (går förbi RLS), TRIGGER och REFERENCES tas bort för anon och
--    authenticated på alla tabeller – inget av det behövs av appen.
-- 4. Rate limiting för känsliga API-rutter (checkout, Stripe, kontoradering,
--    livsmedelssök): räknare i databasen, så att gränsen gäller oavsett vilken
--    serverinstans (Vercel) som svarar. Bara servern (service role) anropar.
--
-- Körs efter 20261104000000_v22_stripe_connect.sql.
-- ============================================================================

-- ======================================================== 1. samtycke ===
/** Klient med uttryckligt samtycke till behandling av hälsodata. */
create or replace function has_health_consent(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'client' and health_data_consent_at is not null
    from profiles where id = p_client
  ), false);
$$;
revoke all on function has_health_consent(uuid) from public, anon;
grant execute on function has_health_consent(uuid) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'weight_entries', 'sleep_logs', 'water_logs', 'progress_entries', 'food_entries',
    'meal_checks', 'scheduled_workouts', 'nutrition_plans'
  ] loop
    execute format('drop policy if exists "health consent: insert" on %I', t);
    execute format('drop policy if exists "health consent: update" on %I', t);
    execute format(
      'create policy "health consent: insert" on %I as restrictive for insert to authenticated with check (has_health_consent(client_id))', t);
    execute format(
      'create policy "health consent: update" on %I as restrictive for update to authenticated using (has_health_consent(client_id)) with check (has_health_consent(client_id))', t);
  end loop;
end;
$$;

-- ============================================ 2. relationer mellan parter ===
create or replace function has_call_access(p_client uuid, p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- Bara parterna själva (eller systemet, auth.uid() = null) får svar.
  select (auth.uid() is null or auth.uid() in (p_client, p_trainer))
     and (
       exists (select 1 from purchases where client_id = p_client and trainer_id = p_trainer and status = 'paid')
       or exists (
         select 1 from calendar_events
         where client_id = p_client and trainer_id = p_trainer and kind = 'session' and status in ('confirmed', 'completed')
       )
     );
$$;

create or replace function has_nutrition_access(p_trainer uuid, p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (p_client, p_trainer))
     and exists (
       select 1 from purchases
       where trainer_id = p_trainer and client_id = p_client and status = 'paid' and includes_nutrition
     );
$$;

-- ======================================================= 3. rättigheter ===
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- ===================================================== 4. rate limiting ===
create table rate_limits (
  key          text primary key check (char_length(key) between 1 and 200),
  window_start timestamptz not null default now(),
  hits         int not null default 1
);
alter table rate_limits enable row level security;
-- Inga policies: bara servern (service role) via hit_rate_limit().
revoke all on rate_limits from anon, authenticated;

/**
 * Server: räkna ett anrop för nyckeln (t.ex. "checkout:<user>") och svara om
 * det ryms inom p_max anrop per p_window_seconds. Fast fönster, atomärt.
 */
create or replace function hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hits int;
begin
  insert into rate_limits as r (key, window_start, hits) values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  -- Städa gamla fönster ibland (ingen persondata ligger kvar längre än ett dygn).
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;
revoke all on function hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;
