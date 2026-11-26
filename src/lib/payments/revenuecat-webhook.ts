import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"
import "server-only"

import { revenueCatWebhookBody } from "@/lib/validation"
import { BOOST_PRODUCT } from "@/lib/payments/store-products"
import { saveAnalyticsRecords } from "@/lib/analytics/record"
import { revenueCatRecords } from "@/lib/analytics/revenue"
import { isAppUserId, isRevenueCatEnabled, refundStoreBoost, syncStoreCustomer } from "@/lib/payments/revenuecat-server"


/**
 * RevenueCat → Coavira: köp, förnyelser, uppsägningar och återbetalningar i
 * appen. Skyddas av lösenordet i Authorization-headern
 * (REVENUECAT_WEBHOOK_SECRET). För varje händelse hämtas kundens aktuella köp
 * från RevenueCat (syncStoreCustomer) – ordningen på händelserna spelar
 * därför ingen roll och samma händelse kan komma flera gånger.
 *
 * Sandbox-köp (TestFlight och Apples granskning) räknas också.
 *
 * v82: varje köp, förnyelse, uppsägning och utgång sparas också för
 * statistiken (revenue_events / subscription_events): pris i SEK, butik,
 * butikens avgift (15 %) och netto. Används av /api/webhooks/revenuecat och
 * /api/revenuecat/webhook (samma hemlighet).
 */
export async function handleRevenueCatWebhook(request: NextRequest) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET ?? ""
  const header = request.headers.get("authorization") ?? ""
  if (!secret || !(safeEqual(header, secret) || safeEqual(header, `Bearer ${secret}`))) {
    return NextResponse.json({ error: "Obehörig" }, { status: 401 })
  }
  const parsed = revenueCatWebhookBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ingen händelse" }, { status: 400 })
  const event = parsed.data.event
  if (event.type === "TEST") return NextResponse.json({ received: true })

  // Appen loggar in i RevenueCat med Supabase-id:t. Anonyma köp (före inloggning) ger inget i appen.
  const userId = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].find(isAppUserId)

  // Statistiken först (även anonyma köp är intäkter). Idempotent – fel → 500 och nytt försök.
  try {
    await saveAnalyticsRecords(revenueCatRecords(event, userId ?? null))
  } catch (e) {
    console.error("revenuecat analytics", { eventId: event.id, type: event.type, message: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: "Kunde inte spara händelsen" }, { status: 500 })
  }

  if (!isRevenueCatEnabled()) return NextResponse.json({ error: "RevenueCat är inte konfigurerat på servern" }, { status: 503 })
  if (!userId) return NextResponse.json({ received: true, ignored: "anonym" })

  try {
    if (event.type === "CANCELLATION" && event.product_id === BOOST_PRODUCT && event.transaction_id) {
      // Engångsköp: CANCELLATION betyder återbetalning.
      await refundStoreBoost(event.transaction_id)
    }
    const result = await syncStoreCustomer(userId)
    return NextResponse.json({ received: true, ...result })
  } catch (e) {
    console.error("revenuecat webhook", { eventId: event.id, type: event.type, message: e instanceof Error ? e.message : String(e) })
    // 500 → RevenueCat försöker igen senare.
    return NextResponse.json({ error: "Kunde inte uppdatera köpet" }, { status: 500 })
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
