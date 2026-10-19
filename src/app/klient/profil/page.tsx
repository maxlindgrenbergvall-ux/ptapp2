import type { Metadata } from "next"

import { ClientProfileSettings } from "@/components/settings/client-profile"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Profilinställningar" }

export default function Page() {
  return (
    <div className="space-y-5">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader title="Profilinställningar" description="Dina uppgifter, intressen och mål – och dina PT:er." />
      </div>
      <ClientProfileSettings />
    </div>
  )
}
