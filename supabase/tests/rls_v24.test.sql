-- Tester för v24: engelska övningsnamn, ordning i PT:ns pass, redigering av
-- genomförda pass, låsning efter klarmarkering och klientens recept.
\set ON_ERROR_STOP on

-- ----------------------------------------------------- övningsnamn ---
select test.eq((select name from exercises where id = 'e-rdl'), 'Romanian Deadlift', 'övningsbanken har engelska facktermer');
select test.eq((select name from exercises where id = 'e-bss'), 'Bulgarian Split Squat', 'Bulgarian Split Squat');
select test.eq((select name from exercises where id = 'e-latpull'), 'Lat Pulldown', 'Lat Pulldown');

-- ------------------------------------------ ordning i PT:ns pass ---
-- Två av PT:ernas pass (aktiv relation, klient med samtycke) får ett program med två övningar.
select w.id as wid, (select email from auth.users where id = w.client_id) as cmail
from scheduled_workouts w join profiles p on p.id = w.client_id
where w.trainer_id is not null and w.verified_at is null and p.health_data_consent_at is not null
order by w.id limit 1 \gset
select w.id as vwid, (select email from auth.users where id = w.client_id) as vcmail
from scheduled_workouts w join profiles p on p.id = w.client_id
where w.trainer_id is not null and w.verified_at is null and p.health_data_consent_at is not null and w.id <> :'wid'
order by w.id limit 1 \gset
update scheduled_workouts set
  exercises = '[{"id":"p1","exerciseId":"e-squat","sets":3,"reps":"5","restSec":120},{"id":"p2","exerciseId":"e-rdl","sets":3,"reps":"8","setReps":["10","8","6"],"restSec":90}]'
where id in (:'wid', :'vwid');
select test.login(:'cmail');
update scheduled_workouts set exercises = (select jsonb_agg(x order by ord desc) from jsonb_array_elements(exercises) with ordinality t(x, ord)) where id = :'wid';
select test.eq((select exercises->0->>'id' from scheduled_workouts where id = :'wid') <> (select exercises->1->>'id' from scheduled_workouts where id = :'wid'), true, 'klienten kan ändra ordningen på övningarna i PT:ns pass');
select test.fails($$update scheduled_workouts set exercises = jsonb_set(exercises, '{0,sets}', '9') where id = '$$ || :'wid' || $$'$$,
  'klienten kan inte ändra innehållet i PT:ns övningar');
select test.fails($$update scheduled_workouts set exercises = exercises - 0 where id = '$$ || :'wid' || $$'$$,
  'klienten kan inte ta bort övningar ur PT:ns pass');
select test.logout();

-- -------------------------------------- redigera ett genomfört pass ---
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v24-klient@test.se', '{"role":"client","full_name":"Redigera Klient","health_data_consent":true}', '{}');
select test.login('v24-klient@test.se');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises, status)
values (auth.uid(), null, 'Eget pass', current_date,
  '[{"id":"a","exerciseId":"e-bench","sets":3,"reps":"10","setReps":["12","10","8"],"restSec":90},{"id":"b","exerciseId":"e-row","sets":2,"reps":"10","restSec":90}]', 'in_progress')
returning id as own \gset
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps) values (:'own', 'a', 0, 60, 12), (:'own', 'a', 1, 60, 10), (:'own', 'b', 0, 50, 10);
select test.fails($$select edit_completed_workout('$$ || :'own' || $$', '[{"id":"a","exerciseId":"e-bench","sets":1,"reps":"5","restSec":0}]', '[]')$$,
  'bara genomförda pass redigeras i efterhand');
update scheduled_workouts set status = 'completed' where id = :'own';
select edit_completed_workout(:'own',
  '[{"id":"b","exerciseId":"e-row","sets":2,"reps":"10","restSec":90},{"id":"a","exerciseId":"e-bench","sets":2,"reps":"10","setReps":["12","10"],"restSec":90},{"id":"c","exerciseId":"e-dip","sets":1,"reps":"12","restSec":60}]',
  '[{"workoutExerciseId":"a","setIndex":0,"kg":62.5,"reps":12,"done":true},{"workoutExerciseId":"b","setIndex":0,"kg":50,"reps":10,"done":true},{"workoutExerciseId":"c","setIndex":0,"kg":0,"reps":12,"done":true},{"workoutExerciseId":"x","setIndex":0,"kg":1,"reps":1,"done":true}]',
  'Kändes starkt', 'Bröst och rygg');
