-- ============================================================================
-- Coavira v5: ombokning av preliminära pass, aviseringar och PT-erbjudanden.
--
-- * Preliminära pass (status pending) kan flyttas. calendar_events.awaiting
--   anger vem som ska svara: 'trainer' (klientens förfrågan) eller 'client'
--   (PT:n har föreslagit/flyttat en tid). Den som flyttar sätter alltid bollen
--   hos motparten. Tiden före senaste flytt sparas i previous_start/previous_end.
-- * Klienten kan nu acceptera en föreslagen tid (pending → confirmed när
--   awaiting = 'client') och föreslå en ny tid (bara lediga tider).
--   Bekräftade pass flyttas inte genom ombokningsflödet.
-- * notifications: aviseringar till motparten när ett pass avbokas, flyttas,
--   bekräftas m.m. Skapas ENBART av en trigger (security definer), så ingen kan
--   skicka aviseringar i någon annans namn. Mottagaren kan bara läsa, markera
--   som läst och ta bort sina egna.
-- * trainer_offers: erbjudanden som PT:n publicerar per kategori. Vilka som visas
--   för en klient avgörs i appen utifrån klientens intressen, som sparas lokalt
--   på enheten (ingen beteendeprofil i databasen).
--
-- Körs efter 20261017000000_v4_calendar.sql.
-- ============================================================================

-- ====================================================== ombokningsflödet ===
create type event_party as enum ('trainer', 'client');

alter table calendar_events
  add column awaiting       event_party,
  add column previous_start timestamptz,
  add column previous_end   timestamptz;

-- Befintliga förfrågningar: den som skapade dem väntar på motparten.
update calendar_events
set awaiting = case when created_by = client_id then 'trainer'::event_party else 'client'::event_party end
where status = 'pending';

alter table calendar_events
  -- Ett preliminärt pass har alltid en klient och någon som ska svara.
  add constraint pending_needs_party check (status <> 'pending' or (client_id is not null and awaiting is not null)),
  add constraint awaiting_only_pending check (status = 'pending' or awaiting is null);

/**
 * Lediga tider som available_slots, men där en viss händelse inte räknas som
 * upptagen. Används när en klient föreslår en ny tid för sitt eget preliminära
 * pass (den nya tiden får överlappa den gamla). Endast för triggers.
 */
create or replace function available_slots_ignoring(p_trainer uuid, p_from timestamptz, p_to timestamptz, p_ignore uuid)
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
        and e.id is distinct from p_ignore
        and tstzrange(e.start_time, e.end_time) && tstzrange(s.start_time, s.end_time)
    )
  order by s.start_time;
