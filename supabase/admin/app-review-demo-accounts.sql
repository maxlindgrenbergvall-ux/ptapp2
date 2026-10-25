-- ============================================================================
-- Demokonton för Apples (och Googles) granskning.
--
-- FÖRST, i Supabase Dashboard → Authentication → Users → Add user → Create new user
-- (kryssa i "Auto Confirm User"), skapa två konton med var sitt starkt lösenord:
--     review-pt@coavira.fit
--     review-klient@coavira.fit
-- Kör sedan hela det här skriptet i SQL Editor. Det kan köras flera gånger.
-- Skriv e-post och lösenord under App Review Information i App Store Connect.
-- ============================================================================

-- --------------------------------------------------------- PT-kontot ---
-- Verifierad och publicerad PT med tjänster, så att granskaren kan köpa PT Boost
-- och klienten kan hitta PT:n i "Hitta PT".
select admin_make_trainer('review-pt@coavira.fit', 'Alex Demo', '0701234567');
select admin_set_certifications('review-pt@coavira.fit', array['Licensierad PT (demokonto för App Review)']);

update trainers t
set city = 'Stockholm',
    specialties = '{styrkelyft,viktminskning}',
    bio = 'Demokonto för granskning. Personlig tränare med fokus på styrketräning och hållbar viktnedgång – pass på gym eller på distans.',
    years_experience = 5,
    price_per_session = 650,
    coaching_mode = 'both',
    offers_training = true,
    offers_nutrition = true
from auth.users u
where u.id = t.id and lower(u.email) = 'review-pt@coavira.fit';

-- Tjänster (bara om PT:n inte redan har några).
insert into trainer_services (trainer_id, kind, title, description, sessions, includes_nutrition, duration_weeks, price_sek)
select u.id, s.kind::service_kind, s.title, s.description, s.sessions, s.nutrition, s.weeks, s.price
from auth.users u
cross join (values
  ('single',    'Enstaka pass',   'Ett PT-pass på 60 minuter.',                        1, false, null::smallint, 650),
  ('package',   'Program 5 pass', 'Fem pass och ett personligt program.',              5, false, 6::smallint,    2950),
  ('nutrition', 'Kostcoaching',   'Personligt kostschema och uppföljning i fyra veckor.', 0, true,  4::smallint,    990)
) as s(kind, title, description, sessions, nutrition, weeks, price)
where lower(u.email) = 'review-pt@coavira.fit'
  and not exists (select 1 from trainer_services x where x.trainer_id = u.id);

update trainers t set is_published = true
from auth.users u
where u.id = t.id and lower(u.email) = 'review-pt@coavira.fit';

-- ------------------------------------------------------ klientkontot ---
-- Klar med välkomststeget (roll, namn, telefon, samtycke till villkor och hälsodata).
do $$
declare
  v_id uuid := (select id from auth.users where lower(email) = 'review-klient@coavira.fit');
begin
  if v_id is null then
    raise exception 'Skapa först review-klient@coavira.fit under Authentication → Add user';
  end if;
  perform set_config('coavira.onboarding', 'on', true);
  update profiles
  set role = coalesce(role, 'client'),
      full_name = 'Kim Demo',
      phone = coalesce(phone, '+46709876543'),
      health_data_consent_at = coalesce(health_data_consent_at, now()),
      onboarded_at = coalesce(onboarded_at, now())
  where id = v_id;
  perform set_config('coavira.onboarding', 'off', true);
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"role":"client"}',
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || '{"role":"client","full_name":"Kim Demo"}'
  where id = v_id;
end;
$$;

-- --------------------------------------------------------- kontroll ---
select u.email, p.role, p.full_name, t.is_published, t.certifications,
       (select count(*) from trainer_services s where s.trainer_id = u.id) as tjanster,
       p.terms_accepted_at is not null as villkor_godkanda
from auth.users u
join profiles p on p.id = u.id
left join trainers t on t.id = u.id
where lower(u.email) in ('review-pt@coavira.fit', 'review-klient@coavira.fit');
