-- RLS-tester för v3 (livsmedelsprodukter, matposter med streckkod, övningsnamn per klient).
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data) values
  ('pt5@test.se', '{"role":"trainer","full_name":"PT Fem"}'),
  ('pt6@test.se', '{"role":"trainer","full_name":"PT Sex"}'),
  ('c5@test.se',  '{"role":"client","full_name":"Klient Fem","health_data_consent":true}'),
  ('c6@test.se',  '{"role":"client","full_name":"Klient Sex","health_data_consent":true}');

select test.login('c5@test.se');
insert into coaching_relationships (trainer_id, client_id) values (test.uid('pt5@test.se'), auth.uid());
select test.logout();
select test.login('pt5@test.se');
update coaching_relationships set status = 'active' where client_id = test.uid('c5@test.se');
select test.logout();

-- ------------------------------------------------------------ produkter ---
-- Servern cachar en Open Food Facts-produkt.
insert into food_products (barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, source)
values ('7310865004703', 'Mellanmjölk', 'Arla', 46, 3.5, 4.8, 1.5, 'openfoodfacts');

select test.login('c5@test.se');
select test.eq((select count(*) from food_products), 1::bigint, 'klient ser cachade Open Food Facts-produkter');
insert into food_products (barcode, name, kcal_100g, protein_100g, source, created_by)
values ('1234567890123', 'Mammas proteinbollar', 410, 18, 'custom', auth.uid());
select test.fails($$insert into food_products (barcode, name, kcal_100g, source) values ('9999999999999', 'Falsk OFF', 1, 'openfoodfacts')$$,
  'klient kan inte skriva i den delade produktcachen');
select test.fails($$insert into food_products (name, kcal_100g, source, created_by) values ('Annans', 1, 'custom', test.uid('c6@test.se'))$$,
  'klient kan inte skapa produkt i någon annans namn');
select test.fails($$insert into food_products (barcode, name, kcal_100g, source, created_by) values ('abc', 'Fel kod', 1, 'custom', auth.uid())$$,
  'ogiltig streckkod nekas');
select test.fails($$insert into food_products (name, kcal_100g, protein_100g, source, created_by) values ('Orimlig', 100, 150, 'custom', auth.uid())$$,
  'orimliga makron per 100 g nekas');
insert into food_entries (client_id, date, name, kcal, protein_g, grams, barcode, product_id)
select auth.uid(), current_date, 'Mellanmjölk 250 g', 115, 8.8, 250, '7310865004703', id from food_products where source = 'openfoodfacts';
select test.eq((select grams from food_entries), 250.0::numeric(7,1), 'matpost sparar gram och streckkod');
select test.logout();

select test.login('c6@test.se');
select test.eq((select count(*) from food_products where source = 'custom'), 0::bigint, 'egna produkter är privata');
select test.logout();

-- ------------------------------------------------- övningsnamn per klient ---
select test.login('pt5@test.se');
insert into client_exercise_aliases (client_id, exercise_id, trainer_id, name)
values (test.uid('c5@test.se'), 'e-squat', auth.uid(), 'Knäböj med paus i botten');
select test.fails($$insert into client_exercise_aliases (client_id, exercise_id, trainer_id, name) values (test.uid('c6@test.se'), 'e-squat', auth.uid(), 'Intrång')$$,
  'PT kan bara döpa om övningar för sina egna klienter');
select test.fails($$insert into client_exercise_aliases (client_id, exercise_id, trainer_id, name) values (test.uid('c5@test.se'), 'finns-inte', auth.uid(), 'X')$$,
  'alias måste peka på en befintlig övning');
update client_exercise_aliases set name = 'Pausknäböj' where client_id = test.uid('c5@test.se');
select test.logout();

select test.login('c5@test.se');
select test.eq((select name from client_exercise_aliases where exercise_id = 'e-squat'), 'Pausknäböj', 'klienten ser PT:ns namn');
update client_exercise_aliases set name = 'Eget namn';
select test.eq((select name from client_exercise_aliases where exercise_id = 'e-squat'), 'Pausknäböj', 'klientens ändringsförsök påverkar inget');
select test.logout();

select test.login('pt6@test.se');
select test.eq((select count(*) from client_exercise_aliases), 0::bigint, 'annan PT ser inte aliasen');
select test.logout();

select test.eq((select name from exercises where id = 'e-pullup'), 'Pull-ups (överhandsgrepp)', 'övningsbiblioteket är uppdaterat (rättat namn)');
select test.eq((select count(*) from exercises where owner_id is null), 127::bigint, 'övningsbiblioteket har 127 övningar');

\warn 'ALLA V3-TESTER GODKÄNDA'
