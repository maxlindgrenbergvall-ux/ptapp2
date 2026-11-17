-- Tester för v59: PT:n tilldelar ett upplägg (client_splits) till sina aktiva klienter.
\set ON_ERROR_STOP on

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('v59-pt@test.se', '{"role":"trainer","full_name":"Petra PT"}', '{"role":"trainer"}'),
  ('v59-pt2@test.se', '{"role":"trainer","full_name":"Pelle Annan"}', '{"role":"trainer"}'),
  ('v59-klient@test.se', '{"role":"client","full_name":"Klara Klient","health_data_consent":true}', '{}'),
  ('v59-pausad@test.se', '{"role":"client","full_name":"Paula Paus","health_data_consent":true}', '{}');
insert into coaching_relationships (trainer_id, client_id, status) values
  (test.uid('v59-pt@test.se'), test.uid('v59-klient@test.se'), 'active'),
  (test.uid('v59-pt@test.se'), test.uid('v59-pausad@test.se'), 'paused');

-- ------------------------------------------------- PT tilldelar upplägget ---
select test.login('v59-pt@test.se');
insert into client_splits (client_id, name, short, split_key, days, days_per_week, assigned_by)
values (test.uid('v59-klient@test.se'), 'Hyrox Race Prep', 'Hyrox', 'hyrox_prep',
  '[{"name":"Race-simulering","focus":"","exercises":[{"exerciseId":"e-hyrox-run","trackingType":"running","sets":4,"reps":"","restSec":0,"distanceM":1000,"blockId":"a"},{"exerciseId":"e-sledpush","trackingType":"conditioning","sets":4,"reps":"","restSec":0,"distanceM":50,"blockId":"a"}]},{"name":"Vila","focus":"","exercises":[],"rest":true}]',
  4, auth.uid());
select test.eq((select assigned_by from client_splits where client_id = test.uid('v59-klient@test.se')), auth.uid(), 'PT:n tilldelar ett upplägg till sin aktiva klient');
update client_splits set days_per_week = 3, assigned_by = auth.uid() where client_id = test.uid('v59-klient@test.se');
select test.eq((select days_per_week from client_splits where client_id = test.uid('v59-klient@test.se')), 3, 'PT:n kan ändra det tilldelade upplägget');
-- Upsert (som appen gör): ersätt upplägget.
insert into client_splits (client_id, name, short, split_key, days, days_per_week, assigned_by)
values (test.uid('v59-klient@test.se'), '5 km Löpning', '5 km', 'run_5k', '[{"name":"Intervaller","focus":"","exercises":[{"exerciseId":"e-intervals","trackingType":"running","sets":6,"reps":"","restSec":90,"distanceM":800,"paceSecPerKm":300}]}]', 3, auth.uid())
on conflict (client_id) do update set name = excluded.name, days = excluded.days, next_day = 0, assigned_by = excluded.assigned_by;
select test.eq((select name from client_splits where client_id = test.uid('v59-klient@test.se')), '5 km Löpning', 'upsert från PT:n ersätter klientens upplägg');
select test.fails(format($$insert into client_splits (client_id, name, days, assigned_by) values (%L, 'X', '[{"name":"A","focus":"","exercises":[]}]', %L)$$, test.uid('v59-pausad@test.se'), auth.uid()),
  'pausad klient: ingen tilldelning');
select test.fails(format($$update client_splits set assigned_by = %L where client_id = %L$$, test.uid('v59-pt2@test.se'), test.uid('v59-klient@test.se')),
  'PT:n kan inte ange en annan PT som avsändare');
select test.fails(format($$update client_splits set days = '[{"name":"A","focus":"","exercises":[{"exerciseId":"e-run","trackingType":"swim","sets":1,"reps":"","restSec":0}]}]' where client_id = %L$$, test.uid('v59-klient@test.se')),
  'ogiltiga övningsfält i upplägget avvisas');
select test.logout();

-- ----------------------------------------------------- annan PT: nej ---
select test.login('v59-pt2@test.se');
select test.eq((select count(*) from client_splits where client_id = test.uid('v59-klient@test.se')), 0::bigint, 'en annan PT ser inte klientens upplägg');
select test.fails(format($$insert into client_splits (client_id, name, days, assigned_by) values (%L, 'X', '[{"name":"A","focus":"","exercises":[]}]', auth.uid())$$, test.uid('v59-klient@test.se')),
  'en annan PT kan inte tilldela (konflikt eller RLS)');
update client_splits set name = 'Kapat' where client_id = test.uid('v59-klient@test.se');
select test.logout();
select test.eq((select name from client_splits where client_id = test.uid('v59-klient@test.se')), '5 km Löpning', 'en annan PT kan inte ändra upplägget');

-- -------------------------------------------------- klienten själv ---
select test.login('v59-klient@test.se');
select test.eq((select assigned_by from client_splits where client_id = auth.uid()), test.uid('v59-pt@test.se'), 'klienten ser vem som tilldelade upplägget');
update client_splits set next_day = 0, days_per_week = 4 where client_id = auth.uid();
select test.eq((select days_per_week from client_splits where client_id = auth.uid()), 4, 'klienten kan anpassa det tilldelade upplägget (PT-märkningen ligger kvar)');
select test.fails(format($$update client_splits set assigned_by = %L where client_id = auth.uid()$$, test.uid('v59-pt2@test.se')), 'klienten kan inte märka upplägget som en annan PT:s');
update client_splits set assigned_by = null, name = 'Mitt eget' where client_id = auth.uid();
select test.eq((select assigned_by is null from client_splits where client_id = auth.uid()), true, 'klienten kan göra upplägget till sitt eget');
select test.logout();

-- --------------------------------------------- PT: mallar och egna övningar ---
select test.login('v59-pt@test.se');
insert into workout_templates (trainer_id, name, description, exercises)
values (auth.uid(), 'Hyrox: Race-simulering', '', '[{"id":"x1","exerciseId":"e-sledpush","trackingType":"conditioning","sets":4,"reps":"","restSec":0,"distanceM":50,"blockId":"a"}]') returning id as tpl \gset
select test.eq((select count(*) from workout_templates where id = :'tpl'), 1::bigint, 'PT:n sparar ett upplägg som PT-mall (med block och distans)');
update workout_templates set name = 'Hyrox: Race-sim v2' where id = :'tpl';
select test.eq((select name from workout_templates where id = :'tpl'), 'Hyrox: Race-sim v2', 'PT:n kan uppdatera sin mall');
insert into custom_exercises (name, muscle_group) values ('Släde med rep', 'kondition') returning id as cx \gset
select test.eq((select count(*) from custom_exercises where id = :'cx'), 1::bigint, 'PT:n skapar en egen övning i passbyggaren');
select test.logout();
select test.login('v59-klient@test.se');
select test.eq((select count(*) from custom_exercises where id = :'cx'), 1::bigint, 'klienten ser sin PT:s egna övningar (i tilldelade upplägg)');
select test.eq((select count(*) from workout_templates where id = :'tpl'), 0::bigint, 'PT-mallen är PT:ns egen (syns inte för klienten)');
select test.logout();
