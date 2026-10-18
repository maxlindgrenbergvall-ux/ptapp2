-- ============================================================================
-- Coavira v9: svenska livsmedel och drycker i produktdatabasen.
--
-- * food_products får enhet (g eller ml – drycker som Nocco, Celsius och läsk
--   anges per 100 ml), produktbild och om varan säljs i Sverige (enligt Open
--   Food Facts), så att svenska varor kan rangordnas först i sökningen.
-- * Open Food Facts-produkter som användare sökt fram eller skannat cachas här
--   (av servern med service role). Sökningen använder cachen först, så vanliga
--   svenska varor hittas även om Open Food Facts är långsamt eller nere.
-- * Egna produkter (custom) är som förut privata för den som skapat dem.
--
-- Körs efter 20261021000000_v8_trainers_email_only.sql.
-- ============================================================================

alter table food_products
  add column unit        text not null default 'g' check (unit in ('g', 'ml')),
  add column image_url   text check (image_url ~ '^https://' and char_length(image_url) <= 500),
  add column sold_in_se  boolean not null default false;

-- Prefixsökning på namn och varumärke (t.ex. "barebells cook" → Barebells Cookies & Cream).
create index food_products_search_idx on food_products
  using gin (to_tsvector('simple', name || ' ' || coalesce(brand, '')))
  where source = 'openfoodfacts';
drop index if exists food_products_name_idx;

-- Matposter: mängden i gram eller ml (t.ex. "Nocco 330 ml").
alter table food_entries
  add column unit text not null default 'g' check (unit in ('g', 'ml'));
