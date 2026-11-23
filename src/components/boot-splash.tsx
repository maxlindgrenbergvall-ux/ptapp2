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
 *
 * v71: tre lägen.
 *  - "app": medan appens data hämtas (klient- och PT-appen).
 *  - "start": i mobilappen över inloggningen vid appstart, medan appens kod
 *    förladdas. En gång per appstart (html.app-started).
 * Snurren följer klockan (Date.now), inte sidan, så den fortsätter i samma vinkel
 * om sidan byts medan den snurrar.
 * v72: direkt efter inloggningen visas ingen laddningsskärm – datan är redan
 * hämtad och appen tonas in (html.app-enter).
 */
import * as React from "react"

import { BrandGlyph } from "@/components/brand"
import { prefersReducedMotion } from "@/lib/use-in-view"

/** Samma färger som native-startbilden (iOS/Android splash). */
export const SPLASH_BG = "#0b0f0d"
const SPLASH_LIME = "#aced37"
/** Ett varv på 1,1 s. */
const SPIN_DEG_PER_S = 360 / 1.1

const SPIN_MS = 1100
/** Vinkeln just nu enligt klockan – samma i alla laddningsskärmar, över sidbyten. */
const clockAngle = () => ((Date.now() % SPIN_MS) / SPIN_MS) * 360

export type BootSplashMode = "app" | "start"

export function BootSplash({ ready, mode = "app" }: { ready: boolean; mode?: BootSplashMode }) {
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
    // Startskärmen bara i mobilappen och en gång per appstart (klasserna sätts i <head>).
    const html = document.documentElement
    // Annars är den redan dold med CSS (display: none) och behöver inte röras.
    if (mode === "start" && (!html.classList.contains("native-app") || html.classList.contains("app-started"))) return
    // Ta över från CSS-animationen: den följer också klockan, så vinkeln är densamma.
    let angle = clockAngle()
    logo.style.animation = "none"
    const draw = (deg: number) => {
      logo.style.transform = `rotate(${deg.toFixed(2)}deg)`
      el.dataset.angle = String(Math.round(deg))
    }
    draw(angle)

    let frame = 0
    let timer = 0
    // v72: man har just loggat in (html.app-enter) – skärmen är dold och appen tonas in i stället.
    const entering = mode === "app" && html.classList.contains("app-enter")
    const enteredAt = performance.now()
    const endEnter = () => window.setTimeout(() => html.classList.remove("app-enter"), 1200)
    let settling: { from: number; distance: number; start: number; duration: number } | null = null
    const finish = () => {
      el.dataset.done = "true"
      if (mode === "start") {
        html.classList.add("app-started")
        try {
          window.sessionStorage.setItem("coavira:started", "1")
        } catch {}
      }
      timer = window.setTimeout(() => setGone(true), 480)
    }
    const tick = (now: number) => {
      if (entering && html.classList.contains("app-enter")) {
        if (readyRef.current) {
          // Datan fanns redan: ingen laddningsskärm alls. Klassen tas bort när ingången har spelats.
          el.dataset.ready = "true"
          timer = endEnter()
          setGone(true)
          return
        }
        // Överlämningen gick inte att använda: visa laddningsskärmen som vanligt i stället för en tom sida.
        if (now - enteredAt > 500) html.classList.remove("app-enter")
        frame = requestAnimationFrame(tick)
        return
      }
      if (readyRef.current && !settling) {
        // Appen är klar: släpp igenom tryck direkt, medan loggan landar.
        el.style.pointerEvents = "none"
        el.dataset.ready = "true"
        if (reduce) {
          if (mode === "start") html.classList.add("app-started")
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
        angle = clockAngle()
        draw(angle)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      if (!entering) window.clearTimeout(timer)
    }
  }, [mode])

  if (gone) return null
  return (
    <div
      ref={root}
      role="status"
      aria-live="polite"
      aria-label="Laddar Coavira"
      data-testid="boot-splash"
      data-mode={mode}
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
          /* Fasen följer klockan (sätts i <head>), så snurren fortsätter över sidbyten. */
          animation-delay: var(--boot-spin-delay, 0ms);
          will-change: transform;
        }
        .boot-splash-glyph { display: block; width: 100%; height: 100%; transition: transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes boot-splash-spin { to { transform: rotate(360deg); } }
        .boot-splash { transition: opacity 380ms cubic-bezier(0.22, 1, 0.36, 1) 80ms; }
        .boot-splash[data-done] { opacity: 0; }
        /* v72: just inloggad – appen tonas in i stället (html.app-enter i globals.css). */
        html.app-enter .boot-splash[data-mode="app"] { display: none; }
        /* Startskärmen: bara i mobilappen, en gång per appstart. */
        html:not(.native-app) .boot-splash[data-mode="start"], html.app-started .boot-splash[data-mode="start"] { display: none; }
        .boot-splash[data-done] .boot-splash-glyph { transform: scale(1.08); }
        @media (prefers-reduced-motion: reduce) {
          .boot-splash-spin { animation: none; }
          .boot-splash, .boot-splash-glyph { transition: none; }
        }
      `}</style>
    </div>
  )
}
