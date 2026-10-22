-- ============================================================================
-- v17: antal pass i varukorgen, serviceavgift (7 %) och härdning inför öppen
-- registrering.
--
-- * Antal: enstaka pass kan köpas i flera exemplar (1–20) – i varukorgen
--   (cart_items.quantity) och i kassan (purchases.quantity). Ett köp av 3 ×
--   enstaka pass ger 3 pass och 3 × priset. Paket och kost är alltid 1.
-- * Serviceavgift: 7 % av deltotalen, avrundat till hela kronor, läggs på varje
--   kassa och sparas i checkout_fees. Databasen räknar ut avgiften; samma
--   belopp skickas till Stripe som en egen rad och kontrolleras när kassan
--   markeras som betald (mark_checkout_paid).
-- * Härdning: hjälpfunktioner (ja/nej-kontroller som används i RLS) kan inte
--   längre anropas av anonyma besökare, och två interna kontroller kan inte
--   anropas alls utifrån.
--
-- Körs efter 20261029000000_v16_cart_boost.sql.
-- ============================================================================

-- ======================================================== serviceavgift ===
/** Serviceavgiften i procent. Ändras bara här (och i src/lib/payments/fees.ts). */
create or replace function service_fee_percent()
returns numeric language sql immutable as $$ select 7::numeric $$;

/** Serviceavgift i hela kronor för en deltotal (avrundas: 66,5 → 67). */
create or replace function service_fee_sek(p_subtotal int)
returns int language sql immutable as $$ select round(p_subtotal * service_fee_percent() / 100)::int $$;

create table checkout_fees (
  checkout_id  uuid primary key,
  client_id    uuid not null references profiles on delete cascade,
  subtotal_sek int not null check (subtotal_sek > 0),
  fee_percent  numeric(5, 2) not null check (fee_percent >= 0),
  fee_sek      int not null check (fee_sek >= 0),
  created_at   timestamptz not null default now()
);
create index checkout_fees_client_idx on checkout_fees (client_id, created_at desc);

alter table checkout_fees enable row level security;
-- Klienten ser sina egna avgifter (kvitto). PT:er ser dem inte – avgiften går till Coavira.
create policy "fees: client own read" on checkout_fees for select to authenticated using (client_id = auth.uid());
revoke insert, update, delete on checkout_fees from authenticated, anon;

-- =============================================================== antal ===
alter table purchases add column quantity int not null default 1 check (quantity between 1 and 20);
alter table cart_items add column quantity int not null default 1 check (quantity between 1 and 20);

-- Klienten får ändra antalet (och bara antalet) på sina egna rader.
create policy "cart: client own update" on cart_items for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
grant update (quantity) on cart_items to authenticated;

/** Antal > 1 bara för enstaka pass. */
create or replace function check_cart_quantity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.quantity > 1 and (select kind from trainer_services where id = new.service_id) is distinct from 'single' then
    raise exception 'Antal kan bara väljas för enstaka pass' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger cart_items_quantity
  before insert or update of quantity on cart_items
  for each row execute function check_cart_quantity();

/**
 * Klient: skapa en kassa hos EN PT. Priserna hämtas här – webbläsaren skickar
 * bara vilka tjänster (och antal enstaka pass) som valts. Serviceavgiften (7 %)
 * räknas ut och sparas. Tidigare obetalda kassor för klienten avbryts.
 */
drop function create_checkout(uuid[]);
create or replace function create_checkout(p_service_ids uuid[], p_quantities int[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_checkout uuid := gen_random_uuid();
  v_trainer uuid;
  v_count int;
  v_trainers int;
  v_subtotal int;
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
  v_fee := service_fee_sek(v_subtotal);
  insert into checkout_fees (checkout_id, client_id, subtotal_sek, fee_percent, fee_sek)
  values (v_checkout, v_uid, v_subtotal, service_fee_percent(), v_fee);

  return jsonb_build_object(
    'checkout_id', v_checkout,
    'trainer_id', v_trainer,
    'subtotal_sek', v_subtotal,
    'fee_percent', service_fee_percent(),
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

/**
 * Server (Stripe-webhooken, service role): markera en kassa som betald.
 * Idempotent. p_amount_sek kontrolleras mot kassans summa INKLUSIVE serviceavgift.
 */
create or replace function mark_checkout_paid(p_checkout uuid, p_session text, p_payment_intent text, p_amount_sek int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_n int;
begin
  select sum(price_sek) + coalesce((select fee_sek from checkout_fees where checkout_id = p_checkout), 0)
    into v_total from purchases where checkout_id = p_checkout;
  if v_total is null then
    raise exception 'Okänd kassa' using errcode = 'P0002';
  end if;
  if p_amount_sek is not null and p_amount_sek <> v_total then
    raise exception 'Beloppet stämmer inte (% kr betalt, % kr i kassan)', p_amount_sek, v_total using errcode = '22023';
  end if;
  update purchases
  set status = 'paid', paid_at = now(),
      stripe_session_id = coalesce(p_session, stripe_session_id),
      stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent)
  where checkout_id = p_checkout and status in ('pending', 'cancelled');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function mark_checkout_paid(uuid, text, text, int) from public, anon, authenticated;
grant execute on function mark_checkout_paid(uuid, text, text, int) to service_role;

-- ============================================================== härdning ===
-- Ja/nej-kontroller som RLS-policyerna använder: bara inloggade (policyerna
-- gäller rollen authenticated). Anonyma besökare kan inte anropa dem via API:t.
do $$
declare
  f text;
begin
  foreach f in array array[
    'can_access_call(text)', 'can_access_client(text)', 'can_view_trainer(uuid)', 'can_view_trainer_media(text)',
    'has_relationship_with(uuid)', 'is_active_trainer_of(uuid)', 'is_my_trainer(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
-- Används bara inuti triggern guard_workout_completion (security definer) –
-- ingen användare behöver anropa dem direkt (de läser andras pass).
revoke execute on function workout_has_started(uuid, date) from public, anon, authenticated;
revoke execute on function workout_missing_weights(uuid) from public, anon, authenticated;
