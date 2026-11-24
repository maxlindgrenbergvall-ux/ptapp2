-- Tester för v75: friskvård – företagsuppgifter, friskvårdspaket, betalningskälla,
-- chattens anti-leakage, kvitton och Coavira+ vid friskvårdsköp.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v75-pt@test.se', '{"role":"trainer","full_name":"Petra Friskvård"}', '{"role":"trainer"}'),
  ('v75-egen@test.se', '{"role":"client","full_name":"Erik Egen","health_data_consent":true}', '{}'),
  ('v75-app@test.se', '{"role":"client","full_name":"Alva App","health_data_consent":true}', '{}'),
  ('v75-annan@test.se', '{"role":"client","full_name":"Anna Annan","health_data_consent":true}', '{}'),
  ('v75-admin@test.se', '{"role":"client","full_name":"Ada Admin","health_data_consent":true}', '{}');
insert into app_admins (user_id) values (test.uid('v75-admin@test.se'));
update trainers set offers_training = true, offers_nutrition = true where id = test.uid('v75-pt@test.se');

-- Erik kom via PT:ns inbjudningslänk (EXISTING_CLIENT), Alva hittade PT:n i appen.
select set_config('coavira.system', 'on', false);
insert into coaching_relationships (trainer_id, client_id, status, acquisition_type)
values (test.uid('v75-pt@test.se'), test.uid('v75-egen@test.se'), 'active', 'EXISTING_CLIENT');
select set_config('coavira.system', '', false);
insert into coaching_relationships (trainer_id, client_id, status)
values (test.uid('v75-pt@test.se'), test.uid('v75-app@test.se'), 'active');
select test.eq((select payment_source from coaching_relationships where client_id = test.uid('v75-app@test.se')), 'coavira', 'nya relationer betalar via Coavira');

-- ------------------------------------------------------ organisationsnummer ---
select test.eq(is_valid_org_number('559123-4561'), true, 'giltigt organisationsnummer (Luhn)');
select test.eq(is_valid_org_number('559123-4562'), false, 'fel kontrollsiffra underkänns');
select test.eq(is_valid_org_number('19850101-0113'), true, 'personnummer med sekel (enskild firma) godkänns');
select test.eq(normalize_org_number('5591234561'), '559123-4561', 'normaliseras till NNNNNN-NNNN');

-- --------------------------------------------------- företagsuppgifter (privat) ---
select test.login('v75-pt@test.se');
select test.fails($$insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, duration_weeks, price_sek, is_wellness_package)
  values (auth.uid(), 'full', 'Friskvårdsupplägg', 36, true, 12, 3495, true)$$, 'friskvårdspaket kräver företagsuppgifter');
select test.fails($$insert into trainer_business (trainer_id, company_name, org_number, company_address) values (auth.uid(), 'Petra PT', '559123-4562', 'Gatan 1')$$,
  'ogiltigt organisationsnummer stoppas');
insert into trainer_business (trainer_id, company_name, org_number, company_address, wellness_instructions)
values (auth.uid(), 'Petra Friskvård AB', '5591234561', 'Storgatan 1, 111 22 Stockholm', 'Sök på "Petra Friskvård" i ePassi');
select test.eq((select org_number from trainer_business), '559123-4561', 'PT:n ser sina uppgifter, normaliserade');
insert into trainer_services (trainer_id, kind, title, sessions, includes_nutrition, duration_weeks, price_sek, is_wellness_package)
values (auth.uid(), 'full', 'Friskvårdsupplägg 3 månader – Personlig träning & skräddarsytt kostschema', 36, true, 12, 3495, true);
select test.eq((select count(*) from trainer_services where is_wellness_package), 1::bigint, 'med företagsuppgifter går friskvårdspaketet att spara');
update trainers set accepts_epassi = true, accepts_edenred = true where id = auth.uid();
select test.eq((select accepts_epassi from trainers where id = auth.uid()), true, 'PT:n markerar egna portalavtal (publikt)');
select test.fails($$update coaching_relationships set payment_source = 'external_wellness'$$, 'betalningskällan kan inte ändras direkt');
select test.logout();

select test.login('v75-app@test.se');
select test.eq((select count(*) from trainer_business), 0::bigint, 'klienter läser inte PT:ns företagsuppgifter (organisationsnummer)');
select test.eq(trainer_wellness_instructions(test.uid('v75-pt@test.se')), null::text, 'portalinstruktionerna är dolda före första köpet');
select test.fails(format($$select set_client_payment_source(%L, 'external_wellness')$$, auth.uid()), 'klienten kan inte ändra betalningskällan');
select test.logout();

