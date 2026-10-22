import type { Metadata } from "next"

import { ReferralDashboard } from "@/components/plus/referral-dashboard"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Bjud in & tjäna" }

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Bjud in & tjäna" description="Bjud in en PT – få en veckas PT Boost när hen verifierats." />
      <ReferralDashboard />
    </div>
  )
}
