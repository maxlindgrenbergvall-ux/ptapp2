import type { Metadata } from "next"

import { GoalSettings } from "@/components/goals/goal-settings"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Mål" }

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Mål" description="Dina mål, mått och kostplan. Kalorimålet och grafen uppdateras medan du ändrar." />
      <GoalSettings />
    </div>
  )
}
