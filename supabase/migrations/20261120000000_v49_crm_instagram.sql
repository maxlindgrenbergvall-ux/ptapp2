-- ============================================================================
-- v49: Instagram-profiler i CRM:et (via Apify).
--
--   - crm_leads.instagram_followers: antal följare när profilen hämtades
--     (räckvidd för segmentet influencer och för Lead Score).
--   - Ny källa 'instagram' för leads som lagts till från en Instagram-profil.
--
-- Körs efter 20261119000000_v47_crm_leads.sql.
-- ============================================================================
alter table crm_leads add column if not exists instagram_followers int check (instagram_followers is null or instagram_followers >= 0);

alter table crm_leads drop constraint if exists crm_leads_source_check;
alter table crm_leads add constraint crm_leads_source_check check (source in ('manual', 'csv', 'url', 'search', 'instagram'));