$$;
revoke all on function available_slots_ignoring(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- available_slots är samma beräkning utan undantag (en källa till sanning).
create or replace function available_slots(p_trainer uuid, p_from timestamptz, p_to timestamptz)
returns table (start_time timestamptz, end_time timestamptz)
language sql stable security definer set search_path = public as $$
  select * from available_slots_ignoring(p_trainer, p_from, p_to, null);
$$;

create or replace function validate_calendar_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_mode coaching_mode;
  v_is_client boolean;
  v_moved boolean;
begin
  new.updated_at := now();

  -- Ett kopplat pass måste tillhöra samma klient.
  if new.workout_id is not null and not exists (
    select 1 from scheduled_workouts w where w.id = new.workout_id and w.client_id is not distinct from new.client_id
  ) then
    raise exception 'Passet tillhör inte klienten' using errcode = '23514';
  end if;

  v_is_client := v_uid is not null and v_uid = new.client_id and v_uid <> new.trainer_id;

  if tg_op = 'UPDATE' then
    if new.trainer_id is distinct from old.trainer_id
       or new.client_id is distinct from old.client_id
       or new.kind is distinct from old.kind
       or new.created_by is distinct from old.created_by then
      raise exception 'PT, klient och typ kan inte ändras på en händelse' using errcode = '42501';
    end if;
    -- Spårningsfälten sätts bara här.
    new.previous_start := old.previous_start;
    new.previous_end := old.previous_end;
    new.awaiting := case when new.status = 'pending' then old.awaiting end;

    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.cancelled_by := v_uid;
    end if;

    v_moved := new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time;

    if v_is_client then
      -- Klienten får aldrig ändra innehållet i passet.
      if new.title is distinct from old.title or new.mode is distinct from old.mode
         or new.location is distinct from old.location or new.workout_id is distinct from old.workout_id then
        raise exception 'Klienter kan inte ändra passets innehåll' using errcode = '42501';
      end if;
      if new.status = 'cancelled' then
        if v_moved then
          raise exception 'Avboka och flytta samtidigt går inte' using errcode = '42501';
        end if;
      elsif new.status = 'confirmed' then
        -- Acceptera PT:ns föreslagna tid.
        if old.status <> 'pending' or old.awaiting <> 'client' or v_moved then
          raise exception 'Klienten kan bara acceptera en tid som PT:n föreslagit' using errcode = '42501';
        end if;
      elsif new.status = 'pending' then
        -- Föreslå en ny tid: bara för preliminära pass och bara lediga tider.
        if old.status <> 'pending' or not v_moved then
          raise exception 'Klienter kan bara föreslå ny tid för preliminära pass' using errcode = '42501';
        end if;
        if not exists (
          select 1 from available_slots_ignoring(new.trainer_id, new.start_time - interval '1 minute', new.end_time + interval '1 minute', old.id) s
          where s.start_time = new.start_time and s.end_time = new.end_time
        ) then
          raise exception 'Tiden är inte ledig' using errcode = 'P0001';
        end if;
      else
        raise exception 'Klienter kan inte sätta den statusen' using errcode = '42501';
      end if;
    end if;

    -- Flytt av ett preliminärt pass: bollen går till motparten.
    if v_moved and new.status = 'pending' and old.status = 'pending' then
      new.previous_start := old.start_time;
      new.previous_end := old.end_time;
      new.awaiting := case when v_is_client then 'trainer'::event_party else 'client'::event_party end;
    elsif v_moved and new.status = 'confirmed' then
      new.previous_start := old.start_time;
      new.previous_end := old.end_time;
    end if;
    -- PT som bekräftar sin egen förfrågan direkt (t.ex. överens per telefon) är ok.
    return new;
  end if;

  -- INSERT
  new.previous_start := null;
  new.previous_end := null;
  if v_is_client then
    -- Bokningsförfrågan: måste vara en ledig tid hos PT:n.
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
    new.awaiting := 'trainer';
    -- Första bokningen hos en PT är också en förfrågan om coachning.
    insert into coaching_relationships (trainer_id, client_id)
    values (new.trainer_id, v_uid)
    on conflict (trainer_id, client_id) do nothing;
  else
    -- PT:ns preliminära pass väntar på klienten.
    new.awaiting := case when new.status = 'pending' then 'client'::event_party end;
  end if;
  return new;
end;
$$;

-- Klienten får nu även acceptera och föreslå ny tid (triggern ovan avgör detaljerna).
drop policy "events: client cancels" on calendar_events;
create policy "events: client responds" on calendar_events for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid() and kind = 'session' and status in ('pending', 'confirmed', 'cancelled'));

