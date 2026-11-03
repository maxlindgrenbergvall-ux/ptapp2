"use client"

import { useRouter } from "next/navigation"

import { SettingsHeader } from "@/components/settings/settings-page"
import { SplitBuilder } from "@/components/workouts/split-builder"

export default function SchedulePage() {
  const router = useRouter()
  return (
    <div className="space-y-5">
      <SettingsHeader title="Träningsschema" description="Välj en split – PPL, Upper/Lower, 4-split, Bro split eller Full Body – anpassa dagarna och lägg ut passen i kalendern." />
      <SplitBuilder mode="client" onDone={() => router.push("/klient/kalender")} />
    </div>
  )
}
