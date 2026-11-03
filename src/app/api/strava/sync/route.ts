import { NextResponse } from "next/server"

import { StravaAuthError, syncStrava } from "@/lib/activity/strava"
import { rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { requireClient } from "@/lib/wearables/route-helpers"

/** "Synka nu": senaste 30 dagarnas Strava-aktiviteter. Max 6 synkar per 15 min (Stravas gränser). */
export async function POST() {
  const auth = await requireClient()
  if ("error" in auth) return auth.error
  if (await rateLimited(`strava-sync:${auth.userId}`, 6, 900)) return tooManyRequests(900)
  try {
    return NextResponse.json(await syncStrava(auth.userId))
  } catch (e) {
    if (e instanceof StravaAuthError) return NextResponse.json({ error: "Strava-kopplingen har gått ut. Koppla Strava igen." }, { status: 409 })
    return NextResponse.json({ error: e instanceof Error ? e.message : "Synk misslyckades" }, { status: 502 })
  }
}
