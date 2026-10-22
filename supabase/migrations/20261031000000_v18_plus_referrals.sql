-- ============================================================================
-- v18: Coavira Plus och inbjudningar (referrals)
--
-- * profiles: referral_code (unik, 8 tecken), coavira_plus_until (Plus till och
--   med), is_coavira_plus (Plus utan slutdatum, t.ex. personal/partners) och
--   referred_by. Användaren kan inte ändra fälten själv, och bara se sina egna
--   (kolumnbehörighet + my_account()). En PT som ser sin klients profil ser
--   alltså inte klientens kod eller Plus-status.
-- * referrals: vem som bjöd in vem. CLIENT_PLUS: den nya klienten och
--   inbjudaren får 1 månad Plus direkt. PT_BOOST: den värvande PT:n får 7 dagars
--   Boost när den nya PT:n verifierats (certifikat satta av Coavira).
-- * Missbruksskydd: koden måste lösas in inom 14 dagar från att kontot skapades,
--   en gång per konto, med bekräftad e-post, och en inbjudare belönas högst
--   12 gånger per år.
-- * Plus-köp: plus_plans (pris sätts av Coavira, inget pris i koden) och
--   plus_purchases via Stripe, som Boost.
--
-- Körs efter 20261030000000_v17_quantity_service_fee.sql.
-- ============================================================================

-- ===================================================================== konstanter
create or replace function referral_plus_days() returns int language sql immutable as $$ select 30 $$;
create or replace function referral_boost_days() returns int language sql immutable as $$ select 7 $$;
create or replace function referral_window_days() returns int language sql immutable as $$ select 14 $$;
create or replace function referral_max_rewards_per_year() returns int language sql immutable as $$ select 12 $$;

-- ============================================================ profiler ===
create or replace function generate_referral_code()
returns text language plpgsql volatile as $$
declare
  -- Utan förväxlingsbara tecken (0/O, 1/I/L).
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '') into v_code
    from generate_series(1, 8);
    exit when not exists (select 1 from profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table profiles
  add column referral_code text,
  add column coavira_plus_until timestamptz,
  add column is_coavira_plus boolean not null default false,
  add column referred_by uuid references profiles on delete set null;
update profiles set referral_code = generate_referral_code() where referral_code is null;
alter table profiles
  alter column referral_code set not null,
  add constraint profiles_referral_code_key unique (referral_code),
  add constraint profiles_referral_code_format check (referral_code ~ '^[A-HJ-NP-Z2-9]{8}$');

create or replace function set_referral_code()
returns trigger language plpgsql as $$
begin
  if new.referral_code is null then
    new.referral_code := generate_referral_code();
  end if;
  return new;
end;
$$;
create trigger profiles_referral_code
  before insert on profiles
  for each row execute function set_referral_code();

/** Kod, Plus och inbjudare ändras bara av systemet (belöningar, köp, admin) – aldrig av användaren. */
create or replace function guard_profile_rewards()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on' and (
    new.referral_code is distinct from old.referral_code
    or new.coavira_plus_until is distinct from old.coavira_plus_until
    or new.is_coavira_plus is distinct from old.is_coavira_plus
    or new.referred_by is distinct from old.referred_by
  ) then
    raise exception 'Coavira Plus och inbjudningskoder kan inte ändras här' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_rewards_guard
  before update on profiles
  for each row execute function guard_profile_rewards();

-- Kolumnbehörighet: andra (t.ex. en PT som ser sin klients profil) får inte läsa
-- kod, Plus eller inbjudare. Ägaren läser dem via my_account().
revoke select, insert, update on profiles from anon, authenticated;
grant select (id, role, full_name, created_at, health_data_consent_at, phone, onboarded_at, interests, focus, avatar_url) on profiles to authenticated;
grant update (full_name, phone, interests, focus, avatar_url) on profiles to authenticated;

/** Har användaren Coavira Plus just nu? (Intern – används av servern och andra funktioner.) */
create or replace function has_plus(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_coavira_plus or coalesce(coavira_plus_until > now(), false) from profiles where id = p_user), false);
$$;
revoke all on function has_plus(uuid) from public, anon, authenticated;

-- ============================================================= referrals ===
create type referral_type as enum ('CLIENT_PLUS', 'PT_BOOST');
create type referral_status as enum ('PENDING', 'COMPLETED');

