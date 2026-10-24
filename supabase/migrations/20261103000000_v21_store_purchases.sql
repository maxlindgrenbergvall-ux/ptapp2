-- ============================================================================
-- v21: köp i appen via App Store (och senare Google Play) med RevenueCat.
--
-- * Coavira Plus i iPhone-appen är en prenumeration hos Apple (49 kr/mån,
--   499 kr/år) som förnyas automatiskt. Apple/RevenueCat äger slutdatumet,
--   så det sparas för sig (profiles.store_plus_until) och skriver aldrig över
--   Plus från inbjudningar eller webbköp. Effektiv Plus = något av dem gäller.
-- * PT Boost i appen är ett engångsköp (7 dagar, 199 kr). Varje köp
--   registreras en gång (store_transactions) och förlänger boosted_until som
--   Stripe-köpet gör. Återbetalning drar av dagarna igen.
-- * Bara servern (service role, RevenueCats webhook och synk) skriver.
-- * Webben: Coavira Plus 49 kr för 30 dagar med Stripe (plus_plans).
--
-- Körs efter 20261102000000_v20_launch_account_deletion.sql.
-- ============================================================================

alter table profiles
  add column store_plus_until   timestamptz,
  add column store_plus_renews  boolean not null default false,
  add column store_plus_product text;

/** Som v20 – och butiksprenumerationen kan bara ändras av systemet. */
create or replace function guard_profile_rewards()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on' and (
    new.referral_code is distinct from old.referral_code
    or new.coavira_plus_until is distinct from old.coavira_plus_until
    or new.is_coavira_plus is distinct from old.is_coavira_plus
    or new.store_plus_until is distinct from old.store_plus_until
    or new.store_plus_renews is distinct from old.store_plus_renews
    or new.store_plus_product is distinct from old.store_plus_product
    or (new.referred_by is distinct from old.referred_by
        and not (new.referred_by is null and not exists (select 1 from profiles where id = old.referred_by)))
  ) then
    raise exception 'Coavira Plus och inbjudningskoder kan inte ändras här' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function has_plus(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select is_coavira_plus or coalesce(coavira_plus_until > now(), false) or coalesce(store_plus_until > now(), false)
    from profiles where id = p_user
  ), false);
$$;
revoke all on function has_plus(uuid) from public, anon, authenticated;

/**
 * Som v18, plus butiksprenumerationen. coavira_plus_until är det senaste
 * slutdatumet oavsett källa (det appen visar).
 */
create or replace function my_account()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'referral_code', p.referral_code,
    'coavira_plus_until', nullif(greatest(coalesce(p.coavira_plus_until, '-infinity'), coalesce(p.store_plus_until, '-infinity')), '-infinity'),
    'is_coavira_plus', p.is_coavira_plus,
    'is_plus', p.is_coavira_plus or coalesce(p.coavira_plus_until > now(), false) or coalesce(p.store_plus_until > now(), false),
    'store_plus_until', p.store_plus_until,
    'store_plus_renews', p.store_plus_renews and coalesce(p.store_plus_until > now(), false),
    'store_plus_product', p.store_plus_product,
    'created_at', p.created_at,
    'referred', exists (select 1 from referrals r where r.referred_id = p.id),
    'can_redeem', not exists (select 1 from referrals r where r.referred_id = p.id)
                  and p.created_at > now() - make_interval(days => referral_window_days())
  )
  from profiles p where p.id = auth.uid();
$$;
revoke all on function my_account() from public, anon;
grant execute on function my_account() to authenticated;

-- ============================================== Plus-prenumeration (butik) ===
/**
 * Server: sätt butiksprenumerationens slutdatum som RevenueCat rapporterar
 * (null = ingen aktiv prenumeration, t.ex. efter återbetalning). Idempotent.
 */
create or replace function apply_store_plus(p_user uuid, p_until timestamptz, p_renews boolean, p_product text)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_user) then
    raise exception 'Okänd användare' using errcode = 'P0002';
  end if;
  perform set_config('coavira.system', 'on', true);
  update profiles
  set store_plus_until = p_until,
      store_plus_renews = coalesce(p_renews, false) and p_until is not null,
      store_plus_product = case when p_until is null then null else left(p_product, 100) end
  where id = p_user;
  perform set_config('coavira.system', 'off', true);
  return p_until;
end;
$$;
revoke all on function apply_store_plus(uuid, timestamptz, boolean, text) from public, anon, authenticated;
grant execute on function apply_store_plus(uuid, timestamptz, boolean, text) to service_role;

-- ================================================== PT Boost (butik) ===
create table store_transactions (
  -- Butikens transaktions-id (Apple/Google via RevenueCat).
  id          text primary key check (char_length(id) between 1 and 200),
  user_id     uuid not null references profiles on delete cascade,
  product_id  text not null,
  days        int not null check (days between 1 and 366),
  store       text not null default 'app_store',
  created_at  timestamptz not null default now(),
  refunded_at timestamptz
);
create index store_transactions_user_idx on store_transactions (user_id, created_at desc);
alter table store_transactions enable row level security;
-- Ingen användare läser eller skriver – bara servern (service role).
revoke all on store_transactions from anon, authenticated;

/** Server: PT Boost köpt i appen. Samma transaktion räknas bara en gång. */
create or replace function apply_store_boost(p_user uuid, p_transaction text, p_product text, p_days int, p_store text default 'app_store')
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  if (select role from profiles where id = p_user) is distinct from 'trainer' then
    raise exception 'PT Boost gäller PT-konton' using errcode = '42501';
  end if;
  insert into store_transactions (id, user_id, product_id, days, store)
  values (p_transaction, p_user, p_product, p_days, p_store)
  on conflict (id) do nothing;
  if not found then
    return (select boosted_until from trainers where id = p_user);
  end if;
  return extend_boost(p_user, p_days);
end;
$$;
revoke all on function apply_store_boost(uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function apply_store_boost(uuid, text, text, int, text) to service_role;

/** Server: återbetalt boostköp – dagarna dras av (aldrig bakåt i tiden). Idempotent. */
create or replace function revoke_store_boost(p_transaction text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  t store_transactions;
  v_until timestamptz;
begin
  update store_transactions set refunded_at = now() where id = p_transaction and refunded_at is null returning * into t;
  if not found then
    return null;
  end if;
  perform set_config('coavira.system', 'on', true);
  update trainers
  set boosted_until = case
        when boosted_until - make_interval(days => t.days) > now() then boosted_until - make_interval(days => t.days)
        else null
      end
  where id = t.user_id
  returning boosted_until into v_until;
  perform set_config('coavira.system', 'off', true);
  return v_until;
end;
$$;
revoke all on function revoke_store_boost(text) from public, anon, authenticated;
grant execute on function revoke_store_boost(text) to service_role;

-- ========================================================= webbpris ===
-- Coavira Plus på webben (Stripe): 49 kr för 30 dagar, samma som i appen.
update plus_plans set active = false where active and not (days = 30 and price_sek = 49);
insert into plus_plans (days, price_sek)
select 30, 49 where not exists (select 1 from plus_plans where active and days = 30 and price_sek = 49);
