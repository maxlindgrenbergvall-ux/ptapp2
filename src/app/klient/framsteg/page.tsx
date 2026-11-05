"use client"

import { ProgressOverview } from "@/components/progress/progress-overview"
import { useAppData } from "@/lib/data/store"

/**
 * Framsteg (v40): bara de två korten (Viktnedgång / Tappat fett och Ökad
 * muskelmassa) och en stor viktkurva under – synkad med kaloriförbränning och
 * träning (Apple Hälsa, Health Connect, Strava, passen i appen).
 *
 * Det som flyttats härifrån:
 *   - Logga vikt      → knappen i grafens rubrik.
 *   - Övningshistorik → "Historik" vid övningen i passet (/klient/framsteg/ovning/[id]).
 *   - Genomförda pass → kalendern/schemat.
 *   - Min data        → Profil.
 */
export default function ProgressPage() {
  const { me } = useAppData()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Framsteg</h1>
      <ProgressOverview clientId={me.id} />
    </div>
  )
}
