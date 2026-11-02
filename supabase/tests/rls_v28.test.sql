-- Tester för v28: riktiga matfoton (Pexels) – uppladdade foton i Storage behålls.
\set ON_ERROR_STOP on

-- v27-testet satte ett uppladdat foto på linssoppan: det ska ligga kvar.
select test.eq((select image_url from library_recipes where slug = 'rod-linssoppa'),
  'https://example.supabase.co/storage/v1/object/public/recipe-images/rod-linssoppa.jpg', 'uppladdat foto skrivs inte över');
select test.eq((select count(*) from library_recipes where image_url like 'https://images.pexels.com/photos/%'), 33::bigint, '33 recept får Pexels-foto (plus linssoppans egna)');
select test.eq((select image_url from library_recipes where slug = 'kycklingbowl-jasminris-broccoli') like 'https://images.pexels.com/photos/1860208/%', true, 'rätt foto till rätt rätt');
select test.eq((select count(*) from library_recipes where image_url is null), 6::bigint, 'sex rätter utan tillräckligt likt foto får reservbilden');

\warn 'ALLA V28-TESTER (MATFOTON) GODKÄNDA'
