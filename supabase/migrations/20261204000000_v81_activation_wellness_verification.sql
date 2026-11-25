-- ============================================================================
-- v81: aktiveringsspärr för PT:er, verifiering av friskvårdsportaler och
-- passets längd.
--
-- 1. Aktiverad PT (trainers.is_pt_activated, publik):
--      Stripe tar emot kort (trainer_payouts_ready) OCH minst ett aktivt paket.
--    Hålls i synk av databasen (triggers på trainer_services och
--    trainer_payout_accounts). En PT som inte är aktiverad:
--      * syns inte i Hitta PT – is_published kan inte vara sant (vakt), och
--        läsregeln för trainers/profiles kräver dessutom is_pt_activated;
--      * kan inte skapa inbjudningskoder och dess koder kan inte lösas in.
--    Publicerade PT:er som tappar aktiveringen döljs (publish_when_ready) och
--    syns igen automatiskt när båda kraven är uppfyllda.
--
-- 2. Friskvårdsportaler (ePassi, Benifex, Edenred):
--      trainers.wellness_verification_status (publik): none | pending | verified | rejected.
--      trainer_wellness_verifications (privat: PT:n själv och admin):
--        wellness_merchant_id, wellness_proof_url (sökväg i bucketen),
--        wellness_attested_at, portalerna som intygas, granskningen.
--    Bucket wellness-verifications (privat): PT:n laddar upp i sin egen mapp
--    {uid}/...; bara PT:n själv och admin kan läsa.
--    Uppgifterna ligger i en egen tabell och inte på trainers, eftersom
--    trainers är läsbar för alla inloggade (marknadsplatsen).
--    Publika badges och filtret i Hitta PT kräver status 'verified'. Slår PT:n
--    på en ny portal efter granskningen måste den verifieras igen.
--
-- 3. scheduled_workouts.duration_seconds: passets längd (0–24 h), sparas när
--    passet avslutas.
--
-- Körs efter 20261203000000_v76_pt_self_signup.sql.
-- ============================================================================

-- ======================================================= 3. passets längd ===
alter table scheduled_workouts add column if not exists duration_seconds int
  check (duration_seconds is null or duration_seconds between 0 and 86400);

-- ============================================================ hjälpare ===
/** Kör en sats som systemet (vakterna släpper igenom) och återställ flaggan efteråt. */
create or replace function v81_system_on() returns text language plpgsql as $$
declare v_old text := coalesce(current_setting('coavira.system', true), '');
begin
  perform set_config('coavira.system', 'on', true);
  return v_old;
end;
$$;
create or replace function v81_system_restore(p_old text) returns void language sql as $$
  select set_config('coavira.system', coalesce(p_old, ''), true);
$$;
revoke all on function v81_system_on() from public, anon, authenticated;
revoke all on function v81_system_restore(text) from public, anon, authenticated;

-- ================================================== 1. aktiverad PT ===
alter table trainers add column if not exists is_pt_activated boolean not null default false;

