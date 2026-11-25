"use client"

/**
 * Aktiveringschecklistan (v81): två steg innan PT:n syns i Hitta PT och kan
 * bjuda in egna klienter – Stripe Connect och minst ett coachingpaket. Gröna
 * bockar när de är klara; spärren släpper av sig själv.
 */
import { motion } from "framer-motion"
import { Check, Loader2, Lock } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"
import { openCheckout } from "@/lib/native/checkout"
import { type Activation, useActivation } from "@/lib/pt-activation"
import { demoConnectPayouts } from "@/lib/pt-onboarding-flow"
import { cn } from "@/lib/utils"

export function ActivationChecklist({ activation, className, compact = false }: { activation: Activation; className?: string; compact?: boolean }) {
  const { mode } = useAppData()
  const [busy, setBusy] = React.useState(false)

  const connect = async () => {
    if (mode === "demo") {
      demoConnectPayouts()
      activation.refresh()
      toast.success("Demoläge: Stripe är kopplat (inget riktigt konto).")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { url?: string; done?: boolean; error?: string }
      if (body.done) return activation.refresh()
      if (!body.url) return void toast.error(body.error ?? "Stripe svarar inte just nu – försök igen.")
      if ((await openCheckout(body.url)) === "closed") activation.refresh()
    } catch {
      toast.error("Stripe svarar inte just nu – försök igen.")
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    {
      key: "stripe",
      done: activation.stripe,
      label: "Koppla Stripe Connect för utbetalningar",
      action: (
        <Button size="sm" className="h-9 rounded-full px-4" onClick={() => void connect()} disabled={busy} data-testid="activation-connect">
          {busy ? <Loader2 className="animate-spin" /> : null} Koppla
        </Button>
      ),
    },
    {
      key: "package",
      done: activation.packages > 0,
      label: "Skapa minst ett coachingpaket",
      action: (
        <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4" data-testid="activation-create-package">
          <Link href="/pt/profil#tjanster">Skapa</Link>
        </Button>
      ),
    },
  ]
  const done = steps.filter((s) => s.done).length

  return (
    <section
      className={cn("rounded-2xl border border-[#84cc16]/30 bg-[#84cc16]/6", compact ? "p-3" : "p-4", className)}
      data-testid="activation-checklist"
      aria-label="Aktivera ditt konto"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Lock className="size-3.5 text-[#84cc16]" aria-hidden /> Aktivera ditt konto
          </h2>
          <p className="text-xs text-muted-foreground">Sedan syns du i Hitta PT och kan bjuda in klienter.</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground tabular">{done}/2</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex min-h-11 items-center gap-3 rounded-xl bg-background/60 px-3 py-2" data-testid={`activation-${s.key}`} data-done={s.done}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                s.done ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "border-muted-foreground/40"
              )}
              aria-hidden
            >
              {s.done && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
                  <Check className="size-3.5" strokeWidth={3} />
                </motion.span>
              )}
            </span>
            <span className={cn("min-w-0 flex-1 text-sm", s.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
              {s.label}
              <span className="sr-only">{s.done ? " – klart" : " – inte klart"}</span>
            </span>
            {!s.done && s.action}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Checklistan överst i PT-vyn tills kontot är aktiverat. */
export function ActivationGate() {
  const activation = useActivation()
  if (!activation.ready || activation.activated) return null
  return <ActivationChecklist activation={activation} className="mb-2" />
}
