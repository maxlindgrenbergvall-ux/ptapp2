-- ============================================================================
-- v19: egna övningar, PT:ns inbjudningskoder för befintliga klienter och
-- serviceavgift efter hur klienten kom till PT:n (5 % eller 10 %).
--
-- * custom_exercises: klienter och PT:er lägger till egna övningar (namn,
--   standardvikt i kg eller lbs, set och reps) när en övning saknas i
--   övningsbanken. Ägaren och de hen tränar med (aktiv relation) ser dem.
-- * pt_invites: en verifierad PT skapar en engångskod (EX-8FK29A) till en
--   klient hen redan har utanför appen. Klienten löser in koden
--   (redeem_pt_invite) och kopplas direkt till PT:n med
--   acquisition_type = 'EXISTING_CLIENT'.
-- * coaching_relationships.acquisition_type: EXISTING_CLIENT (via PT:ns kod)
--   eller PLATFORM_CLIENT (hittade PT:n i appen – standard). Bara databasen
--   sätter fältet.
-- * Serviceavgift: 5 % för befintliga klienter, 10 % för plattformsklienter,
--   räknat på deltotalen. create_checkout väljer procentsatsen.
--
-- Körs efter 20261031000000_v18_plus_referrals.sql.
-- ============================================================================

-- ============================================================ egna övningar ===
create table custom_exercises (
  -- Prefixet skiljer egna övningar från övningsbankens id:n ("e-squat").
  id             text primary key default ('cx-' || gen_random_uuid()::text) check (id ~ '^cx-[0-9a-f-]{36}$'),
  user_id        uuid not null default auth.uid() references profiles on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  default_weight numeric(6, 2) check (default_weight >= 0 and default_weight <= 1000),
  weight_unit    text not null default 'kg' check (weight_unit in ('kg', 'lbs')),
  default_sets   int not null default 3 check (default_sets between 1 and 20),
  default_reps   text not null default '10' check (char_length(btrim(default_reps)) between 1 and 12),
  muscle_group   muscle_group not null default 'helkropp',
  created_at     timestamptz not null default now()
);
create index custom_exercises_user_idx on custom_exercises (user_id, created_at desc);
create unique index custom_exercises_user_name_idx on custom_exercises (user_id, lower(btrim(name)));

/** Tränar inloggad användare med p_other (PT ↔ klient, relation som inte avslutats)? */
create or replace function is_coaching_partner(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coaching_relationships r
    where r.status <> 'ended'
      and ((r.client_id = auth.uid() and r.trainer_id = p_other) or (r.trainer_id = auth.uid() and r.client_id = p_other))
  );
$$;
revoke execute on function is_coaching_partner(uuid) from public, anon;
grant execute on function is_coaching_partner(uuid) to authenticated;

/** Högst 300 egna övningar per användare. */
create or replace function check_custom_exercise_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from custom_exercises where user_id = new.user_id) >= 300 then
    raise exception 'Du kan ha högst 300 egna övningar' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger custom_exercises_limit
  before insert on custom_exercises
  for each row execute function check_custom_exercise_limit();

alter table custom_exercises enable row level security;
-- Ägaren, och PT:n/klienten som ägaren tränar med (övningen kan finnas i ett
-- tilldelat pass eller i klientens egna pass, som PT:n ser som underlag).
create policy "custom exercises: read own and partners" on custom_exercises for select to authenticated
  using (user_id = auth.uid() or is_coaching_partner(user_id));
create policy "custom exercises: own insert" on custom_exercises for insert to authenticated
  with check (user_id = auth.uid());
create policy "custom exercises: own update" on custom_exercises for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "custom exercises: own delete" on custom_exercises for delete to authenticated
  using (user_id = auth.uid());
revoke all on custom_exercises from anon;
revoke update on custom_exercises from authenticated;
grant select, insert, delete on custom_exercises to authenticated;
grant update (name, default_weight, weight_unit, default_sets, default_reps, muscle_group) on custom_exercises to authenticated;

-- ===================================================== kundursprung ===
create type acquisition_type as enum ('EXISTING_CLIENT', 'PLATFORM_CLIENT');

-- Befintliga relationer blev till via appen → PLATFORM_CLIENT (kan ändras av
-- Coavira med admin_set_acquisition nedan).
alter table coaching_relationships
  add column acquisition_type acquisition_type not null default 'PLATFORM_CLIENT',
  add column invite_id uuid;

/**
 * Bara databasen sätter kundursprunget: nya relationer från appen (förfrågan,
 * bokning, köp) blir alltid PLATFORM_CLIENT, och varken PT eller klient kan
 * ändra det – en lägre avgift kräver en inlöst kod från PT:n.
 */
