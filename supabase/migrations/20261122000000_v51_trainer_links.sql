-- ============================================================================
-- v51: PT:ns hemsida och Instagram på den publika profilen.
--
-- Två nya kolumner på trainers. RLS är oförändrad och räcker:
--   "trainers: read"       – publicerade profiler syns för inloggade, den egna
--                            PT:n syns alltid för sina klienter.
--   "trainers: update own" – bara PT:n själv kan ändra sin rad.
-- Databasen kontrollerar formatet, så att ingen kan spara en javascript:-länk
-- eller annat skräp förbi appen:
--   website_url  https:// (eller http://), högst 300 tecken, inga mellanslag.
--   instagram    bara användarnamnet (utan @), Instagrams egna tecken, 1–30.
--
-- Körs efter 20261121000000_v50_crm_prospecting.sql.
-- ============================================================================

alter table trainers add column if not exists website_url text;
alter table trainers add column if not exists instagram text;

alter table trainers drop constraint if exists trainers_website_url_format;
alter table trainers add constraint trainers_website_url_format check (
  website_url is null or (
    char_length(website_url) <= 300
    and website_url ~* '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]<>"'']*)?$'
  )
);

alter table trainers drop constraint if exists trainers_instagram_format;
alter table trainers add constraint trainers_instagram_format check (
  instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'
);
