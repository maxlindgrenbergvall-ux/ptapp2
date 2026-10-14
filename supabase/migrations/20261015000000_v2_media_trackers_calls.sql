-- ============================================================================
-- Forma v2: profilbild och coaching-typ, bilagor i chatten, extra mat,
-- vatten- och sömnlogg, wearables (Fitbit m.fl.) och samtal (WebRTC-signalering).
--
-- Körs efter 20261014000000_init.sql. Ändrar inga befintliga rader utom
-- trainers.offers_remote, som ersätts av coaching_mode (värdena förs över).
-- ============================================================================

-- ======================================================== PT-profil ===
create type coaching_mode as enum ('remote', 'onsite', 'both');

alter table trainers
  add column avatar_url     text check (avatar_url is null or char_length(avatar_url) <= 1000),
  add column coaching_mode  coaching_mode not null default 'onsite',
  add column certifications text[] not null default '{}'
    check (cardinality(certifications) <= 20);

update trainers set coaching_mode = case when offers_remote then 'both'::coaching_mode else 'onsite'::coaching_mode end;
alter table trainers drop column offers_remote;

-- ========================================================= bilagor ===
-- Filerna ligger i Storage (bucket chat-attachments, sökväg {client_id}/{message_id}/{fil}).
-- Meddelandet håller metadata: [{ id, name, mime, size, kind, path }].
alter table messages
  add column attachments jsonb not null default '[]'
    check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

-- Ett meddelande får vara bara bilagor (utan text).
alter table messages drop constraint messages_body_check;
alter table messages add constraint messages_body_or_attachment check (
  char_length(body) <= 2000 and (char_length(body) >= 1 or jsonb_array_length(attachments) >= 1)
);

-- ======================================================= extra mat ===
-- "Övrigt / Extra": mat utöver kostschemat.
create table food_entries (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references profiles on delete cascade,
  date        date not null,
  name        text not null check (char_length(name) between 1 and 120),
  kcal        int not null default 0 check (kcal between 0 and 10000),
  protein_g   numeric(6,1) not null default 0 check (protein_g between 0 and 1000),
  carbs_g     numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g       numeric(6,1) not null default 0 check (fat_g between 0 and 1000),
  created_at  timestamptz not null default now()
);
create index food_entries_client_date_idx on food_entries (client_id, date);

-- ========================================================== vatten ===
-- En rad per dag; klienten uppdaterar totalen (+250 ml osv.).
create table water_logs (
  client_id  uuid not null references profiles on delete cascade,
  date       date not null,
  ml         int not null check (ml between 0 and 15000),
  updated_at timestamptz not null default now(),
  primary key (client_id, date)
);

-- =========================================================== sömn ===
create type health_source as enum ('manual', 'fitbit', 'apple_health', 'google_fit', 'mock');

-- Natten räknas på datumet man vaknar. En rad per natt; data från en wearable
-- ersätter en manuell registrering för samma natt (senast synkad vinner).
create table sleep_logs (
  client_id     uuid not null references profiles on delete cascade,
  date          date not null,
  hours         numeric(3,1) not null check (hours between 0 and 24),
  quality       smallint check (quality between 1 and 5),        -- egen skattning
  sleep_score   smallint check (sleep_score between 0 and 100),  -- från wearable
  -- Minuter per sömnsteg: { "deep": 80, "light": 230, "rem": 95, "awake": 30 }
  stages        jsonb check (stages is null or jsonb_typeof(stages) = 'object'),
  source        health_source not null default 'manual',
  external_id   text,
  updated_at    timestamptz not null default now(),
  primary key (client_id, date)
);

-- ======================================================= wearables ===
create type wearable_provider as enum ('fitbit', 'apple_health', 'google_fit');

-- Synlig för användaren (status i appen). Skrivs bara av servern (service role).
create table wearable_connections (
  user_id           uuid not null references profiles on delete cascade,
  provider          wearable_provider not null,
  status            text not null default 'active' check (status in ('active', 'error', 'revoked')),
  external_user_id  text,
  scopes            text[] not null default '{}',
  connected_at      timestamptz not null default now(),
  last_synced_at    timestamptz,
  last_error        text,
  primary key (user_id, provider)
);
create unique index wearable_connections_external_idx on wearable_connections (provider, external_user_id);

