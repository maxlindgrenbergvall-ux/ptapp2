-- ============================================================================
-- v53: CRM:et byggt för konvertering – bolagsform, aktiviteter, uppföljningar,
-- bokade samtal och konverterade PT:er.
--
--   crm_leads
--     company_form       'unknown' | 'ab' | 'enskild'. Avgör vilka utskick som
--                        är tillåtna (marknadsföringslagen 19 §: en enskild
--                        näringsidkare räknas som fysisk person).
--     org_number         Bara aktiebolagets organisationsnummer (5xxxxx-xxxx).
--                        En enskild firmas "organisationsnummer" är ägarens
--                        personnummer – det får aldrig sparas här.
--     preferred_channel  'email' | 'instagram' | 'phone'.
--     next_action_at/_note  egen påminnelse ("ring torsdag").
--     last_contacted_at  senaste kontakt i någon kanal (mejl, DM, samtal).
--     meeting_at         bokat samtal.
--     converted_user_id / converted_at  leaden har blivit en registrerad PT.
--   crm_status        nytt steg 'meeting' (Samtal bokat).
--   crm_legal_basis   nytt värde 'research': icke-säljande förfrågan
--                     (referensgrupp) till enskild firma – bara mallar av typen
--                     'research' får användas.
--   crm_email_templates  template_key (startmallar), kind ('intro'|'research'),
--                     company_form (vilken bolagsform mallen är till för),
--                     uppföljning (followup_days/_subject/_body), archived.
--   crm_email_logs    step (1 = första mejlet, 2 = uppföljning), parent_id,
--                     opened_at/open_count (bara om öppningsspårning slagits på
--                     i Resend – avstängt som standard, se README).
--   crm_activities    DM, svar, bokade och genomförda samtal, konvertering.
--   crm_sync_conversions()  matchar leads mot registrerade PT-konton (e-post).
--
-- RLS: varje tabell är bara åtkomlig för administratörer (is_admin()), anon
-- har inga behörigheter. Körs efter 20261123000000_v52_remove_strava.sql.
-- ============================================================================

do $$ begin
  create type crm_company_form as enum ('unknown', 'ab', 'enskild');
exception when duplicate_object then null; end $$;
alter type crm_status add value if not exists 'meeting' after 'replied';
alter type crm_legal_basis add value if not exists 'research';

-- ---------------------------------------------------------------- leads ---
alter table crm_leads add column if not exists company_form crm_company_form not null default 'unknown';
alter table crm_leads add column if not exists org_number text;
alter table crm_leads add column if not exists preferred_channel text not null default 'email';
alter table crm_leads add column if not exists next_action_at timestamptz;
alter table crm_leads add column if not exists next_action_note text;
alter table crm_leads add column if not exists last_contacted_at timestamptz;
alter table crm_leads add column if not exists meeting_at timestamptz;
alter table crm_leads add column if not exists converted_user_id uuid references auth.users (id) on delete set null;
alter table crm_leads add column if not exists converted_at timestamptz;

alter table crm_leads drop constraint if exists crm_leads_org_number_check;
alter table crm_leads add constraint crm_leads_org_number_check
  check (org_number is null or (company_form = 'ab' and org_number ~ '^5[0-9]{5}-[0-9]{4}$'));
alter table crm_leads drop constraint if exists crm_leads_preferred_channel_check;
alter table crm_leads add constraint crm_leads_preferred_channel_check check (preferred_channel in ('email', 'instagram', 'phone'));
alter table crm_leads drop constraint if exists crm_leads_next_action_note_check;
alter table crm_leads add constraint crm_leads_next_action_note_check check (next_action_note is null or char_length(next_action_note) <= 200);

-- PT:er på gymkedjor mejlas på arbetsgivarens (bolagets) adress.
update crm_leads set company_form = 'ab' where segment = 'gym_chain' and company_form = 'unknown';
-- Tidigare utskick räknas som kontakt.
update crm_leads set last_contacted_at = last_emailed_at where last_contacted_at is null and last_emailed_at is not null;

