"use client"

/**
 * Laddningsskärmen (v70) – visas från första bildrutan tills appens data är redo.
 *
 * Mörk bakgrund och lime-loggan på exakt samma plats och i samma storlek som
 * native-startbilden (iOS/Android), så att övergången från appens startbild är
 * sömlös. Själva C:et snurrar medan appen laddar:
 *   1. Innan JavaScript har laddats snurrar loggan med en CSS-animation (från
 *      serverns HTML), så att något händer redan medan appen hämtas.
 *   2. När React är igång tar requestAnimationFrame över från samma vinkel och
 *      i samma fart – inget hopp.
 *   3. När datan är redo bromsar loggan in mjukt – från samma fart till stilla –
 *      och landar rakt, och skärmen tonas bort så att appen fadear in. Appen
 *      under är då redan renderad och klickbar.
 * Med "minska rörelse": loggan står still och skärmen försvinner direkt.
 */
import * as React from "react"

import { BrandGlyph } from "@/components/brand"
import { prefersReducedMotion } from "@/lib/use-in-view"

/** Samma färger som native-startbilden (iOS/Android splash). */
export const SPLASH_BG = "#0b0f0d"
const SPLASH_LIME = "#aced37"
/** Ett varv på 1,1 s. */
const SPIN_DEG_PER_S = 360 / 1.1

/** Vinkeln (0–360) ur en beräknad transform, t.ex. "matrix(a, b, c, d, e, f)". */
function angleOf(transform: string): number {
  const m = transform.match(/matrix\(([^)]+)\)/)
  if (!m) return 0
  const [a, b] = m[1].split(",").map(Number)
  const deg = (Math.atan2(b, a) * 180) / Math.PI
  return (deg + 360) % 360
}

export function BootSplash({ ready }: { ready: boolean }) {
  const root = React.useRef<HTMLDivElement>(null)
  const spinner = React.useRef<HTMLDivElement>(null)
  const [gone, setGone] = React.useState(false)
  const readyRef = React.useRef(ready)
  React.useEffect(() => {
    readyRef.current = ready
  }, [ready])

  React.useEffect(() => {
    const el = root.current
    const logo = spinner.current
    if (!el || !logo) return
    const reduce = prefersReducedMotion()
    // Ta över från CSS-animationen där den är just nu.
    let angle = angleOf(getComputedStyle(logo).transform)
    logo.style.animation = "none"
    const draw = (deg: number) => {
      logo.style.transform = `rotate(${deg.toFixed(2)}deg)`
      el.dataset.angle = String(Math.round(deg))
    }
    draw(angle)

    let frame = 0
    let timer = 0
    let settling: { from: number; distance: number; start: number; duration: number } | null = null
    let last = performance.now()
    const finish = () => {
      el.dataset.done = "true"
      timer = window.setTimeout(() => setGone(true), 480)
    }
    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000
      last = now
      if (readyRef.current && !settling) {
        // Appen är klar: släpp igenom tryck direkt, medan loggan landar.
        el.style.pointerEvents = "none"
        el.dataset.ready = "true"
        if (reduce) {
          setGone(true)
          return
        }
        // Landa på nästa hela varv, minst ett tredjedels varv bort.
        const distance = Math.ceil((angle + 120) / 360) * 360 - angle
        const duration = Math.min(1.1, Math.max(0.6, (2 * distance) / SPIN_DEG_PER_S))
        settling = { from: angle, distance, start: now, duration }
      }
      if (settling) {
        // Hermite-kurva: startar i snurrens fart och slutar stilla, utan ryck.
        const t = Math.min(1, (now - settling.start) / 1000 / settling.duration)
        const v0 = (SPIN_DEG_PER_S * settling.duration) / settling.distance
        const x = v0 * (t ** 3 - 2 * t ** 2 + t) + (-2 * t ** 3 + 3 * t ** 2)
        angle = settling.from + settling.distance * x
        draw(t >= 1 ? Math.round(angle) : angle)
        if (t >= 1) return finish()
        frame = requestAnimationFrame(tick)
        return
      }
      if (!reduce) {
        angle += SPIN_DEG_PER_S * dt
        draw(angle)
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
      <div ref={spinner} className="boot-splash-spin" data-testid="boot-splash-logo">
        <BrandGlyph className="boot-splash-glyph" />
      </div>
      <style>{`
        /* Loggan (synlig bredd 11,2 % av skärmens längsta sida) – samma som native-startbilden (aspect fill). Taket gäller stora skärmar. */
        .boot-splash-spin {
          width: min(16.7vmax, 240px); height: min(16.7vmax, 240px); color: ${SPLASH_LIME};
          /* C:ets mittpunkt (12,1 / 24) – loggan snurrar runt sig själv, inte runt rutan. */
          transform-origin: 50.4% 50%;
          /* Den synliga loggan (C + punkt) centreras, som i native-startbilden. */
          translate: -2.5% 0;
          animation: boot-splash-spin 1.1s linear infinite;
          will-change: transform;
        }
        .boot-splash-glyph { display: block; width: 100%; height: 100%; transition: transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes boot-splash-spin { to { transform: rotate(360deg); } }
        .boot-splash { transition: opacity 380ms cubic-bezier(0.22, 1, 0.36, 1) 80ms; }
        .boot-splash[data-done] { opacity: 0; }
        .boot-splash[data-done] .boot-splash-glyph { transform: scale(1.08); }
        @media (prefers-reduced-motion: reduce) {
          .boot-splash-spin { animation: none; }
          .boot-splash, .boot-splash-glyph { transition: none; }
        }
      `}</style>
    </div>
  )
}
