"use client"

import { DailyNutrition } from "@/components/nutrition/daily-nutrition"
import { KostTabs } from "@/components/nutrition/kost-tabs"
import { useAppData } from "@/lib/data/store"

/**
 * Kost-sidan (v42, /klient/kost): en egen sida i bottenmenyn i stället för en
 * ruta längst ned på Idag. Överst dagens kalorier och makron, sedan schemats
 * måltider (bocka av) och snabbloggningen – allt på en skärm, inga menyer.
 * Djuplänk från recepten: /klient/kost?datum=YYYY-MM-DD.
 */
export function NutritionPage() {
  const { me } = useAppData()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Kost</h1>
      <KostTabs />
      <section id="dagens-kost" className="scroll-mt-20" aria-label="Dagens kost">
        <DailyNutrition clientId={me.id} />
      </section>
    </div>
  )
}
