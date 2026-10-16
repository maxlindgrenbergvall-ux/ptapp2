-- ============================================================================
-- Coavira v6: ny inloggning/registrering och inga gratispass.
--
-- Inloggning
-- * Konton skapas via Supabase Auth: e-post + lösenord (med telefonnummer) eller
--   Apple/Google. Vid registrering vet vi inte om användaren är PT eller klient,
--   så profiles.role är tom tills användaren valt kontotyp i välkomststeget
--   (complete_onboarding). Där lämnar klienter också samtycke till hälsodata.
-- * Telefonnummer sparas på profilen i E.164-format (+46701234567).
-- * Rollen kan sättas EN gång (från tom) och bara via complete_onboarding, som
--   också skapar PT-raden och speglar rollen i auth-metadata (för navigeringen).
--
-- Gratispass
-- * Coavira hanterar inga gratispass: erbjudanden måste ha ett pris > 0 eller en
--   rabatt under 100 %, och får inte marknadsföras som gratis. Publicerade
--   PT-profiler måste ha ett pris per pass. Befintliga gratiserbjudanden tas bort.
--
-- Körs efter 20261018000000_v5_reschedule_notifications_offers.sql.
-- ============================================================================

-- =============================================================== profiler ===
alter table profiles
  alter column role drop not null,
  add column phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column onboarded_at timestamptz;

-- Befintliga konton har redan valt roll vid registreringen.
update profiles set onboarded_at = created_at where role is not null;

-- Samtycke krävs fortfarande för klientkonton (tom roll = inte klar än).
alter table profiles drop constraint clients_must_consent;
alter table profiles add constraint clients_must_consent
  check (role is distinct from 'client' or health_data_consent_at is not null);
alter table profiles add constraint onboarded_has_role
  check (onboarded_at is null or role is not null);

/** Normaliserar ett svenskt eller internationellt nummer till E.164, annars null. */
create or replace function normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when d ~ '^\+[1-9][0-9]{7,14}$' then d
    when d ~ '^00[1-9][0-9]{7,14}$' then '+' || substr(d, 3)
    when d ~ '^0[1-9][0-9]{6,12}$' then '+46' || substr(d, 2)
  end
  from (select regexp_replace(coalesce(p, ''), '[\s\-().]', '', 'g') as d) x;
$$;

/**
 * Ny användare i auth.users → profil. Fungerar för e-post (metadata från signUp)
 * och Apple/Google (namn från leverantören). Rollen sätts bara om den finns i
 * metadatan (äldre klienter); annars väljs den i välkomststeget.
 */
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_role user_role := nullif(m->>'role', '')::user_role;
  v_consent boolean := coalesce((m->>'health_data_consent')::boolean, false);
begin
  -- Ett klientkonto utan samtycke väntar på välkomststeget i stället för att misslyckas.
  if v_role = 'client' and not v_consent then
    v_role := null;
  end if;
  insert into profiles (id, role, full_name, phone, health_data_consent_at, onboarded_at)
  values (
    new.id,
    v_role,
    left(coalesce(
      nullif(trim(m->>'full_name'), ''),
      nullif(trim(m->>'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Ny användare'
    ), 120),
    normalize_phone(coalesce(nullif(m->>'phone', ''), new.phone)),
    case when v_consent and v_role = 'client' then now() end,
    case when v_role is not null then now() end
  );
  if v_role = 'trainer' then
    insert into trainers (id) values (new.id);
  end if;
  return new;
end;
$$;

-- Rollen kan bara sättas en gång, och bara via complete_onboarding.
create or replace function guard_profile_update()
returns trigger language plpgsql as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Skapandedatum kan inte ändras' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.onboarded_at is distinct from old.onboarded_at)
     and not (old.role is null and coalesce(current_setting('coavira.onboarding', true), '') = 'on') then
    raise exception 'Roll kan inte ändras' using errcode = '42501';
  end if;
  -- Samtycke kan återkallas genom att radera kontot, inte genom att nollställa fältet.
  if old.health_data_consent_at is not null and new.health_data_consent_at is null then
    raise exception 'Samtycke återkallas genom att radera kontot' using errcode = '42501';
  end if;
  return new;
end;
$$;

/**
 * Välkomststeget: välj kontotyp (en gång), namn, telefon och (för klienter)
 * samtycke till behandling av hälsodata.
 */
create or replace function complete_onboarding(p_role user_role, p_full_name text, p_phone text, p_health_data_consent boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := normalize_phone(p_phone);
begin
  if v_uid is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = v_uid and role is not null) then
    raise exception 'Kontotypen är redan vald' using errcode = '42501';
  end if;
  if p_role = 'client' and not coalesce(p_health_data_consent, false) then
    raise exception 'Samtycke till hälsodata krävs för klientkonton' using errcode = '23514';
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 1 and 120 then
    raise exception 'Ange ditt namn' using errcode = '23514';
  end if;
  if v_phone is null then
    raise exception 'Ogiltigt telefonnummer' using errcode = '23514';
  end if;

  perform set_config('coavira.onboarding', 'on', true);
  update profiles
  set role = p_role,
      full_name = trim(p_full_name),
      phone = v_phone,
      health_data_consent_at = case when p_role = 'client' then coalesce(health_data_consent_at, now()) else health_data_consent_at end,
      onboarded_at = now()
  where id = v_uid;
  perform set_config('coavira.onboarding', 'off', true);

  if p_role = 'trainer' then
    insert into trainers (id) values (v_uid) on conflict (id) do nothing;
  end if;
  -- Speglas i JWT:ns user_metadata (används bara för navigering; RLS läser profiles).
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || jsonb_build_object('role', p_role, 'full_name', trim(p_full_name), 'phone', v_phone)
  where id = v_uid;
end;
$$;
revoke all on function complete_onboarding(user_role, text, text, boolean) from public, anon;
grant execute on function complete_onboarding(user_role, text, text, boolean) to authenticated;

-- ============================================================ gratispass ===
-- Bort med erbjudanden som är gratis (100 % rabatt, 0 kr eller "gratis" i texten).
delete from trainer_offers
where discount_percent >= 100
   or price_sek = 0
   or (title || ' ' || description) ~* '\m(gratis|kostnadsfri\w*|free)\M';

alter table trainer_offers drop constraint trainer_offers_price_sek_check;
alter table trainer_offers drop constraint trainer_offers_discount_percent_check;
alter table trainer_offers
  add constraint trainer_offers_price_sek_check check (price_sek between 1 and 100000),
  add constraint trainer_offers_discount_percent_check check (discount_percent between 1 and 99),
  add constraint trainer_offers_not_free check ((title || ' ' || description) !~* '\m(gratis|kostnadsfri\w*|free)\M');

-- En publicerad PT måste ta betalt per pass. NOT VALID: befintliga profiler
-- påverkas inte förrän de ändras nästa gång (då måste priset sättas).
alter table trainers add constraint published_trainers_charge
  check (not is_published or price_per_session > 0) not valid;
