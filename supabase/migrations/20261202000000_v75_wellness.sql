-- ============================================================================
-- v75: friskvårdsbidrag, friskvårdspaket, källspårning och friskvårdskvitton.
--
-- * trainers (publikt): accepts_epassi, accepts_benifex, accepts_edenred – PT:n
--   tar emot betalning via egna portalavtal. Ger badgen "Friskvård" och filtret
--   i Hitta PT.
-- * trainer_business (privat): företagsnamn, organisationsnummer, företagsadress,
--   momsregistrering och PT:ns sökinstruktioner i portalerna. Organisations-
--   numret i en enskild firma är ägarens personnummer – därför en egen tabell som
--   bara PT:n och admin läser. Klienter får uppgifterna bara via kvittot
--   (get_wellness_receipt) och instruktionerna efter första köpet.
-- * trainer_services.is_wellness_package – friskvårdspaket. Kräver ifyllda
--   företagsuppgifter (de behövs på kvittot). Ett betalt friskvårdspaket ger
--   klienten Coavira+ under paketets längd (standard 12 veckor).
-- * Källspårning: finns redan sedan v19 – coaching_relationships.acquisition_type
--   per PT och klient. EXISTING_CLIENT = registrerad via PT:ns personliga
--   inbjudningslänk (/ref/EX-…), PLATFORM_CLIENT = hittade PT:n i Coavira.
--   Bara databasen sätter värdet, så det dupliceras inte här.
-- * coaching_relationships.payment_source: 'coavira' (standard) eller
--   'external_wellness' – klienten betalar PT:n via eget friskvårdsavtal (ePassi
--   m.fl.), utan avgift till Coavira. Sätts bara av PT:n via
--   set_client_payment_source(): direkt för PT:ns egna klienter (EXISTING_CLIENT),
--   för klienter som hittat PT:n i Coavira först efter ett första köp i appen.
--   Extern friskvård ger tillgång till kostschema och samtal som ett köp gör.
-- * Anti-leakage i chatten: innan klienten har köpt något av PT:n (och om
--   klienten inte är PT:ns egen) stoppas meddelanden med telefonnummer,
--   Swish-nummer eller uppmaningar att betala utanför appen.
-- * checkout_receipts: ett kvittonummer per betald kassa (löpande, CV-ÅÅÅÅ-000123).
--   get_wellness_receipt() ger kvittots innehåll till köparen, PT:n och admin –
--   ingen annan. Personnummer sparas aldrig: klienten fyller i det i appen och
--   det hamnar bara i den nedladdade PDF:en.
--
-- Körs efter 20261201000000_v65_community_rules_suspension.sql.
-- ============================================================================

-- =============================================================== hjälpare ===
/** Svenskt organisations- eller personnummer: 10 siffror (eller 12 med sekel) och Luhn-kontroll. */
create or replace function is_valid_org_number(p text)
returns boolean language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
  s int := 0;
  n int;
  i int;
begin
  if char_length(d) = 12 then d := substr(d, 3); end if;
  if char_length(d) <> 10 then return false; end if;
  for i in 1..10 loop
    n := substr(d, i, 1)::int * (case when i % 2 = 1 then 2 else 1 end);
    s := s + (n / 10) + (n % 10);
  end loop;
  return s % 10 = 0;
end;
$$;

/** "5560360793" / "556036-0793" / "19800101-1234" → "556036-0793" (tio siffror med bindestreck). */
create or replace function normalize_org_number(p text)
returns text language sql immutable as $$
  select case
    when char_length(d) = 12 then substr(d, 3, 6) || '-' || substr(d, 9)
    when char_length(d) = 10 then substr(d, 1, 6) || '-' || substr(d, 7)
    else null end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- ============================================================ PT: publikt ===
alter table trainers
  add column accepts_epassi  boolean not null default false,
  add column accepts_benifex boolean not null default false,
  add column accepts_edenred boolean not null default false;

-- =========================================================== PT: privat ===
create table trainer_business (
  trainer_id            uuid primary key references trainers on delete cascade,
  company_name          text not null default '' check (char_length(company_name) <= 120),
  org_number            text check (org_number is null or (org_number ~ '^[0-9]{6}-[0-9]{4}$' and is_valid_org_number(org_number))),
  company_address       text not null default '' check (char_length(company_address) <= 200),
  -- Momsregistrerad PT: kvittot specificerar 6 % moms. Annars "Säljaren är inte momsregistrerad".
  vat_registered        boolean not null default true,
  wellness_instructions text not null default '' check (char_length(wellness_instructions) <= 600),
  updated_at            timestamptz not null default now()
);
alter table trainer_business enable row level security;

