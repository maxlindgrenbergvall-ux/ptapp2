-- Tester för v31: nytt intro-flöde (steg 1, rollbaserade steg, avtal, flaggan i JWT:n).
\set ON_ERROR_STOP on

-- ------------------------------------------- befintliga konton börjar om ---
select test.eq((select count(*) from profiles where onboarding_completed), 0::bigint, 'alla befintliga konton måste gå igenom det nya intro-flödet');
select test.eq((select count(*) from auth.users u join profiles p on p.id = u.id where (u.raw_app_meta_data ->> 'onboarding_completed') is distinct from 'false'),
  0::bigint, 'flaggan står i JWT:n (app_metadata.onboarding_completed = false) för alla');
select test.eq((select count(*) from profiles where full_name like '% %' and (first_name is null or last_name is null)), 0::bigint,
  'befintliga namn delas upp i förnamn och efternamn (förifyllt i steg 1)');

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v31-ny@test.se', '{"full_name":"Ny Användare"}', '{}'),
  ('v31-pt@test.se', '{"role":"trainer","full_name":"Pia Intro"}', '{"role":"trainer"}');
select id as ny from auth.users where email = 'v31-ny@test.se' \gset
select id as pt from auth.users where email = 'v31-pt@test.se' \gset
select test.eq((select raw_app_meta_data ->> 'onboarding_completed' from auth.users where id = :'ny'), 'false', 'nytt konto: intro-flödet krävs');

-- ------------------------------------------------------------ klient ---
select test.login('v31-ny@test.se');
select test.fails($$select save_profile_step('Ny', 'Användare')$$, 'steg 1 kräver att kontotypen är vald (välkomststeget)');
-- Välkomststeget kräver inte längre namnet (det anges i steg 1).
select complete_onboarding('client', null, '0701234567', true);
select test.eq((select role::text from profiles where id = auth.uid()), 'client', 'välkomststeget utan namn');
select test.fails($$select save_profile_step('', 'Andersson')$$, 'förnamn krävs');
select test.fails($$select save_profile_step('Nina', '   ')$$, 'efternamn krävs');
select test.fails($$select save_profile_step('<script>', 'Andersson')$$, 'otillåtna tecken stoppas');
select test.fails($$select save_profile_step('Nina', 'Andersson', 'https://evil.example/porr.jpg')$$, 'en extern bildlänk kringgår inte bildfiltret');
select test.fails($$select save_profile_step('Nina', 'Andersson', 'https://x.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-000000000000/avatar.webp')$$,
  'någon annans profilbild går inte att använda');
select save_profile_step('Nina', 'Andersson', 'https://x.supabase.co/storage/v1/object/public/avatars/' || auth.uid() || '/avatar.webp?v=1');
select test.eq((select full_name || '|' || first_name || '|' || last_name from profiles where id = auth.uid()), 'Nina Andersson|Nina|Andersson', 'förnamn, efternamn och fullständigt namn sparas');
select test.eq((select avatar_url like '%/avatars/' || auth.uid() || '/avatar.webp%' from profiles where id = auth.uid()), true, 'profilbilden (granskad av bildfiltret) sparas');
select test.eq((my_onboarding_status() ->> 'profile_done')::boolean, true, 'steg 1 klart');
select test.fails($$update profiles set avatar_url = 'https://evil.example/x.jpg' where id = auth.uid()$$, 'direkt ändring till extern bild stoppas');
select test.fails($$update profiles set onboarding_completed = true where id = auth.uid()$$, 'klienten kan inte hoppa över intro-flödet själv');
update profiles set full_name = 'Nina Berg Andersson' where id = auth.uid();
select test.eq((select first_name || '|' || last_name from profiles where id = auth.uid()), 'Nina|Berg Andersson', 'namnbyte i profilen håller för- och efternamn i synk');
select test.fails($$select finish_onboarding()$$, 'klar först när målen är satta');
insert into client_goals (client_id, goals, sex, birth_year, height_cm, start_weight_kg, current_weight_kg, activity_level, weekly_change_kg,
  target_kcal, target_protein_g, target_carbs_g, target_fat_g)
values (auth.uid(), '{weight_loss}', 'female', 1995, 166, 70, 70, 'light', -0.5, 1690, 140, 160, 50);
select test.eq((finish_onboarding() ->> 'completed')::boolean, true, 'klient: steg 1 + mål → intro-flödet klart');
select test.logout();
select test.eq((select raw_app_meta_data ->> 'onboarding_completed' from auth.users where id = :'ny'), 'true', 'JWT:n får onboarding_completed = true');

-- ---------------------------------------------------------------- PT ---
select test.login('v31-pt@test.se');
select test.eq(my_onboarding_status() -> 'required_documents', '["terms", "privacy", "pt_agreement", "gdpr_dpa"]'::jsonb, 'PT: fyra avtal att godkänna');
select test.fails($$select save_profile_step('Pia', 'Intro')$$, 'PT måste ha en profilbild');
select save_profile_step('Pia', 'Intro', 'https://x.supabase.co/storage/v1/object/public/avatars/' || auth.uid() || '/avatar.webp?v=1');
select test.eq((select avatar_url like '%/avatars/%' from trainers where id = auth.uid()), true, 'PT:ns bild sparas på PT-profilen');
update trainers set bio = 'Legitimerad PT med tio års erfarenhet av styrketräning och kost.', specialties = '{styrkelyft}' where id = auth.uid();
select test.fails($$update trainers set avatar_url = 'https://evil.example/x.jpg' where id = auth.uid()$$, 'PT: extern bildlänk stoppas');
select test.fails($$select finish_onboarding()$$, 'PT: inte klar utan Stripe');
select test.fails($$insert into legal_acceptances (user_id, document, version) values (auth.uid(), 'terms', '2026-11')$$, 'avtal kan bara godkännas via funktionen');
select test.fails($$select accept_legal_documents(array['terms', 'privacy'])$$, 'alla avtal måste godkännas');
select test.fails($$select accept_legal_documents(array['terms', 'privacy', 'pt_agreement', 'gdpr_dpa', 'okänt'])$$, 'okända avtal stoppas');
select test.logout();
-- Stripe Connect klart (sätts av servern efter kontrollen hos Stripe).
update trainers set stripe_onboarding_complete = true where id = :'pt';
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'false', 'PT-portalen är stängd tills avtalen är godkända');
select test.login('v31-pt@test.se');
select test.fails($$select finish_onboarding()$$, 'PT: inte klar utan godkända avtal');
select test.eq((accept_legal_documents(array['terms', 'privacy', 'pt_agreement', 'gdpr_dpa']) ->> 'terms_done')::boolean, true, 'PT godkänner alla avtal');
select test.eq((select count(*) from legal_acceptances where user_id = auth.uid() and version = legal_version()), 4::bigint, 'godkännandena sparas med version och tidpunkt');
select test.eq((finish_onboarding() ->> 'completed')::boolean, true, 'PT: steg 1 + Stripe + avtal → kontot aktiverat');
select test.logout();
select test.eq((select raw_app_meta_data ->> 'pt_ready' from auth.users where id = :'pt'), 'true', 'PT-portalen öppnas (pt_ready)');
select test.eq((select raw_app_meta_data ->> 'onboarding_completed' from auth.users where id = :'pt'), 'true', 'PT: flaggan i JWT:n');

-- Andra ser inte någons godkännanden.
select test.login('v31-ny@test.se');
select test.eq((select count(*) from legal_acceptances), 0::bigint, 'godkännanden är privata');
select test.logout();

select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');
\warn 'ALLA V31-TESTER (INTRO-FLÖDE OCH ROLLER) GODKÄNDA'
