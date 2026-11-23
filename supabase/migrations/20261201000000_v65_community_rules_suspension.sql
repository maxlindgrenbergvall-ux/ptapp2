-- v65: Communityregler, rapportering och avstängning av konton.
--
-- 1. Communityregler blir en del av användaravtalet för klienter och PT:er
--    (dokumentet 'community'). Avtalets version höjs till 2026-12, så alla –
--    även befintliga användare – godkänner reglerna innan de gäller dem.
-- 2. Rapportering: en part i en chatt kan rapportera ett meddelande eller en
--    användare hen har en relation med (content_reports). Administratörer hanterar.
-- 3. Avstängning: administratörer kan varna, stänga av (tills vidare eller till ett
--    datum) och häva en avstängning. Varje åtgärd loggas med skäl i account_actions,
--    som användaren själv kan läsa (beslutsmotivering, jfr DSA art. 17).
--    En avstängd användare kan inte skriva i chatten, ladda upp filer, boka, köpa,
--    recensera eller skicka förfrågningar. En avstängd PT avpubliceras och PT:ns
--    tjänster pausas.
-- 4. Bilagor i chatten (bilder, PDF:er och video finns kvar) får en hastighetsgräns:
--    högst 30 bilagor och 10 videor per avsändare och dygn.

-- ------------------------------------------------- 1. communityregler i avtalet ---
alter table legal_acceptances drop constraint if exists legal_acceptances_document_check;
alter table legal_acceptances add constraint legal_acceptances_document_check
  check (document in ('terms', 'privacy', 'pt_agreement', 'gdpr_dpa', 'community'));

create or replace function legal_version()
returns text language sql immutable as $$ select '2026-12' $$;

create or replace function required_documents(p_role user_role)
returns text[] language sql immutable as $$
  select case
    when p_role = 'trainer' then array['terms', 'privacy', 'community', 'pt_agreement', 'gdpr_dpa']
    when p_role = 'client' then array['terms', 'privacy', 'community']
    else array[]::text[]
  end;
$$;

-- ------------------------------------------------------------ 3. avstängning ---
alter table profiles add column if not exists suspended_at timestamptz;
alter table profiles add column if not exists suspended_until timestamptz;
alter table profiles add column if not exists suspension_reason text check (char_length(suspension_reason) <= 500);
-- Kolumnerna ingår inte i användarnas UPDATE-rättigheter (de är kolumnvisa) –
-- bara adminfunktionerna nedan ändrar dem.

/** Är kontot avstängt just nu? (Tillfälliga avstängningar upphör av sig själva.) */
create or replace function is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.suspended_at is not null and (p.suspended_until is null or p.suspended_until > now())
      from profiles p where p.id = p_user
  ), false);
$$;
revoke all on function is_suspended(uuid) from public, anon;
grant execute on function is_suspended(uuid) to authenticated;

create table if not exists account_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  action      text not null check (action in ('warning', 'suspend', 'lift')),
  reason      text not null check (char_length(reason) between 10 and 500),
  until_at    timestamptz,
  report_id   uuid,
  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists account_actions_user_idx on account_actions (user_id, created_at desc);
alter table account_actions enable row level security;
drop policy if exists "account actions: own read" on account_actions;
create policy "account actions: own read" on account_actions for select to authenticated
  using (user_id = auth.uid() or is_admin());
-- Inga skrivpolicies: åtgärder loggas bara av adminfunktionerna.
revoke insert, update, delete on account_actions from anon, authenticated;

