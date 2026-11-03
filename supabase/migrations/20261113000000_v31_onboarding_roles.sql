-- ============================================================================
-- v31: nytt intro-flöde för alla – tvingad utloggning, steg 1 (förnamn,
-- efternamn, profilbild) och rollbaserade steg:
--   Klient: steg 1 → mål och kostplan (client_goals, v30)
--   PT:     steg 1 → Stripe Connect (v22) → villkor och avtal
--
-- * profiles.onboarding_completed (+ _at): false tills intro-flödet är klart.
--   Speglas i JWT:n (app_metadata.onboarding_completed) av en trigger, så att
--   proxy.ts kan styra navigeringen utan databasanrop. Användaren kan inte
--   sätta flaggan själv – bara finish_onboarding() efter att alla krav är uppfyllda.
-- * ALLA befintliga konton får onboarding_completed = false och alla
--   inloggningar avslutas (auth.sessions/refresh_tokens töms): vid nästa
--   inloggning går alla igenom det nya flödet.
-- * legal_acceptances: vilka avtal (och vilken version) en användare godkänt.
--   PT:er måste godkänna användarvillkor, integritetspolicy, PT-avtal och
--   GDPR-åtagandet innan kontot aktiveras (och syns i Hitta PT).
-- * Profilbilder får bara peka på användarens egen mapp i Storage
--   (avatars/{uid}/), dit bara servern laddar upp efter bildfiltret (v29).
--   Externa bildlänkar går inte längre att använda för att kringgå filtret.
--
-- Körs efter 20261112000000_v30_client_goals.sql.
-- ============================================================================

-- ============================================================ profiler ===
alter table profiles add column if not exists first_name text;
alter table profiles add column if not exists last_name text;
alter table profiles add column if not exists onboarding_completed boolean not null default false;
alter table profiles add column if not exists onboarding_completed_at timestamptz;

alter table profiles drop constraint if exists profiles_first_name_check;
alter table profiles add constraint profiles_first_name_check check (first_name is null or char_length(first_name) between 1 and 60);
alter table profiles drop constraint if exists profiles_last_name_check;
alter table profiles add constraint profiles_last_name_check check (last_name is null or char_length(last_name) between 1 and 60);

-- Läsbara för användaren själv (kolumnvisa rättigheter sedan v18). Ändras bara via
-- save_profile_step() och finish_onboarding().
grant select (first_name, last_name, onboarding_completed, onboarding_completed_at) on profiles to authenticated;

-- Befintliga konton: förnamn = första ordet, efternamn = resten (förifyllt i steg 1).
update profiles
set first_name = left(nullif(split_part(trim(full_name), ' ', 1), ''), 60),
    last_name = left(nullif(trim(substr(trim(full_name), char_length(split_part(trim(full_name), ' ', 1)) + 1)), ''), 60)
where first_name is null and full_name is not null;

-- ================================================= flaggan i JWT:n ===
create or replace function sync_onboarding_claim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || jsonb_build_object('onboarding_completed', new.onboarding_completed)
  where id = new.id and (raw_app_meta_data -> 'onboarding_completed') is distinct from to_jsonb(new.onboarding_completed);
  return null;
end;
$$;
revoke all on function sync_onboarding_claim() from public, anon, authenticated;
drop trigger if exists profiles_onboarding_claim on profiles;
create trigger profiles_onboarding_claim
  after insert or update of onboarding_completed on profiles
  for each row execute function sync_onboarding_claim();

-- ================================================ skydd för profilen ===
/*
 * Utöver v6-reglerna (rollen sätts en gång, samtycket kan inte nollställas):
 *  - onboarding_completed/_at ändras bara av finish_onboarding() (eller servern).
 *  - En profilbild måste ligga i användarens egen mapp i Storage (avatars/{uid}/),
 *    dit bara /api/uploads/image laddar upp efter bildfiltret.
 * Reglerna gäller anrop som inloggad användare (rollen authenticated). Funktioner
 * med security definer (t.ex. save_profile_step) kontrollerar själva.
 */