create table referrals (
  id                uuid primary key default gen_random_uuid(),
  referrer_id       uuid not null references profiles on delete cascade,
  -- En användare kan bara bli inbjuden en gång.
  referred_id       uuid not null unique references profiles on delete cascade,
  type              referral_type not null,
  status            referral_status not null default 'PENDING',
  code              text not null,
  -- false = inbjudaren hade redan fått maxantalet belöningar det senaste året.
  referrer_rewarded boolean not null default false,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on referrals (referrer_id, created_at desc);

alter table referrals enable row level security;
create policy "referrals: own read" on referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid());
revoke insert, update, delete on referrals from anon, authenticated;

/** Inloggad användares egna kod och Plus-status. */
create or replace function my_account()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'referral_code', p.referral_code,
    'coavira_plus_until', p.coavira_plus_until,
    'is_coavira_plus', p.is_coavira_plus,
    'is_plus', p.is_coavira_plus or coalesce(p.coavira_plus_until > now(), false),
    'created_at', p.created_at,
    'referred', exists (select 1 from referrals r where r.referred_id = p.id),
    'can_redeem', not exists (select 1 from referrals r where r.referred_id = p.id)
                  and p.created_at > now() - make_interval(days => referral_window_days())
  )
  from profiles p where p.id = auth.uid();
$$;
revoke all on function my_account() from public, anon;
grant execute on function my_account() to authenticated;

