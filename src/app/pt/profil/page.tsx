import type { Metadata } from "next"

import { TrainerProfileEditor } from "@/components/pt/trainer-profile-editor"
import { DeleteAccountCard } from "@/components/settings/delete-account"

export const metadata: Metadata = { title: "Min profil" }

export default function TrainerProfilePage() {
  return (
    <div className="space-y-6">
      <TrainerProfileEditor />
      <div className="max-w-2xl">
        <DeleteAccountCard />
      </div>
    </div>
  )
}
