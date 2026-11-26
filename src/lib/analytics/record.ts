import "server-only"

import type { AnalyticsRecords } from "@/lib/analytics/revenue"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { isSupabaseEnabled } from "@/lib/supabase/config"

/**
 * Sparar statistikraderna från en webhook (service role). Idempotent i
 * databasen – samma händelse kan komma flera gånger. Kastar vid fel så att
 * webhooken svarar 500 och leverantören försöker igen.
 */
export async function saveAnalyticsRecords(records: AnalyticsRecords): Promise<void> {
  if (!isSupabaseEnabled || !hasServiceRole()) return
  if (!records.revenue && !records.subscription && !records.refund) return
  const admin = createSupabaseAdmin()
  const calls = [
    records.revenue && admin.rpc("record_revenue_event", { p: records.revenue }),
    records.subscription && admin.rpc("record_subscription_event", { p: records.subscription }),
    records.refund && admin.rpc("mark_revenue_refunded", { p_provider: records.refund.provider, p_external_id: records.refund.external_id }),
  ].filter(Boolean)
  const results = await Promise.all(calls)
  const failed = results.find((r) => r && r.error)
  if (failed?.error) throw new Error(failed.error.message)
}