/** Förläng Plus med p_days (räknat från nu eller från nuvarande slutdatum). Intern. */
create or replace function extend_plus(p_user uuid, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_until timestamptz;
begin
  perform set_config('coavira.system', 'on', true);
  update profiles
  set coavira_plus_until = greatest(now(), coalesce(coavira_plus_until, now())) + make_interval(days => p_days)
  where id = p_user
  returning coavira_plus_until into v_until;
  return v_until;
end;
$$;
revoke all on function extend_plus(uuid, int) from public, anon, authenticated;

/** Förläng PT Boost med p_days (räknat från nu eller från nuvarande slutdatum). Intern. */
create or replace function extend_boost(p_trainer uuid, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_until timestamptz;
begin
  perform set_config('coavira.system', 'on', true);
  update trainers
  set boosted_until = greatest(now(), coalesce(boosted_until, now())) + make_interval(days => p_days)
  where id = p_trainer
  returning boosted_until into v_until;
  return v_until;
end;
$$;
revoke all on function extend_boost(uuid, int) from public, anon, authenticated;

-- PT Boost-skyddet (v16) släpper igenom systemets egna förlängningar.
create or replace function guard_trainer_boost()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on' and (
    (tg_op = 'INSERT' and new.boosted_until is not null)
    or (tg_op = 'UPDATE' and new.boosted_until is distinct from old.boosted_until)
  ) then
    raise exception 'Boost köps via Coavira (199 kr för 7 dagar)' using errcode = '42501';
  end if;
  return new;
end;
$$;

/** Får inbjudaren en belöning till? Högst referral_max_rewards_per_year() det senaste året. */
create or replace function referrer_can_be_rewarded(p_referrer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from referrals
          where referrer_id = p_referrer and referrer_rewarded and completed_at > now() - interval '365 days') < referral_max_rewards_per_year();
$$;
revoke all on function referrer_can_be_rewarded(uuid) from public, anon, authenticated;

/** PT-värvning klar (den nya PT:n är verifierad): den värvande PT:n får 7 dagars Boost. Intern. */
create or replace function complete_pt_referral(p_trainer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r referrals;
  v_reward boolean;
begin
  select * into r from referrals where referred_id = p_trainer and type = 'PT_BOOST' and status = 'PENDING' for update;
  if not found then
    return;
  end if;
  v_reward := referrer_can_be_rewarded(r.referrer_id);
  update referrals set status = 'COMPLETED', completed_at = now(), referrer_rewarded = v_reward where id = r.id;
  if v_reward then
    perform extend_boost(r.referrer_id, referral_boost_days());
  end if;
end;
$$;
revoke all on function complete_pt_referral(uuid) from public, anon, authenticated;

/** En PT verifieras (Coavira sätter certifikat) → en väntande PT-värvning blir klar. */
create or replace function trainers_complete_referral()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(array_length(new.certifications, 1), 0) > 0 and coalesce(array_length(old.certifications, 1), 0) = 0 then
    perform complete_pt_referral(new.id);
  end if;
  return new;
end;
$$;
create trigger trainers_referral_on_verify
  after update of certifications on trainers
  for each row execute function trainers_complete_referral();

/**
 * Lös in en inbjudningskod (nytt konto, inom 14 dagar, en gång).
 *  - Klient + klientkod: båda får 1 månad Coavira Plus direkt.
 *  - PT + PT-kod: väntar tills den nya PT:n verifierats; då får den värvande
 *    PT:n 7 dagars Boost.
 */
create or replace function redeem_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_created timestamptz;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_referrer uuid;
  v_referrer_role user_role;
  v_reward boolean;
  v_id uuid;
  v_until timestamptz;
begin
  select role, created_at into v_role, v_created from profiles where id = v_uid;
  if v_uid is null or v_role is null then
    raise exception 'Välj kontotyp innan du använder en inbjudningskod' using errcode = '42501';
  end if;
  select id, role into v_referrer, v_referrer_role from profiles where referral_code = v_code;
  if v_referrer is null then
    raise exception 'Okänd inbjudningskod' using errcode = 'P0002';
  end if;
  if v_referrer = v_uid then
    raise exception 'Du kan inte använda din egen kod' using errcode = '22023';
  end if;
  if exists (select 1 from referrals where referred_id = v_uid) then
    raise exception 'Du har redan använt en inbjudningskod' using errcode = '23505';
  end if;
  if v_created < now() - make_interval(days => referral_window_days()) then
    raise exception 'Inbjudningskoder gäller bara nya konton (inom % dagar)', referral_window_days() using errcode = '22023';
  end if;
  if (select email_confirmed_at from auth.users where id = v_uid) is null then
    raise exception 'Bekräfta din e-post först' using errcode = '42501';
  end if;
  if v_referrer_role <> v_role then
    raise exception '%', case when v_role = 'client' then 'Det här är en PT-kod – be om en kod från en vän som är klient'
                              else 'Det här är en klientkod – PT:er värvas med en PT-kod' end using errcode = '22023';
  end if;

  if v_role = 'client' then
    v_reward := referrer_can_be_rewarded(v_referrer);
    insert into referrals (referrer_id, referred_id, type, status, code, referrer_rewarded, completed_at)
    values (v_referrer, v_uid, 'CLIENT_PLUS', 'COMPLETED', v_code, v_reward, now())
    returning id into v_id;
    v_until := extend_plus(v_uid, referral_plus_days());
    if v_reward then
      perform extend_plus(v_referrer, referral_plus_days());
    end if;
  else
    insert into referrals (referrer_id, referred_id, type, status, code)
    values (v_referrer, v_uid, 'PT_BOOST', 'PENDING', v_code)
    returning id into v_id;
    -- Redan verifierad PT: klart direkt.
    if coalesce(array_length((select certifications from trainers where id = v_uid), 1), 0) > 0 then
      perform complete_pt_referral(v_uid);
    end if;
  end if;

  perform set_config('coavira.system', 'on', true);
  update profiles set referred_by = v_referrer where id = v_uid;

  return (select jsonb_build_object('id', id, 'type', type, 'status', status, 'coavira_plus_until', v_until)
          from referrals where id = v_id);
end;
$$;
revoke all on function redeem_referral(text) from public, anon;
grant execute on function redeem_referral(text) to authenticated;

/** Admin: PT:n angav en värvningskod i sin ansökan (t.ex. i mejlet till certifiering@). */
create or replace function admin_link_trainer_referral(p_email text, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_trainer uuid;
  v_referrer uuid;
begin
  select u.id into v_trainer from auth.users u join trainers t on t.id = u.id where lower(u.email) = lower(trim(p_email));
  if v_trainer is null then
    raise exception 'Hittar ingen PT med e-post %', p_email using errcode = 'P0002';
  end if;
  select p.id into v_referrer from profiles p join trainers t on t.id = p.id
  where p.referral_code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_referrer is null or v_referrer = v_trainer then
    raise exception 'Okänd PT-kod %', p_code using errcode = 'P0002';
  end if;
  insert into referrals (referrer_id, referred_id, type, status, code)
  values (v_referrer, v_trainer, 'PT_BOOST', 'PENDING', upper(p_code))
  on conflict (referred_id) do nothing;
  if coalesce(array_length((select certifications from trainers where id = v_trainer), 1), 0) > 0 then
    perform complete_pt_referral(v_trainer);
  end if;
end;
$$;
revoke all on function admin_link_trainer_referral(text, text) from public, anon, authenticated;

-- =============================================================== Plus-köp ===
-- Pris och längd bestäms av Coavira (ingen plan = Plus kan inte köpas än):
--   insert into plus_plans (days, price_sek) values (30, <pris>);
create table plus_plans (
  id         uuid primary key default gen_random_uuid(),
  days       int not null check (days between 1 and 366),
  price_sek  int not null check (price_sek >= 3),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table plus_plans enable row level security;
create policy "plus plans: read active" on plus_plans for select to authenticated using (active);
revoke insert, update, delete on plus_plans from anon, authenticated;

create table plus_purchases (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references profiles on delete cascade,
  plan_id               uuid references plus_plans on delete set null,
  days                  int not null,
  price_sek             int not null,
  status                boost_status not null default 'pending',
  stripe_session_id     text,
  stripe_payment_intent text,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);
create index plus_purchases_user_idx on plus_purchases (user_id, created_at desc);
create index plus_purchases_intent_idx on plus_purchases (stripe_payment_intent) where stripe_payment_intent is not null;
alter table plus_purchases enable row level security;
create policy "plus purchases: own read" on plus_purchases for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on plus_purchases from anon, authenticated;

/** Klient: starta ett Plus-köp (aktiv plan; priset bestäms här). */
create or replace function create_plus_checkout()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p plus_plans;
  v_id uuid;
begin
  if v_uid is null or (select role from profiles where id = v_uid) is distinct from 'client' then
    raise exception 'Coavira Plus finns för klienter' using errcode = '42501';
  end if;
  select * into p from plus_plans where active order by days, price_sek limit 1;
  if not found then
    raise exception 'Coavira Plus går inte att köpa än – bjud in en vän och få en månad gratis' using errcode = 'P0002';
  end if;
  update plus_purchases set status = 'cancelled' where user_id = v_uid and status = 'pending';
  insert into plus_purchases (user_id, plan_id, days, price_sek) values (v_uid, p.id, p.days, p.price_sek) returning id into v_id;
  return jsonb_build_object('purchase_id', v_id, 'user_id', v_uid, 'days', p.days, 'price_sek', p.price_sek);
end;
$$;
revoke all on function create_plus_checkout() from public, anon;
grant execute on function create_plus_checkout() to authenticated;

create or replace function attach_plus_session(p_purchase uuid, p_session text)
returns void language sql security definer set search_path = public as $$
  update plus_purchases set stripe_session_id = left(p_session, 200)
  where id = p_purchase and user_id = auth.uid() and status = 'pending';
$$;
revoke all on function attach_plus_session(uuid, text) from public, anon;
grant execute on function attach_plus_session(uuid, text) to authenticated;

/** Server (Stripe-webhooken): Plus-köpet är betalt. Idempotent. Returnerar nya coavira_plus_until. */
create or replace function mark_plus_paid(p_purchase uuid, p_session text, p_payment_intent text, p_amount_sek int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  b plus_purchases;
  v_until timestamptz;
begin
  select * into b from plus_purchases where id = p_purchase for update;
  if not found then
    raise exception 'Okänt Plus-köp' using errcode = 'P0002';
  end if;
  if b.status = 'paid' then
    return (select coavira_plus_until from profiles where id = b.user_id);
  end if;
  if b.status = 'refunded' then
    raise exception 'Plus-köpet är återbetalt' using errcode = '22023';
  end if;
  if p_amount_sek is not null and p_amount_sek <> b.price_sek then
    raise exception 'Beloppet stämmer inte (% kr betalt, % kr för Plus)', p_amount_sek, b.price_sek using errcode = '22023';
  end if;
  update plus_purchases
  set status = 'paid', paid_at = now(),
      stripe_session_id = coalesce(p_session, stripe_session_id),
      stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent)
  where id = b.id;
  v_until := extend_plus(b.user_id, b.days);
  return v_until;
end;
$$;
revoke all on function mark_plus_paid(uuid, text, text, int) from public, anon, authenticated;
grant execute on function mark_plus_paid(uuid, text, text, int) to service_role;

/** Server: återbetalt Plus-köp kortar Plus med köpets längd. */
create or replace function mark_plus_refunded(p_payment_intent text)
returns int language plpgsql security definer set search_path = public as $$
declare
  b plus_purchases;
  v_n int := 0;
begin
  for b in select * from plus_purchases where stripe_payment_intent = p_payment_intent and status = 'paid' for update loop
    update plus_purchases set status = 'refunded' where id = b.id;
    perform set_config('coavira.system', 'on', true);
    update profiles
    set coavira_plus_until = case
      when coavira_plus_until - make_interval(days => b.days) > now() then coavira_plus_until - make_interval(days => b.days)
      else null end
    where id = b.user_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function mark_plus_refunded(text) from public, anon, authenticated;
grant execute on function mark_plus_refunded(text) to service_role;
