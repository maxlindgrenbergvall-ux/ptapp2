-- v82: statistik, ekonomi och KPI:er för adminpanelen (/admin/analytics).
--
-- * revenue_events: varje intäkt en gång (idempotent på provider + external_id).
--   Stripe-köp skrivs av databasen själv när köpet markeras betalt (triggrar på
--   purchases, trainer_boosts och plus_purchases): plattformsavgiften
--   (= application_fee_amount i Stripe) för PT-bokningar, boost och Plus på webben.
--   RevenueCat (App Store/Google Play) och Stripe-prenumerationer (invoice.paid)
--   skrivs av webhookarna via record_revenue_event().
-- * subscription_events: start, förnyelse, uppsägning och utgång (churn).
-- * landing_page_views: cookie-fri besöksstatistik. visitor_hash = SHA-256 av
--   datum + IP + webbläsare (räknas ut på servern, byts varje dygn – ingen IP sparas).
-- * profiles.last_seen_at + user_activity_logs (en rad per användare och dag),
--   uppdateras av touch_activity() högst var 5:e minut.
-- * get_admin_crm_analytics(period_days): allt i ett anrop. Bara administratörer.
--
-- Alla tabeller är stängda för användare: bara admin läser (RLS + is_admin()),
-- bara servern (service role) och databasens egna funktioner skriver.

