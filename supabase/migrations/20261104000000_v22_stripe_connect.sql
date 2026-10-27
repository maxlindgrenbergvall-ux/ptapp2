-- ============================================================================
-- v22: Stripe Connect – utbetalningar till PT:er och obligatorisk PT-onboarding.
--
-- * En PT måste ha en färdig profil (namn, presentation, inriktning, bild) och
--   ett godkänt Stripe Express-konto innan PT-portalen öppnas. Spärren läses ur
--   JWT:n (app_metadata.pt_ready), som databasen håller i synk – proxy.ts
--   behöver alltså inget extra databasanrop per sida.
-- * trainers.stripe_onboarding_complete (publik) – Stripe har godkänt kontot
--   (details_submitted och charges_enabled). Sätts bara av servern.
-- * trainer_payout_accounts (privat) – Stripe-kontots id och aktuella status.
--   Ingen användare läser eller skriver; servern (service role) och PT:ns egen
--   statusfunktion (my_payout_status) gör det.
-- * Synlighet: en profil kan bara publiceras med godkända utbetalningar, och
--   tjänster går bara att köpa när PT:ns konto tar emot betalningar.
--   Profiler som var publicerade före v22 döljs tills PT:n kopplat Stripe och
--   visas sedan automatiskt igen (publish_when_ready).
-- * Admin: admin_mark_pt_onboarded() för demokonton (t.ex. Apples granskning)
--   som inte kan koppla ett riktigt bankkonto – betalningar till dem går till
--   Coavira utan delning.
--
-- Körs efter 20261103000000_v21_store_purchases.sql.
-- ============================================================================

alter table trainers
  add column stripe_onboarding_complete boolean not null default false,
  add column publish_when_ready boolean not null default false;

create table trainer_payout_accounts (
  trainer_id        uuid primary key references trainers on delete cascade,
  -- Stripe Connect-konto (Express). null bara för undantagna demokonton.
  stripe_account_id text unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  details_submitted boolean not null default false,
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  -- Uppgifter som Stripe fortfarande kräver (requirements.currently_due).
  requirements_due  text[] not null default '{}' check (cardinality(requirements_due) <= 100),
  -- Demokonto utan Stripe (admin). Betalningar går då till Coavira utan delning.
  exempt            boolean not null default false,
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (stripe_account_id is not null or exempt)
);
alter table trainer_payout_accounts enable row level security;
-- Inga policies: bara servern (service role) och security definer-funktionerna nedan.
revoke all on trainer_payout_accounts from anon, authenticated;

-- ===================================================== skydd av fälten ===
/** Utbetalningsstatus ändras bara av systemet (Stripe via servern, admin). */
create or replace function guard_trainer_payouts()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on' and (
    (tg_op = 'INSERT' and (new.stripe_onboarding_complete or new.publish_when_ready))
    or (tg_op = 'UPDATE' and (
      new.stripe_onboarding_complete is distinct from old.stripe_onboarding_complete
      or new.publish_when_ready is distinct from old.publish_when_ready))
  ) then
    raise exception 'Utbetalningar kopplas via Stripe' using errcode = '42501';
  end if;
  -- Synlig i Hitta PT bara med godkända utbetalningar.
  if new.is_published and not new.stripe_onboarding_complete then
    raise exception 'Koppla utbetalningar via Stripe innan du publicerar profilen' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trainers_payouts_guard
  before insert or update on trainers
  for each row execute function guard_trainer_payouts();

-- ============================================== färdig profil och spärr ===
/** Profilen är färdig: namn, presentation (minst 40 tecken), minst en inriktning och profilbild. */
create or replace function trainer_profile_complete(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select char_length(trim(p.full_name)) >= 2
       and char_length(trim(t.bio)) >= 40
       and cardinality(t.specialties) >= 1
       and coalesce(t.avatar_url, '') <> ''
    from trainers t join profiles p on p.id = t.id
    where t.id = p_trainer
  ), false);
$$;
revoke all on function trainer_profile_complete(uuid) from public, anon, authenticated;

