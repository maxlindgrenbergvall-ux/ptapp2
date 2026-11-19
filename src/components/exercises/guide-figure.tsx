/**
 * Guide-atleten (v60): samma modell för alla övningar – en atletisk silhuett
 * i en mörk studio (#131916) med limegröna (#84cc16) detaljer. Animeras med
 * genererade CSS-keyframes (bara transform), pausas när guiden stängs och
 * står still i startläget för den som valt "minska rörelse".
 */
import * as React from "react"

import { fitMotion, FLOOR as FLOOR_Y, frames, keyframesCss, type Motion, type Part, SEG, type SceneItem, transformFor } from "@/lib/exercise-guides/figure"
import { MOTIONS, type MotionId } from "@/lib/exercise-guides/motions"

const SKIN = "#e8ede6"
const FAR = "#8a948c"
const LIME = "#84cc16"
const STEEL = "#3a453f"

export function GuideFigure({ motion, hand, playing = true, className, title }: { motion: MotionId; hand?: Motion["hand"]; playing?: boolean; className?: string; title?: string }) {
  // Övningens eget redskap (v61) – annars rörelsens.
  const base = MOTIONS[motion] as Motion
  const m = React.useMemo(() => (hand ? { ...base, hand } : base), [base, hand])
  const prefix = `cg-${motion}`
  const first = frames(m)[0]
  const fit = React.useMemo(() => fitMotion(m), [m])
  const css = React.useMemo(() => keyframesCss(prefix, m), [prefix, m])
  const part = (p: Part): React.CSSProperties => ({
    transform: transformFor(p, first.pose, first.root),
    animation: `${prefix}-${p} ${m.duration}s linear infinite`,
    animationPlayState: playing ? "running" : "paused",
  })
  const limb = (len: number, w: number, color: string) => <line x1={0} y1={0} x2={0} y2={len} stroke={color} strokeWidth={w} strokeLinecap="round" />
  const leg = (far: boolean) => (
    <g style={part(far ? "hipb" : "hip")}>
      {limb(SEG.thigh, 12, far ? FAR : SKIN)}
      <g transform={`translate(0 ${SEG.thigh})`}>
        <g style={part(far ? "knb" : "kn")}>
          {limb(SEG.shin, 9.5, far ? FAR : SKIN)}
          {/* Skon: limegrön detalj på närmre foten. */}
          <line x1={-2} y1={SEG.shin + 2} x2={SEG.foot} y2={SEG.shin + 2} stroke={far ? FAR : LIME} strokeWidth={6} strokeLinecap="round" />
        </g>
      </g>
    </g>
  )
  const arm = (far: boolean) => (
    <g transform={`translate(0 ${-SEG.torso})`}>
      <g style={part(far ? "shb" : "sh")}>
        {limb(SEG.upperArm, 8.5, far ? FAR : SKIN)}
        <g transform={`translate(0 ${SEG.upperArm})`}>
          <g style={part(far ? "elb" : "el")}>
            {limb(SEG.forearm, 7, far ? FAR : SKIN)}
            {!far && <HandProp kind={m.hand ?? "none"} />}
          </g>
        </g>
      </g>
    </g>
  )
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={title} data-motion={motion} data-hand={m.hand ?? "none"} data-testid="guide-figure">
      <style>{css}</style>
      {/* Studion: mörk bakgrund, golv och en diskret limegrön linje. */}
      <rect width={200} height={200} fill="#131916" />
      <ellipse cx={100} cy={FLOOR_Y + 4} rx={80} ry={6} fill="#1c2420" />
      <line x1={14} y1={FLOOR_Y} x2={186} y2={FLOOR_Y} stroke="#2b352f" strokeWidth={2} />
      <line x1={70} y1={FLOOR_Y} x2={130} y2={FLOOR_Y} stroke={LIME} strokeOpacity={0.5} strokeWidth={2} />
      {/* Hela rörelsen skalas in i bilden (hopp och press över huvudet får plats). */}
      <g transform={`translate(${fit.dx} ${fit.dy}) scale(${fit.scale})`}>
      {(m.scene ?? []).map((s, i) => (
        <Scene key={i} item={s} />
      ))}
      <g transform="translate(100 100)">
        <g style={part("root")}>
          <g transform={`rotate(${m.body ?? 0})`}>
            {leg(true)}
            <g style={part("torso")}>
              {arm(true)}
              {limb(-SEG.torso, 17, SKIN)}
              <circle cx={0} cy={-SEG.torso - SEG.neck - SEG.head} r={SEG.head} fill={SKIN} />
              {/* Pannband – samma kännetecken på modellen i varje övning. */}
              <rect x={-SEG.head} y={-SEG.torso - SEG.neck - SEG.head - 4} width={SEG.head * 2} height={3.2} rx={1.5} fill={LIME} />
            </g>
            {leg(false)}
            <g style={part("torso")}>{arm(false)}</g>
          </g>
        </g>
      </g>
      </g>
    </svg>
  )
}

