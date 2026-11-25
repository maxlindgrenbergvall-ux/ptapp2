"use client"

/**
 * Skalet för stegvisa flöden (PT-introt v76/v77, klienternas välkomst och intro v78):
 * tillbakaknapp, "Steg 1 av N" och en segmenterad progress bar överst, EN rubrik
 * och EN kort mening, innehållet och en tydlig primärknapp längst ner.
 *
 * Varje sida har en egen nyckel (`page`): byts den glider den gamla sidan ut och
 * den nya in från rätt håll, och innehållet tonar in i tur och ordning (Reveal).
 * Ett steg kan ha flera korta sidor; `progress` (0–1) fyller då segmentet för
 * steget gradvis.
 */
import { AnimatePresence, motion, MotionConfig } from "framer-motion"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import * as React from "react"

import { EASE, pageVariants, Reveal, useDirection } from "@/components/flow/motion"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FlowShell({
  step,
  total,
  stepLabel,
  backLabel,
  right,
  rootTestId,
  page,
  progress = 1,
  onBack,
  title,
  lead,
  children,
  primary,
  secondary,
  testId,
}: {
  step: number
  total: number
  /** "Steg 1 av 3" på användarens språk. */
  stepLabel: string
  backLabel: string
  /** Höger i sidhuvudet (logga, "Gör senare" …). */
  right?: React.ReactNode
  rootTestId?: string
  /** Unik per sida – styr sidbytet. Standard: steget. */
  page?: number
  /** Hur långt PT:n kommit inom steget (0–1). */
  progress?: number
  onBack?: () => void
  title: string
  lead: string
  children: React.ReactNode
  /** `form`: knappen skickar formuläret med det id:t (type=submit) i stället för onClick. */
  primary: { label: string; onClick?: () => void; form?: string; disabled?: boolean; busy?: boolean; testId?: string; icon?: React.ReactNode }
  secondary?: { label: string; onClick: () => void; testId?: string }
  testId?: string
}) {
  const key = page ?? step
  const dir = useDirection(key)
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative mx-auto flex min-h-svh w-full max-w-lg flex-col pt-[var(--safe-top)]" data-testid={rootTestId}>
        {/* Ett mjukt sken överst som vandrar med stegen. */}
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 mx-auto h-72 max-w-lg"
          animate={{ background: `radial-gradient(60% 70% at ${15 + ((step - 1) / Math.max(1, total - 1)) * 70}% 0%, rgba(132,204,22,0.16), transparent 70%)` }}
          transition={{ duration: 0.8, ease: EASE }}
        />

        <header className="sticky top-0 z-10 bg-background/80 px-4 pt-3 pb-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={backLabel}
              onClick={onBack}
              disabled={!onBack}
              className={cn("-ml-2 rounded-full transition-opacity", !onBack && "invisible")}
              data-testid="pt-flow-back"
            >
              <ArrowLeft />
            </Button>
            <p className="text-xs font-medium tracking-wide text-muted-foreground tabular" aria-live="polite" data-testid="pt-flow-step">
              {stepLabel}
            </p>
            {right ?? <span className="size-9" aria-hidden />}
          </div>
          <div
            className="mt-3 flex gap-1.5"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step}
            aria-label={stepLabel}
          >
            {Array.from({ length: total }, (_, i) => {
              const fill = i < step - 1 ? 1 : i === step - 1 ? Math.max(0.08, Math.min(1, progress)) : 0
              return (
                <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.span
                    className="block h-full origin-left rounded-full bg-[#84cc16]"
                    initial={false}
                    animate={{ scaleX: fill }}
                    transition={{ type: "spring", stiffness: 140, damping: 22 }}
                  />
                </span>
              )
            })}
          </div>
        </header>

        <main className="flex-1 overflow-x-clip px-5 pt-6 pb-[calc(9.5rem+var(--safe-bottom))]">
          <AnimatePresence mode="wait" custom={dir} initial onExitComplete={() => headingRef.current?.focus({ preventScroll: true })}>
            <motion.div key={key} custom={dir} variants={pageVariants} initial="enter" animate="center" exit="exit" className="space-y-6" data-testid={testId}>
              <Reveal className="space-y-1.5">
                <h1 ref={headingRef} tabIndex={-1} className="text-[1.75rem] leading-tight font-bold tracking-tight text-balance outline-none">
                  {title}
                </h1>
                <p className="text-[0.95rem] text-pretty text-muted-foreground">{lead}</p>
              </Reveal>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-lg bg-gradient-to-t from-background from-70% to-transparent px-5 pt-8 pb-[calc(0.75rem+var(--safe-bottom))]">
          <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}>
            <Button
              size="lg"
              className="h-13 w-full rounded-2xl text-base font-semibold shadow-[0_8px_30px_-8px_rgba(132,204,22,0.55)]"
              onClick={primary.onClick}
              type={primary.form ? "submit" : "button"}
              form={primary.form}
              disabled={primary.disabled || primary.busy}
              data-testid={primary.testId ?? "pt-flow-next"}
            >
              {primary.busy ? <Loader2 className="animate-spin" /> : primary.icon}
              {primary.label}
              {!primary.busy && !primary.icon && <ArrowRight />}
            </Button>
          </motion.div>
          <div className="h-10">
            {secondary && (
              <button
                type="button"
                className="block w-full py-2.5 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={secondary.onClick}
                data-testid={secondary.testId}
              >
                {secondary.label}
              </button>
            )}
          </div>
        </footer>
      </div>
    </MotionConfig>
  )
}

