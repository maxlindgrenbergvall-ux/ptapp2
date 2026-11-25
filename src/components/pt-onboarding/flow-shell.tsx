"use client"

/**
 * Skalet för PT-introt (v76, förfinat i v77) – det gemensamma flödesskalet
 * (FlowShell) med "Steg X av 3" och Coaviras logga.
 */
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { FlowShell } from "@/components/flow/flow-shell"
import { useT } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"

type ShellProps = Omit<React.ComponentProps<typeof FlowShell>, "total" | "stepLabel" | "backLabel" | "right"> & { total?: number }

export function PtFlowShell({ total = 3, ...props }: ShellProps) {
  const t = useT()
  return (
    <FlowShell
      {...props}
      total={total}
      stepLabel={t("ptOnboarding.stepOf", { n: props.step, total })}
      backLabel={t("ptOnboarding.back")}
      right={<BrandMark size="sm" />}
    />
  )
}

/** Kompakta på/av-chips (prisval m.m.). */
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