create or replace function guard_acquisition_type()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('coavira.system', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.acquisition_type := 'PLATFORM_CLIENT';
    new.invite_id := null;
  elsif new.acquisition_type is distinct from old.acquisition_type or new.invite_id is distinct from old.invite_id then
    raise exception 'Kundursprunget kan inte ändras' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger coaching_relationships_acquisition
  before insert or update on coaching_relationships
  for each row execute function guard_acquisition_type();

-- ============================================ PT:ns inbjudningskoder ===
create table pt_invites (
  id         uuid primary key default gen_random_uuid(),
  pt_id      uuid not null references trainers on delete cascade,
  code       text not null unique check (code ~ '^EX-[A-HJ-NP-Z2-9]{6}$'),
  -- Valfri anteckning för PT:n (t.ex. klientens förnamn). Klienten ser den inte.
  label      text check (char_length(label) <= 60),
  is_used    boolean not null default false,
  used_by    uuid references profiles on delete set null,
  used_at    timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  check (is_used = (used_at is not null))
);
create index pt_invites_pt_idx on pt_invites (pt_id, created_at desc);

alter table pt_invites enable row level security;
-- PT:n ser och kan ta bort sina egna (oanvända) koder. Koder skapas bara av
-- create_pt_invite() och löses bara in med redeem_pt_invite() – klienter kan
-- aldrig läsa tabellen (inga koder att gissa ur).
create policy "pt invites: own read" on pt_invites for select to authenticated using (pt_id = auth.uid());
create policy "pt invites: own delete unused" on pt_invites for delete to authenticated using (pt_id = auth.uid() and not is_used);
revoke all on pt_invites from anon, authenticated;
grant select, delete on pt_invites to authenticated;

/** Godkänd PT: PT-konto (skapat av Coavira) med certifikat verifierade av Coavira. */
create or replace function is_approved_trainer(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trainers t join profiles p on p.id = t.id
    where t.id = p_trainer and p.role = 'trainer' and coalesce(array_length(t.certifications, 1), 0) > 0
  );
$$;
revoke execute on function is_approved_trainer(uuid) from public, anon, authenticated;

/** Kod med 6 tecken efter "EX-", från en kryptografiskt slumpad uuid och utan förväxlingsbara tecken. */
create or replace function generate_pt_invite_code()
returns text language plpgsql volatile as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    select 'EX-' || string_agg(substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1), '' order by i) into v_code
    from generate_series(0, 5) i;
    exit when not exists (select 1 from pt_invites where code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke execute on function generate_pt_invite_code() from public, anon, authenticated;

/** PT: skapa en engångskod till en befintlig klient. Bara godkända PT:er. */
create or replace function create_pt_invite(p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row pt_invites;
begin
  if v_uid is null or not is_approved_trainer(v_uid) then
    raise exception 'Bara verifierade PT:er kan bjuda in klienter' using errcode = '42501';
  end if;
  if (select count(*) from pt_invites where pt_id = v_uid and not is_used and expires_at > now()) >= 50 then
    raise exception 'Du har redan 50 oanvända koder – ta bort några först' using errcode = '22023';
  end if;
  insert into pt_invites (pt_id, code, label)
  values (v_uid, generate_pt_invite_code(), nullif(left(btrim(coalesce(p_label, '')), 60), ''))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'code', v_row.code, 'label', v_row.label, 'expires_at', v_row.expires_at, 'created_at', v_row.created_at);
end;
$$;
revoke all on function create_pt_invite(text) from public, anon;
grant execute on function create_pt_invite(text) to authenticated;

-- Misslyckade försök att lösa in koder (skydd mot gissning). Ingen användare läser tabellen.
create table pt_invite_attempts (
  user_id uuid not null references profiles on delete cascade,
  at      timestamptz not null default now()
);
create index pt_invite_attempts_idx on pt_invite_attempts (user_id, at desc);
alter table pt_invite_attempts enable row level security;
revoke all on pt_invite_attempts from anon, authenticated;

/**
 * Klient: lös in PT:ns kod. Kopplar klienten till PT:n som EXISTING_CLIENT
 * (aktiv relation) och förbrukar koden. Svarar { ok, error? , trainer_id,
 * trainer_name } i stället för att kasta fel, så att misslyckade försök
 * räknas (högst 10 per timme).
 */
create or replace function redeem_pt_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_raw text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code text;
  v_inv pt_invites;
  v_rel coaching_relationships;
  v_name text;
begin
  if v_uid is null or (select role from profiles where id = v_uid) is distinct from 'client' then
    return jsonb_build_object('ok', false, 'error', 'Bara klientkonton kan använda en inbjudningskod från en PT');
  end if;
  if (select count(*) from pt_invite_attempts where user_id = v_uid and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'För många felaktiga försök – vänta en timme och försök igen');
  end if;
  v_code := 'EX-' || substr(regexp_replace(v_raw, '^EX', ''), 1, 6);
  select * into v_inv from pt_invites where code = v_code for update;
  if not found or v_inv.is_used then
    insert into pt_invite_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Koden finns inte eller har redan använts');
  end if;
  if v_inv.expires_at <= now() then
    insert into pt_invite_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Koden har gått ut – be din PT om en ny');
  end if;
  if not is_approved_trainer(v_inv.pt_id) then
    return jsonb_build_object('ok', false, 'error', 'PT:n kan inte ta emot klienter just nu');
  end if;

  select * into v_rel from coaching_relationships where trainer_id = v_inv.pt_id and client_id = v_uid;
  if found and v_rel.acquisition_type = 'EXISTING_CLIENT' then
    return jsonb_build_object('ok', false, 'error', 'Du är redan kopplad till PT:n som befintlig klient');
  end if;
  -- En klient som redan köpt hos PT:n via appen är en plattformsklient – en kod
  -- kan inte sänka avgiften i efterhand.
  if exists (select 1 from purchases where client_id = v_uid and trainer_id = v_inv.pt_id and status in ('paid', 'refunded')) then
    return jsonb_build_object('ok', false, 'error', 'Du har redan köpt hos PT:n via Coavira – koden gäller klienter som PT:n hade innan');
  end if;

  perform set_config('coavira.system', 'on', true);
  insert into coaching_relationships (trainer_id, client_id, status, started_at, acquisition_type, invite_id)
  values (v_inv.pt_id, v_uid, 'active', current_date, 'EXISTING_CLIENT', v_inv.id)
  on conflict (trainer_id, client_id) do update
    set status = 'active',
        started_at = coalesce(coaching_relationships.started_at, current_date),
        acquisition_type = 'EXISTING_CLIENT',
        invite_id = excluded.invite_id;
  update pt_invites set is_used = true, used_by = v_uid, used_at = now() where id = v_inv.id;
  perform set_config('coavira.system', 'off', true);

  select full_name into v_name from profiles where id = v_inv.pt_id;
  return jsonb_build_object('ok', true, 'trainer_id', v_inv.pt_id, 'trainer_name', v_name, 'acquisition_type', 'EXISTING_CLIENT');
end;
$$;
revoke all on function redeem_pt_invite(text) from public, anon;
grant execute on function redeem_pt_invite(text) to authenticated;

/** Coavira (SQL Editor): rätta kundursprunget för en relation. Ingen användare kan anropa den. */
create or replace function admin_set_acquisition(p_client_email text, p_trainer_email text, p_type acquisition_type)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  perform set_config('coavira.system', 'on', true);
  update coaching_relationships r set acquisition_type = p_type
  where r.client_id = (select id from auth.users where lower(email) = lower(p_client_email))
    and r.trainer_id = (select id from auth.users where lower(email) = lower(p_trainer_email));
  get diagnostics v_n = row_count;
  perform set_config('coavira.system', 'off', true);
  if v_n = 0 then
    raise exception 'Ingen relation mellan % och %', p_client_email, p_trainer_email using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function admin_set_acquisition(text, text, acquisition_type) from public, anon, authenticated;

-- ======================================== serviceavgift 5 % / 10 % ===
/** Plattformsklienter (hittade PT:n i appen): 10 %. Ändras här och i src/lib/payments/fees.ts. */
create or replace function service_fee_percent()
returns numeric language sql immutable as $$ select 10::numeric $$;

/** Befintliga klienter (via PT:ns kod): 5 %. */
create or replace function existing_client_fee_percent()
returns numeric language sql immutable as $$ select 5::numeric $$;

/** Avgiften för en klient hos en PT, efter hur klienten kom till PT:n. Intern. */
create or replace function service_fee_percent_for(p_client uuid, p_trainer uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from coaching_relationships
      where client_id = p_client and trainer_id = p_trainer and acquisition_type = 'EXISTING_CLIENT'
    ) then existing_client_fee_percent()
    else service_fee_percent()
  end;
$$;
revoke execute on function service_fee_percent_for(uuid, uuid) from public, anon, authenticated;

drop function service_fee_sek(int);
/** Serviceavgift i hela kronor (avrundas: 47,5 → 48). */
create or replace function service_fee_sek(p_subtotal int, p_percent numeric)
returns int language sql immutable as $$ select round(p_subtotal * p_percent / 100)::int $$;

/**
 * Klient: skapa en kassa hos EN PT (som v17) – serviceavgiften är 5 % för
 * befintliga klienter (EXISTING_CLIENT) och 10 % för plattformsklienter.
 */
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