create or replace function guard_profile_update()
returns trigger language plpgsql as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Skapandedatum kan inte ändras' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.onboarded_at is distinct from old.onboarded_at)
     and not (old.role is null and coalesce(current_setting('coavira.onboarding', true), '') = 'on') then
    raise exception 'Roll kan inte ändras' using errcode = '42501';
  end if;
  if old.health_data_consent_at is not null and new.health_data_consent_at is null then
    raise exception 'Samtycke återkallas genom att radera kontot' using errcode = '42501';
  end if;
  -- Namnet ändrat i profilinställningarna (bara full_name): håll för- och efternamn i synk.
  if new.full_name is distinct from old.full_name
     and new.first_name is not distinct from old.first_name and new.last_name is not distinct from old.last_name then
    new.first_name := left(nullif(split_part(trim(new.full_name), ' ', 1), ''), 60);
    new.last_name := left(nullif(trim(substr(trim(new.full_name), char_length(split_part(trim(new.full_name), ' ', 1)) + 1)), ''), 60);
  end if;
  if current_user = 'authenticated' then
    if new.onboarding_completed is distinct from old.onboarding_completed
       or new.onboarding_completed_at is distinct from old.onboarding_completed_at then
      raise exception 'Intro-flödet markeras som klart av appen' using errcode = '42501';
    end if;
    if new.avatar_url is distinct from old.avatar_url and not own_avatar_url(new.id, new.avatar_url) then
      raise exception 'Profilbilden måste laddas upp i appen (bildfiltret granskar den)' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

/** Tillåten profilbild: ingen, eller en bild i användarens egen mapp i Storage. */
create or replace function own_avatar_url(p_user uuid, p_url text)
returns boolean language sql immutable as $$
  select p_url is null
      or (p_url ~ '^https://' and position(('/storage/v1/object/public/avatars/' || p_user::text || '/') in p_url) > 0);
$$;

create or replace function guard_trainer_avatar()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and new.avatar_url is distinct from old.avatar_url and not own_avatar_url(new.id, new.avatar_url) then
    raise exception 'Profilbilden måste laddas upp i appen (bildfiltret granskar den)' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trainers_avatar_guard on trainers;
create trigger trainers_avatar_guard before update of avatar_url on trainers
  for each row execute function guard_trainer_avatar();

-- =============================================================== avtal ===
create table if not exists legal_acceptances (
  user_id     uuid not null references profiles on delete cascade,
  document    text not null check (document in ('terms', 'privacy', 'pt_agreement', 'gdpr_dpa')),
  version     text not null check (char_length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  primary key (user_id, document, version)
);
alter table legal_acceptances enable row level security;
drop policy if exists "legal: own read" on legal_acceptances;
create policy "legal: own read" on legal_acceptances for select to authenticated using (user_id = auth.uid());
-- Inga skrivpolicies: godkännanden sparas bara via accept_legal_documents().
revoke insert, update, delete on legal_acceptances from anon, authenticated;

/** Avtalens nuvarande version. Höjs den måste alla PT:er godkänna på nytt. */
create or replace function legal_version()
returns text language sql immutable as $$ select '2026-11' $$;

/** Avtal som måste godkännas i intro-flödet. Klienter godkänner villkor och hälsodata vid registreringen. */
create or replace function required_documents(p_role user_role)
returns text[] language sql immutable as $$
  select case when p_role = 'trainer' then array['terms', 'privacy', 'pt_agreement', 'gdpr_dpa'] else array[]::text[] end;
$$;

create or replace function terms_accepted(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select required_documents(p.role) <@ coalesce(array_agg(a.document) filter (where a.version = legal_version()), '{}')
    from profiles p left join legal_acceptances a on a.user_id = p.id
    where p.id = p_user
    group by p.role
  ), false);
$$;
revoke all on function terms_accepted(uuid) from public, anon, authenticated;

