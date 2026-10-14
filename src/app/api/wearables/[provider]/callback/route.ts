import { NextResponse, type NextRequest } from "next/server"

import { adapterFor, saveConnection, syncSleep } from "@/lib/wearables/service"
import { parseProvider, requireClient, STATE_COOKIE } from "@/lib/wearables/route-helpers"

/** Leverantören skickar tillbaka användaren hit med en engångskod. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const provider = parseProvider((await ctx.params).provider)
  const back = new URL("/klient/framsteg", request.url)
  const finish = (reason: string) => {
    back.searchParams.set("wearable", reason)
    const res = NextResponse.redirect(back)
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/wearables" })
    return res
  }
  if (!provider) return finish("fel")

  const auth = await requireClient()
  if ("error" in auth) return auth.error

  const { searchParams } = request.nextUrl
  const state = searchParams.get("state")
  // Skydd mot CSRF: state måste matcha cookien som sattes när flödet startade.
  if (!state || state !== request.cookies.get(STATE_COOKIE)?.value) return finish("fel")
  if (searchParams.get("error")) return finish("nekad")
  const code = searchParams.get("code")
  if (!code) return finish("fel")

  try {
    const adapter = adapterFor(provider)
    const redirectUri = new URL(`/api/wearables/${provider}/callback`, request.url).toString()
    await saveConnection(auth.userId, provider, await adapter.exchangeCode(code, redirectUri))
    await syncSleep(auth.userId, provider, 14)
  } catch (e) {
    console.error("wearable callback", e)
    return finish("fel")
  }
  return finish("ansluten")
}
