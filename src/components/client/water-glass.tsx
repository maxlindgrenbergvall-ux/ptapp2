"use client"

/**
 * Vattenglaset (v66) – samma som i reklamfilmen. Nivån följer dagens mängd med
 * en fjäder (damping 20, stiffness 140, mass 0.8) och ytan skvalpar till vid
 * varje + eller − och lägger sig sedan. Allt ritas direkt i SVG:n med
 * requestAnimationFrame (ingen React-rendering per bildruta), och loopen stannar
 * när glaset står still – inget batteri i onödan. Minska rörelse: nivån sätts
 * direkt, utan svall.
 */
import * as React from "react"

const W = 64
const H = 88
const SPRING = { stiffness: 140, damping: 20, mass: 0.8 }
const GLASS_PATH = `M 6 4 L ${W - 6} 4 L ${W - 11} ${H - 4} Q ${W - 12} ${H} ${W - 16} ${H} L 16 ${H} Q 12 ${H} 11 ${H - 4} Z`
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** Stilla yta: en svag, orörlig våg så att vattnet ser ut som vatten. */
const REST_AMP = 0.7

function surface(level: number, amp: number, phase: number): string {
  const top = H - 6 - (H - 14) * level
  let d = `M 0 ${top.toFixed(2)}`
  for (let x = 0; x <= W; x += 4) {
    const y = top + Math.sin(x / 9 + phase) * amp + Math.sin(x / 5.5 - phase * 1.3) * amp * 0.35
    d += ` L ${x} ${y.toFixed(2)}`
  }
  return `${d} L ${W} ${H} L 0 ${H} Z`
}

export function WaterGlass({ level, className }: { level: number; className?: string }) {
  const target = Math.max(0, Math.min(1, level))
  const id = React.useId().replace(/:/g, "")
  const waterRef = React.useRef<SVGPathElement>(null)
  const sim = React.useRef({ x: target, v: 0, amp: REST_AMP, phase: 0, frame: 0, last: 0 })
  // Startytan ritas en gång av React; därefter sköter animationen attributet själv.
  const [initialD] = React.useState(() => surface(target, REST_AMP, 0))

  React.useEffect(() => {
    const s = sim.current
    const el = waterRef.current
    if (!el) return
    const delta = Math.abs(target - s.x)
    if (prefersReducedMotion()) {
      s.x = target
      s.v = 0
      s.amp = REST_AMP
      el.setAttribute("d", surface(s.x, s.amp, s.phase))
      return
    }
    if (delta < 1e-4) return
    // Ett tryck får vattnet att skvalpa – mer ju större ändringen är.
    s.amp = Math.min(6, Math.max(s.amp, REST_AMP) + 2.2 + delta * 14)
    cancelAnimationFrame(s.frame)
    s.last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - s.last) / 1000)
      s.last = now
      const force = -SPRING.stiffness * (s.x - target) - SPRING.damping * s.v
      s.v += (force / SPRING.mass) * dt
      s.x += s.v * dt
      s.phase += dt * 7.5
      s.amp = REST_AMP + (s.amp - REST_AMP) * Math.exp(-dt / 0.42)
      el.setAttribute("d", surface(Math.max(0, Math.min(1.02, s.x)), s.amp, s.phase))
      const settled = Math.abs(s.x - target) < 5e-4 && Math.abs(s.v) < 5e-4 && s.amp - REST_AMP < 0.05
      if (settled) {
        s.x = target
        s.v = 0
        s.amp = REST_AMP
        el.setAttribute("d", surface(s.x, s.amp, s.phase))
        return
      }
      s.frame = requestAnimationFrame(tick)
    }
    s.frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(s.frame)
  }, [target])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden data-testid="water-glass" data-level={target.toFixed(3)}>
      <defs>
        <clipPath id={`glass-${id}`}>
          <path d={GLASS_PATH} />
        </clipPath>
        <linearGradient id={`water-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--water)", stopOpacity: 0.75 }} />
          <stop offset="1" style={{ stopColor: "var(--water)", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#glass-${id})`}>
        <rect width={W} height={H} style={{ fill: "var(--water)", opacity: 0.07 }} />
        <path ref={waterRef} d={initialD} fill={`url(#water-${id})`} />
      </g>
      <path d={GLASS_PATH} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} />
      {/* Glasets reflex. */}
      <line x1={10} y1={10} x2={13} y2={H - 14} stroke="white" strokeOpacity={0.18} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}
