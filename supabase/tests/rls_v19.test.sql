-- Tester för v19: egna övningar, PT:ns inbjudningskoder (EXISTING_CLIENT) och serviceavgift 5 % / 10 %.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('c19a@test.se', '{"role":"client","full_name":"Alma Befintlig","health_data_consent":true}', '{}'),
  ('c19b@test.se', '{"role":"client","full_name":"Bert Plattform","health_data_consent":true}', '{}'),
  ('pt19-ny@test.se', '{"role":"trainer","full_name":"Ej Verifierad PT"}', '{"role":"trainer"}');
-- pt16 (från v16) är publicerad; Coavira verifierar certifikaten.
select admin_set_certifications('pt16@test.se', array['Licensierad PT']);
select id as s_single from trainer_services where trainer_id = test.uid('pt16@test.se') and title = 'Enstaka pass' \gset

-- ------------------------------------------------------- egna övningar ---
select test.login('c19a@test.se');
insert into custom_exercises (name, default_weight, weight_unit, default_sets, default_reps) values ('Bulgarisk utfallsböj', 20, 'kg', 3, '8');
select test.eq((select id ~ '^cx-' from custom_exercises where name = 'Bulgarisk utfallsböj'), true, 'klienten lägger till en egen övning (id cx-…)');
select test.eq((select user_id from custom_exercises where name = 'Bulgarisk utfallsböj'), auth.uid(), 'övningen kopplas till användaren');
insert into custom_exercises (name, default_weight, weight_unit) values ('Landmine press', 45, 'lbs');
select test.eq((select default_weight || ' ' || weight_unit from custom_exercises where name = 'Landmine press'), '45.00 lbs', 'standardvikt i lbs sparas');
select test.fails($$insert into custom_exercises (name) values ('bulgarisk utfallsböj ')$$, 'samma namn två gånger avvisas');
select test.fails($$insert into custom_exercises (name) values ('  ')$$, 'namn krävs');
select test.fails($$insert into custom_exercises (id, name) values ('e-squat', 'Fejk')$$, 'kan inte låtsas vara en bankövning');
select test.fails($$insert into custom_exercises (user_id, name) values (test.uid('c19b@test.se'), 'Åt någon annan')$$, 'kan inte skapa övningar åt andra');
select test.fails($$insert into custom_exercises (name, default_sets) values ('För många set', 50)$$, 'högst 20 set');
select test.fails($$update custom_exercises set user_id = test.uid('c19b@test.se')$$, 'kan inte flytta en övning till någon annan');
update custom_exercises set default_weight = 22.5 where name = 'Bulgarisk utfallsböj';
select test.eq((select default_weight from custom_exercises where name = 'Bulgarisk utfallsböj'), 22.50::numeric(6, 2), 'ägaren ändrar standardvikten');
select test.logout();

select test.login('c19b@test.se');
select test.eq((select count(*) from custom_exercises where user_id = test.uid('c19a@test.se')), 0::bigint, 'andra klienter ser inte övningen');
delete from custom_exercises where user_id = test.uid('c19a@test.se');
select test.logout();
select test.eq((select count(*) from custom_exercises where user_id = test.uid('c19a@test.se')), 2::bigint, 'andra kan inte radera övningen');
select test.login('pt16@test.se');
select test.eq((select count(*) from custom_exercises where user_id = test.uid('c19a@test.se')), 0::bigint, 'en PT utan relation ser inte klientens övningar');
insert into custom_exercises (name, default_weight) values ('Släde 20 m', 60);
select test.logout();
set role anon;
select test.fails($$select * from custom_exercises$$, 'anonyma ser inga övningar');
reset role;

-- ---------------------------------------------- PT skapar inbjudningskod ---
select test.login('c19a@test.se');
select test.fails($$select create_pt_invite()$$, 'klienter kan inte skapa PT-koder');
select test.logout();
select test.login('pt19-ny@test.se');
select test.fails($$select create_pt_invite()$$, 'PT utan verifierade certifikat kan inte skapa koder');
select test.logout();

