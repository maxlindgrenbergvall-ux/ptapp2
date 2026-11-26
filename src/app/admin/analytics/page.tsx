import type { Metadata } from "next"

import { AnalyticsDashboard } from "@/components/crm/analytics-dashboard"

export const metadata: Metadata = { title: "Statistik" }

/** /admin/analytics (v82): ekonomi, moms, KPI:er, besök och aktivitet. */
export default function AnalyticsPage() {
  return <AnalyticsDashboard />
}