select test.eq((select exercises->0->>'id' from scheduled_workouts where id = :'own'), 'b', 'ny ordning sparas');
select test.eq((select kg from set_logs where workout_id = :'own' and workout_exercise_id = 'a' and set_index = 0), 62.5::numeric, 'rättad vikt sparas');
select test.eq((select count(*) from set_logs where workout_id = :'own'), 3::bigint, 'borttagna set försvinner, set för okända övningar ignoreras');
select test.eq((select client_comment || ' / ' || name from scheduled_workouts where id = :'own'), 'Kändes starkt / Bröst och rygg', 'kommentar och namn sparas');
select test.eq((select exercises->1->'setReps'->>0 from scheduled_workouts where id = :'own'), '12', 'rep-mål per set sparas');
select test.fails($$select edit_completed_workout('$$ || :'own' || $$', '[]', '[]')$$, 'ett pass behöver minst en övning');
select test.logout();

select test.login('sak-annan@test.se');
select test.fails($$select edit_completed_workout('$$ || :'own' || $$', '[{"id":"a","exerciseId":"e-bench","sets":1,"reps":"5","restSec":0}]', '[]')$$,
  'ingen annan kan redigera passet');
select test.logout();

-- PT:ns genomförda pass: ordning och set får ändras, inte programmet.
-- Testdata: passet räknas som genomfört igår (spärren för framtida pass gäller inte testdatan).
alter table scheduled_workouts disable trigger scheduled_workouts_completion;
update scheduled_workouts set status = 'completed', date = current_date - 1 where id = :'wid';
alter table scheduled_workouts enable trigger scheduled_workouts_completion;
select :'wid' as pwid, :'cmail' as pcmail, (select exercises::text from scheduled_workouts where id = :'wid') as pex \gset
select test.login(:'pcmail');
select edit_completed_workout(:'pwid', :'pex'::jsonb, '[]', 'Rättat i efterhand');
select test.eq((select client_comment from scheduled_workouts where id = :'pwid'), 'Rättat i efterhand', 'klienten rättar sitt genomförda PT-pass');
select test.fails($$select edit_completed_workout('$$ || :'pwid' || $$', '[{"id":"ny","exerciseId":"e-dip","sets":1,"reps":"5","restSec":0}]', '[]')$$,
  'klienten kan inte byta övningar i PT:ns pass');
select test.logout();

-- ---------------------------------------- låst efter klarmarkering ---
select 'p1' as vex \gset
-- Testdata: passet räknas som genomfört igår (spärren för framtida pass gäller inte testdatan).
alter table scheduled_workouts disable trigger scheduled_workouts_completion;
update scheduled_workouts set status = 'completed', date = current_date - 1 where id = :'vwid';
alter table scheduled_workouts enable trigger scheduled_workouts_completion;
alter table scheduled_workouts disable trigger scheduled_workouts_completion, disable trigger scheduled_workouts_guard;
update scheduled_workouts set verified_at = now() where id = :'vwid';
alter table scheduled_workouts enable trigger scheduled_workouts_completion, enable trigger scheduled_workouts_guard;
select test.login(:'vcmail');
select test.fails($$insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps) values ('$$ || :'vwid' || $$', '$$ || :'vex' || $$', 50, 100, 1)$$,
  'inga nya set i ett klarmarkerat pass');
select test.fails($$select edit_completed_workout('$$ || :'vwid' || $$', (select exercises from scheduled_workouts where id = '$$ || :'vwid' || $$'), '[]')$$,
  'ett klarmarkerat pass kan inte redigeras');
select test.fails($$update scheduled_workouts set client_comment = 'x' where id = '$$ || :'vwid' || $$'$$, 'kommentaren låses också');
select test.logout();

-- --------------------------------------------------------- recept ---
select test.login('v24-klient@test.se');
insert into client_recipes (client_id, name, items, servings)
values (auth.uid(), 'Overnight oats', '[{"name":"Havregryn","grams":60,"kcal":225,"protein":8,"carbs":36,"fat":4}]', 2);
select test.eq((select servings from client_recipes where client_id = auth.uid()), 2::smallint, 'klienten sparar ett eget recept');
select test.fails($$insert into client_recipes (client_id, name) values (test.uid('sak-annan@test.se'), 'Fusk')$$, 'recept kan bara sparas på det egna kontot');
select test.logout();
select test.login('sak-annan@test.se');
select test.eq((select count(*) from client_recipes), 0::bigint, 'andras recept syns inte');
select test.logout();

\warn 'ALLA V24-TESTER (LOGGNING, RECEPT, ÖVNINGSNAMN) GODKÄNDA'
