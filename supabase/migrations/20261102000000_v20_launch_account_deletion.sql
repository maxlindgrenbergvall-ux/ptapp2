-- ============================================================================
-- v20: inför lanseringen i App Store och Google Play.
--
-- * Kontoradering (Apple 5.1.1(v), GDPR art. 17): fungerar för alla konton
--   igen. Sedan v18 stoppade skyddet för Coavira Plus-fälten databasens egen
--   "referred_by = null" när någon som bjudit in en vän raderade sitt konto.
-- * Avidentifiering vid radering: det som andra behåller (PT:ns omdömen och
--   aviseringar) får inte längre den raderades namn.
-- * Villkor: profiles.terms_accepted_at sätts när användaren godkänner
--   villkoren och behandlingen av hälsouppgifter (samma bockruta).
--
-- Körs efter 20261101000000_v19_custom_exercises_pt_invites.sql.
-- ============================================================================

-- ================================================ radering: referred_by ===
/**
 * Som v18, men databasen får nollställa referred_by när inbjudaren raderas
 * (on delete set null). Användaren kan fortfarande inte ändra fälten själv
 * (kolumnrättigheterna saknar dem dessutom).
 */
-- security definer: kontrollen av om inbjudaren finns kvar ska inte begränsas av RLS.
create or replace function guard_profile_rewards()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on' and (
    new.referral_code is distinct from old.referral_code
    or new.coavira_plus_until is distinct from old.coavira_plus_until
    or new.is_coavira_plus is distinct from old.is_coavira_plus
    or (new.referred_by is distinct from old.referred_by
        -- Inbjudarens konto raderas: referensen nollställs av databasen.
        and not (new.referred_by is null and not exists (select 1 from profiles where id = old.referred_by)))
  ) then
    raise exception 'Coavira Plus och inbjudningskoder kan inte ändras här' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ========================================== radering: avidentifiering ===
/**
 * Innan en profil raderas: omdömen PT:n behåller och aviseringar andra fått
 * ska inte längre visa den raderades namn. Allt annat raderas av `on delete
 * cascade` (pass, loggar, kost, meddelanden, bokningar, köp, varukorg, egna
 * övningar, inbjudningar, push-tokens …).
 */
create or replace function anonymize_deleted_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update reviews set author_name = 'Tidigare klient' where author_id = old.id;
  update notifications
    set payload = payload || jsonb_build_object('actor_name', 'Raderat konto')
    where actor_id = old.id and payload ? 'actor_name';
  return old;
end;
$$;
revoke execute on function anonymize_deleted_profile() from public, anon, authenticated;
create trigger profiles_anonymize_on_delete
  before delete on profiles
  for each row execute function anonymize_deleted_profile();

/**
 * Radera inloggat konto (används när servern saknar service role; annars
 * raderar /api/account/delete kontot via Supabase Auth admin-API:t, som även
 * tar bort användarens filer). Samma effekt: auth.users → profiles → allt annat.
 */
create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ===================================================== villkor godkända ===
alter table profiles add column if not exists terms_accepted_at timestamptz;

/** Bockrutan i välkomststeget gäller både villkoren och hälsouppgifterna. */
create or replace function set_terms_accepted()
returns trigger language plpgsql as $$
begin
  if new.health_data_consent_at is not null and new.terms_accepted_at is null then
    new.terms_accepted_at := new.health_data_consent_at;
  end if;
  return new;
end;
$$;
create trigger profiles_terms_accepted
  before insert or update of health_data_consent_at on profiles
  for each row execute function set_terms_accepted();
update profiles set terms_accepted_at = health_data_consent_at where terms_accepted_at is null and health_data_consent_at is not null;
