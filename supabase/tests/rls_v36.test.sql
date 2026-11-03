-- Tester för v36: pop-upen om nyhetsbrev för befintliga användare som aldrig valt.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v36-befintlig@test.se', '{"full_name":"Bea Fintlig"}', '{}'),
  ('v36-ny@test.se', '{"full_name":"Nils Ny"}', '{}');
select id as befintlig from auth.users where email = 'v36-befintlig@test.se' \gset
select id as ny from auth.users where email = 'v36-ny@test.se' \gset

-- Befintligt konto: klart med intro-flödet sedan tidigare, har aldrig fått frågan.
select test.login('v36-befintlig@test.se');
select complete_onboarding('client', null, '0701234560', true);
select test.logout();
update profiles set onboarding_completed = true, first_name = 'Bea', last_name = 'Fintlig' where id = :'befintlig';

select test.login('v36-befintlig@test.se');
select test.eq((my_onboarding_status() ->> 'marketing_choice_needed')::boolean, true, 'befintligt konto som aldrig valt → pop-upen visas');
select test.fails($$select set_marketing_consent(true, 'okänd')$$, 'okänd källa stoppas');
select test.fails($$update profiles set marketing_choice_at = now() where id = auth.uid()$$, 'valet kan inte markeras direkt (bara via funktionerna)');
-- Svarar nej i pop-upen.
select test.eq(set_marketing_consent(false, 'prompt'), false, 'pop-upen: nej tack');
select test.eq((my_onboarding_status() ->> 'marketing_choice_needed')::boolean, false, 'efter ett nej visas pop-upen inte igen');
select test.eq((my_onboarding_status() ->> 'marketing_consent')::boolean, false, 'nej → inget nyhetsbrev');
select test.eq((select string_agg(granted::text || ':' || source, ',') from consent_events where user_id = auth.uid()), 'false:prompt',
  'även ett nej i pop-upen loggas (källa prompt)');
-- Ångrar sig i Inställningar (en parameter fungerar som förut).
select test.eq(set_marketing_consent(true), true, 'Inställningar: ja (som förut, källa settings)');
select test.eq((select string_agg(granted::text || ':' || source, ',' order by id) from consent_events where user_id = auth.uid()), 'false:prompt,true:settings',
  'loggen visar båda valen');
select test.logout();

-- Nytt konto: valet görs i avtalssteget – även när rutan lämnas tom.
select test.login('v36-ny@test.se');
select complete_onboarding('client', null, '0701234561', true);
select save_profile_step('Nils', 'Ny');
insert into client_goals (client_id, goals, sex, birth_year, height_cm, start_weight_kg, current_weight_kg, activity_level, weekly_change_kg,
  target_kcal, target_protein_g, target_carbs_g, target_fat_g)
values (auth.uid(), '{health}', 'male', 1990, 180, 80, 80, 'light', 0, 2400, 120, 300, 80);
select test.eq((my_onboarding_status() ->> 'marketing_choice_needed')::boolean, false, 'mitt i intro-flödet: ingen pop-up (avtalssteget frågar)');
select accept_user_agreement(false);
select finish_onboarding();
select test.eq((my_onboarding_status() ->> 'marketing_choice_needed')::boolean, false, 'tom ruta i avtalssteget räknas som ett val → ingen pop-up');
select test.eq((select count(*) from consent_events where user_id = auth.uid()), 0::bigint, 'ett nej i avtalssteget loggas inte (inget samtycke att visa)');
select test.logout();

select test.eq((select marketing_choice_at is not null from profiles where id = :'ny'), true, 'valet sparas med tidpunkt');
select test.eq((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'RLS på alla tabeller');
\warn 'ALLA V36-TESTER (NYHETSBREV-POP-UP) GODKÄNDA'
