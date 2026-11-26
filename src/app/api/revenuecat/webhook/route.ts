import type { NextRequest } from "next/server"

import { handleRevenueCatWebhook } from "@/lib/payments/revenuecat-webhook"

/** RevenueCat → Coavira (äldre adress; samma som /api/webhooks/revenuecat). */
export function POST(request: NextRequest) {
  return handleRevenueCatWebhook(request)
}