select test.login('pt16@test.se');
select create_pt_invite('Alma') as inv \gset
select (:'inv'::jsonb)->>'code' as code_a \gset
select test.eq(:'code_a' ~ '^EX-[A-HJ-NP-Z2-9]{6}$', true, 'verifierad PT skapar en kod (EX-XXXXXX)');
select test.eq((select count(*) from pt_invites where not is_used), 1::bigint, 'PT:n ser sin kod');
select test.eq((select label from pt_invites where code = :'code_a'), 'Alma', 'med PT:ns anteckning');
select test.fails($$insert into pt_invites (pt_id, code) values (auth.uid(), 'EX-AAAAAA')$$, 'PT:n kan inte välja koder själv');
select test.fails($$update pt_invites set is_used = true, used_at = now()$$, 'PT:n kan inte ändra koder');
select create_pt_invite() as inv_b \gset
select (:'inv_b'::jsonb)->>'code' as code_b \gset
select create_pt_invite() as inv_c \gset
select (:'inv_c'::jsonb)->>'code' as code_c \gset
select create_pt_invite() as inv_del \gset
delete from pt_invites where id = ((:'inv_del'::jsonb)->>'id')::uuid;
select test.eq((select count(*) from pt_invites), 3::bigint, 'PT:n tar bort en oanvänd kod');
select test.logout();

select test.login('pt17@test.se');
select test.eq((select count(*) from pt_invites), 0::bigint, 'andra PT:er ser inte koderna');
select test.logout();
select test.login('c19b@test.se');
select test.eq((select count(*) from pt_invites), 0::bigint, 'klienter kan inte läsa koder');
select test.fails($$select is_approved_trainer(test.uid('pt16@test.se'))$$, 'is_approved_trainer är intern');
select test.fails($$select generate_pt_invite_code()$$, 'kodgeneratorn är intern');
select test.logout();

-- --------------------------------------------------- klienten löser in ---
select test.login('c19a@test.se');
select test.eq((redeem_pt_invite('EX-ZZZZZZ'))->>'ok', 'false', 'okänd kod avvisas');
-- Små bokstäver och utan bindestreck fungerar.
select redeem_pt_invite(lower(replace(:'code_a', '-', ''))) as r \gset
select test.eq((:'r'::jsonb)->>'ok', 'true', 'klienten löser in PT:ns kod');
select test.eq((:'r'::jsonb)->>'trainer_name', 'Bo Boost', 'svaret visar PT:ns namn');
select test.eq((select acquisition_type::text || ':' || status::text from coaching_relationships where trainer_id = test.uid('pt16@test.se')),
  'EXISTING_CLIENT:active', 'klienten kopplas direkt till PT:n som EXISTING_CLIENT');
select test.eq((redeem_pt_invite(:'code_b'))->>'error', 'Du är redan kopplad till PT:n som befintlig klient', 'en andra kod hos samma PT behövs inte');
update coaching_relationships set acquisition_type = 'PLATFORM_CLIENT';
select test.eq((select acquisition_type::text from coaching_relationships where trainer_id = test.uid('pt16@test.se')), 'EXISTING_CLIENT',
  'klienten kan inte ändra kundursprunget');
-- PT:ns egna övning syns nu för klienten.
select test.eq((select count(*) from custom_exercises where name = 'Släde 20 m'), 1::bigint, 'klienten ser sin PT:s egna övningar');
select test.logout();

select test.login('c19b@test.se');
select test.eq((redeem_pt_invite(:'code_a'))->>'error', 'Koden finns inte eller har redan använts', 'en kod kan bara användas en gång');
select test.logout();

select test.login('pt16@test.se');
select test.eq((select is_used and used_by = test.uid('c19a@test.se') from pt_invites where code = :'code_a'), true, 'PT:n ser att koden använts');
select test.eq((select count(*) from custom_exercises where user_id = test.uid('c19a@test.se')), 2::bigint, 'PT:n ser klientens egna övningar');
delete from pt_invites where code = :'code_a';
select test.eq((select count(*) from pt_invites where code = :'code_a'), 1::bigint, 'använda koder kan inte tas bort');
select test.fails($$update coaching_relationships set acquisition_type = 'EXISTING_CLIENT' where client_id = test.uid('c17@test.se')$$,
  'PT:n kan inte göra en plattformsklient till befintlig klient');
select test.logout();

-- En klient som redan köpt hos PT:n i appen (c17, v17) kan inte sänka avgiften med en kod.
select test.login('c17@test.se');
select test.eq((redeem_pt_invite(:'code_c'))->>'error', 'Du har redan köpt hos PT:n via Coavira – koden gäller klienter som PT:n hade innan',
  'plattformsklient med köp kan inte bli befintlig klient');
select test.logout();

-- Ny relation från appen blir alltid PLATFORM_CLIENT, även om klienten försöker annat.
select test.login('c19b@test.se');
insert into coaching_relationships (trainer_id, client_id, status, acquisition_type) values (test.uid('pt17@test.se'), auth.uid(), 'pending', 'EXISTING_CLIENT');
select test.eq((select acquisition_type::text from coaching_relationships where trainer_id = test.uid('pt17@test.se')), 'PLATFORM_CLIENT',
  'förfrågan från appen blir PLATFORM_CLIENT');
