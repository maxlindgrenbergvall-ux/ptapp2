/**
 * Coaviras guide-atlet (v60) – EN och samma modell för alla övningar.
 *
 * En sidovy (ansiktet åt höger) med leder: bål, axel, armbåge, höft och knä
 * på båda sidor. En rörelse är 2–4 poser; motorn interpolerar mellan dem och
 * gör CSS-keyframes (bara transform: rotate/translate – GPU, inga omräkningar
 * av layouten). Fötterna (eller händerna) hålls kvar i marken med
 * framåtkinematik, så att atleten inte "glider".
 *
 * Ren TypeScript – enhetstestad i e2e/exercise-guides.unit.ts.
 */

/** Segmentlängder (viewBox 0 0 200 200, bäckenet i (100, 100) i vila). */
export const SEG = { torso: 48, neck: 5, head: 9, upperArm: 27, forearm: 25, thigh: 40, shin: 40, foot: 11 } as const
export const ORIGIN = { x: 100, y: 100 } as const

/**
 * En pose i grader. Vinklar räknas framåt (atleten tittar åt höger):
 *   t  bålens lutning framåt från lodrätt
 *   h  låret framåt från rakt ned  ·  k  knäböjning (underbenet bakåt)
 *   s  axeln framåt/uppåt i förhållande till bålen (0 = armen längs sidan, 180 = rakt upp)
 *   e  armbågsböjning (underarmen framåt/uppåt)
 *   hb/kb/sb/eb  bortre sidan (saknas = samma som närmre)
 *   x/y  extra förflyttning av bäckenet (t.ex. framåt i ett hopp)
 */
export interface Pose {
  t: number
  h: number
  k: number
  s: number
  e: number
  hb?: number
  kb?: number
  sb?: number
  eb?: number
  x?: number
  y?: number
}

export type Anchor = "feet" | "hands" | "hips"

export interface Motion {
  /** Poserna i ordning. */
  poses: Pose[]
  /** "alternate": A → B → A (styrka). "cycle": A → B → C … → A (löpning, rodd). */
  mode: "alternate" | "cycle"
  /** Sekunder för ett helt varv. */
  duration: number
  /** Vad som står still: fötterna (stående), händerna (hängande) eller höften (sittande/liggande). */
  anchor: Anchor
  /** Hela kroppen roterad (grader medurs): -90 = liggande på rygg, huvudet åt vänster … */
  body?: number
  /** Redskap i händerna. */
  hand?: "barbell" | "dumbbell" | "kettlebell" | "ball" | "handle" | "none"
  /** Fast utrustning runt atleten. */
  scene?: SceneItem[]
}

export type SceneItem =
  | { kind: "bench"; x: number; y: number; w: number; tilt?: number }
  | { kind: "box"; x: number; y: number; w: number; h: number }
  | { kind: "bar"; x: number; y: number; w: number }
  | { kind: "machine"; x: number; y: number; w: number; h: number }
  | { kind: "sled"; x: number; y: number }
  | { kind: "erg"; x: number; y: number; w: number }
  | { kind: "target"; x: number; y: number }
  | { kind: "pulley"; x: number; y: number }
  | { kind: "wheel"; x: number; y: number; r: number }
  | { kind: "water"; y: number }

const rad = (d: number) => (d * Math.PI) / 180
type Pt = { x: number; y: number }
/** Vinkel från "rakt ned", framåt positiv → enhetsvektor (skärmkoordinater, y nedåt). */
const down = (a: number): Pt => ({ x: Math.sin(rad(a)), y: Math.cos(rad(a)) })
const rot = (p: Pt, deg: number): Pt => ({ x: p.x * Math.cos(rad(deg)) - p.y * Math.sin(rad(deg)), y: p.x * Math.sin(rad(deg)) + p.y * Math.cos(rad(deg)) })
const add = (a: Pt, b: Pt, s = 1): Pt => ({ x: a.x + b.x * s, y: a.y + b.y * s })

export interface Joints {
  pelvis: Pt
  shoulder: Pt
  head: Pt
  elbow: Pt
  hand: Pt
  knee: Pt
  ankle: Pt
  toe: Pt
  elbowB: Pt
  handB: Pt
  kneeB: Pt
  ankleB: Pt
}

