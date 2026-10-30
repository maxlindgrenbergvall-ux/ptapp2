import { NextResponse } from "next/server"

import { rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { syncSleep } from "@/lib/wearables/service"
import { requireClient } from "@/lib/wearables/route-helpers"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { WearableProvider } from "@/types/domain"

/** "Synka nu": hämtar senaste veckans sömn från alla anslutna enheter. */
export async function POST() {
  const auth = await requireClient()
  if ("error" in auth) return auth.error
  if (await rateLimited(`wearables-sync:${auth.userId}`, 10, 600)) return tooManyRequests(600)

  // Användarens egna anslutningar läses med användarens session (RLS).
  const sb = await createSupabaseServerClient()
  const { data: conns } = await sb.from("wearable_connections").select("provider").neq("status", "revoked")
  const results: { provider: WearableProvider; nights: number; error?: string }[] = []
  for (const { provider } of (conns ?? []) as { provider: WearableProvider }[]) {
    try {
      results.push({ provider, nights: (await syncSleep(auth.userId, provider, 7)).length })
    } catch (e) {
      results.push({ provider, nights: 0, error: e instanceof Error ? e.message : "Synk misslyckades" })
    }
  }
  return NextResponse.json({ results })
}
