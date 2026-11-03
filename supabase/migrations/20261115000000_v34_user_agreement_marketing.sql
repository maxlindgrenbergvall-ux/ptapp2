-- v34: Ett sammanslaget användaravtal i intro-flödet + valfritt nyhetsbrev.
--
-- * Alla (klienter och PT:er) godkänner ETT avtal i intro-flödet:
--     klient: användarvillkor + integritetspolicy,
--     PT:     användarvillkor + integritetspolicy + PT-avtal + GDPR-åtagande.
--   Godkännandet sparas per del i legal_acceptances (version = legal_version()),
--   så att det går att visa exakt vad som godkänts. Steget är obligatoriskt:
--   finish_onboarding kräver det nu för båda rollerna.
-- * Samtycke till nyhetsbrev, erbjudanden och produktnyheter (valfritt, aldrig
--   förkryssat): profiles.marketing_consent(_at) och en logg (consent_events)
--   som visar när samtycket gavs eller drogs tillbaka och varifrån.
-- * Befintliga konton påverkas inte: den som redan är klar med intro-flödet
--   behöver inte göra om något, och PT:ernas avtal (version 2026-11) gäller.
-- Kan köras om.

-- ======================================================== nyhetsbrev ===
alter table profiles add column if not exists marketing_consent boolean not null default false;
alter table profiles add column if not exists marketing_consent_at timestamptz;
-- Kolumnerna ändras bara via funktionerna nedan (profiles har kolumnvisa
-- rättigheter sedan v18 – inga nya update-rättigheter ges här).

create table if not exists consent_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles on delete cascade,
  kind       text not null check (kind in ('marketing')),
  granted    boolean not null,
  source     text not null check (source in ('onboarding', 'settings')),
  created_at timestamptz not null default now()
);
create index if not exists consent_events_user_idx on consent_events (user_id, created_at desc);
alter table consent_events enable row level security;
drop policy if exists "consent: own read" on consent_events;
create policy "consent: own read" on consent_events for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on consent_events from anon, authenticated;

/** Intern: sätt samtycket och logga ändringen (bara när det faktiskt ändras). */
create or replace function apply_marketing_consent(p_user uuid, p_granted boolean, p_source text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles
  set marketing_consent = p_granted,
      marketing_consent_at = now()
  where id = p_user and marketing_consent is distinct from p_granted;
  if found or (p_source = 'onboarding' and p_granted) then
    insert into consent_events (user_id, kind, granted, source) values (p_user, 'marketing', p_granted, p_source);
  end if;
end;
$$;
revoke all on function apply_marketing_consent(uuid, boolean, text) from public, anon, authenticated;

/** Inställningar: ge eller dra tillbaka samtycket till nyhetsbrev och erbjudanden. */
create or replace function set_marketing_consent(p_granted boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  perform apply_marketing_consent(auth.uid(), coalesce(p_granted, false), 'settings');
  return coalesce(p_granted, false);
end;
$$;
revoke all on function set_marketing_consent(boolean) from public, anon;
grant execute on function set_marketing_consent(boolean) to authenticated;

-- ============================================================= avtal ===
/** Avtalets delar per roll. Klienter godkänner nu också i intro-flödet (v34). */
create or replace function required_documents(p_role user_role)
returns text[] language sql immutable as $$
  select case
    when p_role = 'trainer' then array['terms', 'privacy', 'pt_agreement', 'gdpr_dpa']
    when p_role = 'client' then array['terms', 'privacy']
    else array[]::text[]
  end;
$$;

/**
 * Intro-flödet: godkänn det sammanslagna användaravtalet (alla delar för rollen,
 * nuvarande version) och välj om du vill ha nyhetsbrev. Ett anrop – ett godkännande.
 */
create or replace function accept_user_agreement(p_marketing boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
begin
  select role into v_role from profiles where id = v_uid;
  if v_uid is null or v_role is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  insert into legal_acceptances (user_id, document, version)
  select v_uid, d, legal_version() from unnest(required_documents(v_role)) d
  on conflict do nothing;
  update profiles set terms_accepted_at = coalesce(terms_accepted_at, now()) where id = v_uid;
  if coalesce(p_marketing, false) then
    perform apply_marketing_consent(v_uid, true, 'onboarding');
  end if;
  if v_role = 'trainer' then
    perform sync_pt_ready(v_uid);
  end if;
  return my_onboarding_status();
end;
$$;
revoke all on function accept_user_agreement(boolean) from public, anon;
grant execute on function accept_user_agreement(boolean) to authenticated;

-- ===================================================== statusen (v31+) ===
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
    'marketing_consent', p.marketing_consent,
    'completed', p.onboarding_completed
  );
end;
$$;
revoke all on function my_onboarding_status() from public, anon;
grant execute on function my_onboarding_status() to authenticated;

/** Avslutar intro-flödet. v34: avtalet krävs för båda rollerna. */
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
  end if;
  if not (v_status ->> 'terms_done')::boolean then
    raise exception 'Godkänn användaravtalet för att fortsätta' using errcode = '23514';
  end if;
  update profiles set onboarding_completed = true, onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = auth.uid();
  return my_onboarding_status();
end;
$$;
revoke all on function finish_onboarding() from public, anon;
grant execute on function finish_onboarding() to authenticated;
