"use client"

/**
 * Profil → Betalningar & kvitton (v75): klientens betalningar i appen, nyast
 * först, med friskvårdskvitto (PDF) för varje betalning.
 */
import { Receipt } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReceiptButton } from "@/components/wellness/receipt-button"
import { useAppData } from "@/lib/data/store"
import { formatSek } from "@/lib/money"
import { paidCheckouts } from "@/lib/wellness/api"

export function PaymentsReceiptsCard() {
  const { data, me } = useAppData()
  const rows = paidCheckouts(data, { clientId: me.id })
  return (
    <Card className="gap-3 scroll-mt-20" id="betalningar" data-testid="payments-receipts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4 text-muted-foreground" /> Betalningar & kvitton
        </CardTitle>
        <CardDescription>Friskvårdskvitto (PDF) för varje köp – skicka det till din arbetsgivare eller friskvårdsportal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Inga betalningar än.</p>}
        {rows.map((r) => {
          const trainer = data.trainers.find((t) => t.id === r.trainerId)
          return (
            <div key={r.checkoutId} className="space-y-2 rounded-xl border p-3" data-testid="payment-row">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.titles.join(", ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {trainer?.name ?? "PT"} · {new Date(r.paidAt).toLocaleDateString("sv-SE")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular">{formatSek(r.subtotalSek)}</p>
                  {r.wellness && <Badge className="mt-0.5 bg-[#84cc16] text-[#131916] hover:bg-[#84cc16]">Friskvård</Badge>}
                </div>
              </div>
              <ReceiptButton checkoutId={r.checkoutId} size="sm" className="w-full" />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
