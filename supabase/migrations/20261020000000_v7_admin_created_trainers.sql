-- ============================================================================
-- Coavira v7: PT-konton skapas bara av administratörer.
--
-- * Ingen kan längre bli PT genom att registrera sig själv: varken via
--   signUp-metadata (user_metadata går att skicka från webbläsaren) eller via
--   välkomststeget. complete_onboarding skapar bara klientkonton.
-- * Ett PT-konto skapas av en admin på något av två sätt:
--   1. Admin-API:t med service role-nyckeln (scripts/create-trainer.mjs), som
--      sätter app_metadata.role = 'trainer'. app_metadata kan bara sättas med
--      service role – aldrig av användaren själv.
--   2. Supabase Dashboard → Authentication → Add user (e-post + lösenord,
--      "Auto Confirm"), följt av  select admin_make_trainer('pt@exempel.se');
--      i SQL Editor.
-- * Rollen speglas i app_metadata, som appen och proxy.ts litar på för
--   navigeringen. Åtkomstkontrollen sker som tidigare med RLS (profiles.role).
--
-- Körs efter 20261019000000_v6_auth_onboarding_no_free.sql.
-- ============================================================================

/**
 * Ny användare → profil. PT-rollen godtas BARA från app_metadata (satt av en
 * admin via service role). En "trainer"-roll i user_metadata ignoreras.
 */
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  a jsonb := coalesce(new.raw_app_meta_data, '{}');
  v_consent boolean := coalesce((m->>'health_data_consent')::boolean, false);
  v_role user_role := case
    when a->>'role' = 'trainer' then 'trainer'::user_role
    -- Äldre klientregistrering med samtycke i metadatan.
    when m->>'role' = 'client' and v_consent then 'client'::user_role
  end;
begin
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
    case when v_role = 'client' then now() end,
    case when v_role is not null then now() end
  );
  if v_role = 'trainer' then
    insert into trainers (id) values (new.id);
  end if;
  -- Spegla klientrollen i app_metadata (PT-rollen finns redan där).
  if v_role = 'client' and a->>'role' is distinct from 'client' then
    update auth.users set raw_app_meta_data = a || '{"role":"client"}' where id = new.id;
  end if;
  return new;
end;
$$;

/** Välkomststeget: bara klientkonton. PT-konton skapas av administratörer. */
create or replace function complete_onboarding(p_role user_role, p_full_name text, p_phone text, p_health_data_consent boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := normalize_phone(p_phone);
begin
  if v_uid is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  if p_role is distinct from 'client' then
    raise exception 'PT-konton skapas av Coavira och kan inte registreras i appen' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = v_uid and role is not null) then
    raise exception 'Kontotypen är redan vald' using errcode = '42501';
  end if;
  if not coalesce(p_health_data_consent, false) then
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
  set role = 'client',
      full_name = trim(p_full_name),
      phone = v_phone,
      health_data_consent_at = coalesce(health_data_consent_at, now()),
      onboarded_at = now()
  where id = v_uid;
  perform set_config('coavira.onboarding', 'off', true);

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"role":"client"}',
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || jsonb_build_object('role', 'client', 'full_name', trim(p_full_name), 'phone', v_phone)
  where id = v_uid;
end;
$$;

/**
 * Admin: gör ett (nyss skapat) konto till PT. Körs i SQL Editor efter att
 * kontot skapats under Authentication → Add user. Bara för service role/postgres.
 * Ett konto som redan är klient kan inte göras om till PT (klientens hälsodata
 * ska inte hamna i ett PT-konto) – skapa ett nytt konto med en annan e-post.
 */
create or replace function admin_make_trainer(p_email text, p_full_name text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_role user_role;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'Hittar inget konto med e-post %', p_email using errcode = 'P0002';
  end if;
  select role into v_role from profiles where id = v_id;
  if v_role = 'client' then
    raise exception 'Kontot är redan ett klientkonto' using errcode = '42501';
  end if;

  perform set_config('coavira.onboarding', 'on', true);
  update profiles
  set role = 'trainer',
      full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      phone = coalesce(normalize_phone(p_phone), phone),
      onboarded_at = coalesce(onboarded_at, now())
  where id = v_id;
  perform set_config('coavira.onboarding', 'off', true);

  insert into trainers (id) values (v_id) on conflict (id) do nothing;
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"role":"trainer"}',
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || '{"role":"trainer"}'
  where id = v_id;
  return v_id;
end;
$$;
revoke all on function admin_make_trainer(text, text, text) from public, anon, authenticated;

-- Befintliga konton: spegla rollen i app_metadata (som appen nu litar på).
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}') || jsonb_build_object('role', p.role)
from profiles p
where p.id = u.id and p.role is not null;
