-- ============================================================================
-- Coavira v12: flera PT:er, lämna PT, ett aktivt kostschema, PT-utbud,
-- intressen och mätpunkter.
--
-- * En klient kan ha flera aktiva PT:er samtidigt (coaching_relationships har
--   redan primärnyckel (trainer_id, client_id)). Spärren "bara en PT" i
--   create_checkout tas bort. end_coaching() låter klienten lämna en PT.
-- * Varje PT ser och ändrar bara sina egna pass, kostscheman och chattrådar.
--   Meddelanden får trainer_id (en tråd per PT–klient-par) och samtalskanalerna
--   blir "call:{klient}:{pt}".
-- * Bara ETT aktivt kostschema per klient (unikt index sedan v1). Sparar en PT
--   ett schema när en annan PT:s schema är aktivt blir det ett förslag
--   (is_active = false). Klienten väljer vilket som gäller med
--   choose_nutrition_plan().
-- * PT-utbud: offers_training / offers_nutrition. En kost-PT kan inte sälja
--   pass och en tränings-PT kan inte sälja kost (trigger på trainer_services).
-- * Intressen och fokus på profilen, och progress_entries för mätpunkter
--   (t.ex. "Bästa tid på milen" för cykling).
--
-- Körs efter 20261024000000_v11_services_purchases_nutrition.sql.
-- ============================================================================

-- ======================================================== nya inriktningar ===
-- Används inte i den här filen (nya enum-värden kan inte användas i samma transaktion).
alter type specialty add value if not exists 'cykling';
alter type specialty add value if not exists 'kondition';
alter type specialty add value if not exists 'kost';

-- ================================================================ PT-utbud ===
alter table trainers
  add column offers_training boolean not null default true,
  add column offers_nutrition boolean not null default true,
  add constraint trainers_offers_something check (offers_training or offers_nutrition);

create or replace function guard_service_offering()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t trainers%rowtype;
begin
  -- Pausade tjänster får finnas kvar (de säljs inte).
  if not new.active then
    return new;
  end if;
  select * into t from trainers where id = new.trainer_id;
  if new.sessions > 0 and not t.offers_training then
    raise exception 'Du erbjuder inte träning – tjänsten kan inte innehålla pass' using errcode = '23514';
  end if;
  if new.includes_nutrition and not t.offers_nutrition then
    raise exception 'Du erbjuder inte kostrådgivning – tjänsten kan inte innehålla kost' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trainer_services_offering
  before insert or update on trainer_services
  for each row execute function guard_service_offering();

-- Slutar PT:n erbjuda något pausas tjänsterna som innehåller det.
create or replace function pause_services_outside_offering()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update trainer_services set active = false
  where trainer_id = new.id and active
    and ((sessions > 0 and not new.offers_training) or (includes_nutrition and not new.offers_nutrition));
  return new;
end;
$$;
create trigger trainers_offering_changed
  after update of offers_training, offers_nutrition on trainers
  for each row execute function pause_services_outside_offering();

-- ============================================================== intressen ===
create or replace function valid_interest_keys(p text[])
returns boolean language sql immutable as $$
  select coalesce(array_length(p, 1), 0) <= 12
     and not exists (select 1 from unnest(p) k where k !~ '^[a-z_]{2,30}$');
$$;

alter table profiles
  add column interests text[] not null default '{}' check (valid_interest_keys(interests)),
  add column focus text not null default '' check (char_length(focus) <= 300);

