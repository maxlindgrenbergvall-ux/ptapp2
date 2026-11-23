"use client"

/**
 * Laddningsskärmen (v70) – visas från första bildrutan tills appens data är redo.
 *
 * Mörk bakgrund och lime-loggan på exakt samma plats och i samma storlek som
 * native-startbilden (iOS/Android), så att övergången från appens startbild är
 * sömlös. En vit ring fylls runt loggan:
 *   1. Innan JavaScript har laddats driver en CSS-animation ringen (från
 *      serverns HTML), så att något händer redan medan appen hämtas.
 *   2. När React är igång tar requestAnimationFrame över från samma punkt och
 *      kryper mot ~85 % medan datan hämtas.
 *   3. När datan är redo fylls ringen hela vägen runt, loggan pulserar till och
 *      skärmen tonas bort. Appen under är då redan renderad och klickbar.
 * Med "minska rörelse": ingen ring-animation, skärmen försvinner direkt.
 */
import * as React from "react"

import { BrandGlyph } from "@/components/brand"
import { prefersReducedMotion } from "@/lib/use-in-view"

/** Samma färger som native-startbilden (mobile/ios/android splash). */
export const SPLASH_BG = "#0b0f0d"
const SPLASH_LIME = "#aced37"

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function BootSplash({ ready }: { ready: boolean }) {
  const root = React.useRef<HTMLDivElement>(null)
  const ring = React.useRef<SVGCircleElement>(null)
  const [gone, setGone] = React.useState(false)
  const readyRef = React.useRef(ready)
  React.useEffect(() => {
    readyRef.current = ready
  }, [ready])

  React.useEffect(() => {
    const el = root.current
    const circle = ring.current
    if (!el || !circle) return
    const reduce = prefersReducedMotion()
    // Ta över från CSS-animationen där den är just nu.
    const fromCss = Number.parseFloat(getComputedStyle(circle).strokeDashoffset)
    let p = Number.isFinite(fromCss) ? Math.max(0, Math.min(1, 1 - fromCss)) : 0
    circle.style.animation = "none"
    const draw = () => circle.style.setProperty("stroke-dashoffset", (1 - p).toFixed(4))
    draw()

    let frame = 0
    let timer = 0
    let finishing: { from: number; start: number; duration: number } | null = null
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      if (!finishing && readyRef.current) {
        if (reduce) {
          setGone(true)
          return
        }
        finishing = { from: p, start: now, duration: 280 + 420 * (1 - p) }
        // Appen är klar: släpp igenom tryck direkt, medan ringen fylls klart.
        el.style.pointerEvents = "none"
        el.dataset.ready = "true"
      }
      if (finishing) {
        const t = Math.min(1, (now - finishing.start) / finishing.duration)
        p = finishing.from + (1 - finishing.from) * easeOutCubic(t)
        if (!reduce) draw()
        if (t >= 1) {
          el.dataset.done = "true"
          timer = window.setTimeout(() => setGone(true), 520)
          return
        }
      } else if (!reduce) {
        // Kryper mot 85 % – snabbt i början, långsammare ju längre det tar.
        p += (0.85 - p) * (1 - Math.exp(-dt / 1100))
        draw()
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [])

  if (gone) return null
  return (
    <div
      ref={root}
      role="status"
      aria-live="polite"
      aria-label="Laddar Coavira"
      data-testid="boot-splash"
      className="boot-splash fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: SPLASH_BG }}
    >
      <div className="boot-splash-mark relative flex items-center justify-center">
        <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full -rotate-90">
          <circle cx="50" cy="50" r="47" fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={2.2} />
          <circle
            ref={ring}
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="white"
            strokeWidth={2.2}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            className="boot-splash-ring"
            data-testid="boot-splash-ring"
          />
        </svg>
        <BrandGlyph className="boot-splash-glyph" />
      </div>
      <style>{`
        /* Loggan (synlig bredd 11,2 % av skärmens längsta sida) – samma som native-startbilden (aspect fill). Taket gäller stora skärmar. */
        .boot-splash-mark { width: min(19vmax, 273px); height: min(19vmax, 273px); color: ${SPLASH_LIME}; }
        .boot-splash-glyph { width: min(16.7vmax, 240px); height: min(16.7vmax, 240px); transform: translateX(-2.5%); transition: transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        .boot-splash-ring { stroke-dashoffset: 1; animation: boot-splash-fill 6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes boot-splash-fill { to { stroke-dashoffset: 0.25; } }
        .boot-splash { transition: opacity 360ms cubic-bezier(0.22, 1, 0.36, 1) 120ms; }
        .boot-splash[data-done] { opacity: 0; }
        .boot-splash[data-done] .boot-splash-glyph { transform: translateX(-2.5%) scale(1.08); }
        @media (prefers-reduced-motion: reduce) {
          .boot-splash-ring { animation: none; stroke-dashoffset: 0.25; }
          .boot-splash, .boot-splash-glyph { transition: none; }
        }
      `}</style>
    </div>
  )
}
