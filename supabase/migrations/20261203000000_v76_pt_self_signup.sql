-- ============================================================================
-- v76: PT:er registrerar sig själva – och syns först när Coavira granskat dem.
--
-- Ersätter v7-regeln "PT-konton skapas bara av administratörer":
-- * Självregistrering: signUp med user_metadata.pt_signup = true skapar ett
--   PT-konto (app_metadata.role = 'trainer', satt här i databasen). I samma
--   registrering sparas förnamn och efternamn, företagsuppgifterna för kvitton
--   (trainer_business, v75), egna portalavtal (accepts_*) och godkännandet av
--   PT-användaravtalet (legal_acceptances, nuvarande version). Ingenting går
--   förlorat medan e-postadressen bekräftas.
--   En "trainer"-roll i user_metadata (utan pt_signup) ignoreras fortfarande.
-- * Granskning: en PT syns i Hitta PT först när Coavira lagt in granskade
--   certifikat (trainers.certifications, bara admin). Bjuda in klienter kräver
--   redan granskning sedan v19 (is_approved_trainer).
-- * Introt i tre steg: trainers.pt_onboarding_step (1 konto och företag,
--   2 utbetalningar, 3 första paketet) och pt_onboarding_completed. Steget sparas
--   så att PT:n kommer tillbaka till rätt steg (även från Stripe).
-- * finish_pt_onboarding(): kräver namn och godkänt avtal. Stripe och profilbild/
--   presentation kan göras senare – dashboarden visar en statusrad. Tjänster går
--   ändå bara att köpa med godkända utbetalningar, och profilen syns bara med
--   Stripe (v22) och granskade certifikat (här).
--
-- Körs efter 20261202000000_v75_wellness.sql.
-- ============================================================================

-- ==================================================== introts tillstånd ===
alter table trainers
  add column pt_onboarding_step smallint not null default 1 check (pt_onboarding_step between 1 and 3),
  add column pt_onboarding_completed boolean not null default false;

-- PT:er som redan gått igenom intro-flödet är klara.
update trainers t set pt_onboarding_completed = true, pt_onboarding_step = 3
from profiles p where p.id = t.id and p.onboarding_completed;

/** Bara systemet sätter "klar" (finish_pt_onboarding). Steget får PT:n flytta själv. */
create or replace function guard_pt_onboarding()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('coavira.system', true), '') <> 'on'
     and new.pt_onboarding_completed is distinct from (case when tg_op = 'INSERT' then false else old.pt_onboarding_completed end) then
    raise exception 'Introt avslutas med finish_pt_onboarding()' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trainers_pt_onboarding_guard
  before insert or update on trainers
  for each row execute function guard_pt_onboarding();

-- ============================================= granskning före Hitta PT ===
/**
 * Synlig i Hitta PT först med granskade certifikat. Försöker systemet publicera
 * (t.ex. när Stripe blir klart) hålls profilen dold i stället för att något fel uppstår.
 */
create or replace function guard_trainer_certified()
returns trigger language plpgsql as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published)
     and coalesce(array_length(new.certifications, 1), 0) = 0 then
    if auth.uid() is null or coalesce(current_setting('coavira.system', true), '') = 'on' then
      new.is_published := false;
    else
      raise exception 'Din profil syns i Hitta PT när Coavira har granskat dina certifikat. Skicka dem till certifiering@coavira.fit.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger trainers_certified_guard
  before insert or update of is_published, certifications on trainers
  for each row execute function guard_trainer_certified();

-- ====================================================== självregistrering ===
/**
 * Ny användare → profil. PT-rollen: från app_metadata (admin, v7) eller från en
 * självregistrering (user_metadata.pt_signup = true, v76). En "trainer"-roll i
 * user_metadata ignoreras som förut.
 */
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  a jsonb := coalesce(new.raw_app_meta_data, '{}');
  v_consent boolean := coalesce((m->>'health_data_consent')::boolean, false);
  v_pt_signup boolean := coalesce((m->>'pt_signup')::boolean, false);
  v_role user_role := case
    when a->>'role' = 'trainer' then 'trainer'::user_role
    when v_pt_signup then 'trainer'::user_role
    -- Äldre klientregistrering med samtycke i metadatan.
    when m->>'role' = 'client' and v_consent then 'client'::user_role
  end;
  v_first text := nullif(left(btrim(coalesce(m->>'first_name', '')), 60), '');
  v_last text := nullif(left(btrim(coalesce(m->>'last_name', '')), 60), '');
  v_org text := nullif(btrim(coalesce(m->>'org_number', '')), '');
