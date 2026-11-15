-- ============================================================================
-- v47: internt CRM för B2B-prospektering (/admin/leads).
--
-- Tabeller:  crm_leads, crm_notes, crm_email_logs  (+ crm_email_templates för
--            redigerbara mallar och crm_suppressions för avregistrerade adresser)
-- Behörighet: app_admins + is_admin(). ALLT i CRM:et är stängt för alla utom
--            administratörer (RLS på varje tabell). Klienter och PT:er ser
--            ingenting, och anon har inga behörigheter alls (v44).
--
-- Bli administratör (körs i SQL-editorn / med service role – aldrig från appen):
--   select admin_grant('du@coavira.fit');
--   select admin_revoke('du@coavira.fit');
--
-- Dubbletter stoppas av databasen: samma e-postadress, samma Instagram-konto
-- eller samma webbadress kan bara finnas en gång (unika index på normaliserade
-- nycklar). Appen fångar felet och visar den befintliga leaden.
--
-- Avregistrering: crm_suppressions lagrar en SHA-256 av adressen (inte adressen
-- själv), så att en avregistrerad adress aldrig kan importeras och mejlas igen –
-- även om leaden raderas.
--
-- Körs efter 20261118000000_v44_security_hardening.sql.
-- ============================================================================

-- ------------------------------------------------------ administratörer ---
create table if not exists app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app_admins enable row level security;
-- Inga policies: tabellen läses bara via is_admin() och ändras bara av servern.
revoke all on app_admins from anon, authenticated;

/** Är den inloggade användaren administratör? Används av alla CRM-policyer. */
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

