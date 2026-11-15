import { NextResponse } from "next/server"

import { systemStore } from "@/lib/crm/auth"
import { unsubscribe } from "@/lib/crm/queue"
import { clientIp, rateLimited, tooManyRequests } from "@/lib/rate-limit"

/**
 * POST /api/crm/unsubscribe?token=…  (v47)
 *
 * Avregistrering med ett klick (RFC 8058, rubriken List-Unsubscribe-Post) –
 * mejlklienten (Gmail, Apple Mail …) anropar den här adressen när mottagaren
 * trycker "Avregistrera". Samma åtgärd som knappen på /avregistrera/[token].
 * Nyckeln är slumpmässig (uuid) och säger inget om vem den hör till; svaret är
 * detsamma oavsett om nyckeln fanns, så att ingen kan pröva sig fram.
 */
export async function POST(request: Request) {
  if (await rateLimited(`crm-unsub:${clientIp(request)}`, 30, 600)) return tooManyRequests(600)
  const token = new URL(request.url).searchParams.get("token") ?? ""
  const store = systemStore()
  if (store) await unsubscribe(store, token).catch(() => false)
  return NextResponse.json({ ok: true })
}
