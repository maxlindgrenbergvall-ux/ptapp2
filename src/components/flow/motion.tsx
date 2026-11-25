"use client"

/**
 * Rörelser i PT-introt (v77): sidbyten som glider åt rätt håll, innehåll som
 * tonar in i tur och ordning och siffror som räknar upp. Allt stängs av när
 * enheten ber om mindre rörelse (prefers-reduced-motion).
 */
import { animate, motion, useReducedMotion, type Variants } from "framer-motion"
import * as React from "react"

export const EASE = [0.22, 1, 0.36, 1] as const

/** Sidbytet: in från höger när man går framåt, från vänster tillbaka. */
export const pageVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 48 : -48, filter: "blur(6px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.38, ease: EASE, staggerChildren: 0.06, delayChildren: 0.04 } },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -32 : 32, filter: "blur(4px)", transition: { duration: 0.2, ease: EASE } }),
}

const itemVariants: Variants = {
  enter: { opacity: 0, y: 14 },
  center: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
}

/** Ett block som tonar in i tur och ordning inuti en sida (PtFlowShell). */
export function Reveal({
  children,
  className,
  as = "div",
  ...rest
}: { children: React.ReactNode; className?: string; as?: "div" | "li" } & Record<`data-${string}`, string | undefined>) {
  const Tag = as === "li" ? motion.li : motion.div
  return (
    <Tag variants={itemVariants} className={className} {...rest}>
      {children}
    </Tag>
  )
}

/** Riktningen mellan två sidor (framåt = 1, bakåt = -1). */
export function useDirection(page: number) {
  const [last, setLast] = React.useState({ page, dir: 1 })
  if (last.page === page) return last.dir
  const dir = page > last.page ? 1 : -1
  setLast({ page, dir })
  return dir
}

/** Räknar upp till ett belopp (t.ex. "Du får 3 495 kr netto"). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = React.useState(value)
  const from = React.useRef(value)
  React.useEffect(() => {
    const controls = animate(from.current, value, {
      duration: reduce ? 0 : 0.6,
      ease: EASE,
      onUpdate: (v) => setShown(Math.round(v)),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <span className="tabular">{format(shown)}</span>
}
