-- Tester för v16: varukorg (cart_items) och PT Boost (trainer_boosts, trainers.boosted_until).
\set ON_ERROR_STOP on
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('pt16@test.se', '{"role":"trainer","full_name":"Bo Boost"}', '{"role":"trainer"}'),
  ('pt17@test.se', '{"role":"trainer","full_name":"Opublicerad PT"}', '{"role":"trainer"}'),
  ('c16@test.se', '{"role":"client","full_name":"Klient Sexton","health_data_consent":true}', '{}'),
  ('c17@test.se', '{"role":"client","full_name":"Klient Sjutton","health_data_consent":true}', '{}');

select test.login('pt16@test.se');
update trainers set is_published = true, price_per_session = 750, city = 'Malmö', specialties = '{hyrox}', offers_nutrition = true where id = auth.uid();
insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, price_sek, active) values
  (auth.uid(), 'single', 'Enstaka pass', 1, false, 750, true),
  (auth.uid(), 'package', 'Program 5 pass', 5, false, 3400, true),
  (auth.uid(), 'nutrition', 'Kostcoaching', 0, true, 900, true),
  (auth.uid(), 'single', 'Gammalt pass', 1, false, 500, false);
select test.logout();
select test.login('pt17@test.se');
insert into trainer_services (trainer_id, kind, title, sessions, price_sek) values (auth.uid(), 'single', 'Dolt pass', 1, 600);
select test.logout();

-- ------------------------------------------------------------- varukorg ---
select id as s_old from trainer_services where title = 'Gammalt pass' \gset
select id as s_hidden from trainer_services where title = 'Dolt pass' \gset
select test.login('c16@test.se');
-- trainer_id sätts från tjänsten, även om klienten skickar något annat.
insert into cart_items (client_id, service_id, trainer_id)
select auth.uid(), id, test.uid('pt17@test.se') from trainer_services where title = 'Enstaka pass' and trainer_id = test.uid('pt16@test.se');
insert into cart_items (client_id, service_id, trainer_id)
select auth.uid(), id, trainer_id from trainer_services where title = 'Kostcoaching' and trainer_id = test.uid('pt16@test.se');
select test.eq((select count(*) from cart_items where trainer_id = test.uid('pt16@test.se')), 2::bigint, 'klienten lägger tjänster i varukorgen (trainer_id från tjänsten)');
-- Samma tjänst två gånger = en rad (on conflict do nothing).
insert into cart_items (client_id, service_id, trainer_id)
select auth.uid(), id, trainer_id from trainer_services where title = 'Enstaka pass' and trainer_id = test.uid('pt16@test.se')
on conflict do nothing;
select test.eq((select count(*) from cart_items), 2::bigint, 'samma tjänst läggs bara in en gång');
select test.fails($$insert into cart_items (client_id, service_id, trainer_id) values (auth.uid(), '$$ || :'s_old' || $$', test.uid('pt16@test.se'))$$,
  'inaktiva tjänster kan inte läggas i varukorgen');
select test.fails($$insert into cart_items (client_id, service_id, trainer_id) values (auth.uid(), '$$ || :'s_hidden' || $$', test.uid('pt17@test.se'))$$,
  'tjänster hos opublicerade PT:er kan inte läggas i varukorgen');
select test.fails($$insert into cart_items (client_id, service_id, trainer_id)
  select test.uid('c17@test.se'), id, trainer_id from trainer_services where title = 'Program 5 pass' and trainer_id = test.uid('pt16@test.se')$$, 'klienten kan inte fylla någon annans varukorg');
select test.fails($$update cart_items set reminded_at = now()$$, 'klienten kan inte ändra påminnelsestatus');
select test.logout();

select test.login('c17@test.se');
select test.eq((select count(*) from cart_items), 0::bigint, 'andra klienter ser inte varukorgen');
select test.logout();
select test.login('pt16@test.se');
select test.eq((select count(*) from cart_items), 0::bigint, 'PT:n ser inte klienters varukorgar');
select test.fails($$insert into cart_items (client_id, service_id, trainer_id)
  select auth.uid(), id, trainer_id from trainer_services where title = 'Program 5 pass' and trainer_id = test.uid('pt16@test.se')$$, 'PT:er har ingen varukorg');
select test.logout();

-- Betald tjänst försvinner ur varukorgen, resten ligger kvar.
select test.login('c16@test.se');
select (create_checkout(array(select id from trainer_services where title = 'Enstaka pass' and trainer_id = test.uid('pt16@test.se'))))->>'checkout_id' as co16 \gset
select test.eq((select count(*) from cart_items), 2::bigint, 'en obetald kassa rör inte varukorgen');
select test.logout();
set role service_role;
select mark_checkout_paid(:'co16', 'cs_16', 'pi_16', 750);
reset role;
select test.login('c16@test.se');
select test.eq((select array_agg(s.title) from cart_items c join trainer_services s on s.id = c.service_id), array['Kostcoaching'],
  'betald tjänst tas bort ur varukorgen');
