"use client"

/**
 * PT:ns klientvy → Betalning (v75): hur klienten kom till PT:n och om klienten
 * betalar i appen eller via PT:ns eget friskvårdsavtal (ePassi m.fl.).
 *
 *   Egen klient (PT:ns inbjudningslänk): kan bli extern friskvårdskund direkt – 0 % avgift.
 *   Hittade PT:n i Coavira: första köpet görs i appen, därefter går det att byta.
 * Databasen avgör (set_client_payment_source); appen förklarar regeln.
 */
import { HeartPulse, Loader2, UserPlus, Users } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

export function ClientPaymentSource({ clientId, className }: { clientId: ID; className?: string }) {
  const { data, me, actions } = useAppData()
  const [busy, setBusy] = React.useState(false)
  const rel = data.relationships.find((r) => r.clientId === clientId && r.trainerId === me.id)
  if (!rel) return null
  const own = rel.acquisition === "EXISTING_CLIENT"
  const external = rel.paymentSource === "external_wellness"
  const paid = data.purchases.some((p) => p.clientId === clientId && p.trainerId === me.id && p.status === "paid")
  const canExternal = own || paid

  const toggle = async () => {
    setBusy(true)
    const error = await actions.setClientPaymentSource(clientId, external ? "coavira" : "external_wellness")
    setBusy(false)
    if (error) return toast.error(error)
    toast.success(external ? "Klienten betalar i appen igen" : "Klienten betalar via ditt friskvårdsavtal", {
      description: external ? undefined : "Inga avgifter till Coavira. Du kan schemalägga pass och kostschema utan köp i appen.",
    })
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center", className)} data-testid="client-payment-source">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {own ? <UserPlus className="size-4 text-muted-foreground" /> : <Users className="size-4 text-muted-foreground" />}
          {own ? "Din egen klient (via din inbjudningslänk)" : "Hittade dig i Coavira"}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="payment-source-status">
          {external ? (
            <>
              <HeartPulse className="mr-1 inline size-3.5 text-[#84cc16]" />
              Betalar via ditt friskvårdsavtal (ePassi m.fl.) – 0 % avgift till Coavira.
            </>
          ) : canExternal ? (
            "Betalar i appen. Klienten kan i stället betala via ditt eget friskvårdsavtal – utan avgift till Coavira."
          ) : (
            "Första köpet görs i appen (Stripe). Därefter kan klienten betala via ditt eget friskvårdsavtal."
          )}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={busy || (!external && !canExternal)} onClick={toggle} data-testid="toggle-external-wellness" className="shrink-0">
        {busy && <Loader2 className="animate-spin" />}
        {external ? "Betalar i appen" : "Extern friskvårdskund"}
      </Button>
    </div>
  )
}
