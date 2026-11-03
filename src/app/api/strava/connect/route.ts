import { NextResponse, type NextRequest } from "next/server"

import { stravaAuthorizeUrl, stravaConfigured } from "@/lib/activity/strava"
import { safeNext } from "@/lib/auth-redirect"
import { requireClient } from "@/lib/wearables/route-helpers"

const STRAVA_STATE_COOKIE = "coavira_strava_state"

/**
 * Startar Strava-kopplingen (OAuth). ?tillbaka=/klient styr vart användaren
 * kommer efteråt. state sparas i en httpOnly-cookie (CSRF-skydd) och
 * kontrolleras i /api/strava/callback.
 */
export async function GET(request: NextRequest) {
  const back = safeNext(request.nextUrl.searchParams.get("tillbaka") ?? "/klient/anslutningar")
  const auth = await requireClient()
  if ("error" in auth) return auth.error
  if (!stravaConfigured()) {
    const url = new URL(back, request.url)
    url.searchParams.set("strava", "ej-aktiverad")
    return NextResponse.redirect(url)
  }
  const state = crypto.randomUUID()
  const redirectUri = new URL("/api/strava/callback", request.url).toString()
  const res = NextResponse.redirect(stravaAuthorizeUrl(state, redirectUri))
  res.cookies.set(STRAVA_STATE_COOKIE, `${state}|${back}`, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/strava" })
  return res
}
