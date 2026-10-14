"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

let client: SupabaseClient | null = null

/** En klient per flik; sessionen ligger i cookies så att proxy.ts kan läsa den. */
export function getSupabase(): SupabaseClient {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
  return client
}
