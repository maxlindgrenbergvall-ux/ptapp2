import type { Metadata } from "next"

import { PrivacySettings } from "@/components/settings/privacy"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Min data och sekretess" }

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Min data och sekretess" description="Vem som ser din data, och hur du laddar ner eller raderar den." />
      <PrivacySettings />
    </div>
  )
}
