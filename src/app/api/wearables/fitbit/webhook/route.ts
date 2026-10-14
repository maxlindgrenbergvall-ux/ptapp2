import { after, NextResponse, type NextRequest } from "next/server"

import { verifyFitbitSignature } from "@/lib/wearables/fitbit"
import { syncSleep, userForExternalId } from "@/lib/wearables/service"

/**
 * Fitbit Subscriptions API.
 * GET: verifiering av prenumeranten (?verify=…), se FITBIT_SUBSCRIBER_VERIFY.
 * POST: notiser om ny data. Fitbit kräver svar inom 5 s, så synken körs efter svaret.
 */
export async function GET(request: NextRequest) {
  const verify = request.nextUrl.searchParams.get("verify")
  const expected = process.env.FITBIT_SUBSCRIBER_VERIFY
  return new NextResponse(null, { status: expected && verify === expected ? 204 : 404 })
}

interface FitbitNotification {
  collectionType: string
  date: string
  ownerId: string
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  if (!(await verifyFitbitSignature(body, request.headers.get("x-fitbit-signature")))) {
    return new NextResponse(null, { status: 404 })
  }
  let notifications: FitbitNotification[] = []
  try {
    notifications = JSON.parse(body) as FitbitNotification[]
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  const owners = [...new Set(notifications.filter((n) => n.collectionType === "sleep").map((n) => n.ownerId))]
  after(async () => {
    for (const ownerId of owners) {
      const userId = await userForExternalId("fitbit", ownerId)
      if (userId) await syncSleep(userId, "fitbit", 3).catch((e) => console.error("fitbit webhook sync", e))
    }
  })
  return new NextResponse(null, { status: 204 })
}
