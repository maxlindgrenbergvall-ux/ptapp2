-- ============================================================================
-- v55: varje utskick granskas och godkänns av en människa innan det skickas.
--
--   crm_email_status  nytt värde 'pending_approval' (väntar på granskning).
--                     Nya mejl – även automatiska uppföljningar – skapas med
--                     det värdet av appen och skickas inte förrän någon
--                     godkänt dem.
--   crm_email_logs    approved_at / approved_by  vem som godkände och när
--                     edited_at                  texten ändrades vid granskningen
--
-- Spärr i databasen (inte bara i appen): ett utskick som är köat, skickas
-- eller har skickats MÅSTE ha approved_at, och kön (crm_claim_due_emails)
-- plockar bara godkända rader.
--
-- Befintliga rader (före v55) räknas som godkända när de skapades, så att
-- historiken och leveranskvittona fortsätter fungera.
--
-- RLS oförändrad: bara administratörer. Körs efter v54. Går att köra flera gånger.
-- ============================================================================

alter type crm_email_status add value if not exists 'pending_approval';

alter table crm_email_logs add column if not exists approved_at timestamptz;
alter table crm_email_logs add column if not exists approved_by uuid references auth.users (id) on delete set null;
alter table crm_email_logs add column if not exists edited_at timestamptz;

update crm_email_logs set approved_at = created_at
 where approved_at is null and status::text in ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed');

alter table crm_email_logs drop constraint if exists crm_email_logs_approved_check;
alter table crm_email_logs add constraint crm_email_logs_approved_check
  check (status::text not in ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained') or approved_at is not null);

create index if not exists crm_email_logs_pending_approval on crm_email_logs (scheduled_at) where approved_at is null;

/** Köns arbetare: bara godkända utskick som är dags (for update skip locked = aldrig två gånger). */
create or replace function crm_claim_due_emails(p_limit int)
returns setof crm_email_logs language sql security definer set search_path = public as $$
  update crm_email_logs set status = 'sending'
  where id in (
    select id from crm_email_logs
    where status = 'queued' and approved_at is not null and scheduled_at <= now()
    order by scheduled_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  returning *;
$$;
revoke all on function crm_claim_due_emails(int) from public, anon, authenticated;
grant execute on function crm_claim_due_emails(int) to service_role;
