import type { Metadata } from "next"

import { TrainerProfileEditor } from "@/components/pt/trainer-profile-editor"
import { WellnessSettings } from "@/components/pt/wellness-settings"
import { DeleteAccountCard } from "@/components/settings/delete-account"

export const metadata: Metadata = { title: "Min profil" }

export default function TrainerProfilePage() {
  return (
    <div className="space-y-6">
      <TrainerProfileEditor />
      {/* v75: friskvård – portalavtal, företagsuppgifter för kvitton och instruktioner. */}
      <WellnessSettings />
      <div className="max-w-2xl">
        <DeleteAccountCard />
      </div>
    </div>
  )
}