-- En avstängd användare kan inte skriva till andra eller köpa (restriktiva policyer
-- läggs ovanpå de befintliga – de begränsar, de ger aldrig mer).
do $$
declare t text;
begin
  foreach t in array array['messages', 'calendar_events', 'coaching_relationships', 'reviews', 'cart_items', 'trainer_services'] loop
    execute format('drop policy if exists "suspension: no insert" on %I', t);
    execute format('create policy "suspension: no insert" on %I as restrictive for insert to authenticated with check (not is_suspended(auth.uid()))', t);
  end loop;
  foreach t in array array['calendar_events', 'trainer_services', 'trainers'] loop
    execute format('drop policy if exists "suspension: no update" on %I', t);
    execute format('create policy "suspension: no update" on %I as restrictive for update to authenticated using (not is_suspended(auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "suspension: no upload" on storage.objects;
create policy "suspension: no upload" on storage.objects as restrictive for insert to authenticated
  with check (not is_suspended(auth.uid()));

-- ----------------------------------------------------------- 2. rapportering ---
create table if not exists content_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null default auth.uid() references profiles on delete cascade,
  reported_user_id  uuid not null references profiles on delete cascade,
  message_id        uuid references messages on delete set null,
  category          text not null check (category in ('sexual', 'harassment', 'hate', 'violence', 'self_harm', 'spam', 'scam', 'other')),
  details           text check (char_length(details) <= 1000),
  status            text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at        timestamptz not null default now(),
  handled_at        timestamptz,
  handled_by        uuid references profiles on delete set null,
  check (reporter_id <> reported_user_id)
);
create index if not exists content_reports_open_idx on content_reports (created_at) where status = 'open';
alter table content_reports enable row level security;

-- Man rapporterar någon man har (eller har haft) en relation med, och ett meddelande
-- bara om man är part i chatten och den rapporterade skrev det.
create or replace function can_report(p_reported uuid, p_message uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and not is_suspended(auth.uid())
    and exists (
      select 1 from coaching_relationships r
       where (r.client_id = auth.uid() and r.trainer_id = p_reported)
          or (r.trainer_id = auth.uid() and r.client_id = p_reported)
    )
    and (
      p_message is null or exists (
        select 1 from messages m
         where m.id = p_message
           and m.sender_id = p_reported
           and (m.client_id = auth.uid() or m.trainer_id = auth.uid())
      )
    );
$$;
revoke all on function can_report(uuid, uuid) from public, anon;
grant execute on function can_report(uuid, uuid) to authenticated;

drop policy if exists "reports: create" on content_reports;
create policy "reports: create" on content_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and handled_at is null and handled_by is null
              and can_report(reported_user_id, message_id));
drop policy if exists "reports: read own or admin" on content_reports;
create policy "reports: read own or admin" on content_reports for select to authenticated
  using (reporter_id = auth.uid() or is_admin());
-- Hanteras bara via admin_resolve_report().
revoke update, delete on content_reports from anon, authenticated;

-- Högst 20 rapporter per dygn och användare (mot missbruk av funktionen).
create or replace function limit_reports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from content_reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Du har skickat många rapporter i dag. Kontakta kontakt@coavira.fit om det är bråttom.' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function limit_reports() from public, anon, authenticated;
drop trigger if exists content_reports_limit on content_reports;
create trigger content_reports_limit before insert on content_reports for each row execute function limit_reports();

