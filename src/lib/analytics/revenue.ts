/**
 * Intäkter och prenumerationshändelser till statistiken (v82).
 *
 * Rena funktioner: webhookarna (RevenueCat och Stripe) gör om sina händelser
 * till rader för record_revenue_event() / record_subscription_event() i
 * databasen. Allt räknas i svenska kronor.
 *
 *   RevenueCat – Apple/Google är säljare (Merchant of Record): butiken tar sin
 *   avgift (15 % som standard, REVENUECAT_STORE_FEE_PERCENT) och sköter momsen.
 *   Stripe – Coavira säljer själv: 25 % utgående moms räknas ut i databasen.
 */
import { BOOST_PRODUCT, isPlusProduct } from "@/lib/payments/store-products"

type Env = Record<string, string | undefined>

/** Ungefärliga växelkurser till SEK (SEK_RATE_<VALUTA> på servern skriver över). */
const DEFAULT_SEK_RATES: Record<string, number> = { SEK: 1, USD: 10.5, EUR: 11.5, NOK: 1, DKK: 1.54, GBP: 13.5 }

export function sekRate(currency: string, env: Env = process.env): number | null {
  const c = currency.toUpperCase()
  if (c === "SEK") return 1
  const fromEnv = Number(env[`SEK_RATE_${c}`])
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
  return DEFAULT_SEK_RATES[c] ?? null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Belopp i SEK. Okänd valuta: USD-priset (som RevenueCat alltid skickar) används. */
export function toSek(amount: number, currency: string | null | undefined, usdFallback?: number | null, env: Env = process.env): number | null {
  const rate = currency ? sekRate(currency, env) : null
  if (rate !== null) return round2(amount * rate)
  if (typeof usdFallback === "number") {
    const usd = sekRate("USD", env)
    return usd === null ? null : round2(usdFallback * usd)
  }
  return null
}

/** Butikens avgift i procent (Apple/Google Small Business Program: 15 %). */
export function storeFeePercent(env: Env = process.env): number {
  const v = Number(env.REVENUECAT_STORE_FEE_PERCENT)
  return Number.isFinite(v) && v >= 0 && v <= 50 ? v : 15
}

export type RevenueRecord = {
  provider: "stripe" | "revenuecat"
  external_id: string
  kind: "pt_booking" | "plus" | "boost" | "other"
  event_type: "ONE_TIME" | "INITIAL_PURCHASE" | "RENEWAL" | "NON_RENEWING_PURCHASE" | "INVOICE_PAID"
  user_id?: string | null
  product_id?: string | null
  store: "STRIPE" | "APP_STORE" | "PLAY_STORE" | "OTHER"
  currency?: string
  amount_original?: number
  gross_sek: number
  store_fee_sek?: number
  is_subscription?: boolean
  period_days?: number | null
  period_end?: string | null
  environment?: "PRODUCTION" | "SANDBOX"
  occurred_at?: string
}

export type SubscriptionRecord = {
  provider: "stripe" | "revenuecat"
  external_id: string
  event_type: "started" | "renewed" | "cancelled" | "uncancelled" | "expired"
  user_id?: string | null
  product_id?: string | null
  store: "STRIPE" | "APP_STORE" | "PLAY_STORE" | "OTHER"
  unsubscribe_detected_at?: string | null
  cancel_reason?: string | null
  expires_at?: string | null
  environment?: "PRODUCTION" | "SANDBOX"
  occurred_at?: string
}

export type AnalyticsRecords = {
  revenue?: RevenueRecord
  subscription?: SubscriptionRecord
  /** Återbetalning: intäkten med detta external_id räknas inte längre. */
  refund?: { provider: "stripe" | "revenuecat"; external_id: string }
}

/** Fälten i RevenueCats webhook som statistiken använder. */
export type RevenueCatEvent = {
  id?: string
  type: string
  product_id?: string | null
  transaction_id?: string | null
  original_transaction_id?: string | null
  environment?: string | null
  store?: string | null
  price?: number | null
  price_in_purchased_currency?: number | null
  currency?: string | null
  period_type?: string | null
  purchased_at_ms?: number | null
  expiration_at_ms?: number | null
  event_timestamp_ms?: number | null
  cancel_reason?: string | null
  expiration_reason?: string | null
}

const iso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null)

export function rcStore(store: string | null | undefined): RevenueRecord["store"] {
  if (store === "APP_STORE" || store === "MAC_APP_STORE") return "APP_STORE"
  if (store === "PLAY_STORE") return "PLAY_STORE"
  return "OTHER"
}

