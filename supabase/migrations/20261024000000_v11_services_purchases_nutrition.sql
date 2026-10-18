-- ============================================================================
-- Coavira v11: tjänster, betalning, passgräns, kostlås, recept och verifierade
-- certifikat.
--
-- * trainer_services: PT:ns tjänstemeny – enstaka pass, paket med ett fast
--   antal pass, ren kostcoaching och helhetspaket (träning + kost).
-- * purchases: klientens köp. Skapas bara via create_checkout() (priserna
--   hämtas här, aldrig från webbläsaren) och markeras betalda bara av servern
--   (Stripe-webhooken, service role) via mark_checkout_paid().
-- * Ett betalt köp gör klienten till aktiv klient hos PT:n (Klientöversikten).
-- * Passgräns: PT:n kan bara schemalägga/boka så många pass som klienten har
--   betalat för. Kontrolleras i triggers på scheduled_workouts och
--   calendar_events, med lås per PT–klient-par så att samtidiga anrop inte
--   kan gå förbi gränsen.
-- * Kostlås: kostplanen kan bara skapas av PT:n och läsas av klienten när
--   klienten har betalat för kostcoaching (tjänst med includes_nutrition).
-- * Certifikat: kan bara ändras av Coavira (admin/service role) efter manuell
--   verifiering via certifiering@coavira.com.
-- * recipes: PT:ns egna recept i kostbyggaren.
--
-- Befintliga relationer får ett "tidigare pass"-köp som motsvarar det som
-- redan är schemalagt (och kost om en kostplan finns), så att inget som redan
-- finns försvinner – men nya pass kräver ett nytt köp.
--
-- Körs efter 20261023000000_v10_calendar_feeds.sql.
-- ============================================================================

-- ============================================================ certifikat ===
create or replace function guard_trainer_certifications()
returns trigger language plpgsql as $$
begin
  -- auth.uid() är null för service role och SQL-editorn (admin).
  if new.certifications is distinct from old.certifications and auth.uid() is not null then
    raise exception 'Certifikat verifieras manuellt av Coavira. Skicka dem till certifiering@coavira.com.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trainers_certifications_guard
  before update on trainers
  for each row execute function guard_trainer_certifications();