function HandProp({ kind }: { kind: NonNullable<Motion["hand"]> }) {
  const y = SEG.forearm + 2
  switch (kind) {
    case "barbell":
      return (
        <g>
          <circle cx={0} cy={y} r={13} fill="#1c2420" stroke={LIME} strokeWidth={3} />
          <circle cx={0} cy={y} r={2.5} fill={LIME} />
        </g>
      )
    case "dumbbell":
      return <rect x={-6} y={y - 4} width={12} height={8} rx={3} fill={STEEL} stroke={LIME} strokeWidth={1.5} />
    case "kettlebell":
      return (
        <g>
          <circle cx={0} cy={y + 8} r={8} fill={STEEL} stroke={LIME} strokeWidth={1.5} />
          <path d={`M -4 ${y + 2} Q 0 ${y - 4} 4 ${y + 2}`} fill="none" stroke={STEEL} strokeWidth={2.5} />
        </g>
      )
    case "ball":
      return <circle cx={0} cy={y + 4} r={10} fill={STEEL} stroke={LIME} strokeWidth={1.5} />
    case "handle":
      return <rect x={-5} y={y - 2} width={10} height={4} rx={2} fill={LIME} />
    default:
      return null
  }
}

function Scene({ item: s }: { item: SceneItem }) {
  const fill = "#26302b"
  switch (s.kind) {
    case "bench":
      return s.w ? <rect x={s.x} y={s.y} width={s.w} height={7} rx={3} fill={fill} transform={s.tilt ? `rotate(${s.tilt} ${s.x + s.w / 2} ${s.y})` : undefined} /> : null
    case "box":
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill={fill} stroke="#33403a" />
    case "bar":
      return <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y} stroke="#4a5650" strokeWidth={4} strokeLinecap="round" />
    case "machine":
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill={fill} />
    case "sled":
      return (
        <g>
          <rect x={s.x - 18} y={s.y + 24} width={40} height={10} rx={2} fill={fill} />
          <line x1={s.x - 14} y1={s.y + 24} x2={s.x - 22} y2={s.y - 30} stroke="#4a5650" strokeWidth={4} strokeLinecap="round" />
          <rect x={s.x - 4} y={s.y + 8} width={18} height={16} rx={2} fill="#33403a" stroke={LIME} strokeOpacity={0.6} />
        </g>
      )
    case "erg":
      return <rect x={s.x} y={s.y} width={s.w} height={6} rx={3} fill={fill} />
    case "target":
      return <circle cx={s.x} cy={s.y} r={9} fill="none" stroke={LIME} strokeWidth={2.5} />
    case "pulley":
      return <circle cx={s.x} cy={s.y} r={5} fill="#33403a" stroke="#4a5650" strokeWidth={2} />
    case "wheel":
      return <circle cx={s.x} cy={s.y} r={s.r} fill={STEEL} stroke={LIME} strokeWidth={1.5} />
    case "water":
      return <rect x={0} y={s.y} width={200} height={200 - s.y} fill="#16303a" opacity={0.6} />
  }
}