create or replace function prepare_trainer_business()
returns trigger language plpgsql as $$
begin
  new.company_name := btrim(new.company_name);
  new.company_address := btrim(new.company_address);
  new.wellness_instructions := btrim(new.wellness_instructions);
  if nullif(btrim(coalesce(new.org_number, '')), '') is null then
    new.org_number := null;
  else
    if not is_valid_org_number(new.org_number) then
      raise exception 'Organisationsnumret är inte giltigt (kontrollsiffran stämmer inte)' using errcode = '22023';
    end if;
    new.org_number := normalize_org_number(new.org_number);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trainer_business_prepare
  before insert or update on trainer_business
  for each row execute function prepare_trainer_business();

create policy "business: trainer own" on trainer_business for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy "business: admin read" on trainer_business for select to authenticated
  using (is_admin());

/** Har PT:n fyllt i allt som behövs på ett friskvårdskvitto? */
create or replace function trainer_business_complete(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trainer_business b
    where b.trainer_id = p_trainer and b.company_name <> '' and b.org_number is not null and b.company_address <> ''
  );
$$;
revoke all on function trainer_business_complete(uuid) from public, anon;
grant execute on function trainer_business_complete(uuid) to authenticated;

-- ======================================================== friskvårdspaket ===
alter table trainer_services add column is_wellness_package boolean not null default false;

create or replace function guard_wellness_package()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_wellness_package and new.active and not trainer_business_complete(new.trainer_id) then
    raise exception 'Fyll i företagsnamn, organisationsnummer och adress i din profil innan du säljer ett friskvårdspaket – de står på klientens kvitto.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trainer_services_wellness
  before insert or update of is_wellness_package, active on trainer_services
  for each row execute function guard_wellness_package();

-- ======================================================= betalningskälla ===
alter table coaching_relationships
  add column payment_source text not null default 'coavira' check (payment_source in ('coavira', 'external_wellness'));