create index if not exists crm_leads_next_action on crm_leads (next_action_at) where next_action_at is not null;

-- ------------------------------------------------------------- mallar ---
alter table crm_email_templates add column if not exists template_key text;
alter table crm_email_templates add column if not exists kind text not null default 'intro';
alter table crm_email_templates add column if not exists company_form crm_company_form;
alter table crm_email_templates add column if not exists followup_days int;
alter table crm_email_templates add column if not exists followup_subject text;
alter table crm_email_templates add column if not exists followup_body text;
alter table crm_email_templates add column if not exists archived boolean not null default false;

create unique index if not exists crm_email_templates_key on crm_email_templates (template_key) where template_key is not null;
alter table crm_email_templates drop constraint if exists crm_email_templates_kind_check;
alter table crm_email_templates add constraint crm_email_templates_kind_check check (kind in ('intro', 'research'));
alter table crm_email_templates drop constraint if exists crm_email_templates_followup_check;
alter table crm_email_templates add constraint crm_email_templates_followup_check check (
  (followup_days is null and followup_body is null)
  or (followup_days between 2 and 14 and coalesce(char_length(followup_body), 0) between 1 and 4000 and char_length(coalesce(followup_subject, '')) <= 200)
);

-- ----------------------------------------------------------- utskick ---
alter table crm_email_logs add column if not exists step smallint not null default 1;
alter table crm_email_logs add column if not exists parent_id uuid references crm_email_logs (id) on delete cascade;
alter table crm_email_logs add column if not exists opened_at timestamptz;
alter table crm_email_logs add column if not exists open_count int not null default 0;
alter table crm_email_logs drop constraint if exists crm_email_logs_step_check;
alter table crm_email_logs add constraint crm_email_logs_step_check check (
  (step = 1 and parent_id is null) or (step = 2 and parent_id is not null)
);
-- Högst en uppföljning per mejl.
create unique index if not exists crm_email_logs_one_followup on crm_email_logs (parent_id) where parent_id is not null;

-- -------------------------------------------------------- aktiviteter ---
create table if not exists crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads (id) on delete cascade,
  kind text not null check (kind in ('dm_sent', 'dm_reply', 'email_reply', 'call_booked', 'call_held', 'no_show', 'converted')),
  body text check (body is null or char_length(body) <= 2000),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_lead on crm_activities (lead_id, occurred_at desc);
create index if not exists crm_activities_time on crm_activities (occurred_at desc);
alter table crm_activities enable row level security;
drop policy if exists crm_activities_admin on crm_activities;
create policy crm_activities_admin on crm_activities for all to authenticated using (is_admin()) with check (is_admin());
revoke all on crm_activities from anon;

-- -------------------------------------------------- konverterade PT:er ---
/**
 * Leads vars e-postadress tillhör ett registrerat PT-konto markeras som
 * konverterade (status Onboarding / kund) – en gång. Bara administratörer.
 * Returnerar antalet nya konverteringar.
 */
create or replace function crm_sync_conversions()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then
    raise exception 'Bara administratörer' using errcode = '42501';
  end if;
  with hits as (
    select l.id as lead_id, u.id as user_id
      from crm_leads l
      join auth.users u on lower(u.email) = l.email_key
      join trainers t on t.id = u.id
     where l.converted_user_id is null
  ), done as (
    update crm_leads l
       set converted_user_id = h.user_id,
           converted_at = now(),
           status = 'customer'
      from hits h
     where l.id = h.lead_id
    returning l.id, l.converted_at
  )
  insert into crm_activities (lead_id, kind, body, occurred_at)
  select id, 'converted', 'Registrerade ett PT-konto', converted_at from done;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function crm_sync_conversions() from public, anon;
grant execute on function crm_sync_conversions() to authenticated;