select test.login('v75-admin@test.se');
select test.eq((select count(*) from trainer_business), 1::bigint, 'admin läser företagsuppgifterna');
select test.logout();

-- --------------------------------------------------------- betalningskälla ---
select test.login('v75-pt@test.se');
select test.eq(set_client_payment_source(test.uid('v75-egen@test.se'), 'external_wellness'), 'external_wellness',
  'PT:ns egna klienter kan bli externa friskvårdskunder direkt (0 % avgift)');
select test.fails(format($$select set_client_payment_source(%L, 'external_wellness')$$, test.uid('v75-app@test.se')),
  'klienter från appen måste köpa första gången i appen');
select test.fails(format($$select set_client_payment_source(%L, 'external_wellness')$$, test.uid('v75-annan@test.se')),
  'PT:n kan inte ändra någon annans relation');
select test.logout();
select test.eq(has_nutrition_access(test.uid('v75-pt@test.se'), test.uid('v75-egen@test.se')), true, 'extern friskvård ger tillgång till kostschemat');
select test.eq(has_call_access(test.uid('v75-egen@test.se'), test.uid('v75-pt@test.se')), true, 'extern friskvård ger tillgång till samtal');
select test.eq(has_nutrition_access(test.uid('v75-pt@test.se'), test.uid('v75-app@test.se')), false, 'utan köp ingen kosttillgång');

-- ----------------------------------------------------- chatt: anti-leakage ---
select test.eq(mentions_offplatform_payment('Swisha mig på 070-123 45 67'), true, 'telefonnummer och swish fångas');
select test.eq(mentions_offplatform_payment('Mitt nummer är +46 70 123 45 67'), true, 'internationellt format fångas');
select test.eq(mentions_offplatform_payment('Swishnummer 123 456 78 90'), true, 'Swish-nummer fångas');
select test.eq(mentions_offplatform_payment('Du kan betala via ePassi istället'), true, '"betala via ePassi" fångas');
select test.eq(mentions_offplatform_payment('Vi kör betalningen utanför appen'), true, '"utanför appen" fångas');
select test.eq(mentions_offplatform_payment('Kör 3x10 på 60 kg, vila 90 s. Ses 07:30 imorgon!'), false, 'vanliga träningsmeddelanden släpps igenom');
select test.eq(mentions_offplatform_payment('Bra jobbat, 2026-11-24 blev ett rekordpass'), false, 'datum räknas inte som telefonnummer');

select test.login('v75-app@test.se');
select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body) values (auth.uid(), %L, auth.uid(), 'Kan jag swisha dig istället?')$$, test.uid('v75-pt@test.se')),
  'klient från appen: Swish stoppas före första köpet');
insert into messages (client_id, trainer_id, sender_id, body) values (auth.uid(), test.uid('v75-pt@test.se'), auth.uid(), 'Hej! Vilket paket passar mig?');
select test.eq((select count(*) from messages where client_id = auth.uid()), 1::bigint, 'vanliga meddelanden går fram');
select test.logout();
select test.login('v75-pt@test.se');
select test.fails(format($$insert into messages (client_id, trainer_id, sender_id, body) values (%L, auth.uid(), auth.uid(), 'Betala via epassi så slipper du avgiften')$$, test.uid('v75-app@test.se')),
  'PT:n kan inte heller styra betalningen utanför appen före första köpet');
insert into messages (client_id, trainer_id, sender_id, body) values (test.uid('v75-egen@test.se'), auth.uid(), auth.uid(), 'Ring mig på 0701234567');
select test.eq((select count(*) from messages where client_id = test.uid('v75-egen@test.se')), 1::bigint, 'egna klienter (inbjudningslänk) omfattas inte');
select test.logout();

-- --------------------------------------------------- köp, kvitto och Plus ---
select id as v75_service from trainer_services where is_wellness_package \gset
select gen_random_uuid() as v75_checkout \gset
insert into purchases (checkout_id, client_id, trainer_id, service_id, kind, title, sessions, includes_nutrition, price_sek, quantity)
values (:'v75_checkout', test.uid('v75-app@test.se'), test.uid('v75-pt@test.se'), :'v75_service', 'full',
        'Friskvårdsupplägg 3 månader – Personlig träning & skräddarsytt kostschema', 36, true, 3495, 1);
