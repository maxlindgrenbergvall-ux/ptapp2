-- v60: Videoguide / Utförande. Alla förinlagda övningar visas med Coaviras
-- enda AI-modell: korta MP4/WebM-loopar i Storage-bucketen exercise-guides
-- (genereras med scripts/generate-ai-exercise-videos.ts), annars appens
-- inbyggda animation med samma modell. YouTube, Vimeo och andra källor
-- används aldrig.
--
-- Körs i en transaktion (som Supabase SQL Editor).

-- ============================================================ bucket ===
-- Publik läsning (videorna är samma för alla och innehåller inga personuppgifter).
-- Bara servern (service role) laddar upp – ingen policy ger inloggade användare skrivrätt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('exercise-guides', 'exercise-guides', true, 26214400, array['video/mp4', 'video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise-guides: read" on storage.objects;
create policy "exercise-guides: read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'exercise-guides');

-- ====================================================== exercises.video_url ===
-- Bara AI-guider från exercise-guides. Äldre länkar (t.ex. YouTube) tas bort.
update exercises set video_url = null
  where video_url is not null
    and video_url !~ '^https://[^/]+/storage/v1/object/public/exercise-guides/[A-Za-z0-9_.-]+\.(mp4|webm)$';

alter table exercises drop constraint if exists exercises_video_guide_only;
alter table exercises add constraint exercises_video_guide_only check (
  video_url is null
  or video_url ~ '^https://[^/]+/storage/v1/object/public/exercise-guides/[A-Za-z0-9_.-]+\.(mp4|webm)$'
);
comment on column exercises.video_url is 'v60: AI-videoguide i Storage-bucketen exercise-guides (null = appens animation med samma modell).';
