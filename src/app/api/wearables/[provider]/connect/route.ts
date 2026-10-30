import { NextResponse, type NextRequest } from "next/server"

import { adapterFor, saveConnection, syncSleep, WEB_OAUTH_PROVIDERS } from "@/lib/wearables/service"
import { parseProvider, requireClient, STATE_COOKIE } from "@/lib/wearables/route-helpers"

/**
 * Startar OAuth hos leverantören. Utan API-nycklar (FITBIT_CLIENT_ID m.fl.)
 * kopplas en mock-enhet direkt i utveckling (eller med WEARABLES_MOCK=1), så att
 * flödet går att testa från början till slut. I produktion skapas aldrig falsk
 * hälsodata – då svarar vi att källan inte är aktiverad än.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const provider = parseProvider((await ctx.params).provider)
  const back = new URL("/klient/framsteg", request.url)
  if (!provider) return NextResponse.json({ error: "Okänd leverantör" }, { status: 404 })

  const auth = await requireClient()
  if ("error" in auth) return auth.error

  if (!WEB_OAUTH_PROVIDERS.includes(provider)) {
    // Apple Health / Health Connect: data finns bara på telefonen och kräver en
    // mobilapp som skickar den till /api/wearables/ingest (kommande).
    back.searchParams.set("wearable", "kraver-app")
    return NextResponse.redirect(back)
  }

  const adapter = adapterFor(provider)
  if (!adapter.configured) {
    if (process.env.NODE_ENV === "production" && process.env.WEARABLES_MOCK !== "1") {
      back.searchParams.set("wearable", "ej-aktiverad")
      return NextResponse.redirect(back)
    }
    await saveConnection(auth.userId, provider, await adapter.exchangeCode("", ""))
    await syncSleep(auth.userId, provider, 14)
    back.searchParams.set("wearable", "ansluten-demo")
    return NextResponse.redirect(back)
  }

  const state = crypto.randomUUID()
  const redirectUri = new URL(`/api/wearables/${provider}/callback`, request.url).toString()
  const res = NextResponse.redirect(adapter.authorizeUrl(state, redirectUri))
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/wearables" })
  return res
}
