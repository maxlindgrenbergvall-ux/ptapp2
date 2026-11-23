-- v64: säkerhetshärdning efter penetrationstest (lokal databas, november 2026).
--
-- 1. Bildfiltret i chatten gick att kringgå.
--    Chattbilder ska bara laddas upp via /api/uploads/image, som granskar bilden
--    (v29) och sparar den som WebP med service role (ingen ägare på filen).
--    Men en part i chatten kunde ladda upp en bild direkt till Storage med en
--    annan filändelse (t.ex. "bild.pdf" med innehållstypen image/webp – tillåten
--    i bucketen) och sedan skicka ett meddelande vars bilaga påstod kind "image".
--    Appen visade då den ogranskade bilden direkt i chatten.
--    Nu: en bilaga som ska visas som bild (kind "image" eller en bild-MIME) måste
--    peka på en fil i samma chatt som servern själv har laddat upp (granskad).
--
-- 2. Bucketen exercise-videos (egna övningsvideor, borttagna i v61) tog fortfarande
--    emot uppladdningar – från alla inloggade, även klienter, upp till 200 MB per fil.
--    Uppladdning stängs; läsning och radering finns kvar så att gamla filer kan tas bort.

-- ------------------------------------------------- 1. granskade chattbilder ---
create or replace function guard_message_attachments()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  a jsonb;
  v_ref text;
  v_name text;
begin
  for a in select * from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) loop
    if coalesce(a->>'kind', '') = 'image' or coalesce(a->>'mime', '') ilike 'image/%' then
      v_ref := coalesce(a->>'ref', '');
      if v_ref not like 'storage:chat-attachments/%' then
        raise exception 'Bilder i chatten måste laddas upp via appen (bildfiltret granskar dem)' using errcode = '42501';
      end if;
      v_name := substr(v_ref, char_length('storage:chat-attachments/') + 1);
      -- Filen ska ligga i den här chatten ({client_id}/…) och vara uppladdad av
      -- servern efter granskningen (service role sätter ingen ägare).
      if split_part(v_name, '/', 1) <> new.client_id::text
         or not exists (
           select 1 from storage.objects o
            where o.bucket_id = 'chat-attachments'
              and o.name = v_name
              and (to_jsonb(o) ->> 'owner') is null
              and (to_jsonb(o) ->> 'owner_id') is null
         ) then
        raise exception 'Bilder i chatten måste laddas upp via appen (bildfiltret granskar dem)' using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function guard_message_attachments() from public, anon, authenticated;

drop trigger if exists messages_attachments_guard on messages;
create trigger messages_attachments_guard
  before insert or update of attachments on messages
  for each row execute function guard_message_attachments();

-- ----------------------------------------- 2. exercise-videos: ingen uppladdning ---
drop policy if exists "exercise-videos: trainer write" on storage.objects;
