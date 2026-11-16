"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { SettingsHeader } from "@/components/settings/settings-page"
import { SplitBuilder } from "@/components/workouts/split-builder"
import { ActiveSplitOverview } from "@/components/workouts/next-workout"
import { useAppData } from "@/lib/data/store"
import { useT } from "@/lib/i18n/provider"

/**
 * Träningsschema (v43): har klienten ett aktivt schema visas det (passen i
 * ordning, vilket som står på tur, dagar per vecka) – annars splitbiblioteket.
 */
export default function SchedulePage() {
  const { data, me } = useAppData()
  const active = data.activeSplits.some((s) => s.clientId === me.id)
  const router = useRouter()
  const [changing, setChanging] = React.useState(false)
  const t = useT()
  return (
    <div className="space-y-5">
      {/* v58: "Upplägg / Tips" på användarens språk – löpning, Hyrox och hybrid lyfts fram efter intressena. */}
      <SettingsHeader title={t("plans.title")} description={t("plans.lead")} />
      {active && !changing ? (
        <ActiveSplitOverview onChange={() => setChanging(true)} />
      ) : (
        // Efter sparandet: till startsidan, där Nästa pass startar första passet.
        <SplitBuilder
          mode="client"
          onDone={() => {
            setChanging(false)
            router.push("/klient")
          }}
        />
      )}
    </div>
  )
}
