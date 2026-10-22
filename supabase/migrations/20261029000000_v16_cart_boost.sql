-- ============================================================================
-- v16: Varukorg och PT Boost
--
-- * cart_items: klientens varukorg (tjänster från en eller flera PT:er).
--   Sparas i databasen så att övergivna varukorgar kan påminnas om senare
--   (abandoned_carts / mark_cart_reminded, bara servern). Rensas automatiskt
--   när en tjänst i varukorgen betalas.
-- * PT Boost: 199 kr för 7 dagars synlighet. trainer_boosts är köphistoriken,
--   trainers.boosted_until är när synligheten tar slut. Bara Stripe-webhooken
--   (service role) kan markera en boost som betald och flytta fram datumet –
--   PT:n kan aldrig sätta boosted_until själv.
--
-- Körs efter 20261028000000_v15_push_tokens.sql.
-- ============================================================================

-- ============================================================= varukorg ===
create table cart_items (
  client_id   uuid not null references profiles on delete cascade,
  service_id  uuid not null references trainer_services on delete cascade,
  -- Sätts från tjänsten (trigger), så att varukorgen kan grupperas per PT.
  trainer_id  uuid not null references trainers on delete cascade,
  added_at    timestamptz not null default now(),
  -- När en påminnelse om varukorgen skickades (null = aldrig).
  reminded_at timestamptz,
  primary key (client_id, service_id)
);
create index cart_items_added_idx on cart_items (added_at) where reminded_at is null;

alter table cart_items enable row level security;
create policy "cart: client own read" on cart_items for select to authenticated using (client_id = auth.uid());
create policy "cart: client own insert" on cart_items for insert to authenticated with check (client_id = auth.uid());
create policy "cart: client own delete" on cart_items for delete to authenticated using (client_id = auth.uid());
-- Ingen update för klienter: reminded_at sätts bara av servern.
revoke update on cart_items from authenticated, anon;

/** Ny rad: bara klienter, bara aktiva tjänster hos PT:er klienten får se, högst 20 rader. */
create or replace function prepare_cart_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_trainer uuid;
begin
  if auth.uid() is not null and (select role from profiles where id = auth.uid()) is distinct from 'client' then
    raise exception 'Bara klienter har en varukorg' using errcode = '42501';
  end if;
  select s.trainer_id into v_trainer from trainer_services s
  where s.id = new.service_id and s.active and (auth.uid() is null or can_view_trainer(s.trainer_id));
  if v_trainer is null then
    raise exception 'Tjänsten finns inte längre' using errcode = 'P0002';
  end if;
  if (select count(*) from cart_items where client_id = new.client_id) >= 20 then
    raise exception 'Varukorgen är full (högst 20 tjänster)' using errcode = '22023';
  end if;
  new.trainer_id := v_trainer;
  new.reminded_at := null;
  return new;
end;
$$;
create trigger cart_items_prepare
  before insert on cart_items
  for each row execute function prepare_cart_item();

/** Betald tjänst → bort ur varukorgen. */
create or replace function clear_cart_on_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and new.service_id is not null then
    delete from cart_items where client_id = new.client_id and service_id = new.service_id;
  end if;
  return new;
end;
$$;
create trigger purchases_clear_cart
  after insert or update of status on purchases
  for each row execute function clear_cart_on_payment();

/**
 * Server (påminnelser, framtida jobb): klienter med varukorgar som legat
 * orörda längre än p_idle och inte påmints om. Bara aktiva tjänster räknas.
 */
create or replace function abandoned_carts(p_idle interval default interval '24 hours')
returns table (client_id uuid, items int, total_sek int, trainer_ids uuid[], last_added timestamptz)
language sql stable security definer set search_path = public as $$
  select c.client_id, count(*)::int, sum(s.price_sek)::int, array_agg(distinct c.trainer_id), max(c.added_at)
  from cart_items c join trainer_services s on s.id = c.service_id and s.active
  group by c.client_id
  having max(c.added_at) < now() - p_idle and bool_or(c.reminded_at is null)
  order by max(c.added_at);
$$;
revoke all on function abandoned_carts(interval) from public, anon, authenticated;
grant execute on function abandoned_carts(interval) to service_role;

