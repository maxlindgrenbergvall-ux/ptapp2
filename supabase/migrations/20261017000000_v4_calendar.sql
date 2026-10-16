-- ============================================================================
-- Forma v4: tvåvägs kalender och bokning.
--
-- * calendar_events ersätter bookings. En händelse är antingen ett pass
--   (kind = 'session', med eller utan klient) eller en blockering (lunch,
--   semester). Status: pending → confirmed → completed, eller cancelled.
-- * Dubbelbokning är omöjlig: en exclusion-constraint förbjuder överlappande
--   aktiva händelser (pending/confirmed) för samma PT, oavsett vem som skapar dem.
-- * Tillgänglighet anges som regler per veckodag eller för specifika datum
--   (availability_rules). Lediga tider räknas fram i databasen
--   (available_slots), så att klienter aldrig ser andra klienters bokningar.
-- * Klientens bokning valideras mot de lediga tiderna i en trigger.
--
-- Körs efter 20261016000000_v3_food_products_aliases.sql. Befintliga bokningar
-- och lediga tider flyttas över; bookings och trainer_availability tas bort.
-- ============================================================================

create extension if not exists btree_gist;

-- PT:ns tidszon (tillgänglighet anges i lokal tid) och minsta framförhållning för bokningar.
alter table trainers
  add column timezone text not null default 'Europe/Stockholm'
    check (timezone ~ '^[A-Za-z]+(/[A-Za-z_+-]+)+$'),
  add column min_notice_minutes int not null default 120
    check (min_notice_minutes between 0 and 10080);

-- ================================================================ händelser ===
create type event_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
create type event_kind as enum ('session', 'block');
create type session_mode as enum ('onsite', 'remote');

create table calendar_events (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references trainers on delete cascade,
  client_id     uuid references profiles on delete cascade,
  kind          event_kind not null default 'session',
  status        event_status not null default 'pending',
  title         text not null default '' check (char_length(title) <= 120),
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  mode          session_mode not null default 'onsite',
  location      text check (char_length(location) <= 200),
  notes         text check (char_length(notes) <= 1000),
  -- Valfritt kopplat träningspass (klientens schemalagda pass).
  workout_id    uuid references scheduled_workouts on delete set null,
  created_by    uuid references profiles on delete set null default auth.uid(),
  cancelled_by  uuid references profiles on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint valid_range check (
    end_time > start_time
    and end_time - start_time <= case when kind = 'block' then interval '31 days' else interval '12 hours' end
  ),
  -- Blockeringar har ingen klient och behöver ingen bekräftelse.
  constraint block_without_client check (kind = 'session' or client_id is null),
  constraint block_status check (kind = 'session' or status in ('confirmed', 'cancelled')),
  -- Inga överlappande aktiva händelser för samma PT (stoppar dubbelbokning även vid samtidiga förfrågningar).
  constraint no_overlap exclude using gist (
    trainer_id with =,
    tstzrange(start_time, end_time) with &&
  ) where (status in ('pending', 'confirmed'))
);
create index calendar_events_trainer_idx on calendar_events (trainer_id, start_time);
create index calendar_events_client_idx on calendar_events (client_id, start_time);

-- ========================================================= tillgänglighet ===
-- En regel gäller antingen en veckodag (ISO: 1 = måndag … 7 = söndag) eller ett
-- specifikt datum. Finns datumregler för en dag ersätter de veckoreglerna den dagen
-- ("specialtider"). Hela dagar/perioder stängs med en blockering i kalendern.
create table availability_rules (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references trainers on delete cascade,
  weekday       smallint check (weekday between 1 and 7),
  date          date,
  start_local   time not null,
  end_local     time not null,
  slot_minutes  smallint not null default 60 check (slot_minutes between 15 and 240),
  created_at    timestamptz not null default now(),
  constraint weekday_or_date check ((weekday is null) <> (date is null)),
  constraint valid_hours check (end_local > start_local)
);
create index availability_rules_trainer_idx on availability_rules (trainer_id);

-- ================================================================ hjälpare ===
-- Har PT:n (inloggad) en relation med klienten som inte är avslutad?
-- (Även 'pending', så att en ny klients första bokningsförfrågan kan godkännas.)
create or replace function has_relationship_with(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coaching_relationships
    where client_id = p_client and trainer_id = auth.uid() and status <> 'ended'
  );
$$;

