-- Tester för v82: intäkts- och prenumerationshändelser, besök, aktivitet och
-- adminpanelens analysfunktion.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v82-pt@test.se', '{"full_name":"Petra PT"}', '{"role":"trainer"}');
insert into auth.users (email, raw_user_meta_data) values
  ('v82-klient@test.se', '{"role":"client","full_name":"Kim Klient","health_data_consent":true}'),
  ('v82-plus@test.se', '{"role":"client","full_name":"Pia Plus","health_data_consent":true}'),
  ('v82-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}');
insert into app_admins (user_id) values (test.uid('v82-admin@test.se'));

-- ------------------------------------------- 1. Stripe via databasen ---
-- En PT-bokning: 1 000 kr till PT:n + 100 kr serviceavgift (Coaviras intäkt).
select gen_random_uuid() as co \gset
insert into purchases (checkout_id, client_id, trainer_id, kind, title, sessions, price_sek)
values (:'co', test.uid('v82-klient@test.se'), test.uid('v82-pt@test.se'), 'package', 'Fem pass', 5, 1000);
insert into checkout_fees (checkout_id, client_id, subtotal_sek, fee_percent, fee_sek)
values (:'co', test.uid('v82-klient@test.se'), 1000, 10, 100);
select test.eq((select count(*) from revenue_events), 0::bigint, 'obetalt köp ger ingen intäkt');
update purchases set status = 'paid', paid_at = now() where checkout_id = :'co';
select test.eq((select gross_sek || ':' || net_sek || ':' || vat_sek || ':' || gmv_sek from revenue_events where external_id = 'checkout:' || :'co'),
  '100.00:100.00:20.00:1100.00', 'betald bokning: avgiften 100 kr (varav 20 kr moms), GMV 1 100 kr');
update purchases set status = 'paid' where checkout_id = :'co';
select test.eq((select count(*) from revenue_events where kind = 'pt_booking'), 1::bigint, 'samma kassa räknas bara en gång');

-- Plus på webben (engångsköp, 49 kr / 30 dagar).
insert into plus_purchases (user_id, days, price_sek) values (test.uid('v82-plus@test.se'), 30, 49) returning id as plus_id \gset
update plus_purchases set status = 'paid', paid_at = now() where id = :'plus_id';
select test.eq((select kind || ':' || gross_sek || ':' || period_days from revenue_events where external_id = 'plus:' || :'plus_id'),
  'plus:49.00:30', 'Plus på webben blir en intäkt');

-- Återbetald bokning räknas inte längre.
select gen_random_uuid() as co2 \gset
insert into purchases (checkout_id, client_id, trainer_id, kind, title, sessions, price_sek, status, paid_at)
values (:'co2', test.uid('v82-klient@test.se'), test.uid('v82-pt@test.se'), 'single', 'Ett pass', 1, 500, 'pending', null);
update purchases set status = 'paid', paid_at = now() where checkout_id = :'co2';
update purchases set status = 'refunded' where checkout_id = :'co2';
select test.eq((select refunded_at is not null from revenue_events where external_id = 'checkout:' || :'co2'), true, 'återbetalning markeras');

-- ----------------------------------------------------- 2. webhookarna ---
select test.login('v82-klient@test.se');
select test.fails($$select record_revenue_event('{"provider":"stripe","external_id":"x","event_type":"ONE_TIME","gross_sek":1}')$$, 'användare kan inte skriva intäkter');
select test.fails($$select record_subscription_event('{"provider":"stripe","external_id":"x","event_type":"expired"}')$$, 'eller prenumerationshändelser');
select test.fails($$select mark_revenue_refunded('stripe', 'plus:x')$$, 'eller återbetala');
select test.fails($$insert into landing_page_views (visitor_hash) values (repeat('a', 64))$$, 'eller besök');
select test.eq((select count(*) from revenue_events), 0::bigint, 'och ser inga intäkter');
select test.logout();

