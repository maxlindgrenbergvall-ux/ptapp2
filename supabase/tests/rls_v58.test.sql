-- Tester för v58: språk och träningsintressen i profilen, övningarnas
-- träningsform och loggningssätt, löp-/konditionsfält i pass och setloggar.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v58-klient@test.se', '{"role":"client","full_name":"Klara Klient","health_data_consent":true}', '{}'),
  ('v58-annan@test.se', '{"role":"client","full_name":"Anna Annan","health_data_consent":true}', '{}');

-- ------------------------------------------------------------- profilen ---
select test.login('v58-klient@test.se');
select test.eq((select preferred_language from profiles where id = auth.uid()), null::text, 'nytt konto: inget språk (enhetens språk gäller)');
select test.eq((select cardinality(training_interests) from profiles where id = auth.uid()), 0, 'nytt konto: inga intressen');
update profiles set preferred_language = 'es', training_interests = array['running', 'hyrox'] where id = auth.uid();
select test.eq((select preferred_language from profiles where id = auth.uid()), 'es', 'klienten sparar sitt språk');
select test.eq((select training_interests from profiles where id = auth.uid()), array['running', 'hyrox'], 'klienten sparar sina intressen');
select test.fails($$update profiles set preferred_language = 'it' where id = auth.uid()$$, 'okänt språk avvisas');
select test.fails($$update profiles set training_interests = array['crossfit'] where id = auth.uid()$$, 'okänt intresse avvisas');
select test.fails($$update profiles set training_interests = array['strength','running','hyrox','hybrid','health','strength'] where id = auth.uid()$$, 'högst fem intressen');
update profiles set preferred_language = null where id = auth.uid();
select test.eq((select preferred_language from profiles where id = auth.uid()), null::text, 'språket kan nollställas (enhetens språk igen)');
update profiles set preferred_language = 'de' where id = auth.uid();
select test.logout();

-- En annan användare kan varken läsa eller ändra Klaras val.
select test.login('v58-annan@test.se');
update profiles set preferred_language = 'fr' where id = test.uid('v58-klient@test.se');
select test.eq((select count(*) from profiles where id = test.uid('v58-klient@test.se')), 0::bigint, 'annan användare ser inte profilen');
select test.logout();
select test.eq((select preferred_language from profiles where id = test.uid('v58-klient@test.se')), 'de', 'annan användare kan inte byta någon annans språk');

set role anon;
select test.fails($$select preferred_language from profiles limit 1$$, 'anon: ingen åtkomst till språket');
reset role;

-- ---------------------------------------------------------- övningarna ---
select test.login('v58-klient@test.se');
select test.eq((select tracking_type || '/' || modality from exercises where id = 'e-skierg'), 'conditioning/hyrox', 'SkiErg: kondition, Hyrox');
select test.eq((select name from exercises where id = 'e-wallball'), 'Wall Balls', 'Hyrox-namnen är internationella');
select test.eq((select tracking_type from exercises where id = 'e-hyrox-run'), 'running', 'Hyrox 1 km löpning finns och loggas som löpning');
select test.eq((select tracking_type from exercises where id = 'e-squat'), 'strength', 'styrkeövningar är styrka som förut');
update exercises set tracking_type = 'running' where id = 'e-squat';
select test.logout();
select test.eq((select tracking_type from exercises where id = 'e-squat'), 'strength', 'övningsbanken ändras inte av en klient (RLS)');
select test.fails($$insert into exercises (id, name, muscle_group, tracking_type) values ('x-bad', 'X', 'kondition', 'swimming')$$, 'okänt loggningssätt avvisas');

-- --------------------------------------------- pass med löpning och block ---
select test.login('v58-klient@test.se');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises, status)
values (auth.uid(), null, 'Hyrox-simulering', current_date,
  '[{"id":"r1","exerciseId":"e-hyrox-run","trackingType":"running","sets":4,"reps":"","restSec":0,"distanceM":1000,"paceSecPerKm":300,"blockId":"a"},
    {"id":"s1","exerciseId":"e-sledpush","trackingType":"conditioning","sets":4,"reps":"","restSec":0,"distanceM":50,"blockId":"a"}]', 'in_progress')
returning id as w \gset
select test.eq((select count(*) from scheduled_workouts where id = :'w'), 1::bigint, 'pass med löpning, Sled Push och block sparas');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (auth.uid(), null, 'Fel', current_date, '[{"id":"x","exerciseId":"e-run","trackingType":"jogging","sets":1,"reps":"","restSec":0}]')$$,
  'okänt trackingType i passet avvisas');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (auth.uid(), null, 'Fel', current_date, '[{"id":"x","exerciseId":"e-run","trackingType":"running","sets":1,"reps":"","restSec":0,"distanceM":-5}]')$$,
  'negativ distans avvisas');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (auth.uid(), null, 'Fel', current_date, '[{"id":"x","exerciseId":"e-run","trackingType":"running","sets":1,"reps":"","restSec":0,"paceSecPerKm":"fort"}]')$$,
  'tempo måste vara ett tal');

-- Loggen: distans och tid per intervall (kg/reps 0).
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps, distance_m, duration_sec) values (:'w', 'r1', 0, 0, 0, 1000, 291);
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps, distance_m) values (:'w', 's1', 0, 0, 0, 50);
select test.eq((select duration_sec from set_logs where workout_id = :'w' and workout_exercise_id = 'r1'), 291, 'tid per intervall sparas');
select test.eq((select distance_m from set_logs where workout_id = :'w' and workout_exercise_id = 's1'), 50.0::numeric, 'distans per varv sparas');
select test.fails(format($$insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps, duration_sec) values (%L, 'r1', 1, 0, 0, -1)$$, :'w'), 'negativ tid avvisas');
select test.fails(format($$insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps, distance_m) values (%L, 'r1', 2, 0, 0, 200000)$$, :'w'), 'orimlig distans avvisas');
select test.logout();

-- Ingen annan kan logga i Klaras pass.
select test.login('v58-annan@test.se');
select test.fails(format($$insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps, distance_m) values (%L, 'r1', 3, 0, 0, 1000)$$, :'w'), 'annan användare kan inte logga i passet');
select test.logout();
