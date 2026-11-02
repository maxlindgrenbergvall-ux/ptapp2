-- ============================================================================
-- v25: recept från webben, träningsmålskategorier, favoriter och loggning av
-- recept i kostdagboken.
--
-- Klientens recept ligger i client_recipes (v24) – PT:ernas egna recept i
-- kostbyggaren ligger kvar i recipes. Här får klientens recept:
--   * goal_types   träningsmål (en eller flera kategorier)
--   * image_url    originalbilden (länk till källan, kopieras inte)
--   * source_url / source_name  var receptet hämtades (visas som källa)
--   * steps        steg-för-steg-instruktioner
--   * total_minutes tillagningstid
--   * nutrition    makron PER PORTION när källan anger dem
--   * macros_source manual | site (från källan) | estimated (uträknat ur ingredienserna)
-- Ingredienserna (items) sparas alltid i metriska mått – importen räknar om
-- amerikanska mått (oz, lb, cups, tbsp …) innan receptet sparas.
--
-- user_favorite_recipes: stjärnmarkerade recept (bara de egna).
-- food_entries: måltidstyp (frukost/lunch/middag/mellanmål) och koppling till receptet.
--
-- Körs efter 20261106000000_v24_training_recipes.sql.
-- ============================================================================

-- ========================================================= receptfält ===
alter table client_recipes
  add column if not exists goal_types text[] not null default '{}'
    check (goal_types <@ array['high_protein', 'weight_loss', 'pre_workout', 'post_workout', 'quick_easy']::text[]),
  add column if not exists image_url text
    check (image_url is null or (char_length(image_url) <= 1000 and image_url ~ '^https?://')),
  add column if not exists source_url text
    check (source_url is null or (char_length(source_url) <= 1000 and source_url ~ '^https?://')),
  add column if not exists source_name text check (source_name is null or char_length(source_name) <= 80),
  add column if not exists steps jsonb not null default '[]'
    check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 60),
  add column if not exists total_minutes smallint check (total_minutes is null or total_minutes between 0 and 1440),
  add column if not exists nutrition jsonb
    check (nutrition is null or (
      jsonb_typeof(nutrition) = 'object'
      and jsonb_typeof(nutrition->'kcal') = 'number' and (nutrition->>'kcal')::numeric between 0 and 5000
      and jsonb_typeof(nutrition->'protein') = 'number' and (nutrition->>'protein')::numeric between 0 and 500
      and jsonb_typeof(nutrition->'carbs') = 'number' and (nutrition->>'carbs')::numeric between 0 and 1000
      and jsonb_typeof(nutrition->'fat') = 'number' and (nutrition->>'fat')::numeric between 0 and 500
    )),
  add column if not exists macros_source text not null default 'manual'
    check (macros_source in ('manual', 'site', 'estimated'));

-- Importerade recept har längre namn och fler ingredienser än egna.
alter table client_recipes drop constraint if exists client_recipes_name_check;
alter table client_recipes add constraint client_recipes_name_check check (char_length(name) between 2 and 120);
alter table client_recipes drop constraint if exists client_recipes_items_check;
alter table client_recipes add constraint client_recipes_items_check
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 60);

-- ========================================================== favoriter ===
create table if not exists user_favorite_recipes (
  user_id    uuid not null references profiles on delete cascade,
  recipe_id  uuid not null references client_recipes on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index if not exists user_favorite_recipes_recipe_idx on user_favorite_recipes (recipe_id);

alter table user_favorite_recipes enable row level security;
revoke truncate, trigger, references on user_favorite_recipes from anon, authenticated;
drop policy if exists "favorites: read own" on user_favorite_recipes;
drop policy if exists "favorites: add own" on user_favorite_recipes;
drop policy if exists "favorites: remove own" on user_favorite_recipes;
create policy "favorites: read own" on user_favorite_recipes for select to authenticated
  using (auth.uid() = user_id);
-- Bara recept som användaren själv kan se (RLS på client_recipes gäller i underfrågan).
create policy "favorites: add own" on user_favorite_recipes for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from client_recipes r where r.id = recipe_id));
create policy "favorites: remove own" on user_favorite_recipes for delete to authenticated
  using (auth.uid() = user_id);

-- ================================================ kostdagbok: måltider ===
alter table food_entries
  add column if not exists meal_type text check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  add column if not exists recipe_id uuid references client_recipes on delete set null;

-- Ett loggat recept måste vara klientens eget (FK-kontrollen tittar inte på RLS).
drop policy if exists "food_entries: own recipe insert" on food_entries;
drop policy if exists "food_entries: own recipe update" on food_entries;
create policy "food_entries: own recipe insert" on food_entries as restrictive for insert to authenticated
  with check (recipe_id is null or exists (select 1 from client_recipes r where r.id = recipe_id and r.client_id = food_entries.client_id));
create policy "food_entries: own recipe update" on food_entries as restrictive for update to authenticated
  using (true)
  with check (recipe_id is null or exists (select 1 from client_recipes r where r.id = recipe_id and r.client_id = food_entries.client_id));