set role service_role;
-- RevenueCat: Plus i App Store, 49 kr, 15 % avgift → 41,65 kr netto, ingen moms (MoR).
select test.eq(record_revenue_event(jsonb_build_object(
  'provider', 'revenuecat', 'external_id', 'rc_tx_1', 'kind', 'plus', 'event_type', 'INITIAL_PURCHASE',
  'user_id', test.uid('v82-plus@test.se'), 'product_id', 'coavira_plus_monthly', 'store', 'APP_STORE',
  'gross_sek', 49, 'store_fee_sek', 7.35, 'is_subscription', true, 'period_days', 30,
  'period_end', now() + interval '20 days', 'occurred_at', now() - interval '10 days')), true, 'RevenueCat-köp sparas');
select test.eq(record_revenue_event(jsonb_build_object('provider', 'revenuecat', 'external_id', 'rc_tx_1', 'event_type', 'INITIAL_PURCHASE', 'gross_sek', 49)),
  false, 'samma transaktion två gånger räknas en gång');
select test.eq(record_revenue_event(jsonb_build_object('provider', 'revenuecat', 'external_id', 'rc_sandbox', 'kind', 'plus', 'event_type', 'INITIAL_PURCHASE',
  'gross_sek', 49, 'environment', 'SANDBOX')), true, 'sandbox-köp sparas men räknas inte');
select test.eq(record_revenue_event(jsonb_build_object('provider', 'revenuecat', 'external_id', 'rc_okand', 'event_type', 'RENEWAL',
  'user_id', gen_random_uuid(), 'gross_sek', 10)), true, 'okänd användare sparas utan koppling');
reset role;
select test.eq((select net_sek || ':' || vat_sek from revenue_events where external_id = 'rc_tx_1'), '41.65:0.00', 'netto efter butikens avgift, ingen moms');
select test.eq((select user_id is null from revenue_events where external_id = 'rc_okand'), true, 'okänt id kopplas inte');
set role service_role;
select test.eq(mark_revenue_refunded('revenuecat', 'rc_okand'), true, 'webhooken kan återbetala');
select test.eq(mark_revenue_refunded('revenuecat', 'rc_okand'), false, 'återbetalning är idempotent');
select test.eq(record_subscription_event(jsonb_build_object('provider', 'revenuecat', 'external_id', 'rc_cancel_1', 'event_type', 'cancelled',
  'user_id', test.uid('v82-plus@test.se'), 'product_id', 'coavira_plus_monthly', 'store', 'APP_STORE',
  'unsubscribe_detected_at', now(), 'cancel_reason', 'UNSUBSCRIBE')), true, 'uppsägning sparas');
select test.eq(record_subscription_event(jsonb_build_object('provider', 'revenuecat', 'external_id', 'rc_cancel_1', 'event_type', 'cancelled')),
  false, 'samma händelse en gång');
insert into landing_page_views (visitor_hash, event, path, referrer, utm_source) values
  (repeat('a', 64), 'pageview', '/', 'google.com', null),
  (repeat('a', 64), 'pageview', '/bli-pt', 'google.com', null),
  (repeat('b', 64), 'pageview', '/', null, 'instagram'),
  (repeat('b', 64), 'cta_signup', '/', null, 'instagram');
reset role;
select test.fails($$insert into landing_page_views (visitor_hash) values ('inte-en-hash')$$, 'visitor_hash måste vara SHA-256');

-- ------------------------------------------------------ 3. aktivitet ---
select test.login('v82-pt@test.se');
select test.eq(touch_activity(), true, 'första pingen sparas');
select test.eq(touch_activity(), false, 'inom 5 minuter: inget skrivs');
select test.fails('select last_seen_at from profiles where id = auth.uid()', 'last_seen_at kan inte läsas av användare');
select test.fails('update profiles set last_seen_at = now() - interval ''1 day'' where id = auth.uid()', 'eller ändras');
select test.eq((select count(*) from user_activity_logs), 0::bigint, 'aktivitetsloggen syns inte för användare');
select test.logout();
update profiles set last_seen_at = now() - interval '6 minutes' where id = test.uid('v82-pt@test.se');
select test.login('v82-pt@test.se');
select test.eq(touch_activity(), true, 'efter 5 minuter: nästa ping sparas');
select test.logout();
select test.eq((select pings from user_activity_logs where user_id = test.uid('v82-pt@test.se')), 2, 'en rad per dag – två pingar');
select test.login('v82-klient@test.se');
select test.eq(touch_activity(), true, 'klientens ping');
select test.logout();
select test.eq(touch_activity(), false, 'utan inloggning händer inget');

