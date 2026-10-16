import "server-only"

import { NextResponse } from "next/server"

import { hasServiceRole } from "@/lib/supabase/admin"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { WearableProvider } from "@/types/domain"

const PROVIDERS: WearableProvider[] = ["fitbit", "apple_health", "google_fit"]

export function parseProvider(value: string): WearableProvider | null {
  return (PROVIDERS as string[]).includes(value) ? (value as WearableProvider) : null
}

/** Inloggad klient, eller ett färdigt felsvar. */
export async function requireClient(): Promise<{ userId: string } | { error: NextResponse }> {
  if (!isSupabaseEnabled || !hasServiceRole()) {
    return { error: NextResponse.json({ error: "Wearables kräver Supabase och SUPABASE_SERVICE_ROLE_KEY på servern." }, { status: 501 }) }
  }
  const sb = await createSupabaseServerClient()
  const { data } = await sb.auth.getUser()
  if (!data.user) return { error: NextResponse.json({ error: "Inte inloggad" }, { status: 401 }) }
  if (data.user.user_metadata?.role === "trainer") {
    return { error: NextResponse.json({ error: "Bara klienter kan koppla wearables" }, { status: 403 }) }
  }
  return { userId: data.user.id }
}

export const STATE_COOKIE = "coavira_wearable_state"
