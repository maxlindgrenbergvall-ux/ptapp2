-- ============================================================================
-- v27: riktiga matfoton i receptbiblioteket.
--
-- * De illustrerade bilderna från v26 (/recipes/<slug>.svg) tas bort – tills ett
--   riktigt foto finns visar appen en neutral reservbild.
-- * Bucketen recipe-images (publik läsning, max 2 MB, JPEG/WebP/PNG) för
--   foton. Bara servern/administratören (service role) laddar upp – inga
--   policies för inloggade användare. Ladda upp och koppla med
--   scripts/set-recipe-images.mjs (ett foto per rätt, filnamn = receptets slug).
--
-- Körs efter 20261108000000_v26_recipe_library.sql.
-- ============================================================================

update library_recipes set image_url = null, updated_at = now() where image_url like '/recipes/%';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 2097152, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