-- Mätpunkter som klienten loggar (tider, watt, omfång …). Nyckeln kommer från
-- appens katalog (src/lib/interests.ts); värdet är alltid ett tal (tider i sekunder).
create table progress_entries (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references profiles on delete cascade default auth.uid(),
  metric      text not null check (metric ~ '^[a-z0-9_]{2,40}$'),
  value       numeric(12,2) not null check (value >= 0 and value < 10000000),
  date        date not null default current_date,
  note        text not null default '' check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index progress_entries_client_idx on progress_entries (client_id, metric, date);

alter table progress_entries enable row level security;
create policy "progress: client own" on progress_entries for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "progress: trainers read" on progress_entries for select to authenticated
  using (is_active_trainer_of(client_id));

-- ======================================================== flera PT:er ===
/** Klient: köp hos valfri PT – flera PT:er samtidigt är tillåtet. */
create or replace function create_checkout(p_service_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_checkout uuid := gen_random_uuid();
  v_trainer uuid;
  v_count int;
  v_trainers int;
begin
  if v_uid is null or (select role from profiles where id = v_uid) is distinct from 'client' then
    raise exception 'Bara klienter kan köpa tjänster' using errcode = '42501';
  end if;
  if coalesce(array_length(p_service_ids, 1), 0) not between 1 and 5 then
    raise exception 'Välj 1–5 tjänster' using errcode = '22023';
  end if;

  select count(distinct s.id), min(s.trainer_id::text)::uuid, count(distinct s.trainer_id)
    into v_count, v_trainer, v_trainers
  from trainer_services s
  where s.id = any (p_service_ids) and s.active and can_view_trainer(s.trainer_id);
  if v_count <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'En tjänst finns inte längre' using errcode = 'P0002';
  end if;
  if v_trainers <> 1 then
    raise exception 'Alla tjänster måste vara hos samma PT' using errcode = '22023';
  end if;

  update purchases set status = 'cancelled' where client_id = v_uid and status = 'pending';

  insert into purchases (checkout_id, client_id, trainer_id, service_id, kind, title, sessions, includes_nutrition, price_sek)
  select v_checkout, v_uid, s.trainer_id, s.id, s.kind::text, s.title, s.sessions, s.includes_nutrition, s.price_sek
  from trainer_services s
  where s.id = any (p_service_ids);

  return jsonb_build_object(
    'checkout_id', v_checkout,
    'trainer_id', v_trainer,
    'total_sek', (select sum(price_sek) from purchases where checkout_id = v_checkout),
    'lines', (select jsonb_agg(jsonb_build_object('purchase_id', id, 'title', title, 'price_sek', price_sek, 'kind', kind) order by price_sek desc)
              from purchases where checkout_id = v_checkout)
  );
end;
$$;

-- En avslutad relation kan bara öppnas igen av klienten (genom ett nytt köp),
-- aldrig av PT:n själv – annars kunde PT:n ge sig själv åtkomst till hälsodata igen.
create or replace function guard_relationship_update()
returns trigger language plpgsql as $$
begin
  if new.trainer_id is distinct from old.trainer_id
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Parterna i en relation kan inte ändras' using errcode = '42501';
  end if;
  if old.status = 'ended' and new.status <> 'ended' and auth.uid() = old.trainer_id then
    raise exception 'Klienten har avslutat samarbetet' using errcode = '42501';
  end if;
  return new;
end;
$$;

/**
 * Klient: lämna en PT. PT:n förlorar åtkomst till klientens data direkt,
 * kommande pass avbokas och PT:ns kostschema slutar gälla. Betalda pass som
 * inte använts finns kvar i historiken (återbetalning sköts av PT/Coavira).
 */
create or replace function end_coaching(p_trainer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  update coaching_relationships set status = 'ended'
  where client_id = v_uid and trainer_id = p_trainer and status <> 'ended';
  if not found then
    raise exception 'Ingen pågående relation med PT:n' using errcode = 'P0002';
  end if;
  update calendar_events set status = 'cancelled', cancelled_by = v_uid
  where client_id = v_uid and trainer_id = p_trainer and kind = 'session'
    and status in ('pending', 'confirmed') and start_time > now();
  update nutrition_plans set is_active = false
  where client_id = v_uid and trainer_id = p_trainer and is_active;
end;
$$;
revoke all on function end_coaching(uuid) from public, anon;
grant execute on function end_coaching(uuid) to authenticated;

/** Är PT:n aktiv (eller pausad) PT för inloggad klient? */
create or replace function is_my_trainer(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coaching_relationships
    where client_id = auth.uid() and trainer_id = p_trainer and status in ('active', 'paused')
  );
$$;

-- ------------------------------------------------- pass: bara egna skrivs ---
drop policy "workouts: trainer all" on scheduled_workouts;
-- Alla klientens PT:er ser klientens träning (för att samordna), men ändrar bara sina egna pass.
create policy "workouts: trainers read" on scheduled_workouts for select to authenticated
  using (is_active_trainer_of(client_id));
create policy "workouts: trainer inserts own" on scheduled_workouts for insert to authenticated
  with check (is_active_trainer_of(client_id) and trainer_id = auth.uid());
create policy "workouts: trainer updates own" on scheduled_workouts for update to authenticated
  using (trainer_id = auth.uid() and is_active_trainer_of(client_id))
  with check (trainer_id = auth.uid() and is_active_trainer_of(client_id));
create policy "workouts: trainer deletes own" on scheduled_workouts for delete to authenticated
  using (trainer_id = auth.uid() and is_active_trainer_of(client_id));

-- -------------------------------------------- chatt: en tråd per PT–klient ---
alter table messages add column trainer_id uuid references trainers on delete cascade;
update messages m set trainer_id = coalesce(
  (select t.id from trainers t where t.id = m.sender_id),
  (select r.trainer_id from coaching_relationships r where r.client_id = m.client_id
   order by (r.status in ('active', 'paused')) desc, r.created_at desc limit 1)
);
create index messages_pair_idx on messages (client_id, trainer_id, sent_at);

-- Äldre appversioner (offlinekö) skickar inget trainer_id: välj det självklara.
create or replace function default_message_trainer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is null then
    if exists (select 1 from trainers where id = new.sender_id) then
      new.trainer_id := new.sender_id;
    elsif (select count(*) from coaching_relationships where client_id = new.client_id and status in ('active', 'paused')) = 1 then
      select trainer_id into new.trainer_id from coaching_relationships where client_id = new.client_id and status in ('active', 'paused');
    end if;
  end if;
  return new;
end;
$$;
create trigger messages_default_trainer before insert on messages
  for each row execute function default_message_trainer();

drop policy "messages: parties read" on messages;
drop policy "messages: parties send" on messages;
drop policy "messages: mark read" on messages;
create policy "messages: parties read" on messages for select to authenticated
  using (client_id = auth.uid() or (trainer_id = auth.uid() and is_active_trainer_of(client_id)));
create policy "messages: parties send" on messages for insert to authenticated with check (
  sender_id = auth.uid() and trainer_id is not null and (
    (client_id = auth.uid() and is_my_trainer(trainer_id))
    or (trainer_id = auth.uid() and is_active_trainer_of(client_id))
  )
);
create policy "messages: mark read" on messages for update to authenticated
  using ((client_id = auth.uid() or (trainer_id = auth.uid() and is_active_trainer_of(client_id))) and sender_id <> auth.uid());

-- ------------------------------------------- samtal: en kanal per par ---
create or replace function can_access_call(p_topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_client uuid;
  v_trainer uuid;
begin
  if p_topic !~ '^call:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    return false;
  end if;
  v_client := split_part(p_topic, ':', 2)::uuid;
  v_trainer := split_part(p_topic, ':', 3)::uuid;
  return (v_client = auth.uid() and is_my_trainer(v_trainer))
      or (v_trainer = auth.uid() and is_active_trainer_of(v_client));
end;
$$;
drop policy "calls: parties receive" on realtime.messages;
drop policy "calls: parties send" on realtime.messages;
create policy "calls: parties receive" on realtime.messages for select to authenticated
  using (realtime.topic() like 'call:%' and can_access_call(realtime.topic()));
create policy "calls: parties send" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'call:%' and can_access_call(realtime.topic()));

-- ===================================================== ett aktivt kostschema ===
-- Kostcoaching-behörigheten kontrolleras när ett schema skapas eller är aktivt.
create or replace function enforce_nutrition_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.is_active) and not has_nutrition_access(new.trainer_id, new.client_id) then
    raise exception 'Klienten har inte köpt kostcoaching' using errcode = 'P0001', hint = 'no_nutrition_access';
  end if;
  return new;
end;
$$;

/**
 * Högst ett aktivt schema per klient (unikt index). När en PT sparar:
 *  - är en ANNAN PT:s schema aktivt → PT:ns schema sparas som förslag,
 *  - annars ersätter det PT:ns eget tidigare aktiva schema.
 * Klienten byter aktivt schema med choose_nutrition_plan().
 */
create or replace function nutrition_single_active()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active and auth.uid() is distinct from new.client_id then
    if exists (
      select 1 from nutrition_plans
      where client_id = new.client_id and is_active and trainer_id <> new.trainer_id and id <> new.id
    ) then
      new.is_active := false;
    else
      update nutrition_plans set is_active = false
      where client_id = new.client_id and trainer_id = new.trainer_id and is_active and id <> new.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger nutrition_plans_single_active
  before insert or update on nutrition_plans
  for each row execute function nutrition_single_active();

drop policy "nutrition: trainer all" on nutrition_plans;
drop policy "nutrition: client read" on nutrition_plans;
create policy "nutrition: trainer own" on nutrition_plans for all to authenticated
  using (trainer_id = auth.uid() and is_active_trainer_of(client_id))
  with check (trainer_id = auth.uid() and is_active_trainer_of(client_id));
-- Klientens andra PT:er ser vilket schema som gäller (kalorimål), men kan inte ändra det.
create policy "nutrition: trainers see active" on nutrition_plans for select to authenticated
  using (is_active and is_active_trainer_of(client_id));
-- Klienten ser alla scheman (aktivt + förslag) från PT:er hon/han köpt kost av.
create policy "nutrition: client read" on nutrition_plans for select to authenticated
  using (client_id = auth.uid() and has_nutrition_access(trainer_id, client_id));

/** Klient: välj vilket kostschema som gäller (null = inget). */
create or replace function choose_nutrition_plan(p_plan uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_trainer uuid;
begin
  if p_plan is not null then
    select trainer_id into v_trainer from nutrition_plans where id = p_plan and client_id = v_uid;
    if v_trainer is null then
      raise exception 'Kostschemat finns inte' using errcode = 'P0002';
    end if;
    if not is_my_trainer(v_trainer) then
      raise exception 'Du tränar inte längre med den PT:n' using errcode = '42501';
    end if;
  end if;
  update nutrition_plans set is_active = false where client_id = v_uid and is_active and id is distinct from p_plan;
  if p_plan is not null then
    update nutrition_plans set is_active = true where id = p_plan;
  end if;
end;
$$;
revoke all on function choose_nutrition_plan(uuid) from public, anon;
grant execute on function choose_nutrition_plan(uuid) to authenticated;

alter publication supabase_realtime add table nutrition_plans;