-- ------------------------------------------------------ adminfunktionerna ---
create or replace function admin_warn_account(p_user uuid, p_reason text, p_report uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Bara administratörer' using errcode = '42501'; end if;
  insert into account_actions (user_id, action, reason, report_id, created_by)
  values (p_user, 'warning', trim(p_reason), p_report, auth.uid());
end;
$$;

create or replace function admin_suspend_account(p_user uuid, p_reason text, p_until timestamptz default null, p_report uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Bara administratörer' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Du kan inte stänga av ditt eget konto' using errcode = '42501'; end if;
  if p_until is not null and p_until <= now() then raise exception 'Slutdatumet måste ligga i framtiden' using errcode = '23514'; end if;
  update profiles
     set suspended_at = now(), suspended_until = p_until, suspension_reason = trim(p_reason)
   where id = p_user;
  if not found then raise exception 'Kontot finns inte' using errcode = 'P0002'; end if;
  -- En avstängd PT syns inte i Hitta PT och säljer inget.
  update trainers set is_published = false where id = p_user and is_published;
  update trainer_services set active = false where trainer_id = p_user and active;
  insert into account_actions (user_id, action, reason, until_at, report_id, created_by)
  values (p_user, 'suspend', trim(p_reason), p_until, p_report, auth.uid());
end;
$$;

create or replace function admin_lift_suspension(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Bara administratörer' using errcode = '42501'; end if;
  update profiles set suspended_at = null, suspended_until = null, suspension_reason = null where id = p_user;
  insert into account_actions (user_id, action, reason, created_by)
  values (p_user, 'lift', trim(p_reason), auth.uid());
end;
$$;

create or replace function admin_resolve_report(p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Bara administratörer' using errcode = '42501'; end if;
  if p_status not in ('actioned', 'dismissed') then raise exception 'Ogiltig status' using errcode = '23514'; end if;
  update content_reports set status = p_status, handled_at = now(), handled_by = auth.uid() where id = p_report;
end;
$$;

/**
 * Rapporterna för granskning. Administratörer kan inte läsa chattar (RLS) – här
 * visas BARA det rapporterade meddelandet, så att rapporten kan bedömas.
 */
create or replace function admin_list_reports(p_status text default 'open')
returns table (
  id uuid, created_at timestamptz, category text, details text, status text,
  reporter_id uuid, reporter_name text, reported_user_id uuid, reported_name text, reported_role user_role,
  reported_suspended boolean, reported_actions bigint,
  message_body text, message_attachments jsonb, message_sent_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Bara administratörer' using errcode = '42501'; end if;
  return query
  select r.id, r.created_at, r.category, r.details, r.status,
         r.reporter_id, rp.full_name, r.reported_user_id, tp.full_name, tp.role,
         is_suspended(r.reported_user_id),
         (select count(*) from account_actions a where a.user_id = r.reported_user_id),
         m.body, m.attachments, m.sent_at
    from content_reports r
    join profiles rp on rp.id = r.reporter_id
    join profiles tp on tp.id = r.reported_user_id
    left join messages m on m.id = r.message_id
   where p_status = 'all' or r.status = p_status
   order by r.created_at desc
   limit 200;
end;
$$;
revoke all on function admin_list_reports(text) from public, anon;
grant execute on function admin_list_reports(text) to authenticated;

revoke all on function admin_warn_account(uuid, text, uuid) from public, anon;
revoke all on function admin_suspend_account(uuid, text, timestamptz, uuid) from public, anon;
revoke all on function admin_lift_suspension(uuid, text) from public, anon;
revoke all on function admin_resolve_report(uuid, text) from public, anon;
grant execute on function admin_warn_account(uuid, text, uuid) to authenticated;
grant execute on function admin_suspend_account(uuid, text, timestamptz, uuid) to authenticated;
grant execute on function admin_lift_suspension(uuid, text) to authenticated;
grant execute on function admin_resolve_report(uuid, text) to authenticated;

/** Kontots status för appen: avstängning (skäl, till när) och senaste åtgärder. */
create or replace function my_account_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suspended', is_suspended(p.id),
    'suspended_until', p.suspended_until,
    'suspension_reason', case when is_suspended(p.id) then p.suspension_reason end,
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'until', a.until_at, 'at', a.created_at) order by a.created_at desc)
        from (select * from account_actions where user_id = p.id order by created_at desc limit 5) a
    ), '[]')
  )
  from profiles p where p.id = auth.uid();
$$;
revoke all on function my_account_status() from public, anon;
grant execute on function my_account_status() to authenticated;

-- ------------------------------------------- 4. hastighetsgräns för bilagor ---
create or replace function limit_message_attachments()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new int := jsonb_array_length(coalesce(new.attachments, '[]'::jsonb));
  v_videos int := (select count(*) from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) a
                    where coalesce(a->>'kind', '') = 'video' or coalesce(a->>'mime', '') ilike 'video/%');
  v_recent int;
  v_recent_videos int;
begin
  if v_new = 0 then return new; end if;
  select coalesce(sum(jsonb_array_length(m.attachments)), 0),
         coalesce(sum((select count(*) from jsonb_array_elements(m.attachments) a
                         where coalesce(a->>'kind', '') = 'video' or coalesce(a->>'mime', '') ilike 'video/%')), 0)
    into v_recent, v_recent_videos
    from messages m
   where m.sender_id = new.sender_id and m.sent_at > now() - interval '1 day';
  if v_recent + v_new > 30 then
    raise exception 'Du har skickat många bilagor det senaste dygnet. Försök igen senare.' using errcode = '54000';
  end if;
  if v_recent_videos + v_videos > 10 then
    raise exception 'Du har skickat många videor det senaste dygnet. Försök igen senare.' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function limit_message_attachments() from public, anon, authenticated;
drop trigger if exists messages_attachment_limit on messages;
create trigger messages_attachment_limit before insert on messages for each row execute function limit_message_attachments();