/** Admin: sätt en PT:s verifierade certifikat.  select admin_set_certifications('pt@exempel.se', array['PT-licens (Gymnastik- och idrottshögskolan)']); */
create or replace function admin_set_certifications(p_email text, p_certifications text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u join trainers t on t.id = u.id where lower(u.email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'Hittar ingen PT med e-post %', p_email using errcode = 'P0002';
  end if;
  update trainers
  set certifications = coalesce((select array_agg(left(trim(c), 120)) from unnest(p_certifications) c where trim(c) <> ''), '{}')
  where id = v_id;
end;
$$;
revoke all on function admin_set_certifications(text, text[]) from public, anon, authenticated;

-- ============================================================== tjänster ===
create type service_kind as enum ('single', 'package', 'nutrition', 'full');

create table trainer_services (
  id                 uuid primary key default gen_random_uuid(),
  trainer_id         uuid not null references trainers on delete cascade,
  kind               service_kind not null,
  title              text not null check (char_length(title) between 3 and 80),
  description        text not null default '' check (char_length(description) <= 400),
  sessions           smallint not null default 0,
  includes_nutrition boolean not null default false,
  duration_weeks     smallint check (duration_weeks between 1 and 52),
  -- Inga gratistjänster.
  price_sek          int not null check (price_sek between 1 and 100000),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint service_shape check (
       (kind = 'single'    and sessions = 1                 and not includes_nutrition)
    or (kind = 'package'   and sessions between 2 and 100   and not includes_nutrition)
    or (kind = 'nutrition' and sessions = 0                 and includes_nutrition)
    or (kind = 'full'      and sessions between 1 and 100   and includes_nutrition)
  )
);
create index trainer_services_trainer_idx on trainer_services (trainer_id) where active;
create trigger trainer_services_touch before update on trainer_services
  for each row execute function touch_updated_at();

alter table trainer_services enable row level security;
create policy "services: trainer own" on trainer_services for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
-- Klienter ser aktiva tjänster hos publicerade PT:er och hos sin egen PT.
create policy "services: read active" on trainer_services for select to authenticated
  using (active and can_view_trainer(trainer_id));

-- =================================================================== köp ===
create type purchase_status as enum ('pending', 'paid', 'cancelled', 'refunded');

create table purchases (
  id                    uuid primary key default gen_random_uuid(),
  -- Alla rader i samma kassa (t.ex. paket + kostcoaching) delar checkout_id.
  checkout_id           uuid not null,
  client_id             uuid not null references profiles on delete cascade,
  trainer_id            uuid not null references trainers on delete cascade,
  service_id            uuid references trainer_services on delete set null,
  -- Ögonblicksbild av tjänsten vid köpet. 'legacy' = pass från före v11.
  kind                  text not null check (kind in ('single', 'package', 'nutrition', 'full', 'legacy')),
  title                 text not null check (char_length(title) <= 120),
  sessions              int not null default 0 check (sessions >= 0),
  includes_nutrition    boolean not null default false,
  price_sek             int not null check (price_sek >= 0),
  status                purchase_status not null default 'pending',
  stripe_session_id     text,
  stripe_payment_intent text,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);
create index purchases_pair_idx on purchases (trainer_id, client_id) where status = 'paid';
create index purchases_checkout_idx on purchases (checkout_id);
create index purchases_client_idx on purchases (client_id, created_at desc);

alter table purchases enable row level security;
create policy "purchases: parties read" on purchases for select to authenticated
  using (client_id = auth.uid() or trainer_id = auth.uid());
-- Köp skapas och ändras bara via funktionerna nedan.
revoke insert, update, delete on purchases from authenticated, anon;

-- ============================================================ hjälpare ===
/** Betalda, använda och kvarvarande pass för ett PT–klient-par. */
create or replace function session_balance(p_trainer uuid, p_client uuid)
returns table (paid int, used int, remaining int)
language sql stable security definer set search_path = public as $$
  with p as (
    select coalesce(sum(sessions), 0)::int as paid
    from purchases where trainer_id = p_trainer and client_id = p_client and status = 'paid'
  ),
  u as (
    select (
      (select count(*) from scheduled_workouts w where w.trainer_id = p_trainer and w.client_id = p_client)
      + (select count(*) from calendar_events e
         where e.trainer_id = p_trainer and e.client_id = p_client and e.kind = 'session'
           and e.workout_id is null and e.status in ('pending', 'confirmed', 'completed'))
    )::int as used
  )
  select p.paid, u.used, greatest(p.paid - u.used, 0)
  from p, u
  where auth.uid() is null or auth.uid() in (p_trainer, p_client);
$$;
revoke all on function session_balance(uuid, uuid) from public, anon;
grant execute on function session_balance(uuid, uuid) to authenticated;

/** Har klienten betalat för kostcoaching hos PT:n? */
create or replace function has_nutrition_access(p_trainer uuid, p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from purchases
    where trainer_id = p_trainer and client_id = p_client and status = 'paid' and includes_nutrition
  );
$$;
revoke all on function has_nutrition_access(uuid, uuid) from public, anon;
grant execute on function has_nutrition_access(uuid, uuid) to authenticated;

-- ======================================== befintliga klienter (före v11) ===
-- Det som redan är schemalagt räknas som betalt, så inget försvinner. Nya pass
-- kräver köp. (Görs innan triggern som aktiverar relationer skapas.)
insert into purchases (checkout_id, client_id, trainer_id, kind, title, sessions, includes_nutrition, price_sek, status, paid_at)
select gen_random_uuid(), r.client_id, r.trainer_id, 'legacy', 'Tidigare pass (före betalning i appen)',
       b.used, exists (select 1 from nutrition_plans n where n.trainer_id = r.trainer_id and n.client_id = r.client_id),
       0, 'paid', now()
from coaching_relationships r
cross join lateral (
  select (
    (select count(*) from scheduled_workouts w where w.trainer_id = r.trainer_id and w.client_id = r.client_id)
    + (select count(*) from calendar_events e
       where e.trainer_id = r.trainer_id and e.client_id = r.client_id and e.kind = 'session'
         and e.workout_id is null and e.status in ('pending', 'confirmed', 'completed'))
  )::int as used
) b
where b.used > 0 or exists (select 1 from nutrition_plans n where n.trainer_id = r.trainer_id and n.client_id = r.client_id);

-- ============================================================== passgräns ===
create or replace function require_session_credit(p_trainer uuid, p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paid int;
  v_used int;
begin
  -- Ett lås per par: två samtidiga bokningar kan inte båda ta sista passet.
  perform pg_advisory_xact_lock(hashtextextended(p_trainer::text || p_client::text, 11));
  select coalesce(sum(sessions), 0) into v_paid
  from purchases where trainer_id = p_trainer and client_id = p_client and status = 'paid';
  select (
    (select count(*) from scheduled_workouts w where w.trainer_id = p_trainer and w.client_id = p_client)
    + (select count(*) from calendar_events e
       where e.trainer_id = p_trainer and e.client_id = p_client and e.kind = 'session'
         and e.workout_id is null and e.status in ('pending', 'confirmed', 'completed'))
  ) into v_used;
  if v_used >= v_paid then
    raise exception 'Inga betalda pass kvar (% av % använda). Klienten behöver köpa fler pass.', v_used, v_paid
      using errcode = 'P0001', hint = 'no_session_credit';
  end if;
end;
$$;
revoke all on function require_session_credit(uuid, uuid) from public, anon, authenticated;

create or replace function enforce_workout_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform require_session_credit(new.trainer_id, new.client_id);
  return new;
end;
$$;
create trigger scheduled_workouts_credit
  before insert on scheduled_workouts
  for each row execute function enforce_workout_credit();

-- Ett pass i kalendern utan kopplat träningspass tar ett pass när det blir aktivt
-- (nytt, eller ett avbokat pass som återupplivas). Kopplade pass räknas via scheduled_workouts.
create or replace function enforce_event_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'session' and new.client_id is not null and new.workout_id is null
     and new.status in ('pending', 'confirmed', 'completed')
     and (tg_op = 'INSERT' or old.status = 'cancelled' or old.workout_id is not null) then
    perform require_session_credit(new.trainer_id, new.client_id);
  end if;
  return new;
end;
$$;
create trigger calendar_events_credit
  before insert or update on calendar_events
  for each row execute function enforce_event_credit();

-- ================================================================ kostlås ===
create or replace function enforce_nutrition_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not has_nutrition_access(new.trainer_id, new.client_id) then
    raise exception 'Klienten har inte köpt kostcoaching' using errcode = 'P0001', hint = 'no_nutrition_access';
  end if;
  return new;
end;
$$;
create trigger nutrition_plans_access
  before insert or update on nutrition_plans
  for each row execute function enforce_nutrition_access();

drop policy "nutrition: client read" on nutrition_plans;
create policy "nutrition: client read" on nutrition_plans for select to authenticated
  using (client_id = auth.uid() and has_nutrition_access(trainer_id, client_id));

-- ================================================================ kassa ===
/**
 * Klient: skapa en kassa för en eller flera tjänster hos samma PT. Priserna
 * hämtas från trainer_services. Returnerar raderna som servern skickar till
 * Stripe. Tidigare obetalda kassor för klienten avbryts.
 */
create or replace function create_checkout(p_service_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_checkout uuid := gen_random_uuid();
  v_trainer uuid;
  v_count int;
  v_trainers int;
  v_other uuid;
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

  select trainer_id into v_other from coaching_relationships
  where client_id = v_uid and trainer_id <> v_trainer and status in ('active', 'paused') limit 1;
  if v_other is not null then
    raise exception 'Du tränar redan med en annan PT' using errcode = '42501';
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
revoke all on function create_checkout(uuid[]) from public, anon;
grant execute on function create_checkout(uuid[]) to authenticated;

/** Klient: koppla Stripe-sessionen till kassan (för att kunna verifiera betalningen efteråt). */
create or replace function attach_checkout_session(p_checkout uuid, p_session text)
returns void language sql security definer set search_path = public as $$
  update purchases set stripe_session_id = left(p_session, 200)
  where checkout_id = p_checkout and client_id = auth.uid() and status = 'pending';
$$;
revoke all on function attach_checkout_session(uuid, text) from public, anon;
grant execute on function attach_checkout_session(uuid, text) to authenticated;

/**
 * Server (Stripe-webhooken, service role): markera en kassa som betald.
 * Idempotent. p_amount_sek kontrolleras mot kassans summa.
 */
create or replace function mark_checkout_paid(p_checkout uuid, p_session text, p_payment_intent text, p_amount_sek int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_n int;
begin
  select sum(price_sek) into v_total from purchases where checkout_id = p_checkout;
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

/** Server: återbetalning (Stripe charge.refunded). Återbetalda pass räknas inte längre. */
create or replace function mark_checkout_refunded(p_payment_intent text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  update purchases set status = 'refunded' where stripe_payment_intent = p_payment_intent and status = 'paid';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function mark_checkout_refunded(text) from public, anon, authenticated;
grant execute on function mark_checkout_refunded(text) to service_role;

-- Ett betalt köp gör klienten till aktiv klient hos PT:n (syns i Klientöversikten).
create or replace function activate_relationship_on_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    insert into coaching_relationships (trainer_id, client_id, status, started_at)
    values (new.trainer_id, new.client_id, 'active', current_date)
    on conflict (trainer_id, client_id) do update
      set status = 'active', started_at = coalesce(coaching_relationships.started_at, current_date);
  end if;
  return new;
end;
$$;
create trigger purchases_activate
  after insert or update of status on purchases
  for each row execute function activate_relationship_on_payment();

-- ================================================================= recept ===
create table recipes (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references trainers on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  notes       text not null default '' check (char_length(notes) <= 1000),
  -- MealItem[] (namn, gram, enhet, näringsvärden per 100 g).
  items       jsonb not null default '[]'
              check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index recipes_trainer_idx on recipes (trainer_id);
create trigger recipes_touch before update on recipes
  for each row execute function touch_updated_at();

alter table recipes enable row level security;
create policy "recipes: trainer own" on recipes for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

alter publication supabase_realtime add table purchases, trainer_services;
