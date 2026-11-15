import "server-only"

import { DemoStore, SupabaseStore, type CrmStore } from "@/lib/crm/store"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Vem får använda CRM:et? (v47)
 *
 * Produktion (Supabase): bara inloggade konton som står i app_admins. Kontrollen
 * görs av databasen (is_admin(), security definer) med användarens egen session,
 * och samma session används sedan för alla frågor – RLS stoppar allt annat även
 * om en rutt skulle glömma att kontrollera.
 *
 * Demoläge (ingen Supabase): CRM:et är AVSTÄNGT om inte CRM_DEMO=1 är satt på
 * servern. Då används påhittad data i minnet. Det gör att en demo-driftsättning
 * aldrig av misstag får en öppen adminpanel som kan hämta webbsidor.
 */
export const crmDemoEnabled = () => !isSupabaseEnabled && process.env.CRM_DEMO === "1"

export interface AdminContext {
  store: CrmStore
  userId: string | null
  demo: boolean
}

export async function getAdminContext(): Promise<AdminContext | null> {
  if (!isSupabaseEnabled) return crmDemoEnabled() ? { store: new DemoStore(), userId: null, demo: true } : null
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data: admin, error } = await supabase.rpc("is_admin")
  if (error || admin !== true) return null
  return { store: new SupabaseStore(supabase, auth.user.id), userId: auth.user.id, demo: false }
}

/**
 * Datalager för serverjobb utan inloggad användare (kön, Resend-webhooken,
 * avregistreringslänken). Kör med service role – anroparen ansvarar för att
 * själv ha verifierat förfrågan (hemlighet, signatur eller avregistreringsnyckel).
 */
export function systemStore(): CrmStore | null {
  if (!isSupabaseEnabled) return crmDemoEnabled() ? new DemoStore() : null
  return hasServiceRole() ? new SupabaseStore(createSupabaseAdmin(), null) : null
}
