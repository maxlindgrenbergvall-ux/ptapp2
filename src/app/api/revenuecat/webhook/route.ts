import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { BOOST_PRODUCT } from "@/lib/payments/store-products"
import { isAppUserId, isRevenueCatEnabled, refundStoreBoost, syncStoreCustomer } from "@/lib/payments/revenuecat-server"

interface RcEvent {
  id?: string
  type?: string
  app_user_id?: string
  original_app_user_id?: string
  aliases?: string[]
  product_id?: string
  transaction_id?: string
  environment?: string
}

/**
 * RevenueCat → Coavira: köp, förnyelser, uppsägningar och återbetalningar i
 * appen. Skyddas av lösenordet i Authorization-headern
 * (REVENUECAT_WEBHOOK_SECRET). För varje händelse hämtas kundens aktuella köp
 * från RevenueCat (syncStoreCustomer) – ordningen på händelserna spelar
 * därför ingen roll och samma händelse kan komma flera gånger.
 *
 * Sandbox-köp (TestFlight och Apples granskning) räknas också.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET ?? ""
  const header = request.headers.get("authorization") ?? ""
  if (!secret || !(safeEqual(header, secret) || safeEqual(header, `Bearer ${secret}`))) {
    return NextResponse.json({ error: "Obehörig" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as { event?: RcEvent } | null
  const event = body?.event
  if (!event?.type) return NextResponse.json({ error: "Ingen händelse" }, { status: 400 })
  if (event.type === "TEST") return NextResponse.json({ received: true })
  if (!isRevenueCatEnabled()) return NextResponse.json({ error: "RevenueCat är inte konfigurerat på servern" }, { status: 503 })

  // Appen loggar in i RevenueCat med Supabase-id:t. Anonyma köp (före inloggning) ignoreras.
  const userId = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].find(isAppUserId)
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
