import { NextResponse } from "next/server"

import { ResendError, resendConfigured, syncMarketingContact, type MarketingRole } from "@/lib/marketing/resend"
import { rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * POST /api/marketing/sync (v35) – anropas av appen direkt efter att användaren
 * godkänt avtalet (onboarding) eller ändrat nyhetsbrevet i Inställningar.
 *
 * Servern läser själv rollen och samtycket ur databasen (my_onboarding_status,
 * med användarens egen session) och e-posten ur inloggningen – inget i
 * förfrågan avgör vem som hamnar i vilket segment:
 *   klient + samtycke → Resend-segmentet "Klient - Nyhetsbrev"
 *   PT     + samtycke → Resend-segmentet "PT - Nyhetsbrev"
 *   inget samtycke    → avregistrerad och borttagen ur segmentet
 */
export async function POST() {
  if (!isSupabaseEnabled) return NextResponse.json({ skipped: "demo" }, { status: 202 })
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user?.email) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 })
  if (!resendConfigured()) return NextResponse.json({ skipped: "resend_not_configured" }, { status: 202 })
  if (await rateLimited(`marketing-sync:${user.id}`, 10, 600)) return tooManyRequests(600)

  const { data: status, error } = await supabase.rpc("my_onboarding_status")
  if (error || !status) return NextResponse.json({ error: "Kunde inte läsa samtycket" }, { status: 500 })
  const s = status as { role: string | null; marketing_consent?: boolean; first_name?: string | null; last_name?: string | null }
  if (s.role !== "client" && s.role !== "trainer") return NextResponse.json({ error: "Kontotypen är inte vald" }, { status: 409 })

  try {
    const result = await syncMarketingContact({
      email: user.email,
      firstName: s.first_name,
      lastName: s.last_name,
      role: s.role as MarketingRole,
      consent: Boolean(s.marketing_consent),
    })
    return NextResponse.json(result)
  } catch (e) {
    // Samtycket ligger kvar i databasen; scripts/sync-resend-segments.mjs kan köras om.
    console.error("marketing sync", { userId: user.id, message: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: "Resend svarade inte – försök igen senare" }, { status: e instanceof ResendError && e.status < 500 ? 400 : 502 })
  }
}
