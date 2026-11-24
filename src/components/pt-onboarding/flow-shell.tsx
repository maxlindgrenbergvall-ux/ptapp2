"use client"

/**
 * Skalet för PT-introt (v76) – samma form som klientens intro: tillbakaknapp,
 * "Steg 1 av 3" och en tunn progress bar överst, EN rubrik och EN kort mening,
 * innehållet och en tydlig primärknapp längst ner. En sak i taget.
 */
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"

export function PtFlowShell({
  step,
  total = 3,
  onBack,
  title,
  lead,
  children,
  primary,
  secondary,
  testId,
}: {
  step: number
  total?: number
  onBack?: () => void
  title: string
  lead: string
  children: React.ReactNode
  primary: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; testId?: string; icon?: React.ReactNode }
  secondary?: { label: string; onClick: () => void; testId?: string }
  testId?: string
}) {
  const t = useT()
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  // Skärmläsare och tangentbord: fokus till rubriken när steget byts.
  React.useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [step])
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col pt-[var(--safe-top)]" data-testid={testId}>
      <header className="sticky top-0 z-10 space-y-3 bg-background/85 px-4 pt-3 pb-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("ptOnboarding.back")}
            onClick={onBack}
            disabled={!onBack}
            className={cn(!onBack && "invisible")}
            data-testid="pt-flow-back"
          >
            <ArrowLeft />
          </Button>
          <p className="text-xs font-medium text-muted-foreground tabular" aria-live="polite" data-testid="pt-flow-step">
            {t("ptOnboarding.stepOf", { n: step, total })}
          </p>
          <BrandMark size="sm" />
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step}
          aria-label={t("ptOnboarding.stepOf", { n: step, total })}
        >
          <div className="h-full rounded-full bg-[#84cc16] transition-[width] duration-500 ease-[var(--ease-out-soft)]" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      </header>

      <main className="flex-1 px-4 pt-5 pb-[calc(9rem+var(--safe-bottom))]">
        <div key={step} className="animate-in fade-in-0 slide-in-from-right-4 space-y-5 duration-300 motion-reduce:animate-none">
          <div className="space-y-1">
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{lead}</p>
          </div>
          {children}
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-lg space-y-1 bg-background/90 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] backdrop-blur-xl">
        <Button size="lg" className="h-12 w-full text-base" onClick={primary.onClick} disabled={primary.disabled || primary.busy} data-testid={primary.testId ?? "pt-flow-next"}>
          {primary.busy ? <Loader2 className="animate-spin" /> : primary.icon}
          {primary.label}
          {!primary.busy && !primary.icon && <ArrowRight />}
        </Button>
        {secondary && (
          <button
            type="button"
            className="block w-full py-2 text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={secondary.onClick}
            data-testid={secondary.testId}
          >
            {secondary.label}
          </button>
        )}
      </footer>
    </div>
  )
}

/** Kompakta på/av-chips (portalavtal m.m.). */
export function ToggleChip({ on, onToggle, children, testId }: { on: boolean; onToggle: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      data-testid={testId}
      className={cn(
        "min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-[background-color,border-color,color,scale] duration-150 active:scale-95",
        on ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "hover:border-[#84cc16]/60"
      )}
    >
      {children}
    </button>
  )
}
