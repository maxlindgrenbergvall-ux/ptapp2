"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { SettingsHeader } from "@/components/settings/settings-page"
import { SplitBuilder } from "@/components/workouts/split-builder"
import { ActiveSplitOverview } from "@/components/workouts/next-workout"
import { useAppData } from "@/lib/data/store"

/**
 * Träningsschema (v43): har klienten ett aktivt schema visas det (passen i
 * ordning, vilket som står på tur, dagar per vecka) – annars splitbiblioteket.
 */
export default function SchedulePage() {
  const { data, me } = useAppData()
  const active = data.activeSplits.some((s) => s.clientId === me.id)
  const router = useRouter()
  const [changing, setChanging] = React.useState(false)
  return (
    <div className="space-y-5">
      <SettingsHeader
        title="Träningsschema"
        description="Välj en split – PPL, Upper/Lower, 4-split, Bro split, Full Body eller en egen – och hur många dagar i veckan du vill träna. Nästa pass på startsidan startar passet som står på tur."
      />
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
