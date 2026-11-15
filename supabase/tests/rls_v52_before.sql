-- Körs FÖRE v52-migrationen: en klient med Strava kopplat och ett synkat pass.
\set ON_ERROR_STOP on
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v52-klient@test.se', '{"role":"client","full_name":"Stina Löpare","health_data_consent":true}', '{}');
insert into wearable_connections (user_id, provider, external_user_id) values (test.uid('v52-klient@test.se'), 'strava', 'v52-777');
insert into wearable_tokens (user_id, provider, access_token) values (test.uid('v52-klient@test.se'), 'strava', 'hemlig-token');
insert into activity_logs (client_id, source, external_id, sport, name, started_at, date, duration_sec, kcal)
  values (test.uid('v52-klient@test.se'), 'strava', '9001', 'Run', 'Morgonlöpning', now(), current_date, 1800, 380);
