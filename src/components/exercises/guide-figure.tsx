/**
 * Guide-atleten (v60): samma modell för alla övningar – en atletisk silhuett
 * i en mörk studio (#131916) med limegröna (#84cc16) detaljer. Animeras med
 * genererade CSS-keyframes (bara transform), pausas när guiden stängs och
 * står still i startläget för den som valt "minska rörelse".
 */
import * as React from "react"

import { fitMotion, FLOOR as FLOOR_Y, footMode, frames, gripPoint, rearPoint, keyframesCss, type Motion, type Part, SEG, type SceneItem, transformFor } from "@/lib/exercise-guides/figure"
import { MOTIONS, type MotionId } from "@/lib/exercise-guides/motions"

const SKIN = "#e8ede6"
const FAR = "#8a948c"
const LIME = "#84cc16"
const STEEL = "#3a453f"
const STEEL_LIGHT = "#9aa59d"
const FRAME = "#4a5650"

export function GuideFigure({ motion, hand, playing = true, className, title }: { motion: MotionId; hand?: Motion["hand"]; playing?: boolean; className?: string; title?: string }) {
  // Övningens eget redskap (v61) – annars rörelsens.
  const base = MOTIONS[motion] as Motion
  const m = React.useMemo(() => (hand ? { ...base, hand } : base), [base, hand])
  const prefix = `cg-${motion}`
  const first = frames(m)[0]
  const feet = footMode(m)
  const fit = React.useMemo(() => fitMotion(m), [m])
  const grip = React.useMemo(() => gripPoint(m), [m])
  const rear = React.useMemo(() => (m.plant ? rearPoint(m) : grip), [m, grip])
  const css = React.useMemo(() => keyframesCss(prefix, m), [prefix, m])
  const part = (p: Part): React.CSSProperties => ({
    transform: transformFor(p, first.pose, first.root, feet),
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
          {/* Foten har en egen led (fotled): plant i stående övningar, hälen upp i tåhävningar. */}
          <g transform={`translate(0 ${SEG.shin})`}>
            <g style={part(far ? "ftb" : "ft")}>
              {/* Skon: limegrön detalj på närmre foten. */}
              <line x1={-3} y1={2} x2={SEG.foot} y2={2} stroke={far ? FAR : LIME} strokeWidth={6} strokeLinecap="round" />
            </g>
          </g>
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
        <Scene key={i} item={s} grip={s.kind === "benchrear" ? rear : grip} floor={(FLOOR_Y - fit.dy) / fit.scale} />
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

/**
 * Redskapet i handen, sett från sidan (v62): skivstången som en viktskiva med
 * hylsa och en skiva bakom, hanteln som ett par små skivor med handtag,
 * kettlebellen med handtag och klot, kabelhandtaget som ett D-handtag.
 */
function HandProp({ kind }: { kind: NonNullable<Motion["hand"]> }) {
  const y = SEG.forearm + 2
  switch (kind) {
    case "barbell":
      return (
        <g data-prop="barbell">
          {/* Bortre skivan (djup) och närmre skivan med hylsan i mitten. */}
          <circle cx={2.5} cy={y - 2.5} r={12.5} fill="#10150f" stroke={LIME} strokeOpacity={0.45} strokeWidth={2} />
          <circle cx={0} cy={y} r={12.5} fill="#1c2420" stroke={LIME} strokeWidth={3} />
          <circle cx={0} cy={y} r={7.5} fill="none" stroke={LIME} strokeOpacity={0.35} strokeWidth={1} />
          <circle cx={0} cy={y} r={3} fill={STEEL_LIGHT} stroke="#131916" strokeWidth={1} />
        </g>
      )
    case "dumbbell":
      return (
        <g data-prop="dumbbell">
          <circle cx={1.8} cy={y - 1.8} r={6.5} fill="#10150f" stroke={LIME} strokeOpacity={0.45} strokeWidth={1.5} />
          <circle cx={0} cy={y} r={6.5} fill={STEEL} stroke={LIME} strokeWidth={2} />
          <circle cx={0} cy={y} r={2} fill={STEEL_LIGHT} />
        </g>
      )
    case "kettlebell":
      return (
        <g data-prop="kettlebell">
          <path d={`M -5 ${y + 3} L -5 ${y - 1} Q 0 ${y - 7} 5 ${y - 1} L 5 ${y + 3}`} fill="none" stroke={STEEL_LIGHT} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={0} cy={y + 10} r={9} fill={STEEL} stroke={LIME} strokeWidth={2} />
          <rect x={-5} y={y + 7} width={10} height={2.5} rx={1} fill={LIME} opacity={0.7} />
        </g>
      )
    case "ball":
      return (
        <g data-prop="ball">
          <circle cx={0} cy={y + 5} r={10} fill={STEEL} stroke={LIME} strokeWidth={2} />
          <path d={`M -10 ${y + 5} Q 0 ${y + 9} 10 ${y + 5}`} fill="none" stroke={LIME} strokeOpacity={0.5} strokeWidth={1.2} />
        </g>
      )
    case "handle":
      return (
        <g data-prop="handle">
          <path d={`M -5 ${y} Q 0 ${y + 9} 5 ${y}`} fill="none" stroke={LIME} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={-6} y1={y} x2={6} y2={y} stroke={STEEL_LIGHT} strokeWidth={3} strokeLinecap="round" />
        </g>
      )
    case "wheel":
      return (
        <g data-prop="wheel">
          <circle cx={0} cy={y + 1} r={8} fill={STEEL} stroke={LIME} strokeWidth={2} />
          <circle cx={0} cy={y + 1} r={2} fill={STEEL_LIGHT} />
        </g>
      )
    default:
      return null
  }
}

/** Utrustningen runt atleten. Räcke, dipstation, låg stång och släde sitter där händerna greppar. */
function Scene({ item: s, grip, floor: FLOOR_W }: { item: SceneItem; grip: { x: number; y: number }; floor: number }) {
  const fill = "#26302b"
  if ("at" in s) {
    const { x, y } = grip
    switch (s.kind) {
      case "benchrear":
        // Bänken under bakre foten: vristen vilar på dynans framkant.
        return (
          <g data-scene="bench">
            <line x1={x - 20} y1={y + 10} x2={x - 20} y2={FLOOR_W} stroke={FRAME} strokeWidth={3} />
            <line x1={x + 8} y1={y + 10} x2={x + 8} y2={FLOOR_W} stroke={FRAME} strokeWidth={3} />
            <rect x={x - 26} y={y + 4} width={40} height={7} rx={3} fill={fill} />
          </g>
        )
      case "pullup":
        // Räcke: stången (sedd från änden) i händerna, bom och stolpe bakom atleten ner till golvet.
        return (
          <g data-scene="pullup">
            <line x1={x - 36} y1={y - 4} x2={x - 36} y2={FLOOR_W} stroke={FRAME} strokeWidth={4} />
            <line x1={x - 36} y1={y - 4} x2={x + 2} y2={y - 4} stroke={FRAME} strokeWidth={4} strokeLinecap="round" />
            <circle cx={x} cy={y} r={3.6} fill={STEEL_LIGHT} stroke={LIME} strokeWidth={1.4} />
          </g>
        )
      case "dip":
        // Dipstation: holmen i händernas höjd med två ben ner till golvet.
        return (
          <g data-scene="dip">
            <line x1={x - 30} y1={y + 2} x2={x + 6} y2={y + 2} stroke={STEEL_LIGHT} strokeWidth={4} strokeLinecap="round" />
            <line x1={x - 26} y1={y + 2} x2={x - 26} y2={FLOOR_W} stroke={FRAME} strokeWidth={3.5} />
            <line x1={x + 2} y1={y + 2} x2={x + 2} y2={FLOOR_W} stroke={FRAME} strokeWidth={3.5} />
          </g>
        )
      case "lowbar":
        // Låg stång i ett ställ (inverterad rodd).
        return (
          <g data-scene="lowbar">
            <line x1={x + 8} y1={y - 10} x2={x + 8} y2={FLOOR_W} stroke={FRAME} strokeWidth={4} />
            <line x1={x} y1={y} x2={x + 8} y2={y} stroke={FRAME} strokeWidth={3} />
            <circle cx={x} cy={y} r={3.6} fill={STEEL_LIGHT} stroke={LIME} strokeWidth={1.4} />
          </g>
        )
      case "benchgrip":
        // Bänken bakom atleten med händerna på framkanten (bänkdips).
        return (
          <g data-scene="bench">
            <line x1={x - 34} y1={y + 8} x2={x - 34} y2={FLOOR_W} stroke={FRAME} strokeWidth={3} />
            <line x1={x - 4} y1={y + 8} x2={x - 4} y2={FLOOR_W} stroke={FRAME} strokeWidth={3} />
            <rect x={x - 40} y={y + 2} width={44} height={7} rx={3} fill={fill} />
          </g>
        )
      case "sledpush":
        // Släden framför atleten med de höga stolparna i händerna.
        return (
          <g data-scene="sled">
            <line x1={x} y1={y} x2={x + 14} y2={FLOOR_W - 12} stroke={STEEL_LIGHT} strokeWidth={4} strokeLinecap="round" />
            <rect x={x + 6} y={FLOOR_W - 12} width={42} height={10} rx={2} fill={fill} />
            <rect x={x + 18} y={FLOOR_W - 28} width={18} height={16} rx={2} fill="#33403a" stroke={LIME} strokeOpacity={0.6} />
            <line x1={x + 4} y1={FLOOR_W - 1} x2={x + 50} y2={FLOOR_W - 1} stroke={FRAME} strokeWidth={2.5} strokeLinecap="round" />
          </g>
        )
    }
  }
  switch (s.kind) {
    case "bench":
      if (!s.w) return null
      // Bänken: dyna och två ben ner till golvet (lutande bänk: ett stöd under den höga änden).
      return s.tilt ? (
        <g data-scene="bench">
          <rect x={s.x} y={s.y} width={s.w} height={7} rx={3} fill={fill} transform={`rotate(${s.tilt} ${s.x + s.w / 2} ${s.y})`} />
          <line x1={s.x + s.w / 2} y1={s.y + 6} x2={s.x + s.w / 2} y2={FLOOR_W} stroke={FRAME} strokeWidth={3} />
        </g>
      ) : (
        <g data-scene="bench">
          {s.y + 7 < FLOOR_W - 2 && (
            <>
              <line x1={s.x + 5} y1={s.y + 6} x2={s.x + 5} y2={FLOOR_W} stroke={FRAME} strokeWidth={3} />
              <line x1={s.x + s.w - 5} y1={s.y + 6} x2={s.x + s.w - 5} y2={FLOOR_W} stroke={FRAME} strokeWidth={3} />
            </>
          )}
          <rect x={s.x} y={s.y} width={s.w} height={7} rx={3} fill={fill} />
        </g>
      )
    case "box":
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill={fill} stroke="#33403a" />
    case "bar":
      return <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y} stroke={FRAME} strokeWidth={4} strokeLinecap="round" />
    case "machine":
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill={fill} />
    case "sled":
      return (
        <g>
          <rect x={s.x - 18} y={s.y + 24} width={40} height={10} rx={2} fill={fill} />
          <line x1={s.x - 14} y1={s.y + 24} x2={s.x - 22} y2={s.y - 30} stroke={FRAME} strokeWidth={4} strokeLinecap="round" />
          <rect x={s.x - 4} y={s.y + 8} width={18} height={16} rx={2} fill="#33403a" stroke={LIME} strokeOpacity={0.6} />
        </g>
      )
    case "erg":
      return <rect x={s.x} y={s.y} width={s.w} height={6} rx={3} fill={fill} />
    case "target":
      return <circle cx={s.x} cy={s.y} r={9} fill="none" stroke={LIME} strokeWidth={2.5} />
    case "pulley":
      return <circle cx={s.x} cy={s.y} r={5} fill="#33403a" stroke={FRAME} strokeWidth={2} />
    case "wheel":
      return <circle cx={s.x} cy={s.y} r={s.r} fill={STEEL} stroke={LIME} strokeWidth={1.5} />
    case "water":
      return <rect x={0} y={s.y} width={200} height={200 - s.y} fill="#16303a" opacity={0.6} />
  }
}
