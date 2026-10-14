-- ============================================================================
-- Forma v3: livsmedelsprodukter (streckkod/egna), utökade matposter,
-- klientspecifika övningsnamn och uppdaterat övningsbibliotek.
-- Körs efter 20261015000000_v2_media_trackers_calls.sql.
-- ============================================================================

-- ================================================== livsmedelsprodukter ===
-- Två sorters rader:
--  * openfoodfacts: cache av produkter som hämtats via streckkod/sök från
--    Open Food Facts (öppen databas, ODbL). Skrivs bara av servern.
--  * custom: klientens egna produkter (t.ex. en vara som saknas i databasen).
-- Det inbyggda grundbiblioteket (~200 baslivsmedel) ligger i appen, inte här.
create type food_source as enum ('openfoodfacts', 'custom');

create table food_products (
  id            uuid primary key default gen_random_uuid(),
  barcode       text check (barcode ~ '^[0-9]{6,14}$'),
  name          text not null check (char_length(name) between 1 and 160),
  brand         text check (char_length(brand) <= 120),
  kcal_100g     numeric(6,1) not null check (kcal_100g between 0 and 1000),
  protein_100g  numeric(5,1) not null default 0 check (protein_100g between 0 and 100),
  carbs_100g    numeric(5,1) not null default 0 check (carbs_100g between 0 and 100),
  fat_100g      numeric(5,1) not null default 0 check (fat_100g between 0 and 100),
  serving_g     numeric(6,1) check (serving_g > 0 and serving_g <= 5000),
  source        food_source not null,
  created_by    uuid references profiles on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint custom_has_owner check (source <> 'custom' or created_by is not null)
);
create unique index food_products_off_barcode on food_products (barcode) where source = 'openfoodfacts';
create unique index food_products_custom_barcode on food_products (created_by, barcode) where source = 'custom' and barcode is not null;
create index food_products_name_idx on food_products using gin (to_tsvector('simple', name || ' ' || coalesce(brand, '')));

alter table food_products enable row level security;
create policy "food_products: read shared and own" on food_products for select to authenticated
  using (source = 'openfoodfacts' or created_by = auth.uid());
create policy "food_products: own custom" on food_products for all to authenticated
  using (source = 'custom' and created_by = auth.uid())
  with check (source = 'custom' and created_by = auth.uid());

-- ======================================================== matposter ===
-- Matposter får gram och koppling till produkt/streckkod (för "senaste" och skanning).
alter table food_entries
  add column grams      numeric(7,1) check (grams > 0 and grams <= 5000),
  add column barcode    text check (barcode ~ '^[0-9]{6,14}$'),
  add column product_id uuid references food_products on delete set null;

-- ================================================ övningsnamn per klient ===
-- PT:n kan döpa om en övning för en viss klient ("Knäböj" → "Sara-böj med paus").
-- Klienten ser PT:ns namn överallt: dagsvy, träningslogg och historik.
create table client_exercise_aliases (
  client_id    uuid not null references profiles on delete cascade,
  exercise_id  text not null references exercises on delete cascade,
  trainer_id   uuid not null references trainers on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  updated_at   timestamptz not null default now(),
  primary key (client_id, exercise_id)
);

alter table client_exercise_aliases enable row level security;
create policy "aliases: client read" on client_exercise_aliases for select to authenticated using (client_id = auth.uid());
create policy "aliases: trainer manages" on client_exercise_aliases for all to authenticated
  using (is_active_trainer_of(client_id))
  with check (is_active_trainer_of(client_id) and trainer_id = auth.uid());

alter publication supabase_realtime add table client_exercise_aliases;

