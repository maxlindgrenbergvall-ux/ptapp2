-- Tester för v9: enhet (g/ml), bild och svensk marknad på produkter.
\set ON_ERROR_STOP on

-- Servern (service role/postgres) cachar Open Food Facts-produkter.
insert into food_products (barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, unit, image_url, sold_in_se, source)
values ('7350042710095', 'Nocco BCAA Caribbean', 'Nocco', 1, 0.5, 0, 0, 330, 'ml', 'https://images.openfoodfacts.org/x.jpg', true, 'openfoodfacts');
select test.eq((select unit from food_products where barcode = '7350042710095'), 'ml', 'drycker sparas per 100 ml');
select test.fails($$insert into food_products (name, kcal_100g, unit, source) values ('Fel enhet', 1, 'st', 'openfoodfacts')$$, 'okänd enhet avvisas');
select test.fails($$insert into food_products (name, kcal_100g, image_url, source) values ('Osäker bild', 1, 'http://x.se/a.jpg', 'openfoodfacts')$$, 'bara https-bilder');

select test.login('c10@test.se');
select test.eq((select sold_in_se from food_products where barcode = '7350042710095'), true, 'klienter ser cachade svenska produkter');
-- Egen produkt per 100 ml (t.ex. en dryck som saknas i Open Food Facts).
insert into food_products (barcode, name, brand, kcal_100g, unit, source, created_by)
values ('7300000000017', 'Egen sportdryck', 'Lokal', 24, 'ml', 'custom', auth.uid());
select test.eq((select unit from food_products where source = 'custom' and created_by = auth.uid()), 'ml', 'egen produkt kan anges per 100 ml');
select test.fails($$insert into food_products (barcode, name, kcal_100g, unit, sold_in_se, source) values ('7300000000024', 'Falsk cache', 1, 'g', true, 'openfoodfacts')$$,
  'klienter kan inte skriva till den delade cachen');
select test.logout();

select test.login('c11@test.se');
select test.eq((select count(*) from food_products where source = 'custom' and name = 'Egen sportdryck'), 0::bigint, 'egna produkter är fortfarande privata');
select test.logout();

\warn 'ALLA V9-TESTER (SVENSKA LIVSMEDEL) GODKÄNDA'
