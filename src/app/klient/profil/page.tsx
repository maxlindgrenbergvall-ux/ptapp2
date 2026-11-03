import type { Metadata } from "next"

import { ClientProfileSettings } from "@/components/settings/client-profile"
import { DeleteAccountCard } from "@/components/settings/delete-account"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Profilinställningar" }

/** v37: profilen samlar uppgifter, mål, träningsinställningar och PT:er (Mål-länken ligger i Mina mål). */
export default function Page() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader title="Profil" description="Dina uppgifter, mål, träningsinställningar och PT:er." />
      </div>
      <ClientProfileSettings />
      <div className="mx-auto max-w-2xl">
        <DeleteAccountCard />
      </div>
    </div>
  )
}