-- ============================================== uppdaterat övningsbibliotek ===
-- Samma lista som supabase/seed.sql (genererad från src/lib/exercise-library.json).
-- Befintliga id:n behålls, så pass och historik påverkas inte; bara namn rättas.
insert into exercises (id, name, muscle_group, equipment) values
  ('e-squat', 'Knäböj (skivstång)', 'ben', 'Skivstång'),
  ('e-frontsquat', 'Frontböj', 'ben', 'Skivstång'),
  ('e-goblet', 'Goblet squat', 'ben', 'Kettlebell/hantel'),
  ('e-boxsquat', 'Boxböj', 'ben', 'Skivstång'),
  ('e-pausesquat', 'Pausböj', 'ben', 'Skivstång'),
  ('e-hacksquat', 'Hack squat (maskin)', 'ben', 'Maskin'),
  ('e-legpress', 'Benpress', 'ben', 'Maskin'),
  ('e-bss', 'Bulgarisk utfallsböj', 'ben', 'Hantlar'),
  ('e-lunge', 'Utfallssteg', 'ben', 'Hantlar'),
  ('e-walklunge', 'Gående utfall', 'ben', 'Hantlar'),
  ('e-revlunge', 'Bakåtutfall', 'ben', 'Hantlar'),
  ('e-stepup', 'Step-up på låda', 'ben', 'Hantlar'),
  ('e-legext', 'Benspark (leg extension)', 'ben', 'Maskin'),
  ('e-pistol', 'Pistol squat', 'ben', 'Kroppsvikt'),
  ('e-wallsit', 'Väggsittning', 'ben', 'Kroppsvikt'),
  ('e-rdl', 'Rumänsk marklyft', 'ben', 'Skivstång'),
  ('e-sldl', 'Raka ben-marklyft', 'ben', 'Skivstång'),
  ('e-db-rdl', 'Rumänsk marklyft (hantlar)', 'ben', 'Hantlar'),
  ('e-hipthrust', 'Höftlyft (hip thrust)', 'ben', 'Skivstång'),
  ('e-glutebridge', 'Glute bridge', 'ben', 'Kroppsvikt'),
  ('e-legcurl', 'Liggande lårcurl', 'ben', 'Maskin'),
  ('e-seatedcurl', 'Sittande lårcurl', 'ben', 'Maskin'),
  ('e-nordic', 'Nordic hamstring curl', 'ben', 'Kroppsvikt'),
  ('e-kbswing', 'Kettlebellsving', 'helkropp', 'Kettlebell'),
  ('e-goodmorning', 'Good morning', 'ben', 'Skivstång'),
  ('e-calfraise', 'Stående tåhävning', 'ben', 'Maskin/hantlar'),
  ('e-seatedcalf', 'Sittande tåhävning', 'ben', 'Maskin'),
  ('e-abduction', 'Abduktion (maskin)', 'ben', 'Maskin'),
  ('e-adduction', 'Adduktion (maskin)', 'ben', 'Maskin'),
  ('e-copenhagen', 'Copenhagen-planka', 'bål', 'Bänk'),
  ('e-deadlift', 'Marklyft (konventionell)', 'rygg', 'Skivstång'),
  ('e-sumodl', 'Sumomarklyft', 'rygg', 'Skivstång'),
  ('e-trapbar', 'Trap bar-marklyft', 'rygg', 'Trap bar'),
  ('e-row', 'Skivstångsrodd', 'rygg', 'Skivstång'),
  ('e-pendlay', 'Pendlay-rodd', 'rygg', 'Skivstång'),
  ('e-db-row', 'Enarmsrodd med hantel', 'rygg', 'Hantlar'),
  ('e-cablerow', 'Sittande kabelrodd', 'rygg', 'Kabel'),
  ('e-tbarrow', 'T-bar-rodd', 'rygg', 'Maskin'),
  ('e-chestrow', 'Bröststödd rodd', 'rygg', 'Hantlar/maskin'),
  ('e-pullup', 'Pull-ups (överhandsgrepp)', 'rygg', 'Kroppsvikt'),
  ('e-chinup', 'Chins (underhandsgrepp)', 'rygg', 'Kroppsvikt'),
  ('e-assistpull', 'Assisterade pull-ups', 'rygg', 'Maskin/band'),
  ('e-latpull', 'Latsdrag', 'rygg', 'Kabel'),
  ('e-straightarm', 'Raka armar-drag (kabel)', 'rygg', 'Kabel'),
  ('e-invrow', 'Inverterad rodd', 'rygg', 'Kroppsvikt'),
  ('e-backext', 'Ryggresningar', 'rygg', 'Bänk'),
  ('e-shrug', 'Shrugs', 'rygg', 'Skivstång/hantlar'),
  ('e-rackpull', 'Rack pull', 'rygg', 'Skivstång'),
  ('e-bench', 'Bänkpress (skivstång)', 'bröst', 'Skivstång'),
  ('e-closegrip', 'Bänkpress smalt grepp', 'armar', 'Skivstång'),
  ('e-inclinebb', 'Lutande bänkpress (skivstång)', 'bröst', 'Skivstång'),
  ('e-db-bench', 'Hantelpress', 'bröst', 'Hantlar'),
  ('e-incline', 'Lutande hantelpress', 'bröst', 'Hantlar'),
  ('e-declinebench', 'Nedåtlutande bänkpress', 'bröst', 'Skivstång'),
  ('e-pausebench', 'Pausbänk', 'bröst', 'Skivstång'),
  ('e-dbfly', 'Flyes med hantlar', 'bröst', 'Hantlar'),
  ('e-cablefly', 'Kabelflyes (cable crossover)', 'bröst', 'Kabel'),
  ('e-pecdeck', 'Pec deck', 'bröst', 'Maskin'),
  ('e-chestpress', 'Bröstpress (maskin)', 'bröst', 'Maskin'),
  ('e-pushup', 'Armhävningar', 'bröst', 'Kroppsvikt'),
  ('e-dip', 'Dips', 'bröst', 'Kroppsvikt'),
  ('e-ohp', 'Stående axelpress (militärpress)', 'axlar', 'Skivstång'),
  ('e-db-ohp', 'Sittande hantelpress för axlar', 'axlar', 'Hantlar'),
  ('e-pushpress', 'Push press', 'axlar', 'Skivstång'),
  ('e-arnold', 'Arnoldpress', 'axlar', 'Hantlar'),
  ('e-landmine', 'Landmine-press', 'axlar', 'Skivstång'),
  ('e-lateral', 'Sidolyft', 'axlar', 'Hantlar'),
  ('e-cablelateral', 'Sidolyft i kabel', 'axlar', 'Kabel'),
  ('e-frontraise', 'Frontlyft', 'axlar', 'Hantlar'),
  ('e-reardelt', 'Omvända flyes (bakre axel)', 'axlar', 'Hantlar'),
  ('e-facepull', 'Face pulls', 'axlar', 'Kabel'),
  ('e-uprightrow', 'Upprätt rodd', 'axlar', 'Skivstång/kabel'),
  ('e-handstandpu', 'Handstående armhävning', 'axlar', 'Kroppsvikt'),
  ('e-curl', 'Bicepscurl (hantlar)', 'armar', 'Hantlar'),
  ('e-bbcurl', 'Bicepscurl (skivstång)', 'armar', 'Skivstång'),
  ('e-hammer', 'Hammercurl', 'armar', 'Hantlar'),
  ('e-preacher', 'Scottcurl', 'armar', 'Skivstång/maskin'),
  ('e-inclinecurl', 'Lutande bicepscurl', 'armar', 'Hantlar'),
  ('e-cablecurl', 'Bicepscurl i kabel', 'armar', 'Kabel'),
  ('e-pushdown', 'Triceps pushdown', 'armar', 'Kabel'),
  ('e-ohext', 'Tricepspress över huvudet', 'armar', 'Kabel/hantel'),
  ('e-skullcrusher', 'Liggande tricepspress (skullcrusher)', 'armar', 'Skivstång'),
  ('e-benchdip', 'Bänkdips', 'armar', 'Bänk'),
  ('e-wristcurl', 'Handledscurl', 'armar', 'Hantlar'),
  ('e-plank', 'Plankan', 'bål', 'Kroppsvikt'),
  ('e-sideplank', 'Sidoplanka', 'bål', 'Kroppsvikt'),
  ('e-pallof', 'Pallof press', 'bål', 'Kabel/band'),
  ('e-deadbug', 'Dead bug', 'bål', 'Kroppsvikt'),
  ('e-birddog', 'Bird dog', 'bål', 'Kroppsvikt'),
  ('e-hlr', 'Hängande benlyft', 'bål', 'Räckhäck'),
  ('e-kneeraise', 'Hängande knälyft', 'bål', 'Räckhäck'),
  ('e-abwheel', 'Magrulle (ab wheel)', 'bål', 'Magrulle'),
  ('e-cablecrunch', 'Kabelcrunch', 'bål', 'Kabel'),
  ('e-crunch', 'Crunches', 'bål', 'Kroppsvikt'),
  ('e-russian', 'Russian twist', 'bål', 'Kroppsvikt/vikt'),
  ('e-hollow', 'Hollow hold', 'bål', 'Kroppsvikt'),
  ('e-woodchop', 'Vedhuggaren (kabel)', 'bål', 'Kabel'),
  ('e-suitcase', 'Suitcase carry', 'bål', 'Kettlebell/hantel'),
  ('e-clean', 'Frivändning (power clean)', 'helkropp', 'Skivstång'),
  ('e-hangclean', 'Hängande frivändning', 'helkropp', 'Skivstång'),
  ('e-snatch', 'Ryck (power snatch)', 'helkropp', 'Skivstång'),
  ('e-thruster', 'Thrusters', 'helkropp', 'Skivstång/hantlar'),
  ('e-kbcleanpress', 'Kettlebell clean & press', 'helkropp', 'Kettlebell'),
  ('e-tgu', 'Turkish get-up', 'helkropp', 'Kettlebell'),
  ('e-farmers', 'Farmer''s walk', 'helkropp', 'Hantlar/kettlebells'),
  ('e-sandbag', 'Sandsäcksutfall', 'helkropp', 'Sandsäck'),
  ('e-wallball', 'Wall balls', 'helkropp', 'Medicinboll'),
  ('e-sledpush', 'Slädpush', 'helkropp', 'Släde'),
  ('e-sledpull', 'Slädpull', 'helkropp', 'Släde'),
  ('e-burpee', 'Burpees', 'helkropp', 'Kroppsvikt'),
  ('e-burpee-bj', 'Burpee broad jumps', 'helkropp', 'Kroppsvikt'),
  ('e-boxjump', 'Boxhopp', 'helkropp', 'Låda'),
  ('e-battleropes', 'Battle ropes', 'helkropp', 'Rep'),
  ('e-mountain', 'Mountain climbers', 'helkropp', 'Kroppsvikt'),
  ('e-musclup', 'Muscle-up', 'helkropp', 'Räckhäck/ringar'),
  ('e-run', 'Löpning', 'kondition', '—'),
  ('e-intervals', 'Intervallöpning', 'kondition', '—'),
  ('e-treadmill', 'Löpband', 'kondition', 'Löpband'),
  ('e-row-erg', 'Roddmaskin', 'kondition', 'Roddmaskin'),
  ('e-skierg', 'SkiErg', 'kondition', 'SkiErg'),
  ('e-bikeerg', 'Cykel (BikeErg/spinning)', 'kondition', 'Cykel'),
  ('e-airbike', 'Airbike', 'kondition', 'Airbike'),
  ('e-crosstrainer', 'Crosstrainer', 'kondition', 'Crosstrainer'),
  ('e-stairs', 'Trappmaskin', 'kondition', 'Trappmaskin'),
  ('e-jumprope', 'Hopprep', 'kondition', 'Hopprep'),
  ('e-swim', 'Simning', 'kondition', 'Bassäng'),
  ('e-walk', 'Promenad / incline walk', 'kondition', '—')
on conflict (id) do update
  set name = excluded.name, muscle_group = excluded.muscle_group, equipment = excluded.equipment
  where exercises.owner_id is null;