-- Gissningsskydd: högst 10 felaktiga försök per timme.
select redeem_pt_invite('EX-ZZZZZ' || n) from generate_series(2, 9) n;
select redeem_pt_invite('EX-ZZZZZA');
select redeem_pt_invite('EX-ZZZZZB');
select test.eq((redeem_pt_invite(:'code_c'))->>'error', 'För många felaktiga försök – vänta en timme och försök igen', 'efter 10 felaktiga försök spärras inlösen i en timme');
select test.logout();

-- Utgången kod.
update pt_invites set expires_at = now() - interval '1 minute' where code = :'code_c';
delete from pt_invite_attempts where user_id = test.uid('c19b@test.se');
select test.login('c19b@test.se');
select test.eq((redeem_pt_invite(:'code_c'))->>'error', 'Koden har gått ut – be din PT om en ny', 'utgången kod avvisas');
select test.fails($$select * from pt_invite_attempts$$, 'försöken är dolda för användare');
select test.logout();

-- ------------------------------------------------ serviceavgift 5 / 10 % ---
select test.eq(service_fee_sek(1000, 10), 100, '10 % av 1 000 kr = 100 kr');
select test.eq(service_fee_sek(750, 5), 38, '5 % av 750 kr = 37,5 → 38 kr');
select test.eq(service_fee_sek(950, 10), 95, '10 % av 950 kr = 95 kr');

select test.login('c19a@test.se');
select create_checkout(array[:'s_single']::uuid[], array[2]) as co_a \gset
select test.eq((:'co_a'::jsonb)->>'acquisition_type', 'EXISTING_CLIENT', 'kassan vet att klienten är befintlig');
select test.eq((:'co_a'::jsonb)->>'fee_percent', '5', 'befintlig klient: 5 %');
select test.eq((:'co_a'::jsonb)->>'service_fee_sek', '75', '5 % av 1 500 kr = 75 kr');
select test.eq((:'co_a'::jsonb)->>'total_sek', '1575', 'totalt 1 575 kr');
select test.eq((select fee_percent from checkout_fees where checkout_id = ((:'co_a'::jsonb)->>'checkout_id')::uuid), 5.00::numeric(5, 2), 'procentsatsen sparas i checkout_fees');
select test.fails($$select service_fee_percent_for(auth.uid(), test.uid('pt16@test.se'))$$, 'avgiftsregeln är intern');
select test.fails($$select admin_set_acquisition('c19b@test.se', 'pt16@test.se', 'EXISTING_CLIENT')$$, 'admin-funktionen är låst');
select test.logout();

select test.login('c19b@test.se');
select create_checkout(array[:'s_single']::uuid[], array[2]) as co_b \gset
select test.eq((:'co_b'::jsonb)->>'acquisition_type', 'PLATFORM_CLIENT', 'klient som hittat PT:n i appen är plattformsklient');
select test.eq((:'co_b'::jsonb)->>'fee_percent', '10', 'plattformsklient: 10 %');
select test.eq((:'co_b'::jsonb)->>'service_fee_sek', '150', '10 % av 1 500 kr = 150 kr');
select test.logout();

set role service_role;
select test.fails($$select mark_checkout_paid('$$ || ((:'co_a'::jsonb)->>'checkout_id') || $$', 'cs_19', 'pi_19', 1650)$$,
  'befintlig klient: 10 %-belopp avvisas');
select test.eq(mark_checkout_paid(((:'co_a'::jsonb)->>'checkout_id')::uuid, 'cs_19', 'pi_19', 1575), 1, 'betalning med 5 % godkänns');
select test.eq(mark_checkout_paid(((:'co_b'::jsonb)->>'checkout_id')::uuid, 'cs_19b', 'pi_19b', 1650), 1, 'betalning med 10 % godkänns');
reset role;
select test.eq((select acquisition_type::text from coaching_relationships where client_id = test.uid('c19b@test.se') and trainer_id = test.uid('pt16@test.se')),
  'PLATFORM_CLIENT', 'köp i appen skapar en PLATFORM_CLIENT-relation');

-- Coavira kan rätta kundursprunget.
select admin_set_acquisition('c19b@test.se', 'pt16@test.se', 'EXISTING_CLIENT');
select test.eq((select acquisition_type::text from coaching_relationships where client_id = test.uid('c19b@test.se') and trainer_id = test.uid('pt16@test.se')),
  'EXISTING_CLIENT', 'admin_set_acquisition ändrar kundursprunget');

\warn 'ALLA V19-TESTER (EGNA ÖVNINGAR, PT-KODER, AVGIFT 5/10 %) GODKÄNDA'
