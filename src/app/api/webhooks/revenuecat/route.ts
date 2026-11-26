import type { NextRequest } from "next/server"

import { handleRevenueCatWebhook } from "@/lib/payments/revenuecat-webhook"

/**
 * RevenueCat → Coavira (v82). Lägg in https://<din-domän>/api/webhooks/revenuecat
 * i RevenueCat (Integrations → Webhooks) med Authorization-värdet
 * "Bearer <REVENUECAT_WEBHOOK_SECRET>". Köp, förnyelser, uppsägningar och
 * utgångar uppdaterar både kundens köp och statistiken i adminpanelen.
 */
export function POST(request: NextRequest) {
  return handleRevenueCatWebhook(request)
}
