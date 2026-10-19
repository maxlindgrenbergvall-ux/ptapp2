-- Tester för v14: profilbild i Storage, kost-PT-flagga, inga genomförda pass i
-- förtid, obligatoriska vikter vid klarmarkering och samtalsspärr.
\set ON_ERROR_STOP on

-- ------------------------------------------------------ 1. profilbild ---
select test.login('c12@test.se');
insert into storage.objects (bucket_id, name) values ('avatars', auth.uid() || '/avatar.webp');
select test.eq((select count(*) from storage.objects where bucket_id = 'avatars' and name = auth.uid() || '/avatar.webp'), 1::bigint,
  'användaren kan läsa sin egen profilbild (krävs för upsert)');
update storage.objects set name = name where bucket_id = 'avatars' and name = auth.uid() || '/avatar.webp';
select test.fails($$insert into storage.objects (bucket_id, name) values ('avatars', test.uid('c13@test.se') || '/avatar.webp')$$,
  'ingen kan ladda upp i någon annans mapp');
select test.fails($$update storage.objects set name = test.uid('c13@test.se') || '/kapad.webp' where bucket_id = 'avatars' and name like auth.uid() || '/%' returning 1$$,
  'en bild kan inte flyttas till någon annans mapp');
update profiles set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/a.webp' where id = auth.uid();
select test.eq((select avatar_url from profiles where id = auth.uid()), 'https://x.supabase.co/storage/v1/object/public/avatars/a.webp', 'klienten sparar profilbilden på profilen');
select test.logout();
select test.login('pt13@test.se');
update trainers set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/pt.webp' where id = auth.uid();
select test.eq((select avatar_url from trainers where id = auth.uid()), 'https://x.supabase.co/storage/v1/object/public/avatars/pt.webp', 'PT:n sparar profilbilden');
select test.eq((select count(*) from storage.objects where bucket_id = 'avatars' and name like test.uid('c12@test.se') || '/%'), 0::bigint,
  'andra listar inte klientens filer via API:t');
select test.logout();

-- --------------------------------------------------------- 2. kost-PT ---
select test.eq((select offers_nutrition from trainers where id = test.uid('pt13@test.se')), false, 'tränings-PT utan kosttjänst erbjuder inte kost');
select test.eq((select offers_nutrition from trainers where id = test.uid('pt11@test.se')), true, 'PT med kosttjänst erbjuder kost');
select test.eq((select offers_nutrition from trainers where id = test.uid('pt12@test.se')), true, 'ren kost-PT erbjuder fortfarande kost');

-- ------------------------------------------- 3. inga genomförda pass i förtid ---
select test.login('pt13@test.se');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises)
values (test.uid('c12@test.se'), auth.uid(), 'Framtida pass', current_date + 3, '[{"id":"f1","exerciseId":"e-squat","sets":2,"reps":"5","restSec":90}]')
returning id as future \gset
select test.fails($$update scheduled_workouts set status = 'completed' where id = '$$ || :'future' || $$'$$, 'PT kan inte markera ett framtida pass som genomfört');
select test.fails($$update scheduled_workouts set verified_at = now() where id = '$$ || :'future' || $$'$$, 'PT kan inte klarmarkera ett framtida pass');
select test.fails($$update calendar_events set status = 'completed' where trainer_id = auth.uid() and start_time > now() and status = 'confirmed'$$,
  'ett kalenderpass kan inte markeras genomfört innan det börjat');
select test.logout();
select test.login('c12@test.se');
update scheduled_workouts set status = 'in_progress' where id = :'future';
select test.eq((select status::text from scheduled_workouts where id = :'future'), 'in_progress', 'klienten kan träna/följa passet i förväg');
select test.fails($$update scheduled_workouts set status = 'completed' where id = '$$ || :'future' || $$'$$, 'men inte avsluta det innan passdagen');
select test.logout();

-- ------------------------------------------- 4. vikter krävs vid klarmarkering ---
select test.login('pt13@test.se');
insert into scheduled_workouts (client_id, trainer_id, name, date, exercises)
values (test.uid('c12@test.se'), auth.uid(), 'Dagens pass', current_date, '[{"id":"d1","exerciseId":"e-squat","sets":2,"reps":"5","restSec":90},{"id":"d2","exerciseId":"e-plank","sets":1,"reps":"45 s","restSec":30}]')
returning id as todays \gset
select test.fails($$update scheduled_workouts set status = 'completed', verified_at = now() where id = '$$ || :'todays' || $$'$$, 'klarmarkering kräver registrerade set');
insert into set_logs (workout_id, workout_exercise_id, set_index, kg, reps) values (:'todays', 'd1', 0, 0, 5), (:'todays', 'd2', 0, 0, 1);
select test.fails($$update scheduled_workouts set status = 'completed', verified_at = now() where id = '$$ || :'todays' || $$'$$, 'vikten får inte lämnas tom för knäböj');
update set_logs set kg = 60 where workout_id = :'todays' and workout_exercise_id = 'd1';
update scheduled_workouts set status = 'completed', verified_at = now() where id = :'todays';
select test.eq((select verified_by from scheduled_workouts where id = :'todays'), auth.uid(), 'med vikter ifyllda kan passet klarmarkeras (planka utan vikt är ok)');
delete from scheduled_workouts where id in (:'todays', :'future');
select test.logout();

-- ----------------------------------------------------- 5. samtalsspärr ---
-- En aktiv relation utan köp eller bokning (t.ex. skapad före betalningar) räcker inte.
insert into coaching_relationships (trainer_id, client_id, status) values (test.uid('pt13@test.se'), test.uid('c13@test.se'), 'active');
select test.login('c13@test.se');
select test.eq(can_access_call('call:' || auth.uid() || ':' || test.uid('pt13@test.se')), false, 'samtal är låsta utan köp eller bokat pass');
select test.logout();
select test.login('pt13@test.se');
select test.eq(can_access_call('call:' || test.uid('c13@test.se') || ':' || auth.uid()), false, 'PT kan inte heller ringa klienten utan köp/bokning');
select test.logout();
insert into purchases (checkout_id, client_id, trainer_id, kind, title, sessions, price_sek, status, paid_at)
values (gen_random_uuid(), test.uid('c13@test.se'), test.uid('pt13@test.se'), 'single', 'Enstaka pass', 1, 700, 'paid', now());
select test.login('c13@test.se');
select test.eq(can_access_call('call:' || auth.uid() || ':' || test.uid('pt13@test.se')), true, 'efter köp låses samtal upp');
select test.logout();
select test.login('c12@test.se');
select test.eq(can_access_call('call:' || auth.uid() || ':' || test.uid('pt13@test.se')), true, 'betalande klient kan ringa sin PT');
select test.logout();

\warn 'ALLA V14-TESTER (PROFILBILD, KOST-PT, PASSREGLER, SAMTAL) GODKÄNDA'
