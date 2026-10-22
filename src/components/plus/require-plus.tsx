"use client"

/**
 * Coavira Plus i gränssnittet.
 *
 *   <RequirePlus feature="sleep">
 *     <SleepTracker date={today} />
 *   </RequirePlus>
 *
 * Med Plus visas innehållet som vanligt. Utan Plus visas en suddig förhandsvisning
 * (inte klickbar, dold för skärmläsare) med ett lås; ett klick öppnar
 * uppgraderingsrutan på frostat glas. Gratis för alla: dagens kostschema, boka
 * pass, utföra pass och chatt – de omsluts aldrig. PT:er påverkas inte.
 */
import { Gift, Loader2, Lock, Sparkles } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAppData } from "@/lib/data/store"
import { isPlusActive, PLUS_FEATURE_LABEL, type PlusFeature } from "@/lib/plus"
import { cn } from "@/lib/utils"

export const UPGRADE_TEXT = "Lås upp full historik, sömntracking och djupgående grafer med Coavira Plus."

/** Har inloggad användare Coavira Plus? PT:er har aldrig låsta klientfunktioner. */
export function usePlus() {
  const { data, me } = useAppData()
  const account = data.accounts[me.id]
  return { account, isPlus: me.role === "trainer" || isPlusActive(account) }
}

export function RequirePlus({
  feature,
  children,
  className,
  title,
}: {
  feature: PlusFeature
  children: React.ReactNode
  className?: string
  /** Rubrik på låset (standard: funktionens namn). */
  title?: string
}) {
  const { isPlus } = usePlus()
  const [open, setOpen] = React.useState(false)
  if (isPlus) return <>{children}</>
  const label = title ?? PLUS_FEATURE_LABEL[feature]
  return (
    <div className={cn("relative isolate overflow-hidden rounded-2xl", className)} data-testid="plus-lock" data-feature={feature}>
      {/* Förhandsvisning: suddig, inte klickbar och dold för skärmläsare. */}
      <div aria-hidden inert className="pointer-events-none max-h-80 overflow-hidden opacity-60 blur-[3px] select-none">
        {children}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 p-4 text-center backdrop-blur-md transition-colors outline-none hover:bg-background/30 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${label} – lås upp med Coavira Plus`}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30">
          <Lock className="size-5" aria-hidden />
        </span>
        <span className="font-semibold">{label}</span>
        <PlusBadge />
        <span className="text-xs text-muted-foreground">Tryck för att låsa upp</span>
      </button>
      <UpgradeDialog open={open} onOpenChange={setOpen} feature={feature} />
    </div>
  )
}

export function PlusBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn("gap-1 border-transparent bg-brand text-brand-foreground", className)}>
      <Sparkles className="size-3" aria-hidden /> Coavira Plus
    </Badge>
  )
}

/** Uppgraderingsrutan: frostat glas, texten och två vägar – bjud in en vän eller skaffa Plus. */
export function UpgradeDialog({ open, onOpenChange, feature }: { open: boolean; onOpenChange: (open: boolean) => void; feature?: PlusFeature }) {
  const { mode, actions } = useAppData()
  const [pending, setPending] = React.useState(false)

  const buy = async () => {
    setPending(true)
    const error = await actions.buyPlus()
    setPending(false)
    if (error) {
      toast.error(error)
      return
    }
    if (mode === "demo") {
      toast.success("Coavira Plus är aktiverat", { description: "Demoläge: 30 dagar utan betalning." })
      onOpenChange(false)
    }
    // Med Supabase skickas klienten vidare till Stripe.
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-background/30 backdrop-blur-md"
        className="overflow-hidden border-white/20 bg-background/75 shadow-2xl backdrop-blur-md sm:max-w-md"
        data-testid="upgrade-dialog"
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_35%,transparent),transparent)]" />
        <DialogHeader className="relative items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-lg shadow-brand/30">
            <Sparkles className="size-7" aria-hidden />
          </span>
          <DialogTitle className="text-xl">Coavira Plus</DialogTitle>
          <DialogDescription className="text-base text-pretty text-foreground/80">{UPGRADE_TEXT}</DialogDescription>
          {feature && <p className="text-xs text-muted-foreground">Du försökte öppna: {PLUS_FEATURE_LABEL[feature]}</p>}
        </DialogHeader>
        <ul className="relative grid grid-cols-2 gap-2 text-sm">
          {(Object.keys(PLUS_FEATURE_LABEL) as PlusFeature[]).map((f) => (
            <li key={f} className={cn("rounded-xl border bg-background/60 px-3 py-2", f === feature && "border-brand ring-1 ring-brand")}>
              {PLUS_FEATURE_LABEL[f]}
            </li>
          ))}
        </ul>
        <div className="relative flex flex-col gap-2">
          <Button asChild size="lg" className="h-auto min-h-11 py-2 whitespace-normal" onClick={() => onOpenChange(false)}>
            <Link href="/klient/inbjudningar">
              <Gift /> Bjud in en vän &amp; få 1 månad gratis
            </Link>
          </Button>
          <Button size="lg" variant="outline" onClick={() => void buy()} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Skaffa Coavira Plus
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Dagens kostschema, bokning, dina pass och chatten är alltid gratis. Plus förnyas inte automatiskt.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