const rcKind = (product: string | null | undefined): RevenueRecord["kind"] =>
  isPlusProduct(product) ? "plus" : product === BOOST_PRODUCT ? "boost" : "other"

/**
 * RevenueCat-händelse → intäkt och/eller prenumerationshändelse.
 * Provperioder (pris 0) ger ingen intäkt men räknas som start.
 */
export function revenueCatRecords(e: RevenueCatEvent, userId: string | null, env: Env = process.env): AnalyticsRecords {
  const store = rcStore(e.store)
  const environment = e.environment === "SANDBOX" ? "SANDBOX" : "PRODUCTION"
  const occurred = iso(e.event_timestamp_ms) ?? iso(e.purchased_at_ms) ?? new Date().toISOString()
  const txn = e.transaction_id ?? e.id ?? null
  const subId = e.id ?? `${e.type}:${txn ?? occurred}`
  const product = e.product_id ?? null
  const isSub = isPlusProduct(product)
  const base = { user_id: userId, product_id: product, store, environment } as const

  const amount = e.price_in_purchased_currency ?? e.price ?? 0
  const gross = toSek(Math.abs(amount), e.price_in_purchased_currency != null ? e.currency : "USD", e.price ?? null, env) ?? 0
  const purchased = e.purchased_at_ms ?? e.event_timestamp_ms ?? null
  const periodDays =
    purchased && e.expiration_at_ms ? Math.max(1, Math.min(400, Math.round((e.expiration_at_ms - purchased) / 86_400_000))) : null

  const revenue = (event_type: RevenueRecord["event_type"]): RevenueRecord | undefined =>
    gross > 0 && txn
      ? {
          provider: "revenuecat",
          external_id: txn,
          kind: rcKind(product),
          event_type,
          ...base,
          currency: (e.currency ?? "USD").toUpperCase(),
          amount_original: Math.abs(amount),
          gross_sek: gross,
          store_fee_sek: round2((gross * storeFeePercent(env)) / 100),
          is_subscription: isSub,
          period_days: periodDays,
          period_end: iso(e.expiration_at_ms),
          occurred_at: iso(e.purchased_at_ms) ?? occurred,
        }
      : undefined

  const sub = (event_type: SubscriptionRecord["event_type"], extra: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
    provider: "revenuecat",
    external_id: subId,
    event_type,
    ...base,
    expires_at: iso(e.expiration_at_ms),
    occurred_at: occurred,
    ...extra,
  })

  switch (e.type) {
    case "INITIAL_PURCHASE":
      return { revenue: revenue("INITIAL_PURCHASE"), subscription: isSub ? sub("started") : undefined }
    case "RENEWAL":
      return { revenue: revenue("RENEWAL"), subscription: isSub ? sub("renewed") : undefined }
    case "NON_RENEWING_PURCHASE":
      return { revenue: revenue("NON_RENEWING_PURCHASE") }
    case "CANCELLATION": {
      // Återbetalning (supporten eller negativt pris) – och för engångsköp betyder CANCELLATION alltid det.
      const refunded = e.cancel_reason === "CUSTOMER_SUPPORT" || amount < 0 || !isSub
      return {
        refund: refunded && txn ? { provider: "revenuecat", external_id: txn } : undefined,
        subscription: isSub ? sub("cancelled", { unsubscribe_detected_at: occurred, cancel_reason: e.cancel_reason ?? null }) : undefined,
      }
    }
    case "UNCANCELLATION":
      return { subscription: isSub ? sub("uncancelled") : undefined }
    case "EXPIRATION":
      return { subscription: isSub ? sub("expired", { cancel_reason: e.expiration_reason ?? null }) : undefined }
    default:
      return {}
  }
}

/** Fälten i en Stripe-faktura (invoice.paid) för Coavira+ på webben. */
export type StripeInvoiceLike = {
  id: string
  amount_paid: number
  currency: string
  billing_reason?: string | null
  livemode?: boolean
  created?: number
  status_transitions?: { paid_at?: number | null } | null
  lines?: { data?: { period?: { start?: number; end?: number } }[] }
  metadata?: Record<string, string> | null
  subscription?: string | { id: string } | null
  parent?: { subscription_details?: { subscription?: string | { id: string } | null; metadata?: Record<string, string> | null } | null } | null
}

