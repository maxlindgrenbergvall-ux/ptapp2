-- v36: Fråga befintliga användare om nyhetsbrev (pop-up vid nästa inloggning).
--
-- Fram till nu gick det inte att skilja "har sagt nej" från "har aldrig fått
-- frågan" – båda är marketing_consent = false. Därför:
--   * profiles.marketing_choice_at – när användaren senast aktivt valde (ja ELLER nej),
--     i onboarding, i pop-upen eller i Inställningar.
--   * my_onboarding_status() → 'marketing_choice_needed': kontot är klart med
--     intro-flödet men har aldrig valt → appen visar pop-upen.
--   * Svaret i pop-upen loggas alltid i consent_events (källa 'prompt'), även ett nej.
-- Kräver v34. Kan köras om.

alter table profiles add column if not exists marketing_choice_at timestamptz;

-- Den som redan har samtyckt (eller ändrat sitt val) har valt.
update profiles p
set marketing_choice_at = coalesce(p.marketing_consent_at, now())
where p.marketing_choice_at is null
  and (p.marketing_consent or exists (select 1 from consent_events e where e.user_id = p.id));

alter table consent_events drop constraint if exists consent_events_source_check;
alter table consent_events add constraint consent_events_source_check check (source in ('onboarding', 'settings', 'prompt'));

/** Intern: sätt samtycket, markera att ett val gjorts och logga. */
create or replace function apply_marketing_consent(p_user uuid, p_granted boolean, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_changed boolean;
begin
  update profiles set marketing_choice_at = now() where id = p_user;
  update profiles
  set marketing_consent = p_granted,
      marketing_consent_at = now()
  where id = p_user and marketing_consent is distinct from p_granted;
  v_changed := found;
  -- Ändringar loggas alltid; svaret i pop-upen loggas även när det är ett nej.
  if v_changed or p_source = 'prompt' or (p_source = 'onboarding' and p_granted) then
    insert into consent_events (user_id, kind, granted, source) values (p_user, 'marketing', p_granted, p_source);
  end if;
end;
$$;
revoke all on function apply_marketing_consent(uuid, boolean, text) from public, anon, authenticated;

/** Inställningar eller pop-upen: ge eller avböj/dra tillbaka samtycket. */
drop function if exists set_marketing_consent(boolean);
create or replace function set_marketing_consent(p_granted boolean, p_source text default 'settings')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  if coalesce(p_source, '') not in ('settings', 'prompt') then
    raise exception 'Okänd källa' using errcode = '23514';
  end if;
  perform apply_marketing_consent(auth.uid(), coalesce(p_granted, false), p_source);
  return coalesce(p_granted, false);
end;
$$;
revoke all on function set_marketing_consent(boolean, text) from public, anon;
grant execute on function set_marketing_consent(boolean, text) to authenticated;

/** Avtalssteget (v34): ett val görs alltid där (rutan visas) – även när den lämnas tom. */
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
  perform apply_marketing_consent(v_uid, coalesce(p_marketing, false), 'onboarding');
  if v_role = 'trainer' then
    perform sync_pt_ready(v_uid);
  end if;
  return my_onboarding_status();
end;
$$;
revoke all on function accept_user_agreement(boolean) from public, anon;
grant execute on function accept_user_agreement(boolean) to authenticated;

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
    -- v36: klar med intro-flödet men har aldrig valt → pop-upen.
    'marketing_choice_needed', p.role is not null and coalesce(p.onboarding_completed, false) and p.marketing_choice_at is null,
    'completed', p.onboarding_completed
  );
end;
$$;
revoke all on function my_onboarding_status() from public, anon;
grant execute on function my_onboarding_status() to authenticated;
