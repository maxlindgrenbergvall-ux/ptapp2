"use client"

import * as React from "react"

import { SettingsHeader } from "@/components/settings/settings-page"
import { SplitBuilder } from "@/components/workouts/split-builder"
import { useT } from "@/lib/i18n/provider"

/**
 * PT:ns passbyggare (v59): exakt samma byggare som klientens "Upplägg / Tips"
 * (<SplitBuilder>). Det enda PT-specifika är valet längst ned i byggaren:
 * tilldela till en eller flera aktiva klienter, eller spara som PT-mall.
 * Efter tilldelning/sparning börjar byggaren om på uppläggen.
 */
export function PtWorkoutBuilder() {
  const t = useT()
  const [round, setRound] = React.useState(0)
  return (
    <div className="mx-auto max-w-2xl space-y-5" data-testid="pt-workout-builder">
      <SettingsHeader title={t("builder.title")} description={t("builder.lead")} />
      <SplitBuilder key={round} mode="trainer" onDone={() => setRound((r) => r + 1)} />
    </div>
  )
}