/** Stripe tar emot kort (eller undantaget demokonto) och minst ett aktivt paket. */
create or replace function pt_activation_state(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select trainer_payouts_ready(p_trainer)
     and exists (select 1 from trainer_services s where s.trainer_id = p_trainer and s.active);
$$;
revoke all on function pt_activation_state(uuid) from public, anon, authenticated;

/**
 * Räknar om aktiveringen. Tappas den döljs profilen (och kommer tillbaka av
 * sig själv); blir PT:n aktiverad publiceras en profil som väntar på det.
 */
create or replace function sync_pt_activation(p_trainer uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_active boolean := pt_activation_state(p_trainer);
  v_old text;
begin
  if p_trainer is null or not exists (select 1 from trainers where id = p_trainer) then
    return false;
  end if;
  v_old := v81_system_on();
  update trainers set is_pt_activated = v_active where id = p_trainer and is_pt_activated is distinct from v_active;
  if v_active then
    -- Väntar profilen på att bli synlig? (Certifikat, Stripe och pris kontrolleras av vakterna.)
    update trainers set is_published = true, publish_when_ready = false
    where id = p_trainer and publish_when_ready and not is_published
      and stripe_onboarding_complete and price_per_session > 0
      and coalesce(array_length(certifications, 1), 0) > 0;
  else
    update trainers set is_published = false, publish_when_ready = true
    where id = p_trainer and is_published;
  end if;
  perform v81_system_restore(v_old);
  return v_active;
end;
$$;
revoke all on function sync_pt_activation(uuid) from public, anon, authenticated;

create or replace function trg_services_sync_activation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform sync_pt_activation(old.trainer_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.trainer_id is distinct from old.trainer_id or new.active is distinct from old.active) then
    perform sync_pt_activation(new.trainer_id);
  end if;
  return null;
end;
$$;
drop trigger if exists trainer_services_activation on trainer_services;
create trigger trainer_services_activation
  after insert or update of active, trainer_id or delete on trainer_services
  for each row execute function trg_services_sync_activation();

create or replace function trg_payouts_sync_activation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_pt_activation(case when tg_op = 'DELETE' then old.trainer_id else new.trainer_id end);
  return null;
end;
$$;
drop trigger if exists trainer_payouts_activation on trainer_payout_accounts;
create trigger trainer_payouts_activation
  after insert or update of charges_enabled, exempt, stripe_account_id or delete on trainer_payout_accounts
  for each row execute function trg_payouts_sync_activation();

/**
 * Vakt: aktiveringen sätts bara av databasen, och en profil kan inte vara synlig
 * i Hitta PT utan den. Försöker systemet publicera hålls profilen dold i stället.
 */
create or replace function guard_pt_activation()
returns trigger language plpgsql as $$
declare
  v_user boolean := auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on';
begin
  if v_user and new.is_pt_activated is distinct from (case when tg_op = 'INSERT' then false else old.is_pt_activated end) then
    raise exception 'Aktiveringen sätts av Coavira (Stripe och minst ett paket)' using errcode = '42501';
  end if;
  if new.is_published and not new.is_pt_activated then
    if v_user then
      raise exception 'Koppla Stripe och skapa minst ett coachingpaket innan profilen kan synas i Hitta PT' using errcode = '42501';
    end if;
    new.is_published := false;
    new.publish_when_ready := true;
  end if;
  return new;
end;
$$;
drop trigger if exists trainers_activation_guard on trainers;
create trigger trainers_activation_guard
  before insert or update on trainers
  for each row execute function guard_pt_activation();

-- Läsregler: publika profiler kräver aktivering (utöver vakten ovan).
drop policy if exists "trainers: read" on trainers;
create policy "trainers: read" on trainers for select to authenticated using (
  (is_published and is_pt_activated)
  or id = auth.uid()
  or exists (select 1 from coaching_relationships r where r.trainer_id = trainers.id and r.client_id = auth.uid())
);
drop policy if exists "profiles: read published trainers" on profiles;
create policy "profiles: read published trainers" on profiles for select to authenticated using (
  exists (select 1 from trainers t where t.id = profiles.id and t.is_published and t.is_pt_activated)
);

/** Marknadsplatsen: bara aktiverade, publicerade PT:er (läsreglerna gäller, security_invoker). */
create or replace view marketplace_trainers with (security_invoker = true) as
  select t.* from trainers t where t.is_published and t.is_pt_activated;
grant select on marketplace_trainers to authenticated;

-- Befintliga PT:er: räkna aktiveringen och dölj de som inte är aktiverade.
do $$
declare r record;
begin
  for r in select id from trainers loop
    perform sync_pt_activation(r.id);
  end loop;
end $$;

/** PT:ns status (checklistan i PT-vyn): Stripe klart, antal aktiva paket, aktiverad. */
create or replace function my_activation_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'stripe_charges_enabled', trainer_payouts_ready(t.id),
    'active_packages_count', (select count(*) from trainer_services s where s.trainer_id = t.id and s.active),
    'is_pt_activated', t.is_pt_activated
  )
  from trainers t where t.id = auth.uid();
$$;
revoke all on function my_activation_status() from public, anon;
grant execute on function my_activation_status() to authenticated;

-- ------------------------------------------- inbjudningar kräver aktivering ---
create or replace function create_pt_invite(p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row pt_invites;
begin
  if v_uid is null or not is_approved_trainer(v_uid) then
    raise exception 'Bara verifierade PT:er kan bjuda in klienter' using errcode = '42501';
  end if;
  if not coalesce((select is_pt_activated from trainers where id = v_uid), false) then
    raise exception 'Koppla Stripe och skapa minst ett coachingpaket innan du bjuder in klienter' using errcode = '42501';
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

/**
 * Inlösen: en kod från en PT som inte (längre) är aktiverad kan inte användas.
 * Kontrollen sker i en vakt på kopplingen, så att redeem_pt_invite (som räknar
 * misslyckade försök) inte behöver skrivas om.
 */
create or replace function guard_invite_activation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_used and not old.is_used
     and not coalesce((select is_pt_activated from trainers where id = new.pt_id), false) then
    raise exception 'PT:n kan inte ta emot nya klienter via kod just nu' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists pt_invites_activation_guard on pt_invites;
create trigger pt_invites_activation_guard
  before update of is_used on pt_invites
  for each row execute function guard_invite_activation();

-- ===================================== 2. verifiering av friskvårdsportaler ===
alter table trainers add column if not exists wellness_verification_status text not null default 'none'
  check (wellness_verification_status in ('none', 'pending', 'verified', 'rejected'));

create table if not exists trainer_wellness_verifications (
  trainer_id            uuid primary key references trainers on delete cascade,
  wellness_merchant_id  text not null check (char_length(btrim(wellness_merchant_id)) between 2 and 120),
  -- Sökväg i bucketen wellness-verifications: {trainer_id}/fil.
  wellness_proof_url    text not null check (char_length(wellness_proof_url) <= 300),
  wellness_attested_at  timestamptz not null,
  portals               text[] not null check (cardinality(portals) between 1 and 3 and portals <@ array['epassi', 'benifex', 'edenred']),
  status                text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  review_note           text check (char_length(review_note) <= 500),
  submitted_at          timestamptz not null default now(),
  reviewed_at           timestamptz,
  reviewed_by           uuid references profiles on delete set null
);
alter table trainer_wellness_verifications enable row level security;
revoke all on trainer_wellness_verifications from anon, authenticated;
grant select on trainer_wellness_verifications to authenticated;
drop policy if exists "wellness verification: own or admin" on trainer_wellness_verifications;
create policy "wellness verification: own or admin" on trainer_wellness_verifications for select to authenticated
  using (trainer_id = auth.uid() or is_admin());

-- Privat bucket för bevisen (skärmdump eller avtalsbekräftelse, högst 10 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wellness-verifications', 'wellness-verifications', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "wellness-verifications: trainer upload" on storage.objects;
create policy "wellness-verifications: trainer upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wellness-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from trainers t where t.id = auth.uid())
  );
drop policy if exists "wellness-verifications: own or admin read" on storage.objects;
create policy "wellness-verifications: own or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'wellness-verifications' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
drop policy if exists "wellness-verifications: own delete" on storage.objects;
create policy "wellness-verifications: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wellness-verifications' and (storage.foldername(name))[1] = auth.uid()::text);

/**
 * Vakt: statusen ändras bara av databasen (inskick och admin). Slår PT:n på en
 * portal som inte ingick i granskningen gäller verifieringen inte längre.
 */
create or replace function guard_wellness_status()
returns trigger language plpgsql as $$
declare
  v_user boolean := auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on';
begin
  if v_user and new.wellness_verification_status is distinct from (case when tg_op = 'INSERT' then 'none' else old.wellness_verification_status end) then
    raise exception 'Friskvårdsportalerna verifieras av Coavira' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.wellness_verification_status in ('pending', 'verified') and (
       (new.accepts_epassi and not old.accepts_epassi)
    or (new.accepts_benifex and not old.accepts_benifex)
    or (new.accepts_edenred and not old.accepts_edenred)) then
    new.wellness_verification_status := 'none';
  end if;
  return new;
end;
$$;
drop trigger if exists trainers_wellness_guard on trainers;
create trigger trainers_wellness_guard
  before insert or update on trainers
  for each row execute function guard_wellness_status();

/**
 * PT:n skickar in verifieringen: leverantörs-ID, bevis (redan uppladdat i den
 * egna mappen) och intygandet. Portalerna är de PT:n har slagit på.
 */
create or replace function submit_wellness_verification(p_merchant_id text, p_proof_path text, p_attested boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  t trainers;
  v_portals text[];
  v_old text;
begin
  select * into t from trainers where id = v_uid;
  if v_uid is null or t.id is null then
    raise exception 'Bara PT:er kan verifiera friskvårdsportaler' using errcode = '42501';
  end if;
  if not coalesce(p_attested, false) then
    raise exception 'Intyga att ditt företag har ett aktivt samarbetsavtal med portalen' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_merchant_id, ''))) not between 2 and 120 then
    raise exception 'Fyll i ditt leverantörs-ID eller namn i portalen' using errcode = '23514';
  end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> v_uid::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'wellness-verifications' and o.name = p_proof_path) then
    raise exception 'Ladda upp en skärmdump eller avtalsbekräftelse' using errcode = '23514';
  end if;
  v_portals := array_remove(array[
    case when t.accepts_epassi then 'epassi' end,
    case when t.accepts_benifex then 'benifex' end,
    case when t.accepts_edenred then 'edenred' end], null);
  if cardinality(v_portals) = 0 then
    raise exception 'Välj minst en portal' using errcode = '23514';
  end if;
  insert into trainer_wellness_verifications (trainer_id, wellness_merchant_id, wellness_proof_url, wellness_attested_at, portals, status, submitted_at)
  values (v_uid, btrim(p_merchant_id), p_proof_path, now(), v_portals, 'pending', now())
  on conflict (trainer_id) do update set
    wellness_merchant_id = excluded.wellness_merchant_id,
    wellness_proof_url = excluded.wellness_proof_url,
    wellness_attested_at = excluded.wellness_attested_at,
    portals = excluded.portals,
    status = 'pending', review_note = null, reviewed_at = null, reviewed_by = null,
    submitted_at = now();
  v_old := v81_system_on();
  update trainers set wellness_verification_status = 'pending' where id = v_uid;
  perform v81_system_restore(v_old);
  return 'pending';