-- ========================================================== intäkter ===
create table revenue_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null check (provider in ('stripe', 'revenuecat')),
  external_id     text not null check (char_length(external_id) between 1 and 200),
  kind            text not null check (kind in ('pt_booking', 'plus', 'boost', 'other')),
  event_type      text not null check (event_type in ('PT_BOOKING_FEE', 'ONE_TIME', 'INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'INVOICE_PAID')),
  user_id         uuid references profiles on delete set null,
  product_id      text check (char_length(product_id) <= 200),
  store           text not null default 'STRIPE' check (store in ('STRIPE', 'APP_STORE', 'PLAY_STORE', 'OTHER')),
  currency        text not null default 'SEK' check (char_length(currency) between 3 and 3),
  amount_original numeric(12, 2),
  -- Kundens pris (för Stripe inkl. 25 % moms). För PT-bokningar: serviceavgiften.
  gross_sek       numeric(12, 2) not null check (gross_sek >= 0),
  store_fee_sek   numeric(12, 2) not null default 0 check (store_fee_sek >= 0),
  -- Coaviras intäkt efter butikens avgift.
  net_sek         numeric(12, 2) not null check (net_sek >= 0),
  -- Utgående moms (bara Stripe – i butikerna är Apple/Google säljare, MoR).
  vat_sek         numeric(12, 2) not null default 0 check (vat_sek >= 0),
  -- Hela transaktionens volym (PT-bokning: PT:ns pris + avgiften).
  gmv_sek         numeric(12, 2) check (gmv_sek >= 0),
  is_subscription boolean not null default false,
  period_days     int check (period_days between 1 and 400),
  period_end      timestamptz,
  environment     text not null default 'PRODUCTION' check (environment in ('PRODUCTION', 'SANDBOX')),
  occurred_at     timestamptz not null default now(),
  refunded_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (provider, external_id)
);
create index revenue_events_occurred_idx on revenue_events (occurred_at desc);
create index revenue_events_user_idx on revenue_events (user_id, occurred_at desc);

create table subscription_events (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null check (provider in ('stripe', 'revenuecat')),
  external_id             text not null check (char_length(external_id) between 1 and 200),
  user_id                 uuid references profiles on delete set null,
  product_id              text check (char_length(product_id) <= 200),
  store                   text not null default 'STRIPE' check (store in ('STRIPE', 'APP_STORE', 'PLAY_STORE', 'OTHER')),
  event_type              text not null check (event_type in ('started', 'renewed', 'cancelled', 'uncancelled', 'expired')),
  -- När uppsägningen upptäcktes (CANCELLATION / cancel_at_period_end).
  unsubscribe_detected_at timestamptz,
  cancel_reason           text check (char_length(cancel_reason) <= 120),
  expires_at              timestamptz,
  environment             text not null default 'PRODUCTION' check (environment in ('PRODUCTION', 'SANDBOX')),
  occurred_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  unique (provider, external_id)
);
create index subscription_events_occurred_idx on subscription_events (occurred_at desc);
create index subscription_events_user_idx on subscription_events (user_id, occurred_at desc);

-- ========================================================== besök ===
create table landing_page_views (
  id           bigint generated always as identity primary key,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  event        text not null default 'pageview' check (event in ('pageview', 'cta_signup', 'cta_find_pt')),
  path         text not null default '/' check (char_length(path) <= 300),
  -- Bara värdnamnet (t.ex. google.com) – aldrig hela adressen.
  referrer     text check (char_length(referrer) <= 200),
  utm_source   text check (char_length(utm_source) <= 100),
  utm_medium   text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  created_at   timestamptz not null default now()
);
create index landing_page_views_created_idx on landing_page_views (created_at desc);

-- ======================================================== aktivitet ===
alter table profiles add column last_seen_at timestamptz;
create index profiles_last_seen_idx on profiles (last_seen_at desc) where last_seen_at is not null;

create table user_activity_logs (
  user_id       uuid not null references profiles on delete cascade,
  activity_date date not null,
  role          user_role not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  pings         int not null default 1,
  primary key (user_id, activity_date)
);
create index user_activity_logs_date_idx on user_activity_logs (activity_date, role);

-- ====================================================== behörighet ===
alter table revenue_events enable row level security;
alter table subscription_events enable row level security;
alter table landing_page_views enable row level security;
alter table user_activity_logs enable row level security;
create policy "revenue: admin read" on revenue_events for select to authenticated using (is_admin());
create policy "subscriptions: admin read" on subscription_events for select to authenticated using (is_admin());
create policy "page views: admin read" on landing_page_views for select to authenticated using (is_admin());
create policy "activity: admin read" on user_activity_logs for select to authenticated using (is_admin());
revoke all on revenue_events, subscription_events, landing_page_views, user_activity_logs from anon;
revoke insert, update, delete, truncate on revenue_events, subscription_events, landing_page_views, user_activity_logs from authenticated;
grant select on revenue_events, subscription_events, landing_page_views, user_activity_logs to authenticated;
-- last_seen_at läses bara av admin (via analysfunktionen) – ingen kolumnbehörighet för användare.

-- ============================================ Stripe: databasen själv ===
create or replace function v82_stripe_vat(p_gross numeric)
returns numeric language sql immutable as $$ select round(p_gross - p_gross / 1.25, 2) $$;

/** PT-bokning betald: Coaviras serviceavgift (application_fee_amount) + GMV. En gång per kassa. */
create or replace function v82_on_purchase_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric;
  v_gmv numeric;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    v_fee := coalesce((select fee_sek from checkout_fees where checkout_id = new.checkout_id), 0);
    v_gmv := coalesce((select sum(price_sek) from purchases where checkout_id = new.checkout_id), 0) + v_fee;
    insert into revenue_events (provider, external_id, kind, event_type, user_id, product_id, store,
                                gross_sek, net_sek, vat_sek, gmv_sek, occurred_at)
    values ('stripe', 'checkout:' || new.checkout_id, 'pt_booking', 'PT_BOOKING_FEE', new.client_id, new.trainer_id::text, 'STRIPE',
            v_fee, v_fee, v82_stripe_vat(v_fee), v_gmv, coalesce(new.paid_at, now()))
    on conflict (provider, external_id) do nothing;
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    update revenue_events set refunded_at = now()
    where provider = 'stripe' and external_id = 'checkout:' || new.checkout_id and refunded_at is null;
  end if;
  return new;
end;
$$;
create trigger purchases_v82_revenue after update of status on purchases
  for each row execute function v82_on_purchase_status();

create or replace function v82_on_boost_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into revenue_events (provider, external_id, kind, event_type, user_id, product_id, store,
                                gross_sek, net_sek, vat_sek, gmv_sek, period_days, period_end, occurred_at)
    values ('stripe', 'boost:' || new.id, 'boost', 'ONE_TIME', new.trainer_id, 'web_boost', 'STRIPE',
            new.price_sek, new.price_sek, v82_stripe_vat(new.price_sek), new.price_sek, new.duration_days, new.ends_at, coalesce(new.paid_at, now()))
    on conflict (provider, external_id) do nothing;
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    update revenue_events set refunded_at = now() where provider = 'stripe' and external_id = 'boost:' || new.id and refunded_at is null;
  end if;
  return new;
end;
$$;
create trigger trainer_boosts_v82_revenue after update of status on trainer_boosts
  for each row execute function v82_on_boost_status();

create or replace function v82_on_plus_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into revenue_events (provider, external_id, kind, event_type, user_id, product_id, store,
                                gross_sek, net_sek, vat_sek, gmv_sek, period_days, period_end, occurred_at)
    values ('stripe', 'plus:' || new.id, 'plus', 'ONE_TIME', new.user_id, 'web_plus_' || new.days || 'd', 'STRIPE',
            new.price_sek, new.price_sek, v82_stripe_vat(new.price_sek), new.price_sek, new.days,
            coalesce(new.paid_at, now()) + make_interval(days => new.days), coalesce(new.paid_at, now()))
    on conflict (provider, external_id) do nothing;
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    update revenue_events set refunded_at = now() where provider = 'stripe' and external_id = 'plus:' || new.id and refunded_at is null;
  end if;
  return new;
end;
$$;
create trigger plus_purchases_v82_revenue after update of status on plus_purchases
  for each row execute function v82_on_plus_status();

revoke all on function v82_on_purchase_status() from public, anon, authenticated;
revoke all on function v82_on_boost_status() from public, anon, authenticated;
revoke all on function v82_on_plus_status() from public, anon, authenticated;

-- ================================================ webhookarna (server) ===
/**
 * Server (RevenueCat- och Stripe-webhookarna): spara en intäkt. Samma
 * external_id räknas bara en gång. Beloppen räknas ut i servern (valuta → SEK,
 * butikens avgift); för Stripe räknas momsen ut här. Returnerar true om raden är ny.
 */
create or replace function record_revenue_event(p jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_provider text := p ->> 'provider';
  v_gross numeric := round(coalesce((p ->> 'gross_sek')::numeric, 0), 2);
  v_fee numeric := round(coalesce((p ->> 'store_fee_sek')::numeric, 0), 2);
  v_user uuid := nullif(p ->> 'user_id', '')::uuid;
begin
  if v_user is not null and not exists (select 1 from profiles where id = v_user) then
    v_user := null;
  end if;
  insert into revenue_events (provider, external_id, kind, event_type, user_id, product_id, store, currency, amount_original,
                              gross_sek, store_fee_sek, net_sek, vat_sek, gmv_sek, is_subscription, period_days, period_end,
                              environment, occurred_at)
  values (v_provider, p ->> 'external_id', coalesce(p ->> 'kind', 'other'), p ->> 'event_type', v_user, p ->> 'product_id',
          coalesce(p ->> 'store', 'STRIPE'), upper(coalesce(p ->> 'currency', 'SEK')), (p ->> 'amount_original')::numeric,
          v_gross, v_fee, greatest(v_gross - v_fee, 0),
          case when v_provider = 'stripe' then v82_stripe_vat(v_gross) else 0 end,
          coalesce((p ->> 'gmv_sek')::numeric, v_gross),
          coalesce((p ->> 'is_subscription')::boolean, false), (p ->> 'period_days')::int, (p ->> 'period_end')::timestamptz,
          coalesce(p ->> 'environment', 'PRODUCTION'), coalesce((p ->> 'occurred_at')::timestamptz, now()))
  on conflict (provider, external_id) do nothing;
  return found;
end;
$$;
revoke all on function record_revenue_event(jsonb) from public, anon, authenticated;
grant execute on function record_revenue_event(jsonb) to service_role;

/** Server: återbetalning – intäkten räknas inte längre. Idempotent. */
create or replace function mark_revenue_refunded(p_provider text, p_external_id text)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update revenue_events set refunded_at = now()
    where provider = p_provider and external_id = p_external_id and refunded_at is null
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke all on function mark_revenue_refunded(text, text) from public, anon, authenticated;
grant execute on function mark_revenue_refunded(text, text) to service_role;

/** Server: prenumerationshändelse (start, förnyelse, uppsägning, utgång). Idempotent. */
create or replace function record_subscription_event(p jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := nullif(p ->> 'user_id', '')::uuid;
begin
  if v_user is not null and not exists (select 1 from profiles where id = v_user) then
    v_user := null;
  end if;
  insert into subscription_events (provider, external_id, user_id, product_id, store, event_type,
                                   unsubscribe_detected_at, cancel_reason, expires_at, environment, occurred_at)
  values (p ->> 'provider', p ->> 'external_id', v_user, p ->> 'product_id', coalesce(p ->> 'store', 'STRIPE'), p ->> 'event_type',
          (p ->> 'unsubscribe_detected_at')::timestamptz, left(p ->> 'cancel_reason', 120), (p ->> 'expires_at')::timestamptz,
          coalesce(p ->> 'environment', 'PRODUCTION'), coalesce((p ->> 'occurred_at')::timestamptz, now()))
  on conflict (provider, external_id) do nothing;
  return found;
end;
$$;
revoke all on function record_subscription_event(jsonb) from public, anon, authenticated;
grant execute on function record_subscription_event(jsonb) to service_role;

-- ============================================================ appen ===
/**
 * Appen: "jag är här". Uppdaterar profiles.last_seen_at och dagens rad i
 * user_activity_logs – högst var 5:e minut (annars händer inget). Returnerar
 * true när något skrevs.
 */
create or replace function touch_activity()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_last timestamptz;
begin
  if v_uid is null then return false; end if;
  select role, last_seen_at into v_role, v_last from profiles where id = v_uid;
  if not found then return false; end if;
  if v_last is not null and v_last > now() - interval '5 minutes' then return false; end if;
  update profiles set last_seen_at = now() where id = v_uid;
  insert into user_activity_logs (user_id, activity_date, role)
  values (v_uid, (now() at time zone 'Europe/Stockholm')::date, v_role)
  on conflict (user_id, activity_date) do update set last_seen_at = now(), pings = user_activity_logs.pings + 1;
  return true;
end;
$$;
revoke all on function touch_activity() from public, anon;
grant execute on function touch_activity() to authenticated;

-- ======================================================= analysen ===
/**
 * Admin: hela statistikpanelen i ett anrop. period_days (1–365) styr besök,
 * tratt och registreringar; ekonomin räknas på innevarande månad, kvartal och år
 * (svensk tid). Sandbox-köp (TestFlight) och återbetalda köp räknas inte.
 * Prognos, moms per period, konverteringar och ARPU räknas ut i appen
 * (src/lib/analytics/finance.ts) från siffrorna här.
 */
create or replace function get_admin_crm_analytics(period_days int default 30)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz constant text := 'Europe/Stockholm';
  v_days int := least(greatest(coalesce(get_admin_crm_analytics.period_days, 30), 1), 365);
  v_today date := (now() at time zone tz)::date;
  v_month date := date_trunc('month', v_today)::date;
  v_quarter date := date_trunc('quarter', v_today)::date;
  v_year date := date_trunc('year', v_today)::date;
  v_month_end date := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
  v_month_ts timestamptz := v_month::timestamp at time zone tz;
  v_next_month_ts timestamptz := (v_month + interval '1 month')::timestamp at time zone tz;
  v_from date := v_today - (v_days - 1);
  v_from_ts timestamptz := (v_today - (v_days - 1))::timestamp at time zone tz;
  r jsonb := '{}'::jsonb;
begin
  if not is_admin() then raise exception 'Bara administratörer' using errcode = '42501'; end if;

  create temp table if not exists v82_rev on commit drop as select * from revenue_events limit 0;
  truncate v82_rev;
  insert into v82_rev select * from revenue_events where refunded_at is null and environment = 'PRODUCTION';

  -- Aktiva prenumerationer: senaste intäkten per kund och produkt med perioden kvar.
  create temp table if not exists v82_subs (provider text, user_id uuid, product_id text, net_sek numeric, period_days int, period_end timestamptz, will_renew boolean) on commit drop;
  truncate v82_subs;
  insert into v82_subs
  select s.provider, s.user_id, s.product_id, s.net_sek, coalesce(s.period_days, 30), s.period_end,
         coalesce((select e.event_type not in ('cancelled', 'expired')
                   from subscription_events e
                   where e.provider = s.provider and e.user_id is not distinct from s.user_id
                     and e.product_id is not distinct from s.product_id and e.occurred_at >= s.occurred_at
                     and e.environment = 'PRODUCTION'
                   order by e.occurred_at desc limit 1), true)
  from (
    select distinct on (provider, user_id, product_id) *
    from v82_rev where is_subscription
    order by provider, user_id, product_id, occurred_at desc
  ) s
  where s.period_end > now();

  r := r || jsonb_build_object(
    'generated_at', now(),
    'period_days', v_days,
    'calendar', jsonb_build_object('today', v_today, 'month_start', v_month, 'month_end', v_month_end,
                                   'days_in_month', extract(day from v_month_end)::int, 'days_passed', extract(day from v_today)::int,
                                   'quarter_start', v_quarter, 'year_start', v_year)
  );

  -- ---------------------------------------------------------- ekonomi ---
  r := r || jsonb_build_object('economy', jsonb_build_object(
    'month', (
      select jsonb_object_agg(t.provider, t.v) from (
        select p.provider, jsonb_build_object(
          'gross', coalesce(sum(e.gross_sek), 0), 'store_fee', coalesce(sum(e.store_fee_sek), 0),
          'net', coalesce(sum(e.net_sek), 0), 'vat', coalesce(sum(e.vat_sek), 0), 'gmv', coalesce(sum(e.gmv_sek), 0),
          'one_off_net', coalesce(sum(e.net_sek) filter (where not e.is_subscription), 0),
          'recurring_net', coalesce(sum(e.net_sek) filter (where e.is_subscription), 0),
          'count', count(e.id)) v
        from (values ('stripe'), ('revenuecat')) p(provider)
        left join v82_rev e on e.provider = p.provider and e.occurred_at >= v_month_ts
        group by p.provider
      ) t
    ),
    'vat_periods', (
      select jsonb_object_agg(t.name, t.v) from (
        select per.name, jsonb_build_object(
          'from', per.start,
          'stripe_gross', coalesce(sum(e.gross_sek) filter (where e.provider = 'stripe'), 0),
          'stripe_vat', coalesce(sum(e.vat_sek) filter (where e.provider = 'stripe'), 0),
          'revenuecat_gross', coalesce(sum(e.gross_sek) filter (where e.provider = 'revenuecat'), 0),
          'revenuecat_net', coalesce(sum(e.net_sek) filter (where e.provider = 'revenuecat'), 0)) v
        from (values ('month', v_month), ('quarter', v_quarter), ('year', v_year)) per(name, start)
        left join v82_rev e on e.occurred_at >= per.start::timestamp at time zone tz
        group by per.name, per.start
      ) t
    ),
    'mrr', jsonb_build_object(
      'stripe', coalesce((select round(sum(net_sek * 30.0 / period_days), 2) from v82_subs where provider = 'stripe'), 0),
      'revenuecat', coalesce((select round(sum(net_sek * 30.0 / period_days), 2) from v82_subs where provider = 'revenuecat'), 0),
      'subscriptions', (select count(*) from v82_subs)
    ),
    'remaining_renewals', jsonb_build_object(
      'stripe', coalesce((select sum(net_sek) from v82_subs where provider = 'stripe' and will_renew and period_end < v_next_month_ts), 0),
      'revenuecat', coalesce((select sum(net_sek) from v82_subs where provider = 'revenuecat' and will_renew and period_end < v_next_month_ts), 0)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.day,
        'stripe_net', coalesce(x.stripe_net, 0), 'stripe_gross', coalesce(x.stripe_gross, 0), 'stripe_vat', coalesce(x.stripe_vat, 0),
        'revenuecat_net', coalesce(x.rc_net, 0), 'revenuecat_gross', coalesce(x.rc_gross, 0), 'gmv', coalesce(x.gmv, 0)) order by d.day), '[]')
      from generate_series(v_month, v_today, interval '1 day') d(day)
      left join (
        select (occurred_at at time zone tz)::date as day,
               sum(net_sek) filter (where provider = 'stripe') stripe_net,
               sum(gross_sek) filter (where provider = 'stripe') stripe_gross,
               sum(vat_sek) filter (where provider = 'stripe') stripe_vat,
               sum(net_sek) filter (where provider = 'revenuecat') rc_net,
               sum(gross_sek) filter (where provider = 'revenuecat') rc_gross,
               sum(gmv_sek) gmv
        from v82_rev where occurred_at >= v_month_ts group by 1
      ) x on x.day = d.day::date
    )
  ));

  -- ---------------------------------------------------------- trafik ---
  r := r || jsonb_build_object('traffic', jsonb_build_object(
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'visitors', coalesce(x.visitors, 0), 'views', coalesce(x.views, 0)) order by d.day), '[]')
      from generate_series(v_from, v_today, interval '1 day') d(day)
      left join (
        select (created_at at time zone tz)::date as day, count(distinct visitor_hash) visitors, count(*) views
        from landing_page_views where event = 'pageview' and created_at >= v_from_ts group by 1
      ) x on x.day = d.day::date
    ),
    'totals', (
      select jsonb_build_object(
        -- visitor_hash byts varje dygn: unika besökare = unika per dag, summerat.
        'visitors', count(distinct (visitor_hash, (created_at at time zone tz)::date)) filter (where event = 'pageview'),
        'views', count(*) filter (where event = 'pageview'),
        'cta_signup', count(*) filter (where event = 'cta_signup'),
        'cta_find_pt', count(*) filter (where event = 'cta_find_pt'))
      from landing_page_views where created_at >= v_from_ts
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'visitors', s.visitors) order by s.visitors desc), '[]')
      from (
        select coalesce(nullif(utm_source, ''), nullif(referrer, ''), 'Direkt') source,
               count(distinct (visitor_hash, (created_at at time zone tz)::date)) visitors
        from landing_page_views where event = 'pageview' and created_at >= v_from_ts
        group by 1 order by 2 desc limit 6
      ) s
    ),
    'funnel', jsonb_build_object(
      'signups', (select count(*) from profiles where created_at >= v_from_ts),
      'booked_pt', (select count(distinct client_id) from purchases where status = 'paid' and paid_at >= v_from_ts),
      'plus', (select count(distinct user_id) from v82_rev where kind = 'plus' and event_type <> 'RENEWAL' and occurred_at >= v_from_ts)
    )
  ));

  -- ------------------------------------------------------- aktivitet ---
  r := r || jsonb_build_object('activity', jsonb_build_object(
    'active_now', jsonb_build_object(
      'trainer', (select count(*) from profiles where role = 'trainer' and last_seen_at > now() - interval '15 minutes'),
      'client', (select count(*) from profiles where role = 'client' and last_seen_at > now() - interval '15 minutes')
    ),
    'dau', (select count(*) from user_activity_logs where activity_date = v_today),
    'wau', (select count(distinct user_id) from user_activity_logs where activity_date > v_today - 7),
    'mau', (select count(distinct user_id) from user_activity_logs where activity_date > v_today - 30),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'trainer', coalesce(x.pt, 0), 'client', coalesce(x.cl, 0)) order by d.day), '[]')
      from generate_series(v_today - 29, v_today, interval '1 day') d(day)
      left join (
        select activity_date, count(*) filter (where role = 'trainer') pt, count(*) filter (where role = 'client') cl
        from user_activity_logs where activity_date > v_today - 30 group by 1
      ) x on x.activity_date = d.day::date
    )
  ));

  -- ------------------------------------------------------- tillväxt ---
  r := r || jsonb_build_object('growth', jsonb_build_object(
    'weekly', (
      select coalesce(jsonb_agg(jsonb_build_object('period', w.start, 'trainer', coalesce(x.pt, 0), 'client', coalesce(x.cl, 0)) order by w.start), '[]')
      from generate_series(date_trunc('week', v_today)::date - 77, date_trunc('week', v_today)::date, interval '7 days') w(start)
      left join (
        select date_trunc('week', (created_at at time zone tz))::date wk,
               count(*) filter (where role = 'trainer') pt, count(*) filter (where role = 'client') cl
        from profiles group by 1
      ) x on x.wk = w.start::date
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('period', m.start, 'trainer', coalesce(x.pt, 0), 'client', coalesce(x.cl, 0)) order by m.start), '[]')
      from generate_series(v_month - interval '11 months', v_month, interval '1 month') m(start)
      left join (
        select date_trunc('month', (created_at at time zone tz))::date mo,
               count(*) filter (where role = 'trainer') pt, count(*) filter (where role = 'client') cl
        from profiles group by 1
      ) x on x.mo = m.start::date
    )
  ));

  -- ---------------------------------------------------- Coavira Plus ---
  r := r || jsonb_build_object('plus', jsonb_build_object(
    'active', (select count(*) from profiles where role = 'client' and (is_coavira_plus or coalesce(coavira_plus_until > now(), false))),
    'new_this_month', (select count(distinct user_id) from v82_rev where kind = 'plus' and event_type <> 'RENEWAL' and occurred_at >= v_month_ts),
    'churned_this_month', (select count(distinct coalesce(user_id::text, external_id)) from subscription_events
                           where event_type = 'expired' and environment = 'PRODUCTION' and occurred_at >= v_month_ts),
    'cancelled_this_month', (select count(distinct coalesce(user_id::text, external_id)) from subscription_events
                             where event_type = 'cancelled' and environment = 'PRODUCTION' and occurred_at >= v_month_ts),
    'avg_lifetime_days', (
      select round(avg(extract(epoch from (x.ended - x.started)) / 86400)::numeric, 1)
      from (
        select e.user_id, max(e.occurred_at) ended,
               (select min(v.occurred_at) from revenue_events v where v.user_id = e.user_id and v.kind = 'plus') started
        from subscription_events e
        where e.event_type = 'expired' and e.environment = 'PRODUCTION' and e.user_id is not null
        group by e.user_id
      ) x where x.started is not null and x.ended > x.started
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('period', m.start, 'new', coalesce(n.cnt, 0), 'churned', coalesce(c.cnt, 0)) order by m.start), '[]')
      from generate_series(v_month - interval '11 months', v_month, interval '1 month') m(start)
      left join (
        select date_trunc('month', occurred_at at time zone tz)::date mo, count(distinct user_id) cnt
        from v82_rev where kind = 'plus' and event_type <> 'RENEWAL' group by 1
      ) n on n.mo = m.start::date
      left join (
        select date_trunc('month', occurred_at at time zone tz)::date mo, count(distinct coalesce(user_id::text, external_id)) cnt
        from subscription_events where event_type = 'expired' and environment = 'PRODUCTION' group by 1
      ) c on c.mo = m.start::date
    )
  ));

  -- ------------------------------------------------------------ KPI ---
  r := r || jsonb_build_object('kpis', (
    with cl as (
      select p.id,
             exists (select 1 from purchases u where u.client_id = p.id and u.status = 'paid') paying,
             (p.is_coavira_plus or coalesce(p.coavira_plus_until > now(), false)) plus
      from profiles p where p.role = 'client'
    )
    select jsonb_build_object(
      'pts', (select jsonb_build_object(
                'total', count(*),
                'marketplace', count(*) filter (where is_pt_activated and is_published),
                'activated', count(*) filter (where is_pt_activated),
                'onboarding', count(*) filter (where not is_pt_activated))
              from trainers),
      'clients', (select jsonb_build_object(
                    'total', count(*),
                    'paying_pt', count(*) filter (where paying),
                    'plus', count(*) filter (where plus),
                    'free', count(*) filter (where not paying and not plus))
                  from cl)
    )
  ));

  return r;
end;
$$;
revoke all on function get_admin_crm_analytics(int) from public, anon;
grant execute on function get_admin_crm_analytics(int) to authenticated;
