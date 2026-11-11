"use client"

import * as React from "react"

import { Check } from "lucide-react"

import { prefersReducedMotion, useInView } from "@/lib/use-in-view"
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

/**
 * Ett tal som räknar mjukt till sitt nya värde (v46) – t.ex. dagens kalorier när
 * en måltid loggas eller litrarna när ett glas vatten läggs till.
 *
 * Prestanda: räknaren skriver direkt i textnoden via requestAnimationFrame och
 * orsakar inga React-renderingar. Serverns HTML och första renderingen visar det
 * riktiga värdet. Talet är ingen live-region, så skärmläsare läser inte upp
 * mellanvärdena. Med "minska rörelse" byts talet direkt.
 */
export function AnimatedNumber({
  value,
  format = (n: number) => Math.round(n).toLocaleString("sv-SE"),
  duration = 600,
  className,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const shown = React.useRef(value)
  const formatRef = React.useRef(format)
  React.useEffect(() => {
    formatRef.current = format
  })
  React.useEffect(() => {
    const el = ref.current
    const from = shown.current
    if (!el || from === value) return
    if (prefersReducedMotion()) {
      shown.current = value
      el.textContent = formatRef.current(value)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // Kubisk inbromsning: snabbt i början, mjuk landning på slutvärdet.
      const eased = 1 - (1 - t) ** 3
      shown.current = from + (value - from) * eased
      el.textContent = formatRef.current(t === 1 ? value : shown.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  )
}

/**
 * Bock som "ritas" från vänster till höger när `play` ändras (v46). Rörelsen är
 * två motriktade transform-animationer (.check-draw i globals.css) – ingen
 * SVG-linje som räknas om. `play` = 0 visar bocken stilla (t.ex. vid sidladdning).
 */
export function DrawnCheck({ play, className, strokeWidth = 3 }: { play: number; className?: string; strokeWidth?: number }) {
  return (
    <span key={play} className={play > 0 ? "check-draw" : "inline-flex"}>
      <Check className={className} strokeWidth={strokeWidth} />
    </span>
  )
}

/**
 * En stapel som fylls med transform (GPU) i stället för width. Värdet 0–100.
 * Växer fram när den syns och följer sedan värdet mjukt.
 */
export function FillBar({ value, className, barClassName, ...rest }: { value: number; className?: string; barClassName?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const [ref, shown] = useGrowOnView<HTMLSpanElement>(Math.max(0, Math.min(100, value)))
  // span (inte div): stapeln används även inne i länkar och knappar.
  return (
    <span ref={ref} data-fill={Math.round(shown)} className={cn("block h-2 overflow-hidden rounded-full bg-muted", className)} {...rest}>
      <span
        className={cn("block h-full w-full rounded-full bg-primary transition-transform duration-700 ease-[var(--ease-out-soft)] will-change-transform motion-reduce:transition-none", barClassName)}
        style={{ transform: `translate3d(-${100 - shown}%, 0, 0)` }}
      />
    </span>
  )
}
