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
export const SEG = { torso: 48, neck: 5, head: 9, upperArm: 30, forearm: 29, thigh: 40, shin: 40, foot: 11 } as const
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
  /** Fotens vinkel i kroppens ram (0 = plant mot golvet, + = tån nedåt/hälen upp). Saknas = enligt rörelsens fotläge. */
  f?: number
  fb?: number
}

export type Anchor = "feet" | "hands" | "hips" | "toes"

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
  hand?: "barbell" | "dumbbell" | "kettlebell" | "ball" | "handle" | "wheel" | "none"
  /** Fast utrustning runt atleten. */
  scene?: SceneItem[]
  /**
   * Fötterna: "flat" = plant mot golvet (stående styrka), "shin" = följer
   * underbenet (löpning, liggande, hängande). Standard: flat för stående
   * rörelser utan rotation, annars shin.
   */
  feet?: "flat" | "shin"
  /**
   * Golvkontakt: varje bildruta flyttas lodrätt så att lägsta kontaktpunkten
   * (fot, knä, hand, armbåge, bäcken, axel) står på golvet. `y` i posen
   * lyfter därefter (hopp). För rörelser som byter stödpunkt (burpee, löpning).
   */
  ground?: boolean
  /**
   * Stångbana (v62): bålens lutning löses i varje bildruta så att redskapet
   * hålls över mittfoten (±5), som i en riktig knäböj eller ett marklyft.
   *   "bar":  redskapet sitter fast mot överkroppen (stång på ryggen, i racken, goblet) –
   *           bålen lutas så att tyngdpunkten (kropp + redskap) står över mittfoten
   *   "hang": armarna hänger (marklyft, RDL, frivändningens första drag) – `arm` = armens
   *           vinkel bakåt från lodrätt (grader), stången dras in mot benen.
   */
  track?: { kind: "bar" } | { kind: "hang"; arm?: number } | { kind: "plank" }
  /**
   * Bakre foten planterad (v62): det bortre benet löses med invers kinematik
   * så att bortre tån står `dx` bakom främre fotleden och `dy` över golvet
   * (negativt = upp, t.ex. på en bänk) i varje bildruta – utfall och split squat.
   */
  plant?: { dx: number; dy?: number }
  /** Kroppen vilar mot utrustning (ryggdyna, vägg, bänk, fasthållna fötter) – balanskontrollen gäller inte. */
  supported?: boolean
}

export type SceneItem =
  | { kind: "bench"; x: number; y: number; w: number; tilt?: number }
  /** Utrustning som sitter där händerna greppar (räcke, dipstation, låg stång, släde). */
  | { kind: "pullup" | "dip" | "lowbar" | "sledpush" | "benchgrip"; at: "hand" }
  /** Bänk under den planterade bakre foten (bulgarisk split squat). */
  | { kind: "benchrear"; at: "rear" }
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
  heel: Pt
  toeB: Pt
  heelB: Pt
  elbowB: Pt
  handB: Pt
  kneeB: Pt
  ankleB: Pt
}

/** Fotens vinkel i kroppens ram för en pose (se Pose.f). */
export function footAngle(p: Pose, mode: "flat" | "shin", far = false): number {
  const h = far ? (p.hb ?? p.h) : p.h
  const k = far ? (p.kb ?? p.k) : p.k
  const f = far ? (p.fb ?? p.f) : p.f
  return f ?? (mode === "flat" ? 0 : k - h)
}

export function footMode(m: Pick<Motion, "feet" | "body" | "anchor">): "flat" | "shin" {
  return m.feet ?? (!m.body && m.anchor !== "hands" ? "flat" : "shin")
}

