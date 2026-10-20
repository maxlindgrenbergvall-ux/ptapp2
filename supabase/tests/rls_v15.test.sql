-- Tester för v15: push-tokens i mobilappen.
\set ON_ERROR_STOP on

select test.login('c12@test.se');
select register_push_token('fcm-token-telefon-1-abcdefghijklmnop', 'android');
select test.eq((select count(*) from push_tokens where user_id = auth.uid()), 1::bigint, 'klienten sparar sin push-token');
select register_push_token('fcm-token-telefon-1-abcdefghijklmnop', 'android');
select test.eq((select count(*) from push_tokens), 1::bigint, 'samma token två gånger ger ingen dubblett');
select test.fails($$insert into push_tokens (user_id, token, platform) values (test.uid('pt13@test.se'), 'falsk-token-for-annan-anvandare-123', 'ios')$$,
  'ingen kan skriva tokens direkt (eller åt någon annan)');
select test.fails($$select register_push_token('kort', 'android')$$, 'för kort token avvisas');
select test.fails($$select register_push_token('apns-token-xxxxxxxxxxxxxxxxxxxxxxxx', 'windows')$$, 'okänd plattform avvisas');
select test.logout();

-- En annan användare loggar in på samma telefon: token flyttas.
select test.login('pt13@test.se');
select test.eq((select count(*) from push_tokens), 0::bigint, 'PT:n ser inte klientens tokens');
select unregister_push_token('fcm-token-telefon-1-abcdefghijklmnop');
select test.logout();
select test.eq((select count(*) from push_tokens where user_id = test.uid('c12@test.se')), 1::bigint, 'någon annan kan inte ta bort klientens token');
select test.login('pt13@test.se');
select register_push_token('fcm-token-telefon-1-abcdefghijklmnop', 'android');
select test.eq((select count(*) from push_tokens where user_id = auth.uid()), 1::bigint, 'token flyttas till den som loggat in på telefonen');
select test.logout();
select test.eq((select count(*) from push_tokens where user_id = test.uid('c12@test.se')), 0::bigint, 'den tidigare användaren får inte längre notiser');

-- Utloggning tar bort den egna token.
select test.login('pt13@test.se');
select unregister_push_token('fcm-token-telefon-1-abcdefghijklmnop');
select test.eq((select count(*) from push_tokens), 0::bigint, 'utloggning tar bort enhetens token');
select test.logout();

set role anon;
select test.fails($$select register_push_token('anon-token-xxxxxxxxxxxxxxxxxxxxxx', 'ios')$$, 'utloggade kan inte registrera tokens');
reset role;

\warn 'ALLA V15-TESTER (PUSH-TOKENS) GODKÄNDA'