-- ============================================================ aviseringar ===
create type notification_kind as enum (
  'booking_requested',   -- klient → PT: ny bokningsförfrågan
  'booking_proposed',    -- PT → klient: preliminärt pass att bekräfta
  'booking_confirmed',   -- PT → klient: passet är bekräftat
  'booking_declined',    -- PT → klient: förfrågan nekad
  'event_cancelled',     -- motparten har avbokat
  'event_rescheduled',   -- motparten har flyttat passet / föreslagit ny tid
  'reschedule_accepted'  -- klient → PT: klienten accepterade den nya tiden
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  actor_id    uuid references profiles on delete set null,
  kind        notification_kind not null,
  event_id    uuid references calendar_events on delete cascade,
  -- Ögonblicksbild för texten: tider, titel och avsändarens namn (ingen hälsodata).
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;
create policy "notifications: read own" on notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications: mark own read" on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: delete own" on notifications for delete to authenticated
  using (user_id = auth.uid());
-- Inga insert-policyer: bara triggern nedan skapar aviseringar. Bara read_at går att ändra.
revoke insert, update on notifications from authenticated, anon;
grant update (read_at) on notifications to authenticated;

/**
 * Skapar en avisering till motparten när ett pass med klient ändras.
 * Samma regler finns i appen för demoläget (src/lib/notifications/rules.ts).
 */
create or replace function notify_calendar_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_to uuid;
  v_kind notification_kind;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
begin
  if new.kind <> 'session' or new.client_id is null or v_actor is null
     or v_actor not in (new.trainer_id, new.client_id) then
    return null;
  end if;
  v_to := case when v_actor = new.trainer_id then new.client_id else new.trainer_id end;

  if tg_op = 'INSERT' then
    v_kind := case
      when new.status = 'pending' and v_actor = new.client_id then 'booking_requested'
      when new.status = 'pending' then 'booking_proposed'
      when new.status = 'confirmed' then 'booking_confirmed'
    end;
  else
    v_prev_start := old.start_time;
    v_prev_end := old.end_time;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      v_kind := case
        when old.status = 'pending' and old.awaiting = 'trainer' and v_actor = new.trainer_id then 'booking_declined'
        else 'event_cancelled'
      end;
    elsif new.status = 'confirmed' and old.status = 'pending' then
      v_kind := case when v_actor = new.client_id then 'reschedule_accepted' else 'booking_confirmed' end;
    elsif new.status in ('pending', 'confirmed')
          and (new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time) then
      v_kind := 'event_rescheduled';
    end if;
  end if;

  if v_kind is null then
    return null;
  end if;

  insert into notifications (user_id, actor_id, kind, event_id, payload)
  values (v_to, v_actor, v_kind, new.id, jsonb_strip_nulls(jsonb_build_object(
    'actor_name', (select full_name from profiles where id = v_actor),
    'title', new.title,
    'start', new.start_time,
    'end', new.end_time,
    'previous_start', case when v_kind = 'event_rescheduled' then v_prev_start end,
    'previous_end', case when v_kind = 'event_rescheduled' then v_prev_end end,
    'status', new.status
  )));
  return null;
end;
$$;

create trigger calendar_events_notify
  after insert or update on calendar_events
  for each row execute function notify_calendar_change();

alter publication supabase_realtime add table notifications;

-- ========================================================= PT-erbjudanden ===
create table trainer_offers (
  id               uuid primary key default gen_random_uuid(),
  trainer_id       uuid not null references trainers on delete cascade,
  category         specialty not null,
  title            text not null check (char_length(title) between 3 and 80),
  description      text not null default '' check (char_length(description) <= 280),
  price_sek        int check (price_sek between 0 and 100000),
  discount_percent smallint check (discount_percent between 1 and 100),
  valid_until      date,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index trainer_offers_category_idx on trainer_offers (category) where active;

alter table trainer_offers enable row level security;
-- PT:n hanterar sina egna erbjudanden. Kategorin måste vara en av PT:ns specialiteter.
create policy "offers: trainer own" on trainer_offers for all to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid() and exists (
    select 1 from trainers t where t.id = auth.uid() and category = any (t.specialties)
  ));
-- Inloggade ser aktiva, giltiga erbjudanden från publicerade PT:er.
create policy "offers: read active" on trainer_offers for select to authenticated
  using (active and (valid_until is null or valid_until >= current_date) and exists (
    select 1 from trainers t where t.id = trainer_id and t.is_published
  ));

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trainer_offers_touch before update on trainer_offers
  for each row execute function touch_updated_at();
