import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { BRAND } from "@/lib/brand"
import { buildIcs, icsTitle, type IcsEvent } from "@/lib/calendar/ics"
import { isSupabaseEnabled, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"
import { firstName } from "@/lib/names"

interface FeedRow {
  id: string
  title: string
  start_time: string
  end_time: string
  status: IcsEvent["status"]
  kind: "session" | "block"
  mode: "onsite" | "remote"
  location: string | null
  counterpart: string | null
  owner_name: string
  owner_role: "trainer" | "client"
  updated_at: string
}

/**
 * Prenumerationslänk för Google Calendar, Outlook och Apple Kalender:
 * GET /api/calendar/feed/{token}.ics → text/calendar.
 *
 * Ingen inloggning (kalenderappar kan inte logga in) – den hemliga token är
 * nyckeln. Datan hämtas med den publika nyckeln via databasfunktionen
 * calendar_feed(), som bara lämnar ut tid, rubrik och plats.
 */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token.replace(/\.ics$/i, "").toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse("Ogiltig länk", { status: 404 })
  if (!isSupabaseEnabled) return new NextResponse("Kalendersynk kräver Supabase", { status: 503 })

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.rpc("calendar_feed", { p_token: token })
  if (error) return new NextResponse("Kalendern kunde inte hämtas just nu", { status: 502 })
  const rows = (data ?? []) as FeedRow[]
  // Okänd eller utbytt länk: tom kalender i stället för fel, så att kalenderappen tömmer den.
  const owner = rows[0]

  const events: IcsEvent[] = rows.map((r) => ({
    id: r.id,
    title: icsTitle({ kind: r.kind, title: r.title, status: r.status, counterpart: r.counterpart, role: r.owner_role }),
    start: new Date(r.start_time),
    end: new Date(r.end_time),
    status: r.status,
    location: r.kind === "block" ? undefined : r.mode === "remote" ? "Distans (videosamtal i Coavira)" : r.location ?? undefined,
    description: r.kind === "block" ? undefined : `Öppna ${BRAND.name} för detaljer, chatt och ombokning.`,
    updated: new Date(r.updated_at),
  }))

  const host = new URL(request.url).host
  const ics = buildIcs(events, { name: owner ? `${BRAND.name} – ${firstName(owner.owner_name)}` : BRAND.name, host })
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="coavira.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  })
}