-- Får inloggad användare se PT:ns lediga tider? (Publicerad PT, PT:n själv, eller egen PT.)
create or replace function can_view_trainer(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trainers t
    where t.id = p_trainer
      and (t.is_published or t.id = auth.uid() or exists (
        select 1 from coaching_relationships r where r.trainer_id = t.id and r.client_id = auth.uid()
      ))
  );
$$;

/**
 * Lediga bokningsbara tider för en PT inom [p_from, p_to).
 * Räknas fram ur tillgänglighetsreglerna i PT:ns tidszon, minus aktiva
 * händelser (bokningar, egna pass, blockeringar) och minus tider inom PT:ns
 * minsta framförhållning. security definer: klienten får lediga tider utan att
 * kunna läsa andras bokningar. Begränsad till 62 dagar per anrop.
 */
create or replace function available_slots(p_trainer uuid, p_from timestamptz, p_to timestamptz)
returns table (start_time timestamptz, end_time timestamptz)
language sql stable security definer set search_path = public as $$
  with t as (
    select id, timezone, min_notice_minutes
    from trainers
    where id = p_trainer and can_view_trainer(p_trainer)
  ),
  bounds as (
    select t.*,
           greatest(p_from, now() + make_interval(mins => t.min_notice_minutes)) as lo,
           least(p_to, p_from + interval '62 days') as hi
    from t
  ),
  days as (
    select b.*, d::date as day
    from bounds b,
         generate_series((b.lo at time zone b.timezone)::date, (b.hi at time zone b.timezone)::date, interval '1 day') d
    where b.hi > b.lo
  ),
  rules as (
    select days.*, r.start_local, r.end_local, r.slot_minutes
    from days
    join availability_rules r on r.trainer_id = days.id
    where r.date = days.day
       or (r.weekday = extract(isodow from days.day)
           and not exists (select 1 from availability_rules x where x.trainer_id = days.id and x.date = days.day))
  ),
  slots as (
    select (s at time zone rules.timezone) as start_time,
           ((s + make_interval(mins => rules.slot_minutes)) at time zone rules.timezone) as end_time,
           rules.lo, rules.hi, rules.id as trainer_id
    from rules,
         generate_series(rules.day + rules.start_local,
                         rules.day + rules.end_local - make_interval(mins => rules.slot_minutes),
                         make_interval(mins => rules.slot_minutes)) s
  )
  select distinct s.start_time, s.end_time
  from slots s
  where s.start_time >= s.lo
    and s.end_time <= s.hi
    and not exists (
      select 1 from calendar_events e
      where e.trainer_id = s.trainer_id
        and e.status in ('pending', 'confirmed')
        and tstzrange(e.start_time, e.end_time) && tstzrange(s.start_time, s.end_time)
    )
  order by s.start_time;
$$;