/** Kan PT:n ta emot betalningar just nu? (Stripe-kontot tar emot kort, eller undantaget demokonto.) */
create or replace function trainer_payouts_ready(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select a.exempt or (a.stripe_account_id is not null and a.charges_enabled)
    from trainer_payout_accounts a where a.trainer_id = p_trainer
  ), false);
$$;
revoke all on function trainer_payouts_ready(uuid) from public, anon, authenticated;

/**
 * Speglar spärren i JWT:n: app_metadata.pt_ready = profilen färdig och
 * utbetalningar godkända. Ny token (inloggning/förnyelse) läser det nya värdet.
 */
create or replace function sync_pt_ready(p_trainer uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ready boolean;
begin
  select trainer_profile_complete(t.id) and t.stripe_onboarding_complete into v_ready
  from trainers t where t.id = p_trainer;
  v_ready := coalesce(v_ready, false);
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || jsonb_build_object('pt_ready', v_ready)
  where id = p_trainer and (raw_app_meta_data -> 'pt_ready') is distinct from to_jsonb(v_ready);
  return v_ready;
end;
$$;
revoke all on function sync_pt_ready(uuid) from public, anon, authenticated;

create or replace function trainers_sync_pt_ready()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_pt_ready(new.id);
  return null;
end;
$$;
create trigger trainers_pt_ready
  after insert or update of bio, specialties, avatar_url, stripe_onboarding_complete on trainers
  for each row execute function trainers_sync_pt_ready();

create or replace function profiles_sync_pt_ready()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'trainer' and new.full_name is distinct from old.full_name then
    perform sync_pt_ready(new.id);
  end if;
  return null;
end;
$$;
create trigger profiles_pt_ready
  after update of full_name on profiles
  for each row execute function profiles_sync_pt_ready();

/** PT:n: status för onboardingen (visas i /pt/onboarding). */
create or replace function my_payout_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile_complete', trainer_profile_complete(t.id),
    'stripe_onboarding_complete', t.stripe_onboarding_complete,
    'connected', a.stripe_account_id is not null,
    'details_submitted', coalesce(a.details_submitted, false),
    'charges_enabled', coalesce(a.charges_enabled, false),
    'payouts_enabled', coalesce(a.payouts_enabled, false),
    'requirements_due', coalesce(cardinality(a.requirements_due), 0),
    'exempt', coalesce(a.exempt, false),
    'pt_ready', trainer_profile_complete(t.id) and t.stripe_onboarding_complete
  )
  from trainers t left join trainer_payout_accounts a on a.trainer_id = t.id
  where t.id = auth.uid();
$$;
revoke all on function my_payout_status() from public, anon;
grant execute on function my_payout_status() to authenticated;

