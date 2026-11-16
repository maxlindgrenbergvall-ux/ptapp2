-- v58: språk och träningsintressen i profilen, träningsform och loggningssätt
-- för övningar (styrka / löpning / kondition), distans, tid och kalorier i
-- setloggen, och övningsbankens Hyrox- och löpövningar.
--
-- Körs i en transaktion (som Supabase SQL Editor). Inga nya enum-värden –
-- bara text med check, så allt kan användas direkt i samma migration.

-- ============================================================ profilen ===
alter table profiles
  add column if not exists preferred_language text
    check (preferred_language is null or preferred_language in ('sv', 'en', 'es', 'fr', 'de')),
  add column if not exists training_interests text[] not null default '{}'
    check (training_interests <@ array['strength', 'running', 'hyrox', 'hybrid', 'health']::text[]
           and cardinality(training_interests) <= 5);

comment on column profiles.preferred_language is 'v58: appens språk (sv/en/es/fr/de). null = enhetens språk.';
comment on column profiles.training_interests is 'v58: träningsintressen vid registreringen (strength/running/hyrox/hybrid/health).';

-- Kolumnbehörigheter (profiles har kolumnvisa grants sedan v18). Raderna styrs av
-- RLS som förut: "profiles: update self" – bara den egna profilen kan ändras.
-- Läsning: den egna profilen, och PT:ns klienter (för att se intressena) via befintliga policyer.
grant select (preferred_language, training_interests) on profiles to authenticated;
grant update (preferred_language, training_interests) on profiles to authenticated;

-- ======================================================== övningarna ===
alter table exercises
  add column if not exists modality text not null default 'strength'
    check (modality in ('strength', 'running', 'hyrox', 'conditioning')),
  add column if not exists tracking_type text not null default 'strength'
    check (tracking_type in ('strength', 'running', 'conditioning'));

comment on column exercises.modality is 'v58: träningsform i filtret (Alla/Styrka/Löpning/Hyrox).';
comment on column exercises.tracking_type is 'v58: hur övningen loggas – styrka (set × reps × kg), löpning (distans × tempo), kondition (distans eller reps/kal).';

-- Hyrox-stationerna: internationella namn på alla språk.
update exercises set name = 'SkiErg', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-skierg';
update exercises set name = 'Sled Push', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-sledpush';
update exercises set name = 'Sled Pull', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-sledpull';
update exercises set name = 'Burpee Broad Jumps', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-burpee-bj';
update exercises set name = 'Rowing', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-row-erg';
update exercises set name = 'Farmers Carry', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-farmers';
update exercises set name = 'Sandbag Lunges', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-sandbag';
update exercises set name = 'Wall Balls', modality = 'hyrox', tracking_type = 'conditioning' where id = 'e-wallball';
update exercises set modality = 'conditioning', tracking_type = 'conditioning'
  where id in ('e-bikeerg', 'e-airbike', 'e-crosstrainer', 'e-stairs', 'e-swim', 'e-jumprope');
update exercises set modality = 'running', tracking_type = 'running' where id in ('e-run', 'e-intervals', 'e-treadmill', 'e-walk');

-- Nya löpövningar (den globala banken: owner_id null).
insert into exercises (id, name, muscle_group, equipment, modality, tracking_type) values
  ('e-tempo-run', 'Tempo Run', 'kondition', '—', 'running', 'running'),
  ('e-long-run', 'Long Run Zone 2', 'kondition', '—', 'running', 'running'),
  ('e-hill-reps', 'Hill Repeats', 'kondition', '—', 'running', 'running'),
  ('e-hyrox-run', 'Hyrox 1 km Run', 'kondition', '—', 'hyrox', 'running')
on conflict (id) do update set modality = excluded.modality, tracking_type = excluded.tracking_type;

-- ======================================== övningarna i pass och mallar ===
/*
 * Passens övningar är en jsonb-lista (kopia av mallen). v58-fälten valideras:
 *   trackingType   strength | running | conditioning (eller saknas = styrka)
 *   distanceM      0–100 000 m      paceSecPerKm  60–1 800 s/km
 *   durationSec    0–86 400 s       blockId       högst 40 tecken
 */
create or replace function valid_v58_exercise_fields(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'array' and not exists (
    select 1 from jsonb_array_elements(p) e
    where (e ? 'trackingType' and (jsonb_typeof(e -> 'trackingType') <> 'string' or e ->> 'trackingType' not in ('strength', 'running', 'conditioning')))
       or (e ? 'distanceM' and (jsonb_typeof(e -> 'distanceM') <> 'number' or (e ->> 'distanceM')::numeric not between 0 and 100000))
       or (e ? 'paceSecPerKm' and (jsonb_typeof(e -> 'paceSecPerKm') <> 'number' or (e ->> 'paceSecPerKm')::numeric not between 60 and 1800))
       or (e ? 'durationSec' and (jsonb_typeof(e -> 'durationSec') <> 'number' or (e ->> 'durationSec')::numeric not between 0 and 86400))
       or (e ? 'blockId' and (jsonb_typeof(e -> 'blockId') <> 'string' or char_length(e ->> 'blockId') > 40))
  );
$$;

alter table scheduled_workouts drop constraint if exists scheduled_workouts_v58_fields;
alter table scheduled_workouts add constraint scheduled_workouts_v58_fields check (valid_v58_exercise_fields(exercises));
alter table workout_templates drop constraint if exists workout_templates_v58_fields;
alter table workout_templates add constraint workout_templates_v58_fields check (valid_v58_exercise_fields(exercises));

-- ============================================================ setloggen ===
-- Löpning och kondition: distans, tid och kalorier per intervall/varv. kg och reps
-- är 0 för dem. RLS på set_logs gäller som förut (klientens egna, öppna pass).
alter table set_logs
  add column if not exists distance_m numeric(8,1) check (distance_m is null or distance_m between 0 and 100000),
  add column if not exists duration_sec integer check (duration_sec is null or duration_sec between 0 and 86400),
  add column if not exists calories integer check (calories is null or calories between 0 and 10000);
