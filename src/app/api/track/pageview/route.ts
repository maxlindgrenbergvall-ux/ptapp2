import { NextResponse, type NextRequest } from "next/server"

import { isBot, referrerHost, stockholmDate, trackBody, visitorHash } from "@/lib/analytics/tracking"
import { clientIp } from "@/lib/rate-limit"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { isSupabaseEnabled } from "@/lib/supabase/config"

/**
 * Cookie-fri besöksstatistik för landningssidan (v82): sidvisningar och klick
 * på "Skapa konto" / "Hitta PT". Skickas med navigator.sendBeacon. Ingen IP
 * eller cookie sparas – bara en hash som byts varje dygn (TRACKING_SALT på
 * servern gör den omöjlig att räkna baklänges). Svarar alltid 204.
 */
export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 })
  const ua = request.headers.get("user-agent") ?? ""
  if (isBot(ua) || request.headers.get("sec-gpc") === "1") return done
  const text = await request.text().catch(() => "")
  if (text.length > 4000) return done
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {}
  const parsed = trackBody.safeParse(json)
  if (!parsed.success || !isSupabaseEnabled || !hasServiceRole()) return done
  const b = parsed.data
  const hash = await visitorHash(stockholmDate(), clientIp(request), ua, process.env.TRACKING_SALT ?? "")
  const { error } = await createSupabaseAdmin().from("landing_page_views").insert({
    visitor_hash: hash,
    event: b.event,
    path: b.path,
    referrer: referrerHost(b.referrer, request.headers.get("host")),
    utm_source: b.utm_source ?? null,
    utm_medium: b.utm_medium ?? null,
    utm_campaign: b.utm_campaign ?? null,
  })
  if (error) console.error("track pageview", error.message)
  return done
}