/** Server: markera att klienten påmints om sin varukorg (så att den inte påminns igen). */
create or replace function mark_cart_reminded(p_client uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  update cart_items set reminded_at = now() where client_id = p_client and reminded_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function mark_cart_reminded(uuid) from public, anon, authenticated;
grant execute on function mark_cart_reminded(uuid) to service_role;

-- ================================================================ boost ===
alter table trainers add column boosted_until timestamptz;
create index trainers_boosted_idx on trainers (boosted_until) where boosted_until is not null;

/** boosted_until ändras bara av servern (service role / admin), aldrig av PT:n. */
create or replace function guard_trainer_boost()
returns trigger language plpgsql as $$
begin
  -- auth.uid() är null för service role och SQL-editorn (admin).
  if auth.uid() is not null and (
    (tg_op = 'INSERT' and new.boosted_until is not null)
    or (tg_op = 'UPDATE' and new.boosted_until is distinct from old.boosted_until)
  ) then
    raise exception 'Boost köps via Coavira (199 kr för 7 dagar)' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trainers_boost_guard
  before insert or update on trainers
  for each row execute function guard_trainer_boost();

create type boost_status as enum ('pending', 'paid', 'cancelled', 'refunded');

create table trainer_boosts (
  id                    uuid primary key default gen_random_uuid(),
  trainer_id            uuid not null references trainers on delete cascade,
  price_sek             int not null check (price_sek > 0),
  duration_days         int not null check (duration_days between 1 and 31),
  status                boost_status not null default 'pending',
  -- Perioden som köpet gav (sätts vid betalning; en ny boost läggs efter en pågående).
  starts_at             timestamptz,
  ends_at               timestamptz,
  stripe_session_id     text,
  stripe_payment_intent text,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);
create index trainer_boosts_trainer_idx on trainer_boosts (trainer_id, created_at desc);
create index trainer_boosts_intent_idx on trainer_boosts (stripe_payment_intent) where stripe_payment_intent is not null;

alter table trainer_boosts enable row level security;
create policy "boosts: trainer own read" on trainer_boosts for select to authenticated using (trainer_id = auth.uid());
revoke insert, update, delete on trainer_boosts from authenticated, anon;

/**
 * PT: starta ett boostköp (199 kr, 7 dagar). Priset bestäms här – webbläsaren
 * skickar ingenting. Tidigare obetalda boostköp avbryts.
 */
create or replace function create_boost_checkout()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or (select role from profiles where id = v_uid) is distinct from 'trainer' then
    raise exception 'Bara PT:er kan boosta sin profil' using errcode = '42501';
  end if;
  if not coalesce((select is_published from trainers where id = v_uid), false) then
    raise exception 'Publicera din profil innan du boostar den' using errcode = '22023';
  end if;
  update trainer_boosts set status = 'cancelled' where trainer_id = v_uid and status = 'pending';
  insert into trainer_boosts (trainer_id, price_sek, duration_days) values (v_uid, 199, 7) returning id into v_id;
  return jsonb_build_object(
    'boost_id', v_id,
    'trainer_id', v_uid,
    'price_sek', 199,
    'duration_days', 7,
    'boosted_until', (select boosted_until from trainers where id = v_uid)
  );
end;
$$;
revoke all on function create_boost_checkout() from public, anon;
grant execute on function create_boost_checkout() to authenticated;

/** PT: koppla Stripe-sessionen till boostköpet (för att kunna verifiera betalningen efteråt). */
create or replace function attach_boost_session(p_boost uuid, p_session text)
returns void language sql security definer set search_path = public as $$
  update trainer_boosts set stripe_session_id = left(p_session, 200)
  where id = p_boost and trainer_id = auth.uid() and status = 'pending';
$$;
revoke all on function attach_boost_session(uuid, text) from public, anon;
grant execute on function attach_boost_session(uuid, text) to authenticated;

/**
 * Server (Stripe-webhooken, service role): boostköpet är betalt. Idempotent.
 * Synligheten börjar nu, eller när en pågående boost tar slut, och varar
 * duration_days. Returnerar nya boosted_until.
 */
create or replace function mark_boost_paid(p_boost uuid, p_session text, p_payment_intent text, p_amount_sek int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  b trainer_boosts;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into b from trainer_boosts where id = p_boost for update;
  if not found then
    raise exception 'Okänt boostköp' using errcode = 'P0002';
  end if;
  if b.status = 'paid' then
    return b.ends_at;
  end if;
  if b.status = 'refunded' then
    raise exception 'Boostköpet är återbetalt' using errcode = '22023';
  end if;
  if p_amount_sek is not null and p_amount_sek <> b.price_sek then
    raise exception 'Beloppet stämmer inte (% kr betalt, % kr för boost)', p_amount_sek, b.price_sek using errcode = '22023';
  end if;
  select greatest(now(), coalesce(boosted_until, now())) into v_start from trainers where id = b.trainer_id for update;
  v_end := v_start + make_interval(days => b.duration_days);
  update trainer_boosts
  set status = 'paid', paid_at = now(), starts_at = v_start, ends_at = v_end,
      stripe_session_id = coalesce(p_session, stripe_session_id),
      stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent)
  where id = b.id;
  update trainers set boosted_until = v_end where id = b.trainer_id;
  return v_end;
end;
$$;
revoke all on function mark_boost_paid(uuid, text, text, int) from public, anon, authenticated;
grant execute on function mark_boost_paid(uuid, text, text, int) to service_role;

/** Server: återbetald boost (Stripe charge.refunded). Synligheten kortas med boostens längd. */
create or replace function mark_boost_refunded(p_payment_intent text)
returns int language plpgsql security definer set search_path = public as $$
declare
  b trainer_boosts;
  v_n int := 0;
begin
  for b in select * from trainer_boosts where stripe_payment_intent = p_payment_intent and status = 'paid' for update loop
    update trainer_boosts set status = 'refunded' where id = b.id;
    update trainers
    set boosted_until = case
      when boosted_until - make_interval(days => b.duration_days) > now() then boosted_until - make_interval(days => b.duration_days)
      else null end
    where id = b.trainer_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function mark_boost_refunded(text) from public, anon, authenticated;
grant execute on function mark_boost_refunded(text) to service_role;

-- Realtid: klientens varukorg (t.ex. rensad efter betalning på en annan enhet). RLS gäller även realtid.
alter publication supabase_realtime add table cart_items;