insert into checkout_fees (checkout_id, client_id, subtotal_sek, fee_percent, fee_sek)
values (:'v75_checkout', test.uid('v75-app@test.se'), 3495, 10, 350);
select test.eq((select count(*) from checkout_receipts where checkout_id = :'v75_checkout'), 0::bigint, 'inget kvitto före betalningen');
update purchases set status = 'paid', paid_at = now() where checkout_id = :'v75_checkout';
select test.eq((select count(*) from checkout_receipts where checkout_id = :'v75_checkout'), 1::bigint, 'betalningen ger ett kvitto');
select test.eq((select coavira_plus_until > now() + interval '83 days' and coavira_plus_until < now() + interval '85 days'
                from profiles where id = test.uid('v75-app@test.se')), true, 'friskvårdspaketet ger Coavira+ i 12 veckor');

select test.login('v75-app@test.se');
select get_wellness_receipt(:'v75_checkout') as v75_receipt \gset
select test.eq((:'v75_receipt'::jsonb ->> 'receipt_number') ~ '^CV-[0-9]{4}-[0-9]{6}$', true, 'kvittonummer CV-ÅÅÅÅ-000000');
select test.eq(:'v75_receipt'::jsonb #>> '{seller,org_number}', '559123-4561', 'köparen ser säljarens organisationsnummer på kvittot');
select test.eq(:'v75_receipt'::jsonb #>> '{seller,company_name}', 'Petra Friskvård AB', 'säljarens företagsnamn');
select test.eq(:'v75_receipt'::jsonb ->> 'buyer_name', 'Alva App', 'köparens namn');
select test.eq((:'v75_receipt'::jsonb ->> 'subtotal_sek')::int, 3495, 'PT:ns tjänst');
select test.eq((:'v75_receipt'::jsonb ->> 'service_fee_sek')::int, 350, 'Coaviras serviceavgift på egen rad');
select test.eq((:'v75_receipt'::jsonb ->> 'total_sek')::int, 3845, 'totalt betalt');
select test.eq((:'v75_receipt'::jsonb ->> 'vat_rate')::int, 6, '6 % moms för momsregistrerad PT');
select test.eq((select count(*) from checkout_receipts), 1::bigint, 'klienten ser sina kvitton');
select test.eq(trainer_wellness_instructions(test.uid('v75-pt@test.se')), 'Sök på "Petra Friskvård" i ePassi', 'efter köpet syns portalinstruktionerna');
insert into messages (client_id, trainer_id, sender_id, body) values (auth.uid(), test.uid('v75-pt@test.se'), auth.uid(), 'Kan jag betala nästa period via ePassi?');
select test.eq((select count(*) from messages where client_id = auth.uid()), 2::bigint, 'efter första köpet får man prata om friskvårdsbetalning');
select test.fails('insert into checkout_receipts (checkout_id, client_id, trainer_id) values (gen_random_uuid(), auth.uid(), auth.uid())',
  'kvitton kan inte skapas av användare');
select test.logout();

select test.login('v75-pt@test.se');
select test.eq((get_wellness_receipt(:'v75_checkout') ->> 'total_sek')::int, 3845, 'PT:n läser kvittot');
select test.eq(set_client_payment_source(test.uid('v75-app@test.se'), 'external_wellness'), 'external_wellness',
  'efter första köpet i appen kan klienten betala via friskvård');
select test.logout();

select test.login('v75-annan@test.se');
select test.fails(format($$select get_wellness_receipt(%L)$$, :'v75_checkout'), 'andra kan inte läsa kvittot');
select test.eq((select count(*) from checkout_receipts), 0::bigint, 'andra ser inga kvitton');
select test.logout();

select test.login('v75-admin@test.se');
select test.eq((get_wellness_receipt(:'v75_checkout') ->> 'buyer_name'), 'Alva App', 'admin läser kvittot');
select test.logout();

-- Återbetalt köp: kvittot gäller inte längre.
update purchases set status = 'refunded' where checkout_id = :'v75_checkout';
select test.login('v75-app@test.se');
select test.fails(format($$select get_wellness_receipt(%L)$$, :'v75_checkout'), 'återbetalda köp ger inget kvitto');
select test.logout();
