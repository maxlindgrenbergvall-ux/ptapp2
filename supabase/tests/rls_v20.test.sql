-- Tester för v20 (lansering): RLS på alla tabeller, kontoradering för alla sorters konton och avidentifiering.
\set ON_ERROR_STOP on

-- ------------------------------------------------------- RLS överallt ---
select test.eq((select string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity), null,
  'alla tabeller i public har Row Level Security påslaget');
select test.eq((select count(*) from pg_tables where schemaname = 'public' and rowsecurity
                and tablename in ('custom_exercises', 'pt_invites', 'referrals', 'cart_items')), 4::bigint,
  'custom_exercises, pt_invites, referrals och cart_items har RLS');
-- Tabeller med RLS men utan en enda policy är helt stängda för användare (avsiktligt för interna tabeller).
select test.eq((select string_agg(t.tablename, ', ' order by t.tablename) from pg_tables t
                where t.schemaname = 'public' and t.tablename in ('custom_exercises', 'pt_invites', 'referrals', 'cart_items')
                  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)), null,
  'de nya tabellerna har policyer (ägaren når sin egen data)');
set role anon;
select test.fails($$select * from custom_exercises$$, 'anonyma: custom_exercises stängd');
select test.fails($$select * from pt_invites$$, 'anonyma: pt_invites stängd');
select test.eq((select count(*) from referrals), 0::bigint, 'anonyma: inga inbjudningar');
select test.eq((select count(*) from cart_items), 0::bigint, 'anonyma: inga varukorgar');
select test.fails($$select delete_my_account()$$, 'anonyma kan inte radera konton');
reset role;

-- ------------------------------------------------------ villkor godkända ---
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ('villkor@test.se', '{"full_name":"Vera Villkor"}', '{}');
select test.eq((select terms_accepted_at from profiles where id = test.uid('villkor@test.se')), null::timestamptz, 'inga villkor godkända innan bockrutan');
select test.login('villkor@test.se');
select complete_onboarding('client', 'Vera Villkor', '+46701234567', true);
select test.logout();
select test.eq((select terms_accepted_at is not null and terms_accepted_at = health_data_consent_at from profiles where id = test.uid('villkor@test.se')), true,
  'bockrutan sparar både hälsosamtycke och godkända villkor');

-- ------------------------------------------------------- kontoradering ---
-- Inbjudare (v18): kunde inte radera sitt konto innan v20.
select test.login('ref-a@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from auth.users where email = 'ref-a@test.se'), 0::bigint, 'den som bjudit in en vän kan radera sitt konto');
select test.eq((select count(*) from profiles where referred_by is not null and not exists (select 1 from profiles x where x.id = profiles.referred_by)), 0::bigint,
  'den inbjudnas referred_by nollställs');
select test.eq((select count(*) from referrals r where not exists (select 1 from profiles p where p.id = r.referrer_id)), 0::bigint, 'inbjudningarna raderas');

-- Klient med köp, kassor, varukorg och relation.
select test.login('c17@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from purchases where client_id = test.uid('c17@test.se')) + (select count(*) from checkout_fees where client_id = test.uid('c17@test.se'))
  + (select count(*) from cart_items where client_id = test.uid('c17@test.se')), 0::bigint, 'klient med köp och varukorg raderas helt');

-- Befintlig klient (v19) med egna övningar och inlöst PT-kod.
select id as c19a from auth.users where email = 'c19a@test.se' \gset
select test.login('c19a@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from custom_exercises where user_id = :'c19a'), 0::bigint, 'klientens egna övningar raderas');
select test.eq((select count(*) from coaching_relationships where client_id = :'c19a'), 0::bigint, 'relationen till PT:n raderas');
select test.eq((select used_by from pt_invites where used_by = :'c19a'), null::uuid, 'PT:ns kod finns kvar men utan klientens id');

-- Omdöme och aviseringar: PT:n behåller dem, utan klientens namn.
select id as c10 from auth.users where email = 'c10@test.se' \gset
insert into reviews (trainer_id, author_id, author_name, rating, text)
select t.id, :'c10', 'Klient Tio', 5, 'Bästa PT:n!' from trainers t join auth.users u on u.id = t.id where u.email = 'pt16@test.se';
-- En avisering som inte hör till ett pass (finns kvar när klienten raderas).
insert into notifications (user_id, actor_id, kind, payload)
select t.id, :'c10', 'booking_requested', '{"actor_name":"Klient Tio","title":"PT-pass"}' from trainers t join auth.users u on u.id = t.id where u.email = 'pt16@test.se';
select test.eq((select count(*) from notifications where actor_id = :'c10' and payload->>'actor_name' = 'Klient Tio') > 0, true, 'aviseringar med klientens namn finns');
select test.login('c10@test.se');
select delete_my_account();
select test.logout();
select test.eq((select author_name || ':' || coalesce(author_id::text, 'null') from reviews where text = 'Bästa PT:n!'), 'Tidigare klient:null', 'omdömet blir anonymt');
select test.eq((select count(*) from notifications where payload->>'actor_name' = 'Klient Tio'), 0::bigint, 'aviseringarna visar inte längre namnet');
select test.eq((select payload->>'actor_name' || ':' || coalesce(actor_id::text, 'null') from notifications where payload->>'title' = 'PT-pass' and event_id is null and created_at > now() - interval '1 minute' limit 1),
  'Raderat konto:null', 'PT:ns avisering finns kvar men visar "Raderat konto"');

-- PT med tjänster, koder, boost och klienter.
select id as pt16 from auth.users where email = 'pt16@test.se' \gset
select test.login('pt16@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from trainers where id = :'pt16') + (select count(*) from trainer_services where trainer_id = :'pt16')
  + (select count(*) from pt_invites where pt_id = :'pt16') + (select count(*) from trainer_boosts where trainer_id = :'pt16'), 0::bigint,
  'PT med tjänster, koder och boost raderas helt');

-- PT som värvat en annan PT (v18).
select test.login('pt-ref@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from auth.users where email = 'pt-ref@test.se'), 0::bigint, 'PT som värvat en PT kan radera sitt konto');

-- En användare kan bara radera sig själv.
select test.login('c19b@test.se');
select delete_my_account();
select test.logout();
select test.eq((select count(*) from auth.users where email in ('c19b@test.se')), 0::bigint, 'bara det egna kontot raderas');
select test.eq((select count(*) from auth.users where email = 'villkor@test.se'), 1::bigint, 'andra konton finns kvar');

\warn 'ALLA V20-TESTER (RLS, KONTORADERING, VILLKOR) GODKÄNDA'