begin
  insert into profiles (id, role, full_name, phone, health_data_consent_at, onboarded_at)
  values (
    new.id,
    v_role,
    left(coalesce(
      nullif(btrim(concat_ws(' ', v_first, v_last)), ''),
      nullif(trim(m->>'full_name'), ''),
      nullif(trim(m->>'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Ny användare'
    ), 120),
    normalize_phone(coalesce(nullif(m->>'phone', ''), new.phone)),
    case when v_role = 'client' then now() end,
    case when v_role is not null then now() end
  );
  if v_role = 'trainer' then
    insert into trainers (id) values (new.id);
  end if;

  if v_pt_signup and v_role = 'trainer' then
    perform set_config('coavira.system', 'on', true);
    update profiles set first_name = v_first, last_name = v_last where id = new.id;
    update trainers
    set accepts_epassi = coalesce((m->>'accepts_epassi')::boolean, false),
        accepts_benifex = coalesce((m->>'accepts_benifex')::boolean, false),
        accepts_edenred = coalesce((m->>'accepts_edenred')::boolean, false),
        -- Steg 1 (konto och företag) är klart.
        pt_onboarding_step = 2
    where id = new.id;
    insert into trainer_business (trainer_id, company_name, org_number, company_address)
    values (
      new.id,
      left(btrim(coalesce(m->>'company_name', '')), 120),
      case when v_org is not null and is_valid_org_number(v_org) then v_org end,
      left(btrim(coalesce(m->>'company_address', '')), 200)
    );
    -- Godkännandet i registreringen gäller bara den version PT:n faktiskt såg.
    if m->>'terms_version' = legal_version() then
      insert into legal_acceptances (user_id, document, version)
      select new.id, d, legal_version() from unnest(required_documents('trainer')) d
      on conflict do nothing;
    end if;
    perform set_config('coavira.system', '', true);
  end if;

  -- Spegla rollen i app_metadata (en admin-skapad PT har den redan).
  if v_role is not null and a->>'role' is distinct from v_role::text then
    update auth.users set raw_app_meta_data = a || jsonb_build_object('role', v_role::text) where id = new.id;
  end if;
  return new;
end;
$$;

-- ================================================================ introt ===
/** PT: spara vilket steg introt står på (1–3), så att PT:n kommer tillbaka dit. */
create or replace function set_pt_onboarding_step(p_step int)
returns int language plpgsql security definer set search_path = public as $$
begin
  if p_step not between 1 and 3 then
    raise exception 'Okänt steg' using errcode = '22023';
  end if;
  update trainers set pt_onboarding_step = p_step where id = auth.uid() and not pt_onboarding_completed;
  if not found and not exists (select 1 from trainers where id = auth.uid()) then
    raise exception 'Bara PT:er' using errcode = '42501';
  end if;
  return p_step;
end;
$$;
revoke all on function set_pt_onboarding_step(int) from public, anon;
grant execute on function set_pt_onboarding_step(int) to authenticated;

/**
 * PT: avsluta introt (steg 3 klart eller överhoppat). Kräver namn och godkänt
 * PT-avtal. Stripe, profilbild och presentation kan göras senare.
 */
create or replace function finish_pt_onboarding()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null or p.role is distinct from 'trainer' then
    raise exception 'Bara PT:er' using errcode = '42501';
  end if;
  if p.first_name is null or p.last_name is null then
    raise exception 'Fyll i förnamn och efternamn' using errcode = '23514';
  end if;
  if not terms_accepted(p.id) then
    raise exception 'Godkänn PT-avtalet för att fortsätta' using errcode = '23514';
  end if;
  perform set_config('coavira.system', 'on', true);
  update trainers set pt_onboarding_completed = true, pt_onboarding_step = 3 where id = p.id;
  perform set_config('coavira.system', '', true);
  update profiles set onboarding_completed = true, onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = p.id;
  return my_onboarding_status();
end;
$$;
revoke all on function finish_pt_onboarding() from public, anon;
grant execute on function finish_pt_onboarding() to authenticated;

/** Steg 1 för PT:er som Coavira skapat: namn (om det saknas) och portalavtal. */
create or replace function save_pt_account_step(p_first_name text, p_last_name text, p_epassi boolean, p_benifex boolean, p_edenred boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_first text := nullif(left(btrim(coalesce(p_first_name, '')), 60), '');
  v_last text := nullif(left(btrim(coalesce(p_last_name, '')), 60), '');
begin
  if not exists (select 1 from trainers where id = auth.uid()) then
    raise exception 'Bara PT:er' using errcode = '42501';
  end if;
  if v_first is null or v_last is null then
    raise exception 'Fyll i förnamn och efternamn' using errcode = '23514';
  end if;
  update profiles set first_name = v_first, last_name = v_last, full_name = left(v_first || ' ' || v_last, 120) where id = auth.uid();
  update trainers
  set accepts_epassi = coalesce(p_epassi, false), accepts_benifex = coalesce(p_benifex, false), accepts_edenred = coalesce(p_edenred, false),
      pt_onboarding_step = greatest(pt_onboarding_step, 2)
  where id = auth.uid() and not pt_onboarding_completed;
  return 2;
end;
$$;
revoke all on function save_pt_account_step(text, text, boolean, boolean, boolean) from public, anon;
grant execute on function save_pt_account_step(text, text, boolean, boolean, boolean) to authenticated;
