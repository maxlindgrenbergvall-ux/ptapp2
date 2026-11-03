import { NextResponse } from "next/server"

import { disconnectStrava } from "@/lib/activity/strava"
import { requireClient } from "@/lib/wearables/route-helpers"

/** Koppla från Strava: åtkomsten återkallas hos Strava och passen därifrån raderas. */
export async function POST() {
  const auth = await requireClient()
  if ("error" in auth) return auth.error
  await disconnectStrava(auth.userId)
  return NextResponse.json({ ok: true })
}
