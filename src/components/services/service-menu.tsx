"use client"

import { Check, CreditCard, Dumbbell, Loader2, Salad, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAppData } from "@/lib/data/store"
import { formatSek } from "@/lib/money"
import { firstName } from "@/lib/names"
import { activeServices, hasNutritionAccess, serviceSummary } from "@/lib/services/balance"
import { cn } from "@/lib/utils"
import { SERVICE_KIND_LABEL, type Trainer, type TrainerService } from "@/types/domain"

/**
 * PT:ns tjänster som klienten kan köpa. Väljer klienten pass utan kost och
 * PT:n erbjuder kostcoaching visas först en fråga om att lägga till kosten.
 */
export function ServiceMenu({
  trainer,
  only,
  onPurchased,
  className,
}: {
  trainer: Trainer
  /** Visa bara vissa tjänster (t.ex. kost i kostlåset). */
  only?: (s: TrainerService) => boolean
  onPurchased?: () => void
  className?: string
}) {
  const { data } = useAppData()
  const services = activeServices(data, trainer.id).filter((s) => !only || only(s))
  const [chosen, setChosen] = React.useState<TrainerService | null>(null)

  if (!services.length) {
    return <p className="text-sm text-muted-foreground">{firstName(trainer.name)} har inga tjänster att köpa just nu.</p>
  }

  return (
    <>
      <ul className={cn("grid gap-2 sm:grid-cols-2", className)} aria-label={`Tjänster hos ${firstName(trainer.name)}`}>
        {services.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {s.kind === "nutrition" ? <Salad className="size-4" /> : <Dumbbell className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {SERVICE_KIND_LABEL[s.kind]} · {serviceSummary(s)}
                </p>
                {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
              </div>
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold tabular">{formatSek(s.priceSek)}</span>
              <Button size="sm" onClick={() => setChosen(s)} aria-label={`Välj ${s.title}`}>
                Välj
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <CheckoutDialog trainer={trainer} service={chosen} onClose={() => setChosen(null)} onPurchased={onPurchased} />
    </>
  )
}

function CheckoutDialog({
  trainer,
  service,
  onClose,
  onPurchased,
}: {
  trainer: Trainer
  service: TrainerService | null
  onClose: () => void
  onPurchased?: () => void
}) {
  const { data, me, mode, actions } = useAppData()
  const name = firstName(trainer.name)
  const nutrition = activeServices(data, trainer.id).find((s) => s.kind === "nutrition")
  const offerNutrition = Boolean(service && nutrition && !service.includesNutrition && !hasNutritionAccess(data, trainer.id, me.id))
  const [step, setStep] = React.useState<"upsell" | "confirm">("confirm")
  const [addNutrition, setAddNutrition] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  // Nytt val → börja om (med mersälj först om det är aktuellt).
  const [current, setCurrent] = React.useState<TrainerService | null>(null)
  if (service !== current) {
    setCurrent(service)
    setStep(offerNutrition ? "upsell" : "confirm")
    setAddNutrition(false)
    setPending(false)
  }

  const lines = service ? [service, ...(addNutrition && nutrition ? [nutrition] : [])] : []
  const total = lines.reduce((sum, s) => sum + s.priceSek, 0)

  const pay = async () => {
    setPending(true)
    const error = await actions.checkout(lines.map((s) => s.id))
    if (error) {
      setPending(false)
      toast.error(error)
      return
    }
    if (mode === "demo") {
      toast.success("Betalningen är klar", {
        description: `${name} har fått dig som klient${lines.some((s) => s.includesNutrition) ? " och kostcoachingen är upplåst" : ""}.`,
      })
      onClose()
      onPurchased?.()
    }
    // Med Supabase skickas klienten vidare till Stripe.
  }

  return (
    <Dialog open={service !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        {service && step === "upsell" && nutrition ? (
          <div className="space-y-4" data-testid="nutrition-upsell">
            <DialogHeader className="items-center text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Salad className="size-6 text-primary" />
              </span>
              <DialogTitle className="text-balance">Kosten är det som syns på riktigt – vill du lägga till kostcoaching av {name}?</DialogTitle>
              <DialogDescription>
                {nutrition.title} · {serviceSummary(nutrition)}
                {nutrition.description ? <span className="mt-1 block">{nutrition.description}</span> : null}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="h-auto min-h-11 w-full py-2 whitespace-normal"
                onClick={() => {
                  setAddNutrition(true)
                  setStep("confirm")
                }}
              >
                <Sparkles /> Ja, lägg till kostcoaching · {formatSek(nutrition.priceSek)}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep("confirm")}>
                Nej tack, bara {service.title.toLowerCase()}
              </Button>
            </div>
          </div>
        ) : service ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Bekräfta köp</DialogTitle>
              <DialogDescription>Hos {trainer.name}. Du blir klient direkt när betalningen är klar.</DialogDescription>
            </DialogHeader>
            <ul className="divide-y rounded-xl border" aria-label="Varukorg">
              {lines.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium break-words">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{serviceSummary(s)}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular">{formatSek(s.priceSek)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 p-3 font-semibold">
                <span>Totalt</span>
                <span className="tabular" data-testid="checkout-total">
                  {formatSek(total)}
                </span>
              </li>
            </ul>
            {offerNutrition && nutrition && !addNutrition && (
              <button type="button" className="text-sm text-primary underline underline-offset-4" onClick={() => setAddNutrition(true)}>
                Lägg till kostcoaching ({formatSek(nutrition.priceSek)})
              </button>
            )}
            {addNutrition && (
              <p className="flex items-center gap-1.5 text-sm text-primary">
                <Check className="size-4" /> Kostcoaching ingår
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {mode === "demo"
                ? "Demoläge: betalningen simuleras och inga pengar dras."
                : "Du betalar säkert med kort via Stripe. Passen och eventuell kostcoaching låses upp direkt efter betalningen."}
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={pending}>
                Avbryt
              </Button>
              <Button onClick={() => void pay()} disabled={pending} className="sm:min-w-40">
                {pending ? <Loader2 className="animate-spin" /> : <CreditCard />} Betala {formatSek(total)}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
