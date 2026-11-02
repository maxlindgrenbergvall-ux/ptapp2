-- Tester för v27: inga illustrationer kvar, bucket för riktiga receptfoton.
\set ON_ERROR_STOP on

select test.eq((select count(*) from library_recipes where image_url like '/recipes/%'), 0::bigint, 'inga illustrerade bilder kvar');
select test.eq((select count(*) from library_recipes where image_url is not null and image_url !~ '^https://'), 0::bigint, 'bilder är riktiga https-länkar (eller saknas)');
select test.eq((select public from storage.buckets where id = 'recipe-images'), true, 'bucketen recipe-images är publik för läsning');
select test.eq((select file_size_limit from storage.buckets where id = 'recipe-images'), 2097152::bigint, 'max 2 MB per foto');

-- Uppladdade foton skrivs inte över när seeden körs om.
update library_recipes set image_url = 'https://example.supabase.co/storage/v1/object/public/recipe-images/rod-linssoppa.jpg' where slug = 'rod-linssoppa';
insert into library_recipes (id, slug, name, servings, total_minutes, goal_types, image_url, items, steps, nutrition)
select id, slug, name, servings, total_minutes, goal_types, null, items, steps, nutrition from library_recipes where slug = 'rod-linssoppa'
on conflict (id) do update set name = excluded.name, image_url = coalesce(excluded.image_url, library_recipes.image_url);
select test.eq((select image_url from library_recipes where slug = 'rod-linssoppa'), 'https://example.supabase.co/storage/v1/object/public/recipe-images/rod-linssoppa.jpg', 'uppladdat foto ligger kvar efter ny seed');

select test.login('v26-a@test.se');
select test.fails($$insert into storage.objects (bucket_id, name) values ('recipe-images', 'fusk.jpg')$$, 'användare kan inte ladda upp receptfoton');
select test.logout();

\warn 'ALLA V27-TESTER (RECEPTFOTON) GODKÄNDA'
