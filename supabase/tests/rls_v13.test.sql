-- Tester för v13: egna pass, klarmarkering, program kopplade till bokade pass
-- och klientens profilbild. Körs efter v12-testerna (c12 tränar med pt11 och pt13).
\set ON_ERROR_STOP on
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

select test.login('pt13@test.se');
select remaining as before_remaining from session_balance(auth.uid(), test.uid('c12@test.se')) \gset
select test.logout();

-- ------------------------------------------------------------- egna pass ---
select test.login('c12@test.se');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises, status)
values (auth.uid(), null, 'Eget löppass', current_date, '[{"id":"x1","exerciseId":"e-squat","sets":3,"reps":"10","restSec":60}]', 'in_progress')
returning id as own \gset
select test.eq((select count(*) from scheduled_workouts where id = :'own'), 1::bigint, 'klienten kan skapa ett eget pass');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, name, date, exercises) values (auth.uid(), test.uid('pt13@test.se'), 'Fusk', current_date, '[]')$$,
  'klienten kan inte skapa pass i PT:ns namn');
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps) values (:'own', 'x1', 0, 60, 10);
update scheduled_workouts set name = 'Eget pass – ben', status = 'completed' where id = :'own';
select test.eq((select name from scheduled_workouts where id = :'own'), 'Eget pass – ben', 'klienten kan ändra sitt eget pass');
select test.fails($$update scheduled_workouts set name = 'Ändrat' where trainer_id = test.uid('pt13@test.se') and client_id = auth.uid()$$,
  'klienten kan inte ändra innehållet i PT:ns pass');
select test.fails($$update scheduled_workouts set verified_at = now() where id = '$$ || :'own' || $$'$$, 'klienten kan inte klarmarkera');
select test.logout();

select test.login('pt13@test.se');
select test.eq((select remaining from session_balance(auth.uid(), test.uid('c12@test.se'))), :before_remaining, 'egna pass tar inga betalda pass');
select test.eq((select count(*) from scheduled_workouts where id = :'own'), 1::bigint, 'PT:n ser klientens egna pass (underlag)');
update scheduled_workouts set name = 'Kapat' where id = :'own';
select test.eq((select name from scheduled_workouts where id = :'own'), 'Eget pass – ben', 'PT:n kan inte ändra klientens egna pass');
select test.fails($$insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps) values ('$$ || :'own' || $$', 'x1', 1, 999, 1)$$,
  'PT:n kan inte logga set i klientens egna pass');

-- ------------------------------------------- program för ett bokat pass ---
insert into calendar_events (trainer_id, client_id, status, title, start_time, end_time)
values (auth.uid(), test.uid('c12@test.se'), 'confirmed', 'Cykelpass', now() + interval '5 days', now() + interval '5 days 1 hour')
returning id as ev \gset
select remaining as after_booking from session_balance(auth.uid(), test.uid('c12@test.se')) \gset
insert into scheduled_workouts (client_id, trainer_id, event_id, name, date, exercises)
values (test.uid('c12@test.se'), auth.uid(), :'ev', 'Cykelpass – intervaller', current_date + 5, '[{"id":"y1","exerciseId":"e-squat","sets":2,"reps":"8","restSec":90,"targetKg":40}]')
returning id as linked \gset
update calendar_events set workout_id = :'linked' where id = :'ev';
select test.eq((select remaining from session_balance(auth.uid(), test.uid('c12@test.se'))), :after_booking,
  'program kopplat till ett bokat pass tar inget extra betalt pass');
select test.fails($$insert into scheduled_workouts (client_id, trainer_id, event_id, name, date, exercises)
  values (test.uid('c13@test.se'), auth.uid(), '$$ || :'ev' || $$', 'Fel klient', current_date, '[]')$$, 'kalenderpasset måste höra till klienten');

-- ------------------------------------------------------------ klarmarkera ---
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps) values (:'linked', 'y1', 0, 42.5, 8), (:'linked', 'y1', 1, 42.5, 7);
update scheduled_workouts set status = 'completed', completed_at = now(), verified_at = now(), trainer_comment = 'Bra tempo, sista setet tungt.' where id = :'linked';
select test.eq((select verified_by from scheduled_workouts where id = :'linked'), auth.uid(), 'PT:n klarmarkerar och står som verifierare');
select test.eq((select count(*) from set_logs where workout_id = :'linked'), 2::bigint, 'PT:n loggar vad som faktiskt gjordes');
select test.logout();

select test.login('pt11@test.se');
update scheduled_workouts set trainer_comment = 'Kapat' where id = :'linked';
select test.eq((select trainer_comment from scheduled_workouts where id = :'linked'), 'Bra tempo, sista setet tungt.', 'en annan PT kan inte ändra klarmarkeringen');
select test.logout();

select test.login('c12@test.se');
select test.eq((select trainer_comment from scheduled_workouts where id = :'linked'), 'Bra tempo, sista setet tungt.', 'klienten ser PT:ns kommentar');
select test.eq((select count(*) from scheduled_workouts where id = :'linked' and exercises <> '[]'), 1::bigint, 'klienten kan förhandsgranska programmet före passet');
-- --------------------------------------------------------------- profilbild ---
update profiles set avatar_url = 'https://cdn.example.se/sara.webp' where id = auth.uid();
select test.fails($$update profiles set avatar_url = 'javascript:alert(1)' where id = auth.uid()$$, 'profilbilden måste vara en https-adress eller bild');
delete from scheduled_workouts where id = :'own';
select test.eq((select count(*) from scheduled_workouts where id = :'own'), 0::bigint, 'klienten kan ta bort sitt eget pass');
select test.logout();
select test.login('pt13@test.se');
select test.eq((select avatar_url from profiles where id = test.uid('c12@test.se')), 'https://cdn.example.se/sara.webp', 'PT:n ser klientens profilbild');
delete from scheduled_workouts where id = :'linked';
select test.logout();

\warn 'ALLA V13-TESTER (EGNA PASS, KLARMARKERING, PROFILBILD) GODKÄNDA'