export function stripeInvoiceSubscriptionId(inv: StripeInvoiceLike): string | null {
  const s = inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null
  return typeof s === "string" ? s : (s?.id ?? null)
}

/** invoice.paid för en prenumeration → intäkt (+ start eller förnyelse). Övriga fakturor ignoreras. */
export function stripeInvoiceRecords(inv: StripeInvoiceLike, env: Env = process.env): AnalyticsRecords {
  const subscription = stripeInvoiceSubscriptionId(inv)
  if (!subscription || inv.amount_paid <= 0) return {}
  const meta = { ...(inv.metadata ?? {}), ...(inv.parent?.subscription_details?.metadata ?? {}) }
  const userId = meta.user_id ?? null
  const period = inv.lines?.data?.[0]?.period
  const paidAt = inv.status_transitions?.paid_at ?? inv.created ?? Math.floor(Date.now() / 1000)
  const occurred = new Date(paidAt * 1000).toISOString()
  const periodDays = period?.start && period?.end ? Math.max(1, Math.min(400, Math.round((period.end - period.start) / 86_400))) : null
  const environment = inv.livemode === false ? "SANDBOX" : "PRODUCTION"
  const gross = toSek(inv.amount_paid / 100, inv.currency, null, env) ?? 0
  const product = meta.plan ?? "web_plus_subscription"
  return {
    revenue: {
      provider: "stripe",
      external_id: inv.id,
      kind: "plus",
      event_type: "INVOICE_PAID",
      user_id: userId,
      product_id: product,
      store: "STRIPE",
      currency: inv.currency.toUpperCase(),
      amount_original: inv.amount_paid / 100,
      gross_sek: gross,
      is_subscription: true,
      period_days: periodDays,
      period_end: period?.end ? new Date(period.end * 1000).toISOString() : null,
      environment,
      occurred_at: occurred,
    },
    subscription: {
      provider: "stripe",
      external_id: `invoice:${inv.id}`,
      event_type: inv.billing_reason === "subscription_create" ? "started" : "renewed",
      user_id: userId,
      product_id: product,
      store: "STRIPE",
      expires_at: period?.end ? new Date(period.end * 1000).toISOString() : null,
      environment,
      occurred_at: occurred,
    },
  }
}

/** Fälten i en Stripe-prenumeration (customer.subscription.updated/deleted). */
export type StripeSubscriptionLike = {
  id: string
  livemode?: boolean
  cancel_at_period_end?: boolean
  canceled_at?: number | null
  ended_at?: number | null
  cancel_at?: number | null
  metadata?: Record<string, string> | null
  cancellation_details?: { reason?: string | null; feedback?: string | null } | null
  items?: { data?: { current_period_end?: number }[] }
}

/**
 * customer.subscription.updated med cancel_at_period_end → uppsägning
 * (ångrad uppsägning när den slås av), customer.subscription.deleted → churn.
 */
export function stripeSubscriptionRecords(
  eventId: string,
  type: string,
  sub: StripeSubscriptionLike,
  previous?: { cancel_at_period_end?: boolean } | null
): AnalyticsRecords {
  const base = {
    provider: "stripe" as const,
    external_id: eventId,
    user_id: sub.metadata?.user_id ?? null,
    product_id: sub.metadata?.plan ?? "web_plus_subscription",
    store: "STRIPE" as const,
    environment: sub.livemode === false ? ("SANDBOX" as const) : ("PRODUCTION" as const),
  }
  const end = sub.cancel_at ?? sub.items?.data?.[0]?.current_period_end ?? null
  const reason = sub.cancellation_details?.feedback ?? sub.cancellation_details?.reason ?? null
  if (type === "customer.subscription.deleted") {
    const at = sub.ended_at ?? sub.canceled_at
    return {
      subscription: { ...base, event_type: "expired", cancel_reason: reason, occurred_at: at ? new Date(at * 1000).toISOString() : undefined },
    }
  }
  if (type === "customer.subscription.updated" && previous && "cancel_at_period_end" in previous) {
    if (sub.cancel_at_period_end) {
      const at = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : new Date().toISOString()
      return {
        subscription: {
          ...base,
          event_type: "cancelled",
          unsubscribe_detected_at: at,
          cancel_reason: reason,
          expires_at: end ? new Date(end * 1000).toISOString() : null,
          occurred_at: at,
        },
      }
    }
    return { subscription: { ...base, event_type: "uncancelled" } }
  }
  return {}
}