-- Första lediga tid per PT inom tre veckor (för PT-sökningen).
create or replace function next_available_slots(p_trainers uuid[])
returns table (trainer_id uuid, start_time timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, s.start_time
  from unnest(p_trainers[1:50]) as t(id)
  cross join lateral (
    select a.start_time from available_slots(t.id, now(), now() + interval '21 days') a limit 1
  ) s;
$$;

revoke all on function available_slots(uuid, timestamptz, timestamptz), next_available_slots(uuid[]) from public, anon;
grant execute on function available_slots(uuid, timestamptz, timestamptz), next_available_slots(uuid[]) to authenticated;

-- ============================================================ validering ===
create or replace function validate_calendar_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_mode coaching_mode;
begin
  new.updated_at := now();

  -- Ett kopplat pass måste tillhöra samma klient.
  if new.workout_id is not null and not exists (
    select 1 from scheduled_workouts w where w.id = new.workout_id and w.client_id is not distinct from new.client_id
  ) then
    raise exception 'Passet tillhör inte klienten' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.trainer_id is distinct from old.trainer_id
       or new.client_id is distinct from old.client_id
       or new.kind is distinct from old.kind
       or new.created_by is distinct from old.created_by then
      raise exception 'PT, klient och typ kan inte ändras på en händelse' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.cancelled_by := v_uid;
    end if;
    -- Klienten får bara avboka.
    if v_uid = old.client_id and v_uid <> old.trainer_id then
      if new.status <> 'cancelled'
         or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time
         or new.title is distinct from old.title or new.mode is distinct from old.mode
         or new.location is distinct from old.location or new.workout_id is distinct from old.workout_id then
        raise exception 'Klienter kan bara avboka' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- INSERT av en klient = bokningsförfrågan: måste vara en ledig tid hos PT:n.
  if v_uid = new.client_id and v_uid <> new.trainer_id then
    if new.kind <> 'session' or new.status <> 'pending' then
      raise exception 'En bokningsförfrågan måste vara ett pass med status pending' using errcode = '42501';
    end if;
    select coaching_mode into v_mode from trainers where id = new.trainer_id;
    if (new.mode = 'remote' and v_mode = 'onsite') or (new.mode = 'onsite' and v_mode = 'remote') then
      raise exception 'PT:n erbjuder inte det träningssättet' using errcode = '23514';
    end if;
    if not exists (
      select 1 from available_slots(new.trainer_id, new.start_time - interval '1 minute', new.end_time + interval '1 minute') s
      where s.start_time = new.start_time and s.end_time = new.end_time
    ) then
      raise exception 'Tiden är inte längre ledig' using errcode = 'P0001';
    end if;
    new.created_by := v_uid;
    -- Första bokningen hos en PT är också en förfrågan om coachning. Då ser PT:n
    -- vem som bokat och kan bekräfta (has_relationship_with kräver en relation).
    insert into coaching_relationships (trainer_id, client_id)
    values (new.trainer_id, v_uid)
    on conflict (trainer_id, client_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger calendar_events_validate
  before insert or update on calendar_events
  for each row execute function validate_calendar_event();

-- ===================================================================== RLS ===
alter table calendar_events enable row level security;
alter table availability_rules enable row level security;

-- PT: allt i sin egen kalender. Pass med klient kräver en relation (även obesvarad).
create policy "events: trainer reads own" on calendar_events for select to authenticated
  using (trainer_id = auth.uid());
create policy "events: trainer writes own" on calendar_events for insert to authenticated
  with check (trainer_id = auth.uid() and (client_id is null or has_relationship_with(client_id)));
create policy "events: trainer updates own" on calendar_events for update to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid() and (client_id is null or has_relationship_with(client_id)));
create policy "events: trainer deletes own" on calendar_events for delete to authenticated
  using (trainer_id = auth.uid());

-- Klient: ser sina egna pass (aldrig PT:ns blockeringar eller andra klienter),
-- skickar förfrågningar och kan avboka. Triggern ovan validerar resten.
create policy "events: client reads own" on calendar_events for select to authenticated
  using (client_id = auth.uid());
create policy "events: client requests" on calendar_events for insert to authenticated
  with check (client_id = auth.uid() and kind = 'session' and status = 'pending' and can_view_trainer(trainer_id));
create policy "events: client cancels" on calendar_events for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid() and status = 'cancelled');

create policy "availability: trainer own" on availability_rules for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

alter publication supabase_realtime add table calendar_events;

-- ============================================= flytt från bookings (v1–v3) ===
-- Lediga tider (enstaka slots) blir datumregler på 60 minuter.
insert into availability_rules (trainer_id, date, start_local, end_local, slot_minutes)
select a.trainer_id,
       (a.slot at time zone t.timezone)::date,
       (a.slot at time zone t.timezone)::time,
       ((a.slot at time zone t.timezone)::time + interval '60 minutes')::time,
       60
from trainer_availability a
join trainers t on t.id = a.trainer_id
where (a.slot at time zone t.timezone)::time < time '23:00';

-- Bokningar blir händelser på 60 minuter. Överlappande aktiva bokningar (borde inte
-- finnas) flyttas över som avbokade i stället för att stoppa migreringen.
do $$
declare
  b record;
begin
  for b in select * from bookings order by created_at loop
    begin
      insert into calendar_events (id, trainer_id, client_id, kind, status, title, start_time, end_time, notes, created_by, created_at)
      values (b.id, b.trainer_id, b.client_id, 'session',
              case b.status when 'requested' then 'pending'::event_status
                            when 'confirmed' then 'confirmed'::event_status
                            else 'cancelled'::event_status end,
              'PT-pass', b.slot, b.slot + interval '60 minutes', b.note, b.client_id, b.created_at);
    exception when exclusion_violation then
      insert into calendar_events (id, trainer_id, client_id, kind, status, title, start_time, end_time, notes, created_by, created_at)
      values (b.id, b.trainer_id, b.client_id, 'session', 'cancelled', 'PT-pass', b.slot, b.slot + interval '60 minutes', b.note, b.client_id, b.created_at);
    end;
  end loop;
end;
$$;

drop table bookings;
drop table trainer_availability;
drop function if exists claim_booking_slot();
drop function if exists release_booking_slot();
drop function if exists guard_booking_update();
drop type booking_status;
