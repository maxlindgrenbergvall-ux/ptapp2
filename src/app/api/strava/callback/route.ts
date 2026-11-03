import { NextResponse, type NextRequest } from "next/server"

import { exchangeStravaCode, saveStravaConnection, syncStrava } from "@/lib/activity/strava"
import { safeNext } from "@/lib/auth-redirect"
import { requireClient } from "@/lib/wearables/route-helpers"

const STATE_COOKIE = "coavira_strava_state"

/**
 * Strava skickar tillbaka användaren hit med en engångskod. Koden byts mot
 * tokens på servern (client secret lämnar aldrig servern), anslutningen sparas
 * och de senaste 30 dagarnas aktiviteter hämtas direkt.
 */
export async function GET(request: NextRequest) {
  const [expected, backRaw] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split("|")
  const back = safeNext(backRaw || "/klient/anslutningar")
  const finish = (reason: string) => {
    const url = new URL(back, request.url)
    url.searchParams.set("strava", reason)
    const res = NextResponse.redirect(url)
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/strava" })
    return res
  }
  const auth = await requireClient()
  if ("error" in auth) return auth.error

  const params = request.nextUrl.searchParams
  // CSRF: state måste matcha cookien från /api/strava/connect.
  if (!expected || params.get("state") !== expected) return finish("fel")
  if (params.get("error")) return finish("nekad")
  const code = params.get("code")
  if (!code) return finish("fel")
  // Användaren kan bocka ur "visa aktiviteter" hos Strava – då finns inget att hämta.
  const scope = (params.get("scope") ?? "").split(",").filter(Boolean)
  if (!scope.some((s) => s.startsWith("activity:read"))) return finish("behorighet")

  try {
    await saveStravaConnection(auth.userId, await exchangeStravaCode(code, scope))
  } catch (e) {
    console.error("strava callback", { message: (e as Error).message })
    return finish("fel")
  }
  // Första synken: ett fel här stoppar inte kopplingen (synkas igen senare).
  await syncStrava(auth.userId).catch((e) => console.error("strava first sync", { message: (e as Error).message }))
  return finish("ansluten")
}