-- OAuth-tokens. INGA policyer = ingen åtkomst för inloggade; bara servern med
-- service role-nyckeln läser och skriver. (I produktion: kryptera med Supabase Vault.)
create table wearable_tokens (
  user_id        uuid not null references profiles on delete cascade,
  provider       wearable_provider not null,
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz,
  primary key (user_id, provider),
  foreign key (user_id, provider) references wearable_connections on delete cascade
);
revoke all on wearable_tokens from anon, authenticated;

-- =============================================================== RLS ===
alter table food_entries          enable row level security;
alter table water_logs            enable row level security;
alter table sleep_logs            enable row level security;
alter table wearable_connections  enable row level security;
alter table wearable_tokens       enable row level security;

create policy "food_entries: client" on food_entries for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "food_entries: trainer read" on food_entries for select to authenticated using (is_active_trainer_of(client_id));

create policy "water: client" on water_logs for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "water: trainer read" on water_logs for select to authenticated using (is_active_trainer_of(client_id));

create policy "sleep: client" on sleep_logs for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "sleep: trainer read" on sleep_logs for select to authenticated using (is_active_trainer_of(client_id));

create policy "wearables: read own" on wearable_connections for select to authenticated using (user_id = auth.uid());
-- Koppla från = radera anslutningen (tokens följer med via kaskad).
create policy "wearables: disconnect own" on wearable_connections for delete to authenticated using (user_id = auth.uid());

-- ===================================================== åtkomsthjälp ===
-- Får inloggad användare läsa tråden/mappen för en klient? Tar text eftersom
-- värdet kommer från en sökväg eller ett realtidsämne och kan vara skräp.
create or replace function can_access_client(p_client text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v uuid;
begin
  begin
    v := p_client::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return v = auth.uid() or is_active_trainer_of(v);
end;
$$;

-- Får inloggad användare se videor som PT:n laddat upp? (PT:n själv + PT:ns klienter.)
create or replace function can_view_trainer_media(p_trainer text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v uuid;
begin
  begin
    v := p_trainer::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return v = auth.uid() or exists (
    select 1 from coaching_relationships
    where trainer_id = v and client_id = auth.uid() and status in ('active', 'paused')
  );
end;
$$;

-- =========================================================== Storage ===
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-attachments', 'chat-attachments', false, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf',
          'video/mp4', 'video/quicktime', 'video/webm']),
  ('exercise-videos', 'exercise-videos', false, 209715200, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- Profilbilder: publika att läsa, var och en skriver bara i sin egen mapp {uid}/...
create policy "avatars: own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Chattbilagor: {client_id}/{message_id}/{fil}. Samma parter som chatten.
create policy "chat-attachments: parties read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and can_access_client((storage.foldername(name))[1]));
create policy "chat-attachments: parties upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and can_access_client((storage.foldername(name))[1]));

-- Övningsvideor: {trainer_id}/{fil}. PT:n skriver, PT:ns klienter läser.
create policy "exercise-videos: trainer write" on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exercise-videos: trainer delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exercise-videos: read" on storage.objects for select to authenticated
  using (bucket_id = 'exercise-videos' and can_view_trainer_media((storage.foldername(name))[1]));

-- ============================================ samtal (WebRTC-signalering) ===
-- Signaleringen (ring, SDP, ICE) går som Realtime broadcast på privata kanaler
-- "call:{client_id}". Bara klienten och klientens aktiva PT får lyssna/skicka.
-- Själva ljudet/videon går direkt mellan parterna (peer-to-peer), inte via databasen.
create policy "calls: parties receive" on realtime.messages for select to authenticated
  using (realtime.topic() like 'call:%' and can_access_client(split_part(realtime.topic(), ':', 2)));
create policy "calls: parties send" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'call:%' and can_access_client(split_part(realtime.topic(), ':', 2)));

-- PT ser klientens nya tracker-data i realtid.
alter publication supabase_realtime add table food_entries, water_logs, sleep_logs;
