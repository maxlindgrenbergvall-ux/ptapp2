-- ============================================================================
-- Coavira v15: push-notiser i mobilappen (Capacitor, iOS/Android).
--
-- push_tokens: enhetens push-token (Firebase Cloud Messaging på Android, APNs
-- på iOS) kopplad till den inloggade användaren. En token tillhör alltid bara
-- en användare: loggar någon annan in på samma telefon flyttas token dit
-- (register_push_token). Användaren ser och tar bort bara sina egna; utskick
-- görs av servern (service role) i ett senare steg.
--
-- Körs efter 20261027000000_v14_fixes_rules.sql.
-- ============================================================================

create table push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  token       text not null unique check (char_length(token) between 20 and 4096),
  platform    text not null check (platform in ('ios', 'android')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index push_tokens_user_idx on push_tokens (user_id);

alter table push_tokens enable row level security;
create policy "push_tokens: own read" on push_tokens for select to authenticated using (user_id = auth.uid());
create policy "push_tokens: own delete" on push_tokens for delete to authenticated using (user_id = auth.uid());
-- Ingen insert/update-policy: skrivning bara via register_push_token.

/** Spara enhetens token för den inloggade användaren (flyttas från ev. tidigare användare). */
create or replace function register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  insert into push_tokens (user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

/** Ta bort enhetens token (utloggning eller avstängda notiser) – bara den egna. */
create or replace function unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function register_push_token(text, text) from public, anon;
revoke all on function unregister_push_token(text) from public, anon;
grant execute on function register_push_token(text, text) to authenticated;
grant execute on function unregister_push_token(text) to authenticated;