create or replace function guard_payment_source()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('coavira.system', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.payment_source := 'coavira';
  elsif new.payment_source is distinct from old.payment_source then
    raise exception 'Betalningssättet ändras med set_client_payment_source()' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger coaching_relationships_payment_source
  before insert or update on coaching_relationships
  for each row execute function guard_payment_source();

/** Har klienten betalt något hos PT:n i appen? */
create or replace function has_paid_purchase(p_client uuid, p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from purchases where client_id = p_client and trainer_id = p_trainer and status = 'paid');
$$;
revoke all on function has_paid_purchase(uuid, uuid) from public, anon, authenticated;

/**
 * Får klienten och PT:n dela kontaktuppgifter och betala utanför appen?
 * Ja om klienten är PT:ns egen (inbjudningslänk), betalar via extern friskvård
 * eller redan har köpt något av PT:n i appen. Bara parterna (och admin) får svar.
 */
create or replace function offplatform_unlocked(p_client uuid, p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (p_client, p_trainer) or is_admin())
     and (
       exists (
         select 1 from coaching_relationships r
         where r.client_id = p_client and r.trainer_id = p_trainer
           and (r.acquisition_type = 'EXISTING_CLIENT' or r.payment_source = 'external_wellness')
       )
       or has_paid_purchase(p_client, p_trainer)
     );
$$;
revoke all on function offplatform_unlocked(uuid, uuid) from public, anon;
grant execute on function offplatform_unlocked(uuid, uuid) to authenticated;

/**
 * PT: klienten betalar via eget friskvårdsavtal ('external_wellness', ingen avgift
 * till Coavira) eller i appen ('coavira'). Egna klienter (PT:ns inbjudningslänk)
 * kan aktiveras direkt; klienter som hittat PT:n i Coavira först efter ett köp i appen.
 */
create or replace function set_client_payment_source(p_client uuid, p_source text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_rel coaching_relationships;
begin
  if p_source not in ('coavira', 'external_wellness') then
    raise exception 'Okänt betalningssätt' using errcode = '22023';
  end if;
  select * into v_rel from coaching_relationships where trainer_id = auth.uid() and client_id = p_client;
  if not found then
    raise exception 'Klienten är inte din' using errcode = '42501';
  end if;
  if p_source = 'external_wellness' and v_rel.acquisition_type <> 'EXISTING_CLIENT' and not has_paid_purchase(p_client, auth.uid()) then
    raise exception 'Klienten hittade dig i Coavira – första köpet görs i appen. Därefter kan klienten betala via friskvård.'
      using errcode = '42501';
  end if;
  perform set_config('coavira.system', 'on', true);
  update coaching_relationships set payment_source = p_source where trainer_id = auth.uid() and client_id = p_client;
  perform set_config('coavira.system', '', true);
  return p_source;
end;
$$;
revoke all on function set_client_payment_source(uuid, text) from public, anon;
grant execute on function set_client_payment_source(uuid, text) to authenticated;

/** Aktiv relation där klienten betalar via extern friskvård. */
create or replace function is_external_wellness(p_client uuid, p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coaching_relationships
    where client_id = p_client and trainer_id = p_trainer and payment_source = 'external_wellness' and status = 'active'
  );
$$;
revoke all on function is_external_wellness(uuid, uuid) from public, anon, authenticated;

-- Extern friskvård ger samma tillgång som ett köp (kostschema och samtal).
create or replace function has_nutrition_access(p_trainer uuid, p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (p_client, p_trainer))
     and (
       exists (
         select 1 from purchases
         where trainer_id = p_trainer and client_id = p_client and status = 'paid' and includes_nutrition
       )
       or is_external_wellness(p_client, p_trainer)
     );
$$;

create or replace function has_call_access(p_client uuid, p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (p_client, p_trainer))
     and (
       exists (select 1 from purchases where client_id = p_client and trainer_id = p_trainer and status = 'paid')
       or exists (
         select 1 from calendar_events
         where client_id = p_client and trainer_id = p_trainer and kind = 'session' and status in ('confirmed', 'completed')
       )
       or is_external_wellness(p_client, p_trainer)
     );
$$;

/** PT:ns sökinstruktioner i friskvårdsportalerna – först efter första köpet (eller för PT:ns egna klienter). */
create or replace function trainer_wellness_instructions(p_trainer uuid)
returns text language sql stable security definer set search_path = public as $$
  select b.wellness_instructions
  from trainer_business b
  where b.trainer_id = p_trainer
    and (auth.uid() = p_trainer or is_admin() or offplatform_unlocked(auth.uid(), p_trainer));
$$;
revoke all on function trainer_wellness_instructions(uuid) from public, anon;
grant execute on function trainer_wellness_instructions(uuid) to authenticated;

-- ===================================================== chatt: anti-leakage ===
/**
 * Uppmanar meddelandet till betalning eller kontakt utanför appen? Telefon- och
 * Swish-nummer, "swisha", "betala via ePassi/Benifex/Edenred …" och liknande.
 * Samma regler som src/lib/wellness/off-platform.ts.
 */
create or replace function mentions_offplatform_payment(p_body text)
returns boolean language sql immutable as $$
  select coalesce(p_body, '') ~* any (array[
    -- Mobil- och telefonnummer: +46 / 0046 / 07x … och 0x-nummer med 7–10 siffror.
    '(\+46|0046)[ -]?\(?0?\)?[ -]?[1-9]([ -]?[0-9]){6,8}',
    '(^|[^0-9])0[1-9]([ -]?[0-9]){6,9}([^0-9]|$)',
    -- Swish-nummer (123 xxx xx xx) och Swish i alla former.
    '(^|[^0-9])123[ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}([^0-9]|$)',
    '\mswish',
    -- Betalning via portaler, bank eller kontant – och "utanför appen".
    '\m(betala|betalar|betalning|betalningen|betalt|pay)\M[^.!?]{0,30}\m(epassi|benify|benifex|edenred|wellnet|actiway|kontant|faktura|bankgiro|plusgiro|privat)',
    '\m(via|med|genom)\s+(epassi|benify|benifex|edenred|wellnet|actiway)\M',
    '\m(bankgiro|plusgiro|clearingnummer|kontonummer|kontanter)\M',
    'utanför (appen|coavira)'
  ]);
$$;

create or replace function guard_message_offplatform()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is null or new.body is null or coalesce(current_setting('coavira.system', true), '') = 'on' then
    return new;
  end if;
  if mentions_offplatform_payment(new.body) and not offplatform_unlocked(new.client_id, new.trainer_id) then
    raise exception 'Telefonnummer, Swish och betalning utanför appen kan delas först efter första köpet i Coavira. Det skyddar både dig och PT:n.'
      using errcode = '23514', hint = 'offplatform';
  end if;
  return new;
end;
$$;
create trigger messages_offplatform
  before insert on messages
  for each row execute function guard_message_offplatform();

-- ============================================================== kvitton ===
create table checkout_receipts (
  checkout_id uuid primary key,
  receipt_no  bigint generated always as identity unique,
  client_id   uuid not null references profiles on delete cascade,
  trainer_id  uuid not null references trainers on delete cascade,
  issued_at   timestamptz not null default now()
);
create index checkout_receipts_client_idx on checkout_receipts (client_id);
create index checkout_receipts_trainer_idx on checkout_receipts (trainer_id);
alter table checkout_receipts enable row level security;
create policy "receipts: parties and admin read" on checkout_receipts for select to authenticated
  using (client_id = auth.uid() or trainer_id = auth.uid() or is_admin());
-- Skrivs bara av triggern nedan.
revoke insert, update, delete on checkout_receipts from authenticated, anon;

-- Befintliga betalda köp får kvitton i betalningsordning.
insert into checkout_receipts (checkout_id, client_id, trainer_id, issued_at)
select p.checkout_id, min(p.client_id::text)::uuid, min(p.trainer_id::text)::uuid, max(p.paid_at)
from purchases p
where p.status = 'paid' and p.kind <> 'legacy'
group by p.checkout_id
having sum(p.price_sek) > 0
order by max(p.paid_at);

/** Ett köp blev betalt: skapa kvittot och ge Coavira+ för friskvårdspaket. */
create or replace function on_purchase_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_weeks int;
begin
  if new.price_sek > 0 and new.kind <> 'legacy' then
    insert into checkout_receipts (checkout_id, client_id, trainer_id, issued_at)
    values (new.checkout_id, new.client_id, new.trainer_id, coalesce(new.paid_at, now()))
    on conflict (checkout_id) do nothing;
  end if;
  select coalesce(s.duration_weeks, 12) * new.quantity into v_weeks
  from trainer_services s where s.id = new.service_id and s.is_wellness_package;
  if v_weeks is not null then
    perform set_config('coavira.system', 'on', true);
    update profiles
    set coavira_plus_until = greatest(coalesce(coavira_plus_until, now()), now()) + make_interval(weeks => v_weeks)
    where id = new.client_id;
    perform set_config('coavira.system', '', true);
  end if;
  return new;
end;
$$;
create trigger purchases_paid
  after update of status on purchases
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function on_purchase_paid();

/**
 * Friskvårdskvittot för en betald kassa – bara köparen, PT:n och admin.
 * Säljaren är PT:n (enligt PT-avtalet får PT:n hela sitt pris). Coaviras
 * serviceavgift redovisas på en egen rad och ingår inte i friskvårdsaktiviteten.
 */
create or replace function get_wellness_receipt(p_checkout uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_r checkout_receipts;
  v_b trainer_business;
  v_sub int;
  v_fee int;
  v_paid timestamptz;
  v_refunded boolean;
begin
  select * into v_r from checkout_receipts where checkout_id = p_checkout;
  if not found or not (auth.uid() in (v_r.client_id, v_r.trainer_id) or is_admin()) then
    raise exception 'Kvittot finns inte' using errcode = 'P0002';
  end if;
  select coalesce(sum(price_sek), 0), max(paid_at), bool_or(status = 'refunded')
    into v_sub, v_paid, v_refunded
  from purchases where checkout_id = p_checkout and status in ('paid', 'refunded');
  if v_refunded then
    raise exception 'Köpet är återbetalat – kvittot gäller inte längre' using errcode = '22023';
  end if;
  select coalesce(fee_sek, 0) into v_fee from checkout_fees where checkout_id = p_checkout;
  select * into v_b from trainer_business where trainer_id = v_r.trainer_id;
  return jsonb_build_object(
    'checkout_id', v_r.checkout_id,
    'receipt_number', 'CV-' || to_char(v_r.issued_at, 'YYYY') || '-' || lpad(v_r.receipt_no::text, 6, '0'),
    'paid_at', coalesce(v_paid, v_r.issued_at),
    'buyer_name', (select full_name from profiles where id = v_r.client_id),
    'seller', jsonb_build_object(
      'name', (select full_name from profiles where id = v_r.trainer_id),
      'company_name', coalesce(v_b.company_name, ''),
      'org_number', v_b.org_number,
      'company_address', coalesce(v_b.company_address, ''),
      'vat_registered', coalesce(v_b.vat_registered, true),
      'complete', trainer_business_complete(v_r.trainer_id)
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('title', p.title, 'quantity', p.quantity, 'unit_price_sek', p.price_sek / p.quantity,
                                          'price_sek', p.price_sek, 'is_wellness_package', coalesce(s.is_wellness_package, false))
                       order by p.price_sek desc)
      from purchases p left join trainer_services s on s.id = p.service_id
      where p.checkout_id = p_checkout and p.status = 'paid'
    ), '[]'::jsonb),
    'subtotal_sek', v_sub,
    'service_fee_sek', coalesce(v_fee, 0),
    'total_sek', v_sub + coalesce(v_fee, 0),
    'vat_rate', case when coalesce(v_b.vat_registered, true) then 6 else 0 end
  );
end;
$$;
revoke all on function get_wellness_receipt(uuid) from public, anon;
grant execute on function get_wellness_receipt(uuid) to authenticated;
