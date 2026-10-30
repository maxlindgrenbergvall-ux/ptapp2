import "server-only"

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { BOOST_PRODUCT, BOOST_PRODUCT_DAYS, isPlusProduct } from "@/lib/payments/store-products"

/**
 * Serversidan av köp i appen. RevenueCat är facit: vi hämtar kundens köp med
 * den hemliga nyckeln (REVENUECAT_SECRET_KEY, bara på servern) och skriver
 * resultatet i databasen med service role. Både webhooken och appens
 * "synka nu" (direkt efter ett köp) använder samma funktion.
 */

export const isRevenueCatEnabled = () => Boolean(process.env.REVENUECAT_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isAppUserId = (id: unknown): id is string => typeof id === "string" && UUID.test(id)

const API_BASE = () => (process.env.REVENUECAT_API_BASE || "https://api.revenuecat.com").replace(/\/+$/, "")

interface RcSubscription {
  expires_date: string | null
  unsubscribe_detected_at: string | null
  billing_issues_detected_at: string | null
  refunded_at?: string | null
  store?: string
}
interface RcNonSubscription {
  id: string
  store_transaction_id?: string | null
  store?: string
  purchase_date?: string
}
export interface RcSubscriber {
  subscriptions?: Record<string, RcSubscription>
  non_subscriptions?: Record<string, RcNonSubscription[]>
}

export async function fetchSubscriber(appUserId: string): Promise<RcSubscriber> {
  const res = await fetch(`${API_BASE()}/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}`, "Content-Type": "application/json" },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`RevenueCat svarade ${res.status}`)
  const body = (await res.json()) as { subscriber?: RcSubscriber }
  return body.subscriber ?? {}
}

/**
 * Radera kunden hos RevenueCat (GDPR art. 17). Själva köpen finns kvar hos
 * Apple/Google, som är säljare; en aktiv prenumeration sägs upp i butiken.
 */
export async function deleteSubscriber(appUserId: string): Promise<void> {
  const res = await fetch(`${API_BASE()}/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}` },
    cache: "no-store",
  })
  if (!res.ok && res.status !== 404) throw new Error(`RevenueCat svarade ${res.status}`)
}

/** Plus-prenumerationen: senaste slutdatum bland ej återbetalda Plus-produkter. */
export function plusFromSubscriber(sub: RcSubscriber): { until: string | null; renews: boolean; product: string | null } {
  let best: { until: string; renews: boolean; product: string } | null = null
  for (const [product, s] of Object.entries(sub.subscriptions ?? {})) {
    if (!isPlusProduct(product) || !s.expires_date || s.refunded_at) continue
    if (!best || Date.parse(s.expires_date) > Date.parse(best.until)) {
      best = { until: s.expires_date, renews: !s.unsubscribe_detected_at && !s.billing_issues_detected_at, product }
    }
  }
  return best ?? { until: null, renews: false, product: null }
}

/** Butikens transaktions-id (samma som i webhooken), annars RevenueCats id. */
export const transactionId = (t: RcNonSubscription) => t.store_transaction_id || t.id

/** Hämta kundens köp och skriv dem i databasen. Returnerar det som gäller nu. */
export async function syncStoreCustomer(userId: string) {
  const sub = await fetchSubscriber(userId)
  const admin = createSupabaseAdmin()
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle()
  if (!profile) return { plusUntil: null, renews: false, boostedUntil: null, unknownUser: true }

  const plus = plusFromSubscriber(sub)
  const { error: plusError } = await admin.rpc("apply_store_plus", { p_user: userId, p_until: plus.until, p_renews: plus.renews, p_product: plus.product })
  if (plusError) throw new Error(plusError.message)

  let boostedUntil: string | null = null
  if ((profile as { role: string | null }).role === "trainer") {
    for (const t of sub.non_subscriptions?.[BOOST_PRODUCT] ?? []) {
      const { data, error } = await admin.rpc("apply_store_boost", {
        p_user: userId,
        p_transaction: transactionId(t),
        p_product: BOOST_PRODUCT,
        p_days: BOOST_PRODUCT_DAYS,
        p_store: t.store ?? "app_store",
      })
      if (error) throw new Error(error.message)
      boostedUntil = (data as string | null) ?? boostedUntil
    }
  }
  return { plusUntil: plus.until, renews: plus.renews, boostedUntil, unknownUser: false }
}

/** Återbetalt boostköp (webhookens CANCELLATION för engångsköpet). */
export async function refundStoreBoost(transaction: string) {
  const { error } = await createSupabaseAdmin().rpc("revoke_store_boost", { p_transaction: transaction })
  if (error) throw new Error(error.message)
}
