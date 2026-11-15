-- ============================================================================
-- v52: Strava är borttaget ur Coavira.
--
-- 1. Anslutningar till Strava tas bort. OAuth-tokens följer med (on delete
--    cascade från wearable_connections till wearable_tokens) – Coavira har
--    därefter ingen åtkomst till någons Strava-konto.
-- 2. Pass som redan synkats från Strava BEHÅLLS som klientens egen
--    träningshistorik, men utan koppling till Strava: källan blir 'manual'.
--    (Triggern som raderade passen när kopplingen togs bort tas därför bort
--    FÖRST.)
-- 3. Databasen tillåter inte längre Strava som källa eller anslutning.
--    Enum-värdet 'strava' i wearable_provider går inte att ta bort i Postgres
--    utan att bygga om typen; en check-constraint spärrar det i stället.
--
-- RLS är oförändrad. Apple Hälsa (HealthKit) och Health Connect påverkas inte.
--
-- Körs efter 20261122000000_v51_trainer_links.sql.
-- ============================================================================

-- 1. Triggern först, så att passen inte raderas när anslutningen tas bort.
drop trigger if exists wearable_connections_strava_cleanup on wearable_connections;
drop function if exists remove_strava_activities();

-- 2. Behåll historiken som manuella pass (hoppa över en rad om den mot förmodan krockar).
update activity_logs a
   set source = 'manual', external_id = left('imp-' || a.external_id, 200), updated_at = now()
 where a.source = 'strava'
   and not exists (
     select 1 from activity_logs b
      where b.client_id = a.client_id and b.source = 'manual' and b.external_id = left('imp-' || a.external_id, 200)
   );
delete from activity_logs where source = 'strava';

-- 3. Anslutningar och tokens.
delete from wearable_connections where provider::text = 'strava';

-- 4. Spärra Strava framåt.
alter table activity_logs drop constraint if exists activity_logs_source_check;
alter table activity_logs add constraint activity_logs_source_check
  check (source in ('apple_health', 'google_fit', 'manual'));

alter table wearable_connections drop constraint if exists wearable_connections_no_strava;
alter table wearable_connections add constraint wearable_connections_no_strava
  check (provider::text <> 'strava');