/** Ledernas läge (kroppens eget koordinatsystem, bäckenet i 0,0) – samma matematik som SVG-grupperna. */
export function joints(p: Pose): Joints {
  const pelvis = { x: 0, y: 0 }
  const shoulder = add(pelvis, { x: Math.sin(rad(p.t)), y: -Math.cos(rad(p.t)) }, SEG.torso)
  const head = add(shoulder, { x: Math.sin(rad(p.t)), y: -Math.cos(rad(p.t)) }, SEG.neck + SEG.head)
  const arm = (s: number, e: number) => {
    const elbow = add(shoulder, down(s - p.t), SEG.upperArm)
    return { elbow, hand: add(elbow, down(s + e - p.t), SEG.forearm) }
  }
  const leg = (h: number, k: number) => {
    const knee = add(pelvis, down(h), SEG.thigh)
    const ankle = add(knee, down(h - k), SEG.shin)
    return { knee, ankle, toe: add(ankle, rot({ x: 1, y: 0 }, -h + k), SEG.foot) }
  }
  const near = arm(p.s, p.e)
  const far = arm(p.sb ?? p.s, p.eb ?? p.e)
  const nl = leg(p.h, p.k)
  const fl = leg(p.hb ?? p.h, p.kb ?? p.k)
  return { pelvis, shoulder, head, elbow: near.elbow, hand: near.hand, knee: nl.knee, ankle: nl.ankle, toe: nl.toe, elbowB: far.elbow, handB: far.hand, kneeB: fl.knee, ankleB: fl.ankle }
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f
/** Mjuk rörelse: långsamt i vändlägena (cosinus). */
const ease = (f: number) => 0.5 - 0.5 * Math.cos(Math.PI * f)

export function mix(a: Pose, b: Pose, f: number): Pose {
  const g = (k: keyof Pose, fb: number) => lerp((a[k] as number | undefined) ?? fb, (b[k] as number | undefined) ?? fb, f)
  return {
    t: lerp(a.t, b.t, f),
    h: lerp(a.h, b.h, f),
    k: lerp(a.k, b.k, f),
    s: lerp(a.s, b.s, f),
    e: lerp(a.e, b.e, f),
    hb: g("hb", lerp(a.h, b.h, f)),
    kb: g("kb", lerp(a.k, b.k, f)),
    sb: g("sb", lerp(a.s, b.s, f)),
    eb: g("eb", lerp(a.e, b.e, f)),
    x: lerp(a.x ?? 0, b.x ?? 0, f),
    y: lerp(a.y ?? 0, b.y ?? 0, f),
  }
}

export interface Frame {
  /** 0–100 (procent av varvet). */
  at: number
  pose: Pose
  /** Bäckenets förflyttning i världen (efter kroppens rotation och förankring). */
  root: Pt
}

/** Antal mellanlägen per övergång – tillräckligt för att fötterna ska stå still. */
const STEPS = 8

/** Rörelsens bildrutor (procent, pose och bäckenets läge). */
export function frames(m: Motion): Frame[] {
  const seq = m.mode === "alternate" ? [...m.poses, ...m.poses.slice(0, -1).reverse()] : [...m.poses, m.poses[0]]
  const segs = seq.length - 1
  const out: Frame[] = []
  const anchorOf = (p: Pose): Pt | null => {
    if (m.anchor === "hips") return null
    const j = joints(p)
    return rot(m.anchor === "feet" ? j.ankle : j.hand, m.body ?? 0)
  }
  const fixed = anchorOf(m.poses[0])
  for (let i = 0; i < segs; i++) {
    for (let s = 0; s < STEPS; s++) {
      const f = s / STEPS
      const pose = mix(seq[i], seq[i + 1], ease(f))
      out.push({ at: ((i + f) / segs) * 100, pose, root: rootFor(pose, fixed, anchorOf) })
    }
  }
  const last = seq[segs]
  out.push({ at: 100, pose: mix(last, last, 0), root: rootFor(last, fixed, anchorOf) })
  return out
}

function rootFor(pose: Pose, fixed: Pt | null, anchorOf: (p: Pose) => Pt | null): Pt {
  const extra = { x: pose.x ?? 0, y: pose.y ?? 0 }
  if (!fixed) return extra
  const now = anchorOf({ ...pose, x: 0, y: 0 })!
  return { x: fixed.x - now.x + extra.x, y: fixed.y - now.y + extra.y }
}

/** CSS-transform för varje led (rotate för lederna, translate för bäckenet). */
export const PARTS = ["root", "torso", "sh", "el", "shb", "elb", "hip", "kn", "hipb", "knb"] as const
export type Part = (typeof PARTS)[number]

export function transformFor(part: Part, p: Pose, root: Pt): string {
  const r = (d: number) => `rotate(${+d.toFixed(2)}deg)`
  switch (part) {
    case "root":
      return `translate(${+root.x.toFixed(2)}px, ${+root.y.toFixed(2)}px)`
    case "torso":
      return r(p.t)
    case "sh":
      return r(-p.s)
    case "el":
      return r(-p.e)
    case "shb":
      return r(-(p.sb ?? p.s))
    case "elb":
      return r(-(p.eb ?? p.e))
    case "hip":
      return r(-p.h)
    case "kn":
      return r(p.k)
    case "hipb":
      return r(-(p.hb ?? p.h))
    case "knb":
      return r(p.kb ?? p.k)
  }
}

/** @keyframes för en rörelse (en per led). Namnen får prefixet `prefix`. */
export function keyframesCss(prefix: string, m: Motion): string {
  const fr = frames(m)
  return PARTS.map((part) => {
    const steps = fr.map((f) => `${+f.at.toFixed(2)}%{transform:${transformFor(part, f.pose, f.root)}}`).join("")
    return `@keyframes ${prefix}-${part}{${steps}}`
  }).join("\n")
}

/** Golvet i bilden (y). */
export const FLOOR = 186

function sceneBox(it: SceneItem): { x0: number; y0: number; x1: number; y1: number } | null {
  switch (it.kind) {
    case "bench":
      return it.w ? { x0: it.x, y0: it.y - Math.abs(Math.sin(rad(it.tilt ?? 0))) * it.w * 0.5, x1: it.x + it.w, y1: it.y + 7 } : null
    case "box":
    case "machine":
      return { x0: it.x, y0: it.y, x1: it.x + it.w, y1: it.y + it.h }
    case "bar":
      return { x0: it.x, y0: it.y - 2, x1: it.x + it.w, y1: it.y + 2 }
    case "sled":
      return { x0: it.x - 24, y0: it.y - 32, x1: it.x + 22, y1: it.y + 34 }
    case "erg":
      return { x0: it.x, y0: it.y, x1: it.x + it.w, y1: it.y + 6 }
    case "target":
    case "pulley":
      return { x0: it.x - 9, y0: it.y - 9, x1: it.x + 9, y1: it.y + 9 }
    case "wheel":
      return { x0: it.x - it.r, y0: it.y - it.r, x1: it.x + it.r, y1: it.y + it.r }
    case "water":
      return null
  }
}

export interface Fit {
  scale: number
  dx: number
  dy: number
}

/**
 * Skala och placering så att HELA rörelsen (alla bildrutor, huvudet, redskap
 * och utrustning) får plats i bilden – med lägsta punkten på golvet.
 */
export function fitMotion(m: Motion): Fit {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const grow = (x: number, y: number, r = 0) => {
    x0 = Math.min(x0, x - r)
    x1 = Math.max(x1, x + r)
    y0 = Math.min(y0, y - r)
    y1 = Math.max(y1, y + r)
  }
  for (const { pose, root } of frames(m)) {
    const j = joints(pose)
    for (const [name, pt] of Object.entries(j)) {
      const w = add(rot(pt, m.body ?? 0), root)
      grow(ORIGIN.x + w.x, ORIGIN.y + w.y, name === "head" ? SEG.head + 2 : name.startsWith("hand") && m.hand && m.hand !== "none" ? 13 : 6)
    }
  }
  for (const it of m.scene ?? []) {
    const b = sceneBox(it)
    if (b) {
      grow(b.x0, b.y0)
      grow(b.x1, b.y1)
    }
  }
  const pad = 8
  const scale = Math.min(1, (200 - 2 * pad) / (x1 - x0), (FLOOR - pad) / (y1 - y0))
  const dx = 100 - ((x0 + x1) / 2) * scale
  const dy = FLOOR - y1 * scale
  return { scale: +scale.toFixed(4), dx: +dx.toFixed(2), dy: +dy.toFixed(2) }
}

/** Är någon del av atleten utanför bilden (efter placeringen)? Används av testerna. */
export function outOfFrame(m: Motion, margin = 1): boolean {
  const f = fitMotion(m)
  return frames(m).some(({ pose, root }) =>
    Object.values(joints(pose)).some((pt) => {
      const w = add(rot(pt, m.body ?? 0), root)
      const x = (ORIGIN.x + w.x) * f.scale + f.dx
      const y = (ORIGIN.y + w.y) * f.scale + f.dy
      return x < margin || x > 200 - margin || y < margin || y > FLOOR + 2
    })
  )
}
