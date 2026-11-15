-- ============================================================================
-- v54: berikningsmotorn i CRM:et – bolagstyp och roll avgörs automatiskt.
--
--   crm_leads
--     company_type          'unknown' | 'ab' | 'enskild_firma' | 'gym_anstalld' |
--                           'influencer' | 'privatperson' (badge + regelverk)
--     company_type_manual   satt för hand – motorn ändrar den aldrig
--     enrichment_status     'pending' | 'running' | 'done' | 'needs_review' | 'failed'
--     enrichment            bevisen och slutsatsen (jsonb). Får ALDRIG innehålla
--                           ett personnummer – databasen spärrar det.
--     enriched_at           senaste körningen
--     verified_at           bekräftat hos Bolagsverket (aktivt aktiebolag)
--   (org_number finns sedan v53 och tar bara aktiebolagets nummer.)
--
-- RLS är oförändrad: crm_leads är bara åtkomlig för administratörer
-- (is_admin()), och berikningen körs med administratörens session eller med
-- service role (schemalagd körning). anon har inga behörigheter.
--
-- Körs efter 20261124000000_v53_crm_conversion.sql. Går att köra flera gånger.
-- ============================================================================

alter table crm_leads add column if not exists company_type text not null default 'unknown';
alter table crm_leads add column if not exists company_type_manual boolean not null default false;
alter table crm_leads add column if not exists enrichment_status text not null default 'pending';
alter table crm_leads add column if not exists enrichment jsonb not null default '{}';
alter table crm_leads add column if not exists enriched_at timestamptz;
alter table crm_leads add column if not exists verified_at timestamptz;

alter table crm_leads drop constraint if exists crm_leads_company_type_check;
alter table crm_leads add constraint crm_leads_company_type_check
  check (company_type in ('unknown', 'ab', 'enskild_firma', 'gym_anstalld', 'influencer', 'privatperson'));
alter table crm_leads drop constraint if exists crm_leads_enrichment_status_check;
alter table crm_leads add constraint crm_leads_enrichment_status_check
  check (enrichment_status in ('pending', 'running', 'done', 'needs_review', 'failed'));
-- Bevisen: ett objekt, rimlig storlek, och inget som ser ut som ett personnummer
-- (ÅÅMMDD-NNNN / ÅÅÅÅMMDD-NNNN där månaden är 01–12).
alter table crm_leads drop constraint if exists crm_leads_enrichment_check;
alter table crm_leads add constraint crm_leads_enrichment_check check (
  jsonb_typeof(enrichment) = 'object'
  and pg_column_size(enrichment) < 16384
  and enrichment::text !~ '(^|[^0-9])((19|20)?[0-9]{2}(0[1-9]|1[0-2])[0-9]{2}[-+][0-9]{4})([^0-9]|$)'
);

-- Befintliga leads: typen följer det som redan är bedömt. En bolagsform som
-- någon har satt (utom gymkedjornas automatiska AB från v53) räknas som manuell.
update crm_leads set company_type = case
    when segment = 'gym_chain' then 'gym_anstalld'
    when company_form = 'ab' then 'ab'
    when company_form = 'enskild' then 'enskild_firma'
    when segment = 'influencer' then 'influencer'
    else 'unknown' end
  where company_type = 'unknown';
update crm_leads set company_type_manual = true, enrichment_status = 'done'
  where company_form <> 'unknown' and segment <> 'gym_chain' and not company_type_manual;

create index if not exists crm_leads_enrichment_pending on crm_leads (updated_at) where enrichment_status in ('pending', 'running');