-- ------------------------------------------------------- 4. analysen ---
select test.login('v82-pt@test.se');
select test.fails('select get_admin_crm_analytics(30)', 'PT:er kan inte läsa statistiken');
select test.logout();
select test.login('v82-klient@test.se');
select test.fails('select get_admin_crm_analytics(30)', 'klienter kan inte läsa statistiken');
select test.logout();

select test.login('v82-admin@test.se');
select get_admin_crm_analytics(30) as a \gset
select test.eq((:'a'::jsonb #>> '{economy,month,stripe,net}')::numeric, 149::numeric, 'Stripe denna månad: 100 kr avgift + 49 kr Plus (återbetalt räknas inte)');
select test.eq((:'a'::jsonb #>> '{economy,month,stripe,gmv}')::numeric, 1149::numeric, 'GMV: 1 100 + 49 kr');
select test.eq((:'a'::jsonb #>> '{economy,month,stripe,vat}')::numeric, 29.8::numeric, 'utgående moms 20 + 9,80 kr');
select test.eq((:'a'::jsonb #>> '{economy,month,revenuecat,net}')::numeric, 41.65::numeric, 'RevenueCat netto (sandbox och återbetalt räknas inte)');
select test.eq((:'a'::jsonb #>> '{economy,mrr,revenuecat}')::numeric, 41.65::numeric, 'MRR: en månadsprenumeration');
select test.eq((:'a'::jsonb #>> '{economy,remaining_renewals,revenuecat}')::numeric, 0::numeric, 'uppsagd prenumeration förnyas inte i prognosen');
select test.eq((:'a'::jsonb #>> '{traffic,totals,visitors}')::int, 2, 'två unika besökare');
select test.eq((:'a'::jsonb #>> '{traffic,totals,views}')::int, 3, 'tre sidvisningar');
select test.eq((:'a'::jsonb #>> '{traffic,totals,cta_signup}')::int, 1, 'ett klick på Skapa konto');
select test.eq((:'a'::jsonb #>> '{traffic,funnel,booked_pt}')::int >= 1, true, 'klienter som bokat PT räknas');
select test.eq((:'a'::jsonb #>> '{activity,active_now,trainer}')::int, 1, 'en PT aktiv just nu');
select test.eq((:'a'::jsonb #>> '{activity,active_now,client}')::int, 1, 'en klient aktiv just nu');
select test.eq((:'a'::jsonb #>> '{activity,dau}')::int, 2, 'DAU');
select test.eq(jsonb_array_length(:'a'::jsonb #> '{activity,daily}'), 30, '30 dagar aktivitet');
select test.eq(jsonb_array_length(:'a'::jsonb #> '{growth,weekly}'), 12, '12 veckor tillväxt');
select test.eq(jsonb_array_length(:'a'::jsonb #> '{plus,monthly}'), 12, '12 månader Plus');
select test.eq((:'a'::jsonb #>> '{plus,cancelled_this_month}')::int, 1, 'en uppsägning denna månad');
select test.eq((:'a'::jsonb #>> '{kpis,pts,onboarding}')::int >= 1, true, 'PT:n är inte aktiverad än');
select test.eq((:'a'::jsonb #>> '{kpis,clients,paying_pt}')::int >= 1, true, 'betalande PT-klient räknas');
select test.eq(jsonb_array_length(get_admin_crm_analytics(7) #> '{traffic,daily}'), 7, 'perioden styr besöksgrafen');
select test.eq(jsonb_array_length(get_admin_crm_analytics(9999) #> '{traffic,daily}'), 365, 'perioden begränsas till ett år');
select test.eq((select count(*) from revenue_events) >= 5, true, 'admin läser intäktshändelserna');
select test.eq((select count(*) from landing_page_views), 4::bigint, 'admin läser besöken');
select test.logout();
