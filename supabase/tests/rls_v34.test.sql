-- Tester för v34: ett sammanslaget användaravtal (obligatoriskt i intro-flödet) och valfritt nyhetsbrev.
\set ON_ERROR_STOP on

-- Befintliga konton: den som redan är klar påverkas inte.
select test.eq((select count(*) from profiles where onboarding_completed and marketing_consent), 0::bigint, 'ingen får nyhetsbrev utan att själv ha valt det');

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v34-klient@test.se', '{"full_name":"Klara Avtal"}', '{}'),
  ('v34-pt@test.se', '{"role":"trainer","full_name":"Pelle Avtal"}', '{"role":"trainer"}'),
  ('v34-annan@test.se', '{"full_name":"Annan Person"}', '{}');
select id as klient from auth.users where email = 'v34-klient@test.se' \gset
select id as pt from auth.users where email = 'v34-pt@test.se' \gset

-- ------------------------------------------------------------ klient ---
select test.login('v34-klient@test.se');
select complete_onboarding('client', null, '0701234500', true);
select save_profile_step('Klara', 'Avtal');
insert into client_goals (client_id, goals, sex, birth_year, height_cm, start_weight_kg, current_weight_kg, activity_level, weekly_change_kg,
  target_kcal, target_protein_g, target_carbs_g, target_fat_g)
values (auth.uid(), '{weight_loss}', 'female', 1995, 166, 70, 70, 'light', -0.5, 1690, 140, 160, 50);
select test.eq(my_onboarding_status() -> 'required_documents', '["terms", "privacy"]'::jsonb, 'klient: avtalet består av användarvillkor + integritetspolicy');
select test.eq((my_onboarding_status() ->> 'terms_done')::boolean, false, 'klient: avtalet är inte godkänt än');
select test.fails($$select finish_onboarding()$$, 'klient: intro-flödet kan inte avslutas utan avtalet (obligatoriskt)');
select test.fails($$insert into legal_acceptances (user_id, document, version) values (auth.uid(), 'terms', '2026-11')$$, 'avtal kan bara godkännas via funktionen');
select test.fails($$update profiles set marketing_consent = true where id = auth.uid()$$, 'nyhetsbrevet kan inte slås på direkt (bara via funktionerna, med logg)');
select test.fails($$select marketing_consent from profiles$$, 'andras samtycken går inte att läsa (kolumnen är dold)');
select test.eq((accept_user_agreement(false) ->> 'terms_done')::boolean, true, 'ett godkännande → hela avtalet godkänt');
select test.eq((select string_agg(document, ',' order by document) from legal_acceptances where user_id = auth.uid() and version = legal_version()), 'privacy,terms',
  'båda delarna sparas med version');
select test.eq((my_onboarding_status() ->> 'marketing_consent')::boolean, false, 'utan kryss: inget nyhetsbrev');
select test.eq((select count(*) from consent_events where user_id = auth.uid()), 0::bigint, 'inget samtycke loggas när rutan inte kryssas');
select test.eq((finish_onboarding() ->> 'completed')::boolean, true, 'klient: steg 1 + avtal + mål → klart');
-- Ångrar sig senare i inställningarna.
select test.eq(set_marketing_consent(true), true, 'inställningar: nyhetsbrev på');
select test.eq((my_onboarding_status() ->> 'marketing_consent')::boolean, true, 'statusen visar samtycket');
select set_marketing_consent(true);
select test.eq((select count(*) from consent_events where user_id = auth.uid()), 1::bigint, 'samma val två gånger loggas en gång');
select set_marketing_consent(false);
select test.eq((select string_agg(granted::text || ':' || source, ',' order by id) from consent_events where user_id = auth.uid()), 'true:settings,false:settings',
  'loggen visar när samtycket gavs och drogs tillbaka');
select test.eq((my_onboarding_status() ->> 'marketing_consent')::boolean, false, 'samtycket kan dras tillbaka när som helst');
select test.logout();

select test.eq((select terms_accepted_at is not null from profiles where id = :'klient'), true, 'tidpunkten för godkännandet sparas på profilen');
select test.eq((select count(*) from consent_events where user_id = :'klient'), 2::bigint, 'loggen finns kvar för revision');

-- Någon annans samtycken syns inte.
select test.login('v34-annan@test.se');
select test.eq((select count(*) from consent_events), 0::bigint, 'en annan användare ser inte loggen');
select test.fails($$select apply_marketing_consent('$$ || :'klient' || $$'::uuid, true, 'settings')$$, 'den interna funktionen kan inte anropas');
select test.logout();

-- ---------------------------------------------------------------- PT ---
select test.login('v34-pt@test.se');
select save_profile_step('Pelle', 'Avtal', 'https://x.supabase.co/storage/v1/object/public/avatars/' || auth.uid() || '/avatar.webp?v=1');
update trainers set bio = 'Legitimerad PT med tio års erfarenhet av styrketräning och kost.', specialties = '{styrkelyft}' where id = auth.uid();
select test.logout();
update trainers set stripe_onboarding_complete = true where id = :'pt';
select test.login('v34-pt@test.se');
select test.fails($$select finish_onboarding()$$, 'PT: inte klar utan avtalet');
select test.eq((accept_user_agreement(true) ->> 'terms_done')::boolean, true, 'PT: ett godkännande täcker alla fyra delarna');
select test.eq((select count(*) from legal_acceptances where user_id = auth.uid() and version = legal_version()), 4::bigint,
  'PT: villkor, integritet, PT-avtal och GDPR-åtagande sparas');
select test.eq((my_onboarding_status() ->> 'marketing_consent')::boolean, true, 'PT: nyhetsbrev valt i intro-flödet');
select test.eq((select string_agg(granted::text || ':' || source, ',') from consent_events where user_id = auth.uid()), 'true:onboarding',
  'samtycket loggas med källan intro-flödet');
select test.eq((finish_onboarding() ->> 'completed')::boolean, true, 'PT: kontot aktiveras');
select test.logout();
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'true', 'PT-portalen öppnas efter avtalet');
select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');
\warn 'ALLA V34-TESTER (ANVÄNDARAVTAL, NYHETSBREV) GODKÄNDA'
