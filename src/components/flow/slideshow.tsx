"use client"

/**
 * Bildspelet i introna (v79): kort med en animerad bild, en rubrik och en
 * mening. Korten byter själva var 3,5:e sekund (som en slideshow) och börjar om
 * efter det sista. Sveper eller trycker man pausar bildspelet en stund och
 * fortsätter sedan. Punkten för kortet som visas fylls medan det visas.
 *
 * Inget automatiskt byte när enheten ber om mindre rörelse eller när fliken
 * inte syns.
 */
import { motion, MotionConfig, useReducedMotion } from "framer-motion"
import * as React from "react"

import { EASE } from "@/components/flow/motion"
import { cn } from "@/lib/utils"

export type Slide = {
  id: string
  title: string
  text: string
  /** Den animerade bilden; `active` när kortet visas. */
  visual: (active: boolean) => React.ReactNode
}

/** Paus efter att användaren svept eller tryckt. */
const HOLD_MS = 8000

export function Slideshow({
  slides,
  interval = 3500,
  ariaLabel,
  slideLabel,
  titleAs: Title = "h1",
  visualClassName = "h-56",
  titleClassName = "text-[2rem] leading-[1.1]",
  textClassName = "text-[1.05rem]",
  className,
  onIndexChange,
  testIdPrefix = "pt-intro",
}: {
  slides: Slide[]
  interval?: number
  ariaLabel: string
  /** "Kort 1 av 3" för skärmläsare. */
  slideLabel: (n: number, total: number) => string
  titleAs?: "h1" | "h2"
  visualClassName?: string
  titleClassName?: string
  textClassName?: string
  className?: string
  onIndexChange?: (i: number) => void
  /** Testid-prefix: `${prefix}-slide` och `${prefix}-dot`. */
  testIdPrefix?: string
}) {
  const track = React.useRef<HTMLDivElement>(null)
  const ignoreScrollUntil = React.useRef(0)
  const [index, setIndex] = React.useState(0)
  const [holdUntil, setHoldUntil] = React.useState(0)
  const [visible, setVisible] = React.useState(true)
  const reduce = useReducedMotion()
  const auto = !reduce && visible && slides.length > 1
  const held = holdUntil > 0

  const select = React.useCallback(
    (i: number) => {
      setIndex(i)
      onIndexChange?.(i)
    },
    [onIndexChange]
  )

  const go = React.useCallback(
    (i: number) => {
      const el = track.current
      if (!el) return
      const next = ((i % slides.length) + slides.length) % slides.length
      ignoreScrollUntil.current = Date.now() + 800
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" })
      select(next)
    },
    [reduce, select, slides.length]
  )

  // Användaren tog över: pausa en stund.
  const hold = () => setHoldUntil(Date.now() + HOLD_MS)

  React.useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  // Nästa kort efter `interval` (eller när pausen är slut).
  React.useEffect(() => {
    if (!auto) return
    const wait = held ? Math.max(interval, holdUntil - Date.now()) : interval
    const id = window.setTimeout(() => {
      setHoldUntil(0)
      go(index + 1)
    }, wait)
    return () => window.clearTimeout(id)
  }, [auto, held, holdUntil, index, interval, go])

  const onScroll = () => {
    if (Date.now() < ignoreScrollUntil.current) return
    const el = track.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) select(i)
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("flex flex-col", className)}>
        <div
          ref={track}
          onScroll={onScroll}
          onPointerDown={hold}
          onWheel={hold}
          className="-mx-5 flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-roledescription="karusell"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
            hold()
            go(index + (e.key === "ArrowRight" ? 1 : -1))
          }}
        >
          {slides.map((s, i) => {
            const active = i === index
            return (
              <section
                key={s.id}
                className="flex w-full shrink-0 snap-center flex-col justify-center gap-6 px-7"
                aria-roledescription="kort"
                aria-label={slideLabel(i + 1, slides.length)}
                aria-hidden={!active || undefined}
                data-testid={`${testIdPrefix}-slide`}
              >
                <div className={cn("flex items-center justify-center", visualClassName)} aria-hidden>
                  {s.visual(active)}
                </div>
                <motion.div
                  className="space-y-2.5"
                  initial={false}
                  animate={active ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 10 }}
                  transition={{ duration: 0.5, ease: EASE, delay: active ? 0.1 : 0 }}
                >
                  <Title className={cn("font-bold tracking-tight text-balance", titleClassName)}>{s.title}</Title>
                  <p className={cn("leading-relaxed text-pretty text-muted-foreground", textClassName)}>{s.text}</p>
                </motion.div>
              </section>
            )
          })}
        </div>

        <div className="flex justify-center gap-2 py-5" role="group" aria-label="Välj kort">
          {slides.map((s, i) => {
            const active = i === index
            return (
              <button
                key={s.id}
                type="button"
                aria-label={slideLabel(i + 1, slides.length)}
                aria-current={active || undefined}
                onClick={() => {
                  hold()
                  go(i)
                }}
                className={cn(
                  "relative h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-500 ease-[var(--ease-out-soft)]",
                  active ? "w-8 bg-[#84cc16]/30" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                data-testid={`${testIdPrefix}-dot`}
              >
                {active && (
                  <motion.span
                    // Ny nyckel per kort och paus: fyllningen börjar om.
                    key={`${i}-${holdUntil}-${auto}`}
                    className="absolute inset-0 origin-left rounded-full bg-[#84cc16]"
                    initial={{ scaleX: auto && !held ? 0 : 1 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: auto && !held ? interval / 1000 : 0, ease: "linear" }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </MotionConfig>
  )
}