/** Ledernas läge (kroppens eget koordinatsystem, bäckenet i 0,0) – samma matematik som SVG-grupperna. */
export function joints(p: Pose, feet: "flat" | "shin" = "shin"): Joints {
  const pelvis = { x: 0, y: 0 }
  const shoulder = add(pelvis, { x: Math.sin(rad(p.t)), y: -Math.cos(rad(p.t)) }, SEG.torso)
  const head = add(shoulder, { x: Math.sin(rad(p.t)), y: -Math.cos(rad(p.t)) }, SEG.neck + SEG.head)
  const arm = (s: number, e: number) => {
    const elbow = add(shoulder, down(s - p.t), SEG.upperArm)
    return { elbow, hand: add(elbow, down(s + e - p.t), SEG.forearm) }
  }
  const leg = (h: number, k: number, fa: number) => {
    const knee = add(pelvis, down(h), SEG.thigh)
    const ankle = add(knee, down(h - k), SEG.shin)
    return { knee, ankle, toe: add(ankle, rot({ x: 1, y: 0 }, fa), SEG.foot), heel: add(ankle, rot({ x: -1, y: 0 }, fa), 3) }
  }
  const near = arm(p.s, p.e)
  const far = arm(p.sb ?? p.s, p.eb ?? p.e)
  const nl = leg(p.h, p.k, footAngle(p, feet))
  const fl = leg(p.hb ?? p.h, p.kb ?? p.k, footAngle(p, feet, true))
  return {
    pelvis, shoulder, head,
    elbow: near.elbow, hand: near.hand, knee: nl.knee, ankle: nl.ankle, toe: nl.toe, heel: nl.heel,
    elbowB: far.elbow, handB: far.hand, kneeB: fl.knee, ankleB: fl.ankle, toeB: fl.toe, heelB: fl.heel,
  }
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
    ...(a.f !== undefined || b.f !== undefined ? { f: lerp(a.f ?? footAngle(a, "shin"), b.f ?? footAngle(b, "shin"), f) } : {}),
    ...(a.fb !== undefined || b.fb !== undefined ? { fb: lerp(a.fb ?? footAngle(a, "shin", true), b.fb ?? footAngle(b, "shin", true), f) } : {}),
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

/** Redskapets vikt som andel av kroppsvikten (för tyngdpunkten). */
export function loadOf(m: Pick<Motion, "hand">): number {
  return m.hand === "barbell" ? 1.2 : m.hand === "dumbbell" || m.hand === "kettlebell" ? 0.25 : m.hand === "ball" ? 0.1 : 0
}

const midPt = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Tyngdpunktens x (ungefärliga segmentvikter + redskapet i händerna). */
export function comX(j: Joints, load = 0): number {
  const parts: [Pt, number][] = [
    [midPt(j.pelvis, j.shoulder), 0.5],
    [j.head, 0.08],
    [midPt(j.pelvis, j.knee), 0.1],
    [midPt(j.pelvis, j.kneeB), 0.1],
    [midPt(j.knee, j.ankle), 0.05],
    [midPt(j.kneeB, j.ankleB), 0.05],
    [midPt(j.shoulder, j.elbow), 0.03],
    [midPt(j.shoulder, j.elbowB), 0.03],
    [midPt(j.elbow, j.hand), 0.025],
    [midPt(j.elbowB, j.handB), 0.025],
    [j.hand, load / 2],
    [j.handB, load / 2],
  ]
  const w = parts.reduce((sum, [, m]) => sum + m, 0)
  return parts.reduce((sum, [q, m]) => sum + q.x * m, 0) / w
}

/** Mittfotens x i kroppens ram (plant fot). */
function midfootX(p: Pose, feet: "flat" | "shin"): number {
  const j = joints(p, feet)
  return (j.heel.x + j.toe.x) / 2
}

/** Bisektion: x i [lo, hi] där fn(x) = 0 (fn växande). */
function solve(fn: (x: number) => number, lo: number, hi: number): number {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (fn(mid) > 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/** Höft- och knävinkel som når `target` (kroppens ram, från bäckenet) med knät framåt. */
export function legIk(target: Pt): { h: number; k: number } {
  const D = Math.min(Math.hypot(target.x, target.y), SEG.thigh + SEG.shin - 0.01)
  const phi = (Math.atan2(target.x, target.y) * 180) / Math.PI
  const a = (Math.acos(D / (SEG.thigh + SEG.shin)) * 180) / Math.PI
  return { h: phi + a, k: 2 * a }
}

/** Plankans lutning: hela kroppen vrids kring bäckenet så att händerna (armbågarna) och tårna (knäna) når samma golv. */
function planked(m: Motion, p: Pose, feet: "flat" | "shin"): Pose {
  const at = (d: number): Pose => ({ ...p, t: p.t + d, h: p.h - d, ...(p.hb !== undefined ? { hb: p.hb - d } : {}) })
  const gap = (d: number) => {
    const j = joints(at(d), feet)
    const y = (q: Pt) => rot(q, m.body ?? 0).y
    const upper = Math.max(y(j.hand) + (m.hand === "wheel" ? 8 : 0), y(j.elbow))
    const lower = Math.max(y(j.toe), y(j.toeB), y(j.knee), y(j.kneeB))
    return upper - lower
  }
  // Vridning framåt (huvudet nedåt) gör händerna lägre i förhållande till fötterna.
  const sgn = gap(1) > gap(0) ? 1 : -1
  return at(+solve((d) => sgn * gap(d), -45, 45).toFixed(2))
}

/**
 * Posens slutliga form: stångbana (track) och planterad bakre fot (plant).
 * Löses per bildruta så att även mellanlägena följer reglerna.
 */
export function tracked(m: Motion, p: Pose): Pose {
  const feet = footMode(m)
  let out = trackOnly(m, p, feet)
  if (!m.plant && m.track?.kind !== "bar" && m.track?.kind !== "hang") out = balanced(m, out, feet)
  if (m.plant) {
    const j = joints(out, feet)
    // Golvet i kroppens ram = främre fotens sula (plant fot: samma höjd som fotleden).
    const fa = footAngle(out, feet, true)
    const toe = { x: j.ankle.x - m.plant.dx, y: j.ankle.y + (m.plant.dy ?? 0) }
    const target = add(toe, rot({ x: 1, y: 0 }, fa), -SEG.foot)
    const ik = legIk(target)
    out = { ...out, hb: +ik.h.toFixed(2), kb: +ik.k.toFixed(2) }
  }
  return out
}

/**
 * Ankelstrategin (v62): fristående stående övningar lutar hela kroppen lite
 * kring fotleden (högst 12°) när redskapet annars skulle dra tyngdpunkten
 * utanför foten – som en människa gör i curl, frontlyft eller kettlebellsving.
 */
function balanced(m: Motion, p: Pose, feet: "flat" | "shin"): Pose {
  // Dynamiska rörelser med golvkontakt (hopp, burpee) och stödda övningar balanseras inte.
  if ((m.anchor !== "feet" && m.anchor !== "toes") || m.body || m.supported || m.ground) return p
  const lean = (d: number): Pose => ({ ...p, t: p.t + d, h: p.h - d, hb: (p.hb ?? p.h) - d })
  const j0 = joints(p, feet)
  // Stödytan i kroppens ram: hälen → tån (hälen uppe: framfoten).
  const heelUp = (p.f ?? 0) > 5
  const lo = (heelUp ? j0.toe.x - 4 : j0.heel.x) + 1
  const hi = j0.toe.x - 1
  const com = (d: number) => {
    const j = joints(lean(d), feet)
    // Fotleden står still: mät tyngdpunkten relativt foten.
    return comX(j, loadOf(m)) - (j.ankle.x - j0.ankle.x)
  }
  const c0 = com(0)
  if (c0 >= lo && c0 <= hi) return p
  const goal = c0 < lo ? lo : hi
  const d = solve((x) => com(x) - goal, -12, 12)
  return lean(+d.toFixed(2))
}

function trackOnly(m: Motion, p: Pose, feet: "flat" | "shin"): Pose {
  if (!m.track) return p
  const tr = m.track
  if (tr.kind === "plank") return planked(m, p, feet)
  const at = (t: number): Pose => (tr.kind === "hang" ? { ...p, t, s: t - (tr.arm ?? 6), sb: undefined } : { ...p, t })
  const err =
    tr.kind === "bar"
      ? (t: number) => comX(joints(at(t), feet), loadOf(m)) - midfootX(p, feet)
      : (t: number) => joints(at(t), feet).hand.x - midfootX(p, feet)
  const TOL = tr.kind === "bar" ? 2 : 5
  const e0 = err(p.t)
  if (Math.abs(e0) <= TOL) return at(p.t)
  // Mot närmaste kant av toleransen (redskapet flyttas framåt när bålen lutar mer).
  const goal = e0 > 0 ? TOL : -TOL
  return at(+solve((t) => err(t) - goal, -30, 89).toFixed(2))
}

/** Antal mellanlägen per övergång – tillräckligt för att fötterna ska stå still. */
const STEPS = 8

/** Rörelsens bildrutor (procent, pose och bäckenets läge). */
export function frames(m: Motion): Frame[] {
  const seq = m.mode === "alternate" ? [...m.poses, ...m.poses.slice(0, -1).reverse()] : [...m.poses, m.poses[0]]
  const segs = seq.length - 1
  const out: Frame[] = []
  const feet = footMode(m)
  const anchorOf = (p: Pose): Pt | null => {
    if (m.anchor === "hips") return null
    const j = joints(p, feet)
    return rot(m.anchor === "feet" ? j.ankle : m.anchor === "toes" ? j.toe : j.hand, m.body ?? 0)
  }
  const p0 = tracked(m, m.poses[0])
  const fixed = anchorOf(p0)
  const groundY0 = m.ground ? lowestContact(m, p0, feet) : 0
  const base = (p: Pose): Pt => {
    const now = fixed ? anchorOf(p)! : { x: 0, y: 0 }
    const r = fixed ? { x: fixed.x - now.x, y: fixed.y - now.y } : { x: 0, y: 0 }
    // Golvkontakt: lägsta kontaktpunkten på samma höjd som i första posen.
    if (m.ground) r.y = groundY0 - lowestContact(m, p, feet)
    return r
  }
  const rootFor = (p: Pose): Pt => {
    const b = base(p)
    return { x: b.x + (p.x ?? 0), y: b.y + (p.y ?? 0) }
  }
  for (let i = 0; i < segs; i++) {
    for (let s = 0; s < STEPS; s++) {
      const f = s / STEPS
      const pose = tracked(m, mix(seq[i], seq[i + 1], ease(f)))
      out.push({ at: ((i + f) / segs) * 100, pose, root: rootFor(pose) })
    }
  }
  const last = tracked(m, mix(seq[segs], seq[segs], 0))
  out.push({ at: 100, pose: last, root: rootFor(last) })
  return out
}

/** Kontaktpunkter mot golvet (för `ground`). */
const CONTACTS = ["ankle", "toe", "heel", "ankleB", "toeB", "heelB", "knee", "kneeB", "hand", "handB", "elbow", "elbowB", "pelvis", "shoulder"] as const

/** Lägsta kontaktpunktens y (kroppens ram roterad med `body`, utan förflyttning). */
function lowestContact(m: Motion, p: Pose, feet: "flat" | "shin"): number {
  const j = joints({ ...p, x: 0, y: 0 }, feet)
  const wheel = m.hand === "wheel" ? 8 : 0
  return Math.max(...CONTACTS.map((c) => rot(j[c], m.body ?? 0).y + (c.startsWith("hand") ? wheel : 0)))
}

/** Var händerna greppar i första bildrutan (världskoordinater, före placeringen i bilden). */
export function rearPoint(m: Motion): Pt {
  const f = frames(m)[0]
  const j = joints(f.pose, footMode(m))
  const w = add(rot(j.ankleB, m.body ?? 0), f.root)
  return { x: ORIGIN.x + w.x, y: ORIGIN.y + w.y }
}

export function gripPoint(m: Motion): Pt {
  const f = frames(m)[0]
  const j = joints(f.pose, footMode(m))
  const w = add(rot(j.hand, m.body ?? 0), f.root)
  return { x: ORIGIN.x + w.x, y: ORIGIN.y + w.y }
}

/** CSS-transform för varje led (rotate för lederna, translate för bäckenet). */
export const PARTS = ["root", "torso", "sh", "el", "shb", "elb", "hip", "kn", "hipb", "knb", "ft", "ftb"] as const
export type Part = (typeof PARTS)[number]

export function transformFor(part: Part, p: Pose, root: Pt, feet: "flat" | "shin" = "shin"): string {
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
    // Foten i underbenets ram: kroppsramens vinkel minus underbenets rotation (k − h).
    case "ft":
      return r(footAngle(p, feet) - (p.k - p.h))
    case "ftb":
      return r(footAngle(p, feet, true) - ((p.kb ?? p.k) - (p.hb ?? p.h)))
  }
}

/** @keyframes för en rörelse (en per led). Namnen får prefixet `prefix`. */
export function keyframesCss(prefix: string, m: Motion): string {
  const fr = frames(m)
  const feet = footMode(m)
  return PARTS.map((part) => {
    const steps = fr.map((f) => `${+f.at.toFixed(2)}%{transform:${transformFor(part, f.pose, f.root, feet)}}`).join("")
    return `@keyframes ${prefix}-${part}{${steps}}`
  }).join("\n")
}

/** Golvet i bilden (y). */
export const FLOOR = 186

function sceneBox(it: SceneItem, m: Motion): { x0: number; y0: number; x1: number; y1: number } | null {
  if (it.kind === "benchrear") {
    const r = rearPoint(m)
    return { x0: r.x - 26, y0: r.y + 4, x1: r.x + 14, y1: r.y + 11 }
  }
  if ("at" in it) {
    const g = gripPoint(m)
    switch (it.kind) {
      case "pullup":
        return { x0: g.x - 40, y0: g.y - 8, x1: g.x + 6, y1: g.y + 4 }
      case "dip":
        return { x0: g.x - 34, y0: g.y - 4, x1: g.x + 8, y1: g.y + 4 }
      case "lowbar":
        return { x0: g.x - 6, y0: g.y - 6, x1: g.x + 6, y1: g.y + 6 }
      case "sledpush":
        return { x0: g.x - 4, y0: g.y - 4, x1: g.x + 52, y1: g.y + 4 }
      case "benchgrip":
        return { x0: g.x - 40, y0: g.y, x1: g.x + 4, y1: g.y + 8 }
    }
  }
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
  const feet = footMode(m)
  for (const { pose, root } of frames(m)) {
    const j = joints(pose, feet)
    for (const [name, pt] of Object.entries(j)) {
      const w = add(rot(pt, m.body ?? 0), root)
      grow(ORIGIN.x + w.x, ORIGIN.y + w.y, name === "head" ? SEG.head + 2 : name.startsWith("hand") && m.hand && m.hand !== "none" ? 14 : 6)
    }
  }
  for (const it of m.scene ?? []) {
    const b = sceneBox(it, m)
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
    Object.values(joints(pose, footMode(m))).some((pt) => {
      const w = add(rot(pt, m.body ?? 0), root)
      const x = (ORIGIN.x + w.x) * f.scale + f.dx
      const y = (ORIGIN.y + w.y) * f.scale + f.dy
      return x < margin || x > 200 - margin || y < margin || y > FLOOR + 2
    })
  )
}
