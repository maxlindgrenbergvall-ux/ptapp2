"use client"

import * as React from "react"

import { useInView } from "@/lib/use-in-view"
import { cn } from "@/lib/utils"

/**
 * Renderar innehållet (t.ex. ett Recharts-diagram) först när det syns, så att
 * diagrammets egen animation körs när användaren tittar – även på mobilen.
 * Platsen reserveras med `minHeight` så att sidan inte hoppar.
 */
export function RevealOnView({ children, minHeight, className }: { children: React.ReactNode; minHeight: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} data-revealed={inView} style={{ minHeight }} className={cn(inView && "animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none", className)}>
      {inView ? children : null}
    </div>
  )
}

/** Värdet att visa: 0 tills elementet syns, sedan det riktiga (så att stapeln växer fram). */
export function useGrowOnView<T extends Element>(value: number) {
  const [ref, inView] = useInView<T>()
  return [ref, inView ? value : 0] as const
}
