import type { Metadata } from "next"

import { PlusPage } from "@/components/plus/referral-dashboard"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Coavira Plus" }

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Coavira Plus" description="Dina pass, din kost och chatten är alltid gratis. Plus ger dig mer." />
      <PlusPage />
    </div>
  )
}
