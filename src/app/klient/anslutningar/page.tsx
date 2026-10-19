import type { Metadata } from "next"

import { ConnectionsPage } from "@/components/settings/connections"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Anslutningar" }

export default function Page() {
  return (
    <div className="space-y-5">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader title="Anslutningar" description="Klockor, hälsoappar och kalendrar som är kopplade till ditt konto." />
      </div>
      <ConnectionsPage />
    </div>
  )
}
