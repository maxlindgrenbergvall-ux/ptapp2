import type { Metadata } from "next"

import { ModerationDashboard } from "@/components/crm/moderation-dashboard"

export const metadata: Metadata = { title: "Moderering" }

/** /admin/moderering (v65): rapporter från chatten, varningar och avstängningar. */
export default function ModerationPage() {
  return <ModerationDashboard />
}
