-- ============================================================================
-- v44: säkerhetshärdning efter penetrationstestet (se README, "Säkerhetsgranskning v44").
--
-- Granskningen (46 + 15 attacker som klient, PT och oinloggad mot en kopia av
-- databasen) hittade inga kritiska hål: RLS är på för alla tabeller, roller,
-- betalningar, avgifter, certifikat och Boost kan inte manipuleras. Den här
-- migrationen täpper till det som hittades och härdar på djupet:
--
-- 1. has_health_consent(p_client) svarade för VILKEN användare som helst –
--    en inloggad kunde ta reda på om en annan person (via dess id) är klient
--    och har gett samtycke till hälsodata. Nu bara för en själv, sina
--    PT-/klientrelationer och servern (service role). Policyerna som använder
--    funktionen (v23) körs alltid av klienten själv eller klientens PT.
-- 2. Felmeddelandet för certifikat pekade på certifiering@coavira.com –
--    appens adress är certifiering@coavira.fit. Certifikat är personuppgifter
--    och ska inte skickas till en domän vi inte styr över.
-- 3. Oinloggade (anon) hade Supabases standardbehörigheter på alla tabeller.
--    Ingen policy släpper in anon i dag, men behörigheterna tas bort så att
--    en framtida slarvig policy (t.ex. "using (true)" utan "to authenticated")
--    inte blir en läcka. Gäller även tabeller som skapas framöver. anon kan
--    fortfarande anropa calendar_feed (kalenderprenumerationen, security definer).
--
-- Körs efter 20261117000000_v43_splits_exercises.sql.
-- ============================================================================

-- --------------------------------------------- 1. hälsodatasamtycke ---
create or replace function has_health_consent(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'client' and health_data_consent_at is not null
    from profiles where id = p_client
  ), false)
  -- auth.uid() är null för servern (service role) och SQL-editorn.
  and (auth.uid() is null or auth.uid() = p_client or is_coaching_partner(p_client));
$$;
revoke all on function has_health_consent(uuid) from public, anon;
grant execute on function has_health_consent(uuid) to authenticated;

-- ---------------------------------------------- 2. certifikatadressen ---
create or replace function guard_trainer_certifications()
returns trigger language plpgsql as $$
begin
  -- auth.uid() är null för service role och SQL-editorn (admin).
  if new.certifications is distinct from old.certifications and auth.uid() is not null then
    raise exception 'Certifikat verifieras manuellt av Coavira. Skicka dem till certifiering@coavira.fit.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ------------------------------------------ 3. anon utan tabellåtkomst ---
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