end;
$$;
revoke all on function submit_wellness_verification(text, text, boolean) from public, anon;
grant execute on function submit_wellness_verification(text, text, boolean) to authenticated;

/** Admin: inskickade verifieringar (namn, portaler, bevisets sökväg). */
create or replace function admin_list_wellness_verifications(p_status text default 'pending')
returns table (
  trainer_id uuid, trainer_name text, wellness_merchant_id text, wellness_proof_url text,
  wellness_attested_at timestamptz, portals text[], status text, review_note text,
  submitted_at timestamptz, reviewed_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Bara administratörer' using errcode = '42501';
  end if;
  return query
    select v.trainer_id, p.full_name, v.wellness_merchant_id, v.wellness_proof_url, v.wellness_attested_at,
           v.portals, v.status, v.review_note, v.submitted_at, v.reviewed_at
    from trainer_wellness_verifications v join profiles p on p.id = v.trainer_id
    where p_status = 'all' or v.status = p_status
    order by v.submitted_at desc
    limit 200;
end;
$$;
revoke all on function admin_list_wellness_verifications(text) from public, anon;
grant execute on function admin_list_wellness_verifications(text) to authenticated;

/** Admin: godkänn eller neka med ett klick (nekande kräver ett kort skäl). */
create or replace function admin_review_wellness_verification(p_trainer uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_approve then 'verified' else 'rejected' end;
  v_old text;
begin
  if not is_admin() then
    raise exception 'Bara administratörer' using errcode = '42501';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Skriv ett kort skäl till PT:n' using errcode = '23514';
  end if;
  update trainer_wellness_verifications
     set status = v_status, review_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''), reviewed_at = now(), reviewed_by = auth.uid()
   where trainer_id = p_trainer;
  if not found then
    raise exception 'Ingen verifiering att granska' using errcode = 'P0002';
  end if;
  v_old := v81_system_on();
  update trainers set wellness_verification_status = v_status where id = p_trainer;
  perform v81_system_restore(v_old);
  return v_status;
end;
$$;
revoke all on function admin_review_wellness_verification(uuid, boolean, text) from public, anon;
grant execute on function admin_review_wellness_verification(uuid, boolean, text) to authenticated;
