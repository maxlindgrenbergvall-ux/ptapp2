import type { Metadata } from "next"

import { WellnessReviewDashboard } from "@/components/crm/wellness-review"

export const metadata: Metadata = { title: "Friskvård" }

/** /admin/friskvard (v81): granska PT:ernas portalavtal (ePassi, Benifex, Edenred). */
export default function WellnessReviewPage() {
  return <WellnessReviewDashboard />
}