-- ======================================================= server (Stripe) ===
/** Server: koppla ett nyskapat Stripe-konto till PT:n. Idempotent; ett befintligt konto behålls. */
create or replace function attach_stripe_account(p_trainer uuid, p_account text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_existing text;
begin
  if (select role from profiles where id = p_trainer) is distinct from 'trainer' then
    raise exception 'Bara PT-konton tar emot utbetalningar' using errcode = '42501';
  end if;
  select stripe_account_id into v_existing from trainer_payout_accounts where trainer_id = p_trainer;
  if v_existing is not null then
    return v_existing;
  end if;
  insert into trainer_payout_accounts (trainer_id, stripe_account_id, exempt)
  values (p_trainer, p_account, false)
  on conflict (trainer_id) do update set stripe_account_id = excluded.stripe_account_id, exempt = false, updated_at = now();
  return p_account;
end;
$$;
revoke all on function attach_stripe_account(uuid, text) from public, anon, authenticated;
grant execute on function attach_stripe_account(uuid, text) to service_role;

/**
 * Server: Stripe-kontots status (från accounts.retrieve eller account.updated).
 *  - details_submitted + charges_enabled första gången → onboardingen är klar
 *    (stripe_onboarding_complete går aldrig tillbaka till false – portalen låses
 *    inte igen om Stripe senare begär mer uppgifter).
 *  - Profilen syns i Hitta PT bara medan kontot tar emot betalningar: den döljs
 *    om Stripe stänger av kort och visas igen när det rättats.
 * Returnerar { trainer_id, complete, pt_ready } eller null för okänt konto.
 */
create or replace function apply_stripe_account(
  p_account text, p_details boolean, p_charges boolean, p_payouts boolean, p_due text[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a trainer_payout_accounts;
  t trainers;
  v_complete boolean;
begin
  update trainer_payout_accounts
  set details_submitted = coalesce(p_details, false),
      charges_enabled = coalesce(p_charges, false),
      payouts_enabled = coalesce(p_payouts, false),
      requirements_due = coalesce(p_due[1:100], '{}'),
      onboarded_at = case when onboarded_at is null and p_details and p_charges then now() else onboarded_at end,
      updated_at = now()
  where stripe_account_id = p_account
  returning * into a;
  if not found then
    return null;
  end if;

  select * into t from trainers where id = a.trainer_id;
  v_complete := t.stripe_onboarding_complete or (a.details_submitted and a.charges_enabled);

  perform set_config('coavira.system', 'on', true);
  if a.charges_enabled then
    update trainers
    set stripe_onboarding_complete = v_complete,
        -- Var profilen publicerad tidigare (före v22 eller innan Stripe stängde av kort)? Visa den igen.
        is_published = case when publish_when_ready and v_complete and price_per_session > 0 then true else is_published end,
        publish_when_ready = case when publish_when_ready and v_complete and price_per_session > 0 then false else publish_when_ready end
    where id = t.id;
  else
    update trainers
    set stripe_onboarding_complete = v_complete,
        publish_when_ready = publish_when_ready or is_published,
        is_published = false
    where id = t.id;
  end if;
  perform set_config('coavira.system', 'off', true);

  return jsonb_build_object('trainer_id', t.id, 'complete', v_complete, 'pt_ready', sync_pt_ready(t.id));
end;
$$;
revoke all on function apply_stripe_account(text, boolean, boolean, boolean, text[]) from public, anon, authenticated;
grant execute on function apply_stripe_account(text, boolean, boolean, boolean, text[]) to service_role;

-- ================================================================ admin ===
/**
 * Admin: demokonto (t.ex. för Apples granskning) som inte kan koppla ett
 * riktigt bankkonto. Onboardingen räknas som klar; betalningar till PT:n går
 * till Coavira utan delning.  select admin_mark_pt_onboarded('review-pt@coavira.fit');
 */
create or replace function admin_mark_pt_onboarded(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select p.id into v_id
  from auth.users u join profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email)) and p.role = 'trainer';
  if v_id is null then
    raise exception 'Hittar inget PT-konto med e-post %', p_email using errcode = 'P0002';
  end if;
  insert into trainer_payout_accounts (trainer_id, exempt, onboarded_at)
  values (v_id, true, now())
  on conflict (trainer_id) do update set exempt = true, updated_at = now();
  perform set_config('coavira.system', 'on', true);
  update trainers set stripe_onboarding_complete = true where id = v_id;
  perform set_config('coavira.system', 'off', true);
  return sync_pt_ready(v_id);
end;
$$;
revoke all on function admin_mark_pt_onboarded(text) from public, anon, authenticated;

-- ======================================================== köp av tjänster ===
/** Som v19 – och PT:n måste kunna ta emot betalningar (Stripe Connect). */
create or replace function create_checkout(p_service_ids uuid[], p_quantities int[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_checkout uuid := gen_random_uuid();
  v_trainer uuid;
  v_count int;
  v_trainers int;
  v_subtotal int;
  v_pct numeric;
  v_fee int;
begin
  if v_uid is null or (select role from profiles where id = v_uid) is distinct from 'client' then
    raise exception 'Bara klienter kan köpa tjänster' using errcode = '42501';
  end if;
  if coalesce(array_length(p_service_ids, 1), 0) not between 1 and 5 then
    raise exception 'Välj 1–5 tjänster' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_service_ids) x) <> array_length(p_service_ids, 1) then
    raise exception 'Samma tjänst finns flera gånger – ändra antalet i stället' using errcode = '22023';
  end if;
  if p_quantities is not null and coalesce(array_length(p_quantities, 1), 0) <> array_length(p_service_ids, 1) then
    raise exception 'Antal saknas för någon tjänst' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_quantities) q where q is null or q not between 1 and 20) then
    raise exception 'Antal ska vara 1–20' using errcode = '22023';
  end if;

  select count(distinct s.id), min(s.trainer_id::text)::uuid, count(distinct s.trainer_id)
    into v_count, v_trainer, v_trainers
  from trainer_services s
  where s.id = any (p_service_ids) and s.active and can_view_trainer(s.trainer_id);
  if v_count <> array_length(p_service_ids, 1) then
    raise exception 'En tjänst finns inte längre' using errcode = 'P0002';
  end if;
  if v_trainers <> 1 then
    raise exception 'Alla tjänster måste vara hos samma PT' using errcode = '22023';
  end if;
  if not trainer_payouts_ready(v_trainer) then
    raise exception 'PT:n kan inte ta emot betalningar just nu – försök igen senare' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(p_service_ids, coalesce(p_quantities, array_fill(1, array[array_length(p_service_ids, 1)]))) as x(id, qty)
    join trainer_services s on s.id = x.id
    where x.qty > 1 and s.kind <> 'single'
  ) then
    raise exception 'Antal kan bara väljas för enstaka pass' using errcode = '22023';
  end if;

  update purchases set status = 'cancelled' where client_id = v_uid and status = 'pending';

  insert into purchases (checkout_id, client_id, trainer_id, service_id, kind, title, sessions, includes_nutrition, price_sek, quantity)
  select v_checkout, v_uid, s.trainer_id, s.id, s.kind::text, s.title, s.sessions * x.qty, s.includes_nutrition, s.price_sek * x.qty, x.qty
  from unnest(p_service_ids, coalesce(p_quantities, array_fill(1, array[array_length(p_service_ids, 1)]))) as x(id, qty)
  join trainer_services s on s.id = x.id;

  select sum(price_sek) into v_subtotal from purchases where checkout_id = v_checkout;
  v_pct := service_fee_percent_for(v_uid, v_trainer);
  v_fee := service_fee_sek(v_subtotal, v_pct);
  insert into checkout_fees (checkout_id, client_id, subtotal_sek, fee_percent, fee_sek)
  values (v_checkout, v_uid, v_subtotal, v_pct, v_fee);

  return jsonb_build_object(
    'checkout_id', v_checkout,
    'trainer_id', v_trainer,
    'acquisition_type', case when v_pct = existing_client_fee_percent() then 'EXISTING_CLIENT' else 'PLATFORM_CLIENT' end,
    'subtotal_sek', v_subtotal,
    'fee_percent', v_pct,
    'service_fee_sek', v_fee,
    'total_sek', v_subtotal + v_fee,
    'lines', (select jsonb_agg(jsonb_build_object(
                'purchase_id', id, 'title', title, 'kind', kind, 'quantity', quantity,
                'unit_price_sek', price_sek / quantity, 'price_sek', price_sek) order by price_sek desc)
              from purchases where checkout_id = v_checkout)
  );
end;
$$;
revoke all on function create_checkout(uuid[], int[]) from public, anon;
grant execute on function create_checkout(uuid[], int[]) to authenticated;

-- ============================================================ befintliga ===
-- Publicerade profiler döljs tills PT:n kopplat Stripe – och visas sedan igen
-- automatiskt (apply_stripe_account). Alla PT:er går igenom onboardingen.
select set_config('coavira.system', 'on', true);
update trainers set publish_when_ready = true, is_published = false
where is_published and not stripe_onboarding_complete;
select set_config('coavira.system', 'off', true);
select sync_pt_ready(id) from trainers;
