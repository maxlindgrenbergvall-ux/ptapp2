import type { Metadata } from "next"

import { CrmDashboard } from "@/components/crm/crm-dashboard"

export const metadata: Metadata = { title: "Leads" }

export default function LeadsPage() {
  return <CrmDashboard />
}
