import "server-only"

import { createClient } from "@supabase/supabase-js"

import { SUPABASE_URL } from "@/lib/supabase/config"

/**
 * Supabase med service role – kringgår RLS. Används BARA på servern för det
 * användare inte själva får göra (spara wearable-tokens, synka från webhooks).
 * Nyckeln får aldrig ha prefixet NEXT_PUBLIC_.
 */
export function createSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY saknas")
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const hasServiceRole = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
