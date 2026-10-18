-- ============================================================================
-- Coavira v10: synka passen till Google Calendar, Outlook och Apple Kalender.
--
-- * Varje användare kan skapa en hemlig prenumerationslänk (iCal/.ics).
--   Kalenderappen hämtar länken regelbundet; ingen inloggning behövs, så
--   länken är hemlig (≈ 240 bitar slump) och kan när som helst bytas ut.
-- * calendar_feed(token) är security definer och returnerar bara det som
--   behövs i en kalender: tid, rubrik, plats och status. Anteckningar och
--   hälsodata följer aldrig med.
--   - PT: egna pass (med klientens namn), egna pass utan klient och blockeringar.
--   - Klient: egna bokade och preliminära pass med PT:ns namn.
--   Avbokade pass skickas som STATUS:CANCELLED i 30 dagar så att de försvinner
--   ur kalenderappen.
--
-- Körs efter 20261022000000_v9_swedish_food_products.sql.
-- ============================================================================

create table calendar_feeds (
  user_id     uuid primary key references profiles on delete cascade,
  token       text not null unique
              default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
              check (token ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now()
);

alter table calendar_feeds enable row level security;
create policy "calendar_feeds: read own" on calendar_feeds for select to authenticated
  using (user_id = auth.uid());
-- Skapas och byts bara via calendar_feed_token().
revoke insert, update, delete on calendar_feeds from authenticated;
revoke all on calendar_feeds from anon;

/** Hämta (eller skapa) min kalenderlänk. p_rotate = true gör den gamla länken ogiltig. */
create or replace function calendar_feed_token(p_rotate boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  if p_rotate then
    delete from calendar_feeds where user_id = v_uid;
  end if;
  insert into calendar_feeds (user_id) values (v_uid) on conflict (user_id) do nothing;
  select token into v_token from calendar_feeds where user_id = v_uid;
  return v_token;
end;
$$;
revoke all on function calendar_feed_token(boolean) from public, anon;
grant execute on function calendar_feed_token(boolean) to authenticated;

/** Kalenderhändelser för en prenumerationslänk (anropas av servern utan inloggning). */
create or replace function calendar_feed(p_token text)
returns table (
  id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  status event_status,
  kind event_kind,
  mode session_mode,
  location text,
  counterpart text,
  owner_name text,
  owner_role user_role,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with f as (
    select c.user_id, p.role, p.full_name
    from calendar_feeds c
    join profiles p on p.id = c.user_id
    where p_token ~ '^[0-9a-f]{64}$' and c.token = p_token
  )
  select e.id,
         e.title,
         e.start_time,
         e.end_time,
         e.status,
         e.kind,
         e.mode,
         e.location,
         case when f.role = 'trainer' then cp.full_name else tp.full_name end,
         f.full_name,
         f.role,
         e.updated_at
  from f
  join calendar_events e
    on (f.role = 'trainer' and e.trainer_id = f.user_id)
    or (f.role = 'client' and e.client_id = f.user_id and e.kind = 'session')
  left join profiles cp on cp.id = e.client_id
  left join profiles tp on tp.id = e.trainer_id
  where e.end_time >= now() - interval '30 days'
    and e.start_time <= now() + interval '365 days'
    and (e.status <> 'cancelled' or e.updated_at >= now() - interval '30 days')
  order by e.start_time
  limit 2000;
$$;
revoke all on function calendar_feed(text) from public;
grant execute on function calendar_feed(text) to anon, authenticated;
