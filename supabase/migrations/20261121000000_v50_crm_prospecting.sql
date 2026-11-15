-- ============================================================================
-- v50: automatisk prospektering i CRM:et.
--
-- Ett jobb söker brett på Instagram (via Apify) i många omgångar och sparar
-- bara konton som klarar kvalitetskraven (riktig PT i Sverige, direkt och
-- verifierad e-postadress, lägsta Lead Score) – tills målet är nått.
--
-- Jobbet sparas här så att det kan fortsätta över tid: varje steg tas när
-- någon har CRM:et öppet eller när det schemalagda anropet (/api/crm/queue)
-- körs. locked_until hindrar att två steg körs samtidigt.
--
-- Körs efter 20261120000000_v49_crm_instagram.sql.
-- ============================================================================
create table if not exists crm_prospect_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  status text not null default 'running' check (status in ('running', 'done', 'exhausted', 'stopped', 'failed')),
  config jsonb not null,
  state jsonb not null,
  error text,
  locked_until timestamptz
);
create index if not exists crm_prospect_jobs_running on crm_prospect_jobs (created_at desc) where status = 'running';

alter table crm_prospect_jobs enable row level security;
drop policy if exists crm_prospect_jobs_admin on crm_prospect_jobs;
create policy crm_prospect_jobs_admin on crm_prospect_jobs for all to authenticated using (is_admin()) with check (is_admin());
revoke all on crm_prospect_jobs from anon;
