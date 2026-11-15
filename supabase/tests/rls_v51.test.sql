-- Tester för v51: PT:ns hemsida/Instagram + en övergripande säkerhetskontroll.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v51-pt@test.se', '{"role":"trainer","full_name":"Pia PT"}', '{"role":"trainer"}'),
  ('v51-pt2@test.se', '{"role":"trainer","full_name":"Per PT"}', '{"role":"trainer"}');

select test.login('v51-pt@test.se');
update trainers set website_url = 'https://piapt.se/om-mig', instagram = 'pia.pt_' where id = auth.uid();
select test.eq((select website_url from trainers where id = auth.uid()), 'https://piapt.se/om-mig', 'PT sparar sin hemsida');
select test.eq((select instagram from trainers where id = auth.uid()), 'pia.pt_', 'PT sparar sitt Instagramkonto');
select test.fails($$update trainers set website_url = 'javascript:alert(1)' where id = auth.uid()$$, 'javascript:-länk stoppas');
select test.fails($$update trainers set website_url = 'https://pia pt.se' where id = auth.uid()$$, 'mellanslag i adressen stoppas');
select test.fails($$update trainers set website_url = 'https://piapt.se/"><script>' where id = auth.uid()$$, 'html i adressen stoppas');
select test.fails($$update trainers set website_url = 'ftp://piapt.se' where id = auth.uid()$$, 'annat protokoll än http(s) stoppas');
select test.fails($$update trainers set instagram = '@pia.pt' where id = auth.uid()$$, '@ i Instagramnamnet stoppas');
select test.fails($$update trainers set instagram = 'pia/../x' where id = auth.uid()$$, 'snedstreck i Instagramnamnet stoppas');
select test.fails($$update trainers set instagram = repeat('a', 31) where id = auth.uid()$$, 'för långt Instagramnamn stoppas');
update trainers set website_url = null, instagram = null where id = auth.uid();
select test.eq((select count(*) from trainers where id = auth.uid() and website_url is null and instagram is null), 1::bigint, 'PT kan ta bort länkarna');
update trainers set website_url = 'https://piapt.se', instagram = 'pia.pt' where id = auth.uid();
select test.logout();

select test.login('v51-pt2@test.se');
update trainers set website_url = 'https://fel.se', instagram = 'kapad' where id = test.uid('v51-pt@test.se');
select test.logout();
select test.eq((select instagram from trainers where id = test.uid('v51-pt@test.se')), 'pia.pt', 'en annan PT kan inte ändra länkarna');

set role anon;
select test.fails('select website_url from trainers limit 1', 'anon: ingen åtkomst till trainers');
reset role;

-- ------------------------------------------- övergripande kontroll (v51) ---
-- 1. RLS är påslagen på VARJE tabell i public. En ny tabell utan RLS fångas här.
select test.eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'RLS påslagen på alla tabeller i public');

-- 2. anon har inga tabellbehörigheter alls.
select test.eq(
  (select coalesce(string_agg(distinct table_name, ', '), '')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  '', 'anon saknar behörigheter på alla tabeller');

-- 3. Alla security definer-funktioner har låst search_path (annars kan en
--    användare skugga en tabell/funktion och köra kod med ägarens rättigheter).
select test.eq(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  '', 'security definer-funktioner har fast search_path');

-- 4. Ingen tabell ger anon eller authenticated en policy som är "using (true)" för skrivning.
select test.eq(
  (select coalesce(string_agg(tablename || '.' || policyname, ', '), '')
     from pg_policies
    where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, 'true') = 'true' and coalesce(with_check, qual, 'true') = 'true')),
  '', 'ingen skrivpolicy släpper in alla');
