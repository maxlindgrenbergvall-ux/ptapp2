-- ============================================================================
-- Coavira v8: PT-konton loggar bara in med e-post och lösenord.
--
-- * Ett PT-konto kan inte kopplas till Apple eller Google. Supabase Auth lägger
--   till en rad i auth.identities när en social inloggning kopplas till ett
--   befintligt konto (samma e-post); triggern nedan stoppar det för PT:er, så
--   inloggningen misslyckas redan i Supabase. (Appen loggar dessutom ut en
--   PT-session som skapats via OAuth, se proxy.ts.)
-- * PT-konton skapas av admin med bara e-postadressen. PT:n väljer sitt eget
--   lösenord via "Glömt lösenordet?" före första inloggningen.
--
-- Körs efter 20261020000000_v7_admin_created_trainers.sql.
-- ============================================================================

create or replace function is_trainer_account(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role = 'trainer')
      or exists (select 1 from auth.users where id = p_user and raw_app_meta_data->>'role' = 'trainer');
$$;
revoke all on function is_trainer_account(uuid) from public, anon, authenticated;

create or replace function block_trainer_social_identities()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.provider <> 'email' and is_trainer_account(new.user_id) then
    raise exception 'PT-konton kan bara logga in med e-post och lösenord' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trainers_email_only
  before insert or update of provider, user_id on auth.identities
  for each row execute function block_trainer_social_identities();

-- Befintliga PT:er: koppla bort eventuella Apple/Google-identiteter.
delete from auth.identities i
where i.provider <> 'email' and is_trainer_account(i.user_id);

/** Admin: gör ett konto till PT (se v7). Vägrar konton som är kopplade till Apple/Google. */
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
  if exists (select 1 from auth.identities where user_id = v_id and provider <> 'email') then
    raise exception 'Kontot är kopplat till Apple/Google. PT-konton ska bara ha e-post – skapa kontot under Authentication → Add user.' using errcode = '42501';
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