/** Admin (SQL-editorn): ge ett konto administratörsbehörighet.  select admin_grant('du@coavira.fit'); */
create or replace function admin_grant(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'Inget konto med e-postadressen %', p_email; end if;
  insert into app_admins (user_id) values (v_id) on conflict do nothing;
  return 'Administratör: ' || p_email;
end;
$$;
revoke all on function admin_grant(text) from public, anon, authenticated;

create or replace function admin_revoke(p_email text)
returns text language plpgsql security definer set search_path = public as $$
begin
  delete from app_admins where user_id = (select id from auth.users where lower(email) = lower(trim(p_email)));
  return 'Inte längre administratör: ' || p_email;
end;
$$;
revoke all on function admin_revoke(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- typer ---
do $$ begin
  create type crm_segment as enum ('freelance', 'influencer', 'gym_chain');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_status as enum ('new', 'qualified', 'emailed', 'replied', 'customer', 'not_relevant');
exception when duplicate_object then null; end $$;
do $$ begin
  -- Varför vi får mejla: företagsadress (juridisk person), samtycke, eller inte bedömt än.
  create type crm_legal_basis as enum ('unknown', 'company', 'consent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_email_status as enum ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- leads ---
create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,

  name text not null check (char_length(name) between 1 and 160),
  title text check (char_length(title) <= 160),
  segment crm_segment not null default 'freelance',
  status crm_status not null default 'new',

  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- MX-kontroll: null = inte kontrollerad, true = domänen tar emot e-post, false = gör det inte.
  email_verified boolean,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  website_url text check (website_url is null or (char_length(website_url) <= 500 and website_url ~* '^https?://')),
  gym text check (char_length(gym) <= 120),
  city text check (char_length(city) <= 80),
  specialties text[] not null default '{}' check (cardinality(specialties) <= 12),

  -- Var uppgifterna kommer ifrån (GDPR art. 14: ska kunna anges för den registrerade).
  source text not null default 'manual' check (source in ('manual', 'csv', 'url', 'search')),
  source_url text check (source_url is null or char_length(source_url) <= 500),

  score int not null default 0 check (score between 0 and 100),
  score_breakdown jsonb not null default '[]',

  legal_basis crm_legal_basis not null default 'unknown',
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  last_emailed_at timestamptz,
  status_changed_at timestamptz not null default now(),

  -- Normaliserade nycklar för dubblettskyddet.
  email_key text generated always as (lower(email)) stored,
  instagram_key text generated always as (lower(instagram)) stored,
  website_key text generated always as (
    -- utan protokoll och www, utan frågesträng/ankare, utan avslutande snedstreck
    nullif(regexp_replace(regexp_replace(regexp_replace(lower(website_url), '^https?://(www\.)?', ''), '[?#].*$', ''), '/+$', ''), '')
  ) stored
);

create unique index if not exists crm_leads_email_key on crm_leads (email_key) where email_key is not null;
create unique index if not exists crm_leads_instagram_key on crm_leads (instagram_key) where instagram_key is not null;
create unique index if not exists crm_leads_website_key on crm_leads (website_key) where website_key is not null;
create unique index if not exists crm_leads_unsubscribe_token on crm_leads (unsubscribe_token);
create index if not exists crm_leads_status on crm_leads (status, score desc);

/** updated_at och status_changed_at sköts av databasen. */
create or replace function crm_touch_lead()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists crm_leads_touch on crm_leads;
create trigger crm_leads_touch before update on crm_leads for each row execute function crm_touch_lead();

alter table crm_leads enable row level security;
drop policy if exists crm_leads_admin on crm_leads;
create policy crm_leads_admin on crm_leads for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------- anteckningar ---
create table if not exists crm_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists crm_notes_lead on crm_notes (lead_id, created_at desc);
alter table crm_notes enable row level security;
drop policy if exists crm_notes_admin on crm_notes;
create policy crm_notes_admin on crm_notes for all to authenticated using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------- mallar ---
create table if not exists crm_email_templates (
  id uuid primary key default gen_random_uuid(),
  -- null = mallen passar alla segment.
  segment crm_segment,
  name text not null check (char_length(name) between 1 and 120),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  updated_at timestamptz not null default now()
);
alter table crm_email_templates enable row level security;
drop policy if exists crm_email_templates_admin on crm_email_templates;
create policy crm_email_templates_admin on crm_email_templates for all to authenticated using (is_admin()) with check (is_admin());

-- -------------------------------------------------------------- utskick ---
create table if not exists crm_email_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads (id) on delete cascade,
  template_id uuid references crm_email_templates (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  to_email text not null,
  subject text not null,
  body text not null,

  status crm_email_status not null default 'queued',
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  delivered_at timestamptz,
  resend_id text,
  error text
);
create index if not exists crm_email_logs_due on crm_email_logs (scheduled_at) where status = 'queued';
create index if not exists crm_email_logs_lead on crm_email_logs (lead_id, created_at desc);
create unique index if not exists crm_email_logs_resend_id on crm_email_logs (resend_id) where resend_id is not null;
alter table crm_email_logs enable row level security;
drop policy if exists crm_email_logs_admin on crm_email_logs;
create policy crm_email_logs_admin on crm_email_logs for all to authenticated using (is_admin()) with check (is_admin());

-- ------------------------------------------------------ avregistrerade ---
create table if not exists crm_suppressions (
  -- SHA-256 (hex) av den normaliserade adressen – inte adressen själv.
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null default 'unsubscribed' check (reason in ('unsubscribed', 'bounced', 'complained', 'manual')),
  created_at timestamptz not null default now()
);
alter table crm_suppressions enable row level security;
drop policy if exists crm_suppressions_admin on crm_suppressions;
create policy crm_suppressions_admin on crm_suppressions for all to authenticated using (is_admin()) with check (is_admin());

-- anon har inga behörigheter (v44 tar bort dem även för nya tabeller) – säkra ändå.
revoke all on crm_leads, crm_notes, crm_email_templates, crm_email_logs, crm_suppressions from anon;

/**
 * Köns arbetare (server, service role): hämta och lås upp till p_limit utskick
 * som är dags att skicka. "for update skip locked" gör att två samtidiga
 * körningar aldrig tar samma rad – inget mejl skickas två gånger.
 */
create or replace function crm_claim_due_emails(p_limit int)
returns setof crm_email_logs language sql security definer set search_path = public as $$
  update crm_email_logs set status = 'sending'
  where id in (
    select id from crm_email_logs
    where status = 'queued' and scheduled_at <= now()
    order by scheduled_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  returning *;
$$;
revoke all on function crm_claim_due_emails(int) from public, anon, authenticated;
grant execute on function crm_claim_due_emails(int) to service_role;
