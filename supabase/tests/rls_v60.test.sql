-- Tester för v60: videoguiderna (bucket exercise-guides och exercises.video_url).
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v60-pt@test.se', '{"role":"trainer","full_name":"Petra PT"}', '{"role":"trainer"}'),
  ('v60-klient@test.se', '{"role":"client","full_name":"Klara Klient","health_data_consent":true}', '{}');

-- ---------------------------------------------------------------- bucket ---
select test.eq((select public from storage.buckets where id = 'exercise-guides'), true, 'bucketen exercise-guides finns och är publik att läsa');
select test.eq((select allowed_mime_types from storage.buckets where id = 'exercise-guides'), array['video/mp4', 'video/webm'], 'bara MP4 och WebM');

select test.login('v60-pt@test.se');
select test.fails($$insert into storage.objects (bucket_id, name) values ('exercise-guides', 'e-squat.mp4')$$, 'PT kan inte ladda upp guidevideor');
select test.logout();
select test.login('v60-klient@test.se');
select test.fails($$insert into storage.objects (bucket_id, name) values ('exercise-guides', 'e-squat.mp4')$$, 'klient kan inte ladda upp guidevideor');
select test.logout();

-- Servern (service role) laddar upp och sätter video_url.
set role service_role;
insert into storage.objects (bucket_id, name) values ('exercise-guides', 'e-squat.mp4');
update exercises set video_url = 'https://abc.supabase.co/storage/v1/object/public/exercise-guides/e-squat.mp4' where id = 'e-squat';
reset role;
select test.eq((select video_url from exercises where id = 'e-squat'), 'https://abc.supabase.co/storage/v1/object/public/exercise-guides/e-squat.mp4', 'servern kopplar AI-videon till övningen');

set role anon;
select test.eq((select count(*) from storage.objects where bucket_id = 'exercise-guides' and name = 'e-squat.mp4'), 1::bigint, 'alla kan läsa guidevideorna');
reset role;

-- ------------------------------------------------------- video_url-regeln ---
select test.fails($$update exercises set video_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' where id = 'e-bench'$$, 'YouTube-länkar avvisas');
select test.fails($$update exercises set video_url = 'https://vimeo.com/123456' where id = 'e-bench'$$, 'Vimeo-länkar avvisas');
select test.fails($$update exercises set video_url = 'http://abc.supabase.co/storage/v1/object/public/exercise-guides/e-bench.mp4' where id = 'e-bench'$$, 'bara https');
select test.fails($$update exercises set video_url = 'https://abc.supabase.co/storage/v1/object/public/exercise-videos/x.mp4' where id = 'e-bench'$$, 'bara bucketen exercise-guides');

-- Inloggade kan inte ändra övningsbankens video (RLS: bara egna övningar).
select test.login('v60-klient@test.se');
update exercises set video_url = null where id = 'e-squat';
select test.logout();
select test.eq((select video_url is not null from exercises where id = 'e-squat'), true, 'klienten kan inte ta bort bankens AI-video');
select test.login('v60-pt@test.se');
update exercises set video_url = 'https://evil.example/storage/v1/object/public/exercise-guides/e-squat.mp4' where id = 'e-squat';
select test.logout();
select test.eq((select video_url from exercises where id = 'e-squat'), 'https://abc.supabase.co/storage/v1/object/public/exercise-guides/e-squat.mp4', 'PT kan inte byta bankens AI-video');