-- PT:ns spärr (v22) kräver nu även godkända avtal: profil + Stripe + villkor.
create or replace function sync_pt_ready(p_trainer uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ready boolean;
begin
  select trainer_profile_complete(t.id) and t.stripe_onboarding_complete and terms_accepted(t.id) into v_ready
  from trainers t where t.id = p_trainer;
  v_ready := coalesce(v_ready, false);
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || jsonb_build_object('pt_ready', v_ready)
  where id = p_trainer and (raw_app_meta_data -> 'pt_ready') is distinct from to_jsonb(v_ready);
  return v_ready;
end;
$$;
revoke all on function sync_pt_ready(uuid) from public, anon, authenticated;

-- ======================================================== statusen ===
/** Var i intro-flödet är jag? Används av appen för att välja nästa steg. */
create or replace function my_onboarding_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p profiles;
  t trainers;
  v_profile boolean;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  select * into t from trainers where id = p.id;
  v_profile := p.first_name is not null and p.last_name is not null
    and (p.role is distinct from 'trainer' or coalesce(t.avatar_url, '') <> '');
  return jsonb_build_object(
    'role', p.role,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'avatar_url', case when p.role = 'trainer' then t.avatar_url else p.avatar_url end,
    'profile_done', v_profile,
    'goals_done', exists (select 1 from client_goals g where g.client_id = p.id),
    'pt_profile_done', case when p.role = 'trainer' then trainer_profile_complete(p.id) else null end,
    'payouts_done', case when p.role = 'trainer' then coalesce(t.stripe_onboarding_complete, false) else null end,
    'terms_version', legal_version(),
    'required_documents', to_jsonb(required_documents(p.role)),
    'accepted_documents', coalesce((select jsonb_agg(document order by document) from legal_acceptances where user_id = p.id and version = legal_version()), '[]'),
    'terms_done', terms_accepted(p.id),
    'completed', p.onboarding_completed
  );
end;
$$;
revoke all on function my_onboarding_status() from public, anon;
grant execute on function my_onboarding_status() to authenticated;

-- ============================================================ steg 1 ===
/**
 * Steg 1 för alla: förnamn, efternamn och profilbild. Bilden laddas upp av
 * servern efter bildfiltret (/api/uploads/image) och måste ligga i
 * användarens egen mapp. PT:er måste ha en profilbild, klienter kan vänta.
 */
create or replace function save_profile_step(p_first_name text, p_last_name text, p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_first text := trim(coalesce(p_first_name, ''));
  v_last text := trim(coalesce(p_last_name, ''));
  v_avatar text := nullif(trim(coalesce(p_avatar_url, '')), '');
begin
  select role into v_role from profiles where id = v_uid;
  if v_uid is null or v_role is null then
    raise exception 'Välj kontotyp först' using errcode = '42501';
  end if;
  if char_length(v_first) not between 1 and 60 then
    raise exception 'Ange ditt förnamn' using errcode = '23514';
  end if;
  if char_length(v_last) not between 1 and 60 then
    raise exception 'Ange ditt efternamn' using errcode = '23514';
  end if;
  if v_first ~ '[[:cntrl:]<>]' or v_last ~ '[[:cntrl:]<>]' then
    raise exception 'Namnet innehåller otillåtna tecken' using errcode = '23514';
  end if;
  if v_avatar is not null and not own_avatar_url(v_uid, v_avatar) then
    raise exception 'Profilbilden måste laddas upp i appen (bildfiltret granskar den)' using errcode = '42501';
  end if;
  if v_role = 'trainer' and v_avatar is null and coalesce((select avatar_url from trainers where id = v_uid), '') = '' then
    raise exception 'Lägg till en profilbild – klienterna ser den när de hittar dig' using errcode = '23514';
  end if;

  update profiles
  set first_name = v_first,
      last_name = v_last,
      full_name = left(v_first || ' ' || v_last, 120),
      avatar_url = coalesce(v_avatar, avatar_url)
  where id = v_uid;
  if v_role = 'trainer' and v_avatar is not null then
    update trainers set avatar_url = v_avatar where id = v_uid;
  end if;
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || jsonb_build_object('full_name', left(v_first || ' ' || v_last, 120))
  where id = v_uid;
  return my_onboarding_status();
end;
$$;
revoke all on function save_profile_step(text, text, text) from public, anon;
grant execute on function save_profile_step(text, text, text) to authenticated;

-- ============================================================ avtal ===
/** PT steg 3: godkänn avtalen (nuvarande version). Alla obligatoriska måste ingå. */
create or replace function accept_legal_documents(p_documents text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_required text[];
begin
  select role into v_role from profiles where id = v_uid;
  if v_uid is null or v_role is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  v_required := required_documents(v_role);
  if cardinality(v_required) = 0 then
    raise exception 'Inga avtal att godkänna för kontotypen' using errcode = '23514';
  end if;
  if not (v_required <@ coalesce(p_documents, '{}')) then
    raise exception 'Godkänn alla villkor och avtal för att fortsätta' using errcode = '23514';
  end if;
  if not (coalesce(p_documents, '{}') <@ v_required) then
    raise exception 'Okänt avtal' using errcode = '23514';
  end if;
  insert into legal_acceptances (user_id, document, version)
  select v_uid, d, legal_version() from unnest(v_required) d
  on conflict do nothing;
  if v_role = 'trainer' then
    perform sync_pt_ready(v_uid);
  end if;
  return my_onboarding_status();
end;
$$;
revoke all on function accept_legal_documents(text[]) from public, anon;
grant execute on function accept_legal_documents(text[]) to authenticated;

-- ===================================================== klart (sista) ===
/**
 * Avslutar intro-flödet när alla steg för rollen är klara:
 *   Klient: steg 1 + mål (client_goals).
 *   PT:     steg 1 + färdig PT-profil + Stripe Connect + godkända avtal.
 * Sätter onboarding_completed (och därmed JWT:n via triggern).
 */
create or replace function finish_onboarding()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status jsonb := my_onboarding_status();
begin
  if not (v_status ->> 'profile_done')::boolean then
    raise exception 'Steg 1 (namn och profilbild) är inte klart' using errcode = '23514';
  end if;
  if v_status ->> 'role' = 'client' and not (v_status ->> 'goals_done')::boolean then
    raise exception 'Sätt dina mål först' using errcode = '23514';
  end if;
  if v_status ->> 'role' = 'trainer' then
    if not (v_status ->> 'pt_profile_done')::boolean then
      raise exception 'PT-profilen (presentation och inriktning) är inte klar' using errcode = '23514';
    end if;
    if not (v_status ->> 'payouts_done')::boolean then
      raise exception 'Koppla utbetalningar via Stripe först' using errcode = '23514';
    end if;
    if not (v_status ->> 'terms_done')::boolean then
      raise exception 'Godkänn villkoren och avtalen först' using errcode = '23514';
    end if;
  end if;
  update profiles set onboarding_completed = true, onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = auth.uid();
  return my_onboarding_status();
end;
$$;
revoke all on function finish_onboarding() from public, anon;
grant execute on function finish_onboarding() to authenticated;

/**
 * Välkomststeget (v7) kräver inte längre namnet – det anges i steg 1.
 * Kvar: kontotyp (klient), telefon och samtycke till hälsodata.
 */
create or replace function complete_onboarding(p_role user_role, p_full_name text, p_phone text, p_health_data_consent boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := normalize_phone(p_phone);
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
begin
  if v_uid is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  if p_role is distinct from 'client' then
    raise exception 'PT-konton skapas av Coavira och kan inte registreras i appen' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = v_uid and role is not null) then
    raise exception 'Kontotypen är redan vald' using errcode = '42501';
  end if;
  if not coalesce(p_health_data_consent, false) then
    raise exception 'Samtycke till hälsodata krävs för klientkonton' using errcode = '23514';
  end if;
  if v_name is not null and char_length(v_name) > 120 then
    raise exception 'Namnet är för långt' using errcode = '23514';
  end if;
  if v_phone is null then
    raise exception 'Ogiltigt telefonnummer' using errcode = '23514';
  end if;

  perform set_config('coavira.onboarding', 'on', true);
  update profiles
  set role = 'client',
      full_name = coalesce(v_name, full_name),
      phone = v_phone,
      health_data_consent_at = coalesce(health_data_consent_at, now()),
      onboarded_at = now()
  where id = v_uid;
  perform set_config('coavira.onboarding', 'off', true);

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"role":"client","onboarding_completed":false}',
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || jsonb_build_object('role', 'client', 'phone', v_phone)
  where id = v_uid;
end;
$$;

-- ============================================ alla genom nya flödet ===
-- Alla konton (även befintliga) börjar om i intro-flödet …
update profiles set onboarding_completed = false, onboarding_completed_at = null where onboarding_completed;
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}') || '{"onboarding_completed":false}'
where exists (select 1 from profiles p where p.id = u.id);
-- … och PT:ernas spärr räknas om (avtalen ingår nu).
do $$ begin perform sync_pt_ready(id) from trainers; end $$;

-- … och alla loggas ut: inloggningarna kan inte förnyas. Åtkomsttoken som redan
-- utfärdats gäller som längst sin livslängd (standard 1 h); appen läser dessutom
-- flaggan från profilen och skickar in i intro-flödet direkt.
do $$
begin
  if to_regclass('auth.refresh_tokens') is not null then execute 'delete from auth.refresh_tokens'; end if;
  if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions'; end if;
end $$;
