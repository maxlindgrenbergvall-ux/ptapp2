"use client"

/**
 * Fjädern (v67) – samma känsla som vattenglaset och reklamfilmen: damping 20,
 * stiffness 140, mass 0.8. Simuleringen körs i requestAnimationFrame och skriver
 * direkt i DOM:en via `apply` (ingen React-rendering per bildruta). Den kan
 * avbrytas mitt i en rörelse (nytt mål tar över farten), stannar när den står
 * still och hoppar direkt till målet med "minska rörelse".
 */
import * as React from "react"

import { prefersReducedMotion } from "@/lib/use-in-view"

export const SPRING = { stiffness: 140, damping: 20, mass: 0.8 }

export interface Spring {
  /** Glid mot ett nytt mål. */
  to: (target: number) => void
  /** En knuff (fart i enheter/s) – t.ex. en bricka som studsar till och lägger sig. */
  kick: (velocity: number) => void
  stop: () => void
}

export function createSpring(initial: number, apply: (x: number) => void, config = SPRING): Spring {
  let x = initial
  let v = 0
  let target = initial
  let frame = 0
  let last = 0
  const tick = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000)
    last = now
    const force = -config.stiffness * (x - target) - config.damping * v
    v += (force / config.mass) * dt
    x += v * dt
    const scale = Math.max(1, Math.abs(target))
    if (Math.abs(x - target) < 5e-4 * scale && Math.abs(v) < 5e-3 * scale) {
      x = target
      v = 0
      frame = 0
      apply(x)
      return
    }
    apply(x)
    frame = requestAnimationFrame(tick)
  }
  const run = () => {
    if (prefersReducedMotion()) {
      cancelAnimationFrame(frame)
      frame = 0
      x = target
      v = 0
      apply(x)
      return
    }
    if (frame) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }
  return {
    to(next) {
      target = next
      if (x === next && v === 0) return
      run()
    },
    kick(velocity) {
      if (prefersReducedMotion()) return
      v += velocity
      run()
    },
    stop() {
      cancelAnimationFrame(frame)
      frame = 0
    },
  }
}

/**
 * Följer `target` med fjädern. `apply` får det aktuella värdet varje bildruta.
 * Startvärdet ska React rita själv (t.ex. i `style`), så att serverns HTML
 * stämmer – därefter rör bara fjädern attributet.
 */
export function useSpring(target: number, apply: (x: number) => void): Spring {
  const applyRef = React.useRef(apply)
  const springRef = React.useRef<Spring | null>(null)
  const [initial] = React.useState(target)
  React.useEffect(() => {
    applyRef.current = apply
  })
  React.useEffect(() => {
    const spring = createSpring(initial, (x) => applyRef.current(x))
    springRef.current = spring
    return () => {
      spring.stop()
      springRef.current = null
    }
  }, [initial])
  React.useEffect(() => {
    springRef.current?.to(target)
  }, [target])
  // Stabil fasad: anropas bara från effekter och händelser, aldrig under renderingen.
  return React.useMemo<Spring>(
    () => ({
      to: (t) => springRef.current?.to(t),
      kick: (v) => springRef.current?.kick(v),
      stop: () => springRef.current?.stop(),
    }),
    []
  )
}