delete from cart_items where service_id = (select id from trainer_services where title = 'Kostcoaching' and trainer_id = test.uid('pt16@test.se'));
select test.eq((select count(*) from cart_items), 0::bigint, 'klienten tömmer sin varukorg');
insert into cart_items (client_id, service_id, trainer_id)
select auth.uid(), id, trainer_id from trainer_services where title = 'Program 5 pass' and trainer_id = test.uid('pt16@test.se');
select test.logout();

-- Övergivna varukorgar (för påminnelser): bara servern.
select test.login('c16@test.se');
select test.fails($$select * from abandoned_carts()$$, 'klienter kan inte lista övergivna varukorgar');
select test.logout();
update cart_items set added_at = now() - interval '2 days' where client_id = test.uid('c16@test.se');
set role service_role;
select test.eq((select total_sek from abandoned_carts(interval '24 hours') where client_id = test.uid('c16@test.se')), 3400,
  'övergiven varukorg hittas med summa');
select test.eq((select count(*) from abandoned_carts(interval '3 days')), 0::bigint, 'nyare varukorgar räknas inte');
select test.eq(mark_cart_reminded(test.uid('c16@test.se')), 1, 'påminnelsen registreras');
select test.eq((select count(*) from abandoned_carts(interval '24 hours') where client_id = test.uid('c16@test.se')), 0::bigint,
  'klienten påminns bara en gång');
reset role;

-- --------------------------------------------------------------- boost ---
select test.login('c16@test.se');
select test.fails($$select create_boost_checkout()$$, 'klienter kan inte köpa boost');
select test.logout();
select test.login('pt17@test.se');
select test.fails($$select create_boost_checkout()$$, 'opublicerad profil kan inte boostas');
select test.logout();

select test.login('pt16@test.se');
select test.fails($$update trainers set boosted_until = now() + interval '30 days' where id = auth.uid()$$, 'PT:n kan inte sätta boosted_until själv');
select test.fails($$insert into trainer_boosts (trainer_id, price_sek, duration_days, status) values (auth.uid(), 1, 31, 'paid')$$,
  'PT:n kan inte skapa betalda boostar');
select create_boost_checkout() as b1 \gset
select test.eq((:'b1'::jsonb)->>'price_sek', '199', 'boost kostar 199 kr');
select test.eq((:'b1'::jsonb)->>'duration_days', '7', 'boost gäller 7 dagar');
select attach_boost_session(((:'b1'::jsonb)->>'boost_id')::uuid, 'cs_b1');
select test.eq((select status::text || ':' || stripe_session_id from trainer_boosts where id = ((:'b1'::jsonb)->>'boost_id')::uuid), 'pending:cs_b1',
  'PT:n ser sitt obetalda boostköp med Stripe-session');
select test.fails($$select mark_boost_paid('$$ || ((:'b1'::jsonb)->>'boost_id') || $$', 'cs_b1', 'pi_b1', 199)$$, 'PT:n kan inte markera boost som betald');
select test.logout();

set role service_role;
select test.fails($$select mark_boost_paid('$$ || ((:'b1'::jsonb)->>'boost_id') || $$', 'cs_b1', 'pi_b1', 1)$$, 'fel belopp avvisas');
select mark_boost_paid(((:'b1'::jsonb)->>'boost_id')::uuid, 'cs_b1', 'pi_b1', 199) as until1 \gset
select test.eq(:'until1'::timestamptz between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute', true,
  'betald boost: synlig i 7 dagar');
select test.eq(mark_boost_paid(((:'b1'::jsonb)->>'boost_id')::uuid, 'cs_b1', 'pi_b1', 199), :'until1'::timestamptz, 'betalningen är idempotent');
reset role;
select test.eq((select boosted_until from trainers where id = test.uid('pt16@test.se')), :'until1'::timestamptz, 'boosted_until sätts på PT-profilen');

-- En ny boost under en pågående läggs efter den.
select test.login('pt16@test.se');
select (create_boost_checkout())->>'boost_id' as b2 \gset
select test.logout();
set role service_role;
select test.eq(mark_boost_paid(:'b2', 'cs_b2', 'pi_b2', 199), :'until1'::timestamptz + interval '7 days', 'ny boost förlänger med 7 dagar');
reset role;

select test.login('c17@test.se');
select test.eq((select boosted_until from trainers where id = test.uid('pt16@test.se')), :'until1'::timestamptz + interval '7 days',
  'klienter ser vilka PT:er som är boostade');
select test.eq((select count(*) from trainer_boosts), 0::bigint, 'klienter ser inte boostköp');
select test.logout();

-- Återbetalning kortar synligheten.
set role service_role;
select test.eq(mark_boost_refunded('pi_b2'), 1, 'återbetald boost registreras');
select test.eq(mark_boost_refunded('pi_b2'), 0, 'återbetalningen är idempotent');
reset role;
select test.eq((select boosted_until from trainers where id = test.uid('pt16@test.se')), :'until1'::timestamptz, 'återbetald boost tar bort 7 dagar');
select test.login('pt16@test.se');
select test.eq((select array_agg(status::text order by created_at) from trainer_boosts), array['paid', 'refunded'], 'PT:n ser sin boosthistorik');
select test.logout();

\warn 'ALLA V16-TESTER (VARUKORG, PT BOOST) GODKÄNDA'
