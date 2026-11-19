/**
 * Rörelserna (v60) – poser för guide-atleten, en per rörelsemönster.
 * Vinklarna förklaras i figure.ts. Varje förinlagd övning pekar på en
 * rörelse och en uppsättning utförandesteg (guides.ts).
 */
import { legIk, type Motion, type Pose, SEG } from "@/lib/exercise-guides/figure"

const P = (p: Partial<Pose>): Pose => ({ t: 0, h: 0, k: 0, s: 0, e: 0, ...p })

/**
 * Armen till en punkt (invers kinematik, armbågen bakom stången och böjd
 * framåt – aldrig översträckt): handen `x` framför
 * och `y` under axeln (kroppens ram, y nedåt) vid bållutningen `t`. Ger s och e.
 * Används där stången ska gå nära kroppen (upright row, frivändningens högdrag).
 */
const armTo = (t: number, x: number, y: number): { s: number; e: number } => {
  const L1 = SEG.upperArm, L2 = SEG.forearm
  const D = Math.min(Math.hypot(x, y), L1 + L2 - 0.01)
  const deg = (r: number) => (r * 180) / Math.PI
  const phi = deg(Math.atan2(x, y))
  const alpha = deg(Math.acos((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)))
  const a1 = phi - alpha
  const elbow = { x: Math.sin((a1 * Math.PI) / 180) * L1, y: Math.cos((a1 * Math.PI) / 180) * L1 }
  const a2 = deg(Math.atan2(x - elbow.x, y - elbow.y))
  // Armbågsvinkeln i (−180, 180] (atan2 slår om vid ±180°).
  const e = ((((a2 - a1) % 360) + 540) % 360) - 180
  return { s: +(a1 + t).toFixed(1), e: +e.toFixed(1) }
}
/** Stången på övre ryggen, strax bakom axeln (knäböj, good morning). */
const BACK_BAR = { s: -50, e: 186 }
/** Stången i "racken" på främre axeln, armbågarna högt (frontböj, press, frivändning). */
const RACK = { s: 70, e: 160 }
/** Marklyftets startläge (stången över mittfoten mot smalbenen, höften över knäna) – löst med track "hang". */
const PULL_START = { t: 58, h: 84, k: 96, s: 54 }
/**
 * Glute bridge (rygg i golvet): bålen lyfts `lift` grader med skulderbladen kvar
 * i golvet och fötterna stilla – höft och knä löses med invers kinematik.
 * Armarna ligger längs sidorna i golvet.
 */
const bridge = (lift: number): Pose => {
  const FOOT = { x: 30, y: 4 } // fotleden relativt bäckenet i liggande startläge
  const t = -(90 + lift)
  const sh = { x: Math.sin((t * Math.PI) / 180) * SEG.torso, y: -Math.cos((t * Math.PI) / 180) * SEG.torso }
  // Axeln står still i golvet: bäckenet flyttas dit axeln inte rör sig.
  const pelvis = { x: -SEG.torso - sh.x, y: -sh.y }
  const leg = legIk({ x: FOOT.x - pelvis.x, y: FOOT.y - pelvis.y })
  return P({ t, h: +leg.h.toFixed(1), k: +leg.k.toFixed(1), s: 90 + t, e: 0 })
}

/** Plankläge på raka armar, händer och tår i golvet (burpee, broad jump). */
const PLANK = { t: 68, h: -68, k: 0, s: 68, e: 0 }
const FLOOR = { kind: "bench", x: 0, y: 0, w: 0 } as const

export const MOTIONS = {
  // ------------------------------------------------------------ ben ---
  squat: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "barbell", track: { kind: "bar" }, poses: [P({ t: 4, ...BACK_BAR }), P({ t: 40, h: 100, k: 130, ...BACK_BAR })] },
  front_squat: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "barbell", track: { kind: "bar" }, poses: [P({ t: 2, ...RACK }), P({ t: 22, h: 102, k: 134, ...RACK })] },
  goblet_squat: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "kettlebell", track: { kind: "bar" }, poses: [P({ s: 20, e: 135 }), P({ t: 24, h: 102, k: 132, s: 28, e: 135 })] },
  machine_squat: {
    supported: true,
    mode: "alternate",
    duration: 2.6,
    anchor: "feet",
    hand: "none",
    poses: [P({ t: -8, s: -30, e: 140 }), P({ t: 10, h: 100, k: 115, s: -30, e: 140 })],
    scene: [{ kind: "machine", x: 70, y: 40, w: 14, h: 146 }],
  },
  leg_press: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hips",
    hand: "none",
    feet: "shin",
    poses: [P({ t: -55, h: 120, k: 120, s: 20, e: 30 }), P({ t: -55, h: 105, k: 15, s: 20, e: 30 })],
    scene: [{ kind: "bench", x: 52, y: 108, w: 56, tilt: -35 }, { kind: "machine", x: 150, y: 30, w: 10, h: 70 }],
  },
  lunge: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "dumbbell", plant: { dx: 62 }, poses: [P({ t: 2, h: 24, k: 6, fb: 40 }), P({ t: 4, h: 84, k: 86, fb: 62 })] },
  loaded_lunge: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "none", plant: { dx: 62 }, poses: [P({ t: 2, h: 24, k: 6, fb: 40, ...BACK_BAR }), P({ t: 4, h: 84, k: 86, fb: 62, ...BACK_BAR })] },
  split_squat: {
    mode: "alternate",
    duration: 2.6,
    anchor: "feet",
    hand: "dumbbell",
    // Bakre foten på bänken (vristen vilar på dynan), främre benet böjer.
    plant: { dx: 60, dy: -40 },
    poses: [P({ t: 8, h: 18, k: 4, fb: 100 }), P({ t: 16, h: 86, k: 90, fb: 100 })],
    scene: [{ kind: "benchrear", at: "rear" }],
  },
  step_up: {
    mode: "alternate",
    duration: 2.6,
    anchor: "feet",
    hand: "dumbbell",
    // Främre foten på lådan, bakre trycker från golvet och följer med upp.
    plant: { dx: 30, dy: 36 },
    poses: [P({ t: 14, h: 80, k: 95, fb: 20 }), P({ t: 2, h: 0, k: 0, fb: 40 })],
    scene: [{ kind: "box", x: 108, y: 150, w: 44, h: 36 }],
  },
  pistol: { mode: "alternate", duration: 3, anchor: "feet", hand: "none", poses: [P({ s: 80, hb: 20 }), P({ t: 40, h: 108, k: 140, s: 95, hb: 90, kb: 0 })] },
  wall_sit: {
    supported: true,
    mode: "alternate",
    duration: 3.2,
    anchor: "feet",
    hand: "none",
    poses: [P({ h: 90, k: 90, s: 10 }), P({ h: 90, k: 90, s: 14, y: -1 })],
    scene: [{ kind: "machine", x: 76, y: 20, w: 8, h: 166 }],
  },
  leg_extension: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    hand: "none",
    feet: "shin",
    poses: [P({ t: -6, h: 90, k: 95, s: 10, e: 20 }), P({ t: -6, h: 90, k: 5, s: 10, e: 20 })],
    scene: [{ kind: "bench", x: 70, y: 108, w: 40 }],
  },
  seated_leg_curl: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    hand: "none",
    feet: "shin",
    poses: [P({ t: -8, h: 90, k: 5, s: 10, e: 20 }), P({ t: -8, h: 90, k: 105, s: 10, e: 20 })],
    scene: [{ kind: "bench", x: 70, y: 108, w: 40 }],
  },
  lying_leg_curl: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    body: 90,
    hand: "none",
    poses: [P({ s: 160, e: 20, y: -8 }), P({ s: 160, e: 20, k: 115, y: -8 })],
    scene: [{ kind: "bench", x: 40, y: 104, w: 120 }],
  },
  nordic: {
    supported: true,
    mode: "alternate",
    duration: 3,
    anchor: "feet",
    hand: "none",
    poses: [P({ k: 90, s: 20, e: 60 }), P({ t: 55, h: 55, k: 145, s: 80, e: 20 })],
  },
  hinge: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "barbell", track: { kind: "hang", arm: 4 }, poses: [P({ k: 8 }), P({ t: 70, h: 44, k: 48 })] },
  good_morning: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "barbell", track: { kind: "bar" }, poses: [P({ k: 8, ...BACK_BAR }), P({ t: 70, h: 42, k: 46, ...BACK_BAR })] },
  deadlift: { mode: "alternate", duration: 2.8, anchor: "feet", hand: "barbell", track: { kind: "hang", arm: 4 }, poses: [P(PULL_START), P({ k: 4 })] },
  hip_thrust: {
    supported: true,
    mode: "alternate",
    duration: 2.4,
    anchor: "feet",
    hand: "barbell",
    poses: [P({ t: -70, h: 40, k: 105, s: -20, e: 30 }), P({ t: -92, h: 88, k: 92, s: -10, e: 20 })],
    scene: [{ kind: "bench", x: 40, y: 104, w: 30 }],
  },
  glute_bridge: {
    supported: true,
    mode: "alternate",
    duration: 2.4,
    anchor: "feet",
    hand: "none",
    // Skulderbladen i golvet, armarna längs sidorna, höften pressas upp.
    poses: [bridge(0), bridge(26)],
  },

  kb_swing: { mode: "alternate", duration: 1.6, anchor: "feet", hand: "kettlebell", poses: [P({ t: 58, h: 42, k: 52, s: 40 }), P({ t: 12, h: 6, k: 10, s: 40 }), P({ t: -6, k: 2, s: 92 })] },
  calf_raise: { mode: "alternate", duration: 1.8, anchor: "toes", hand: "dumbbell", poses: [P({ h: -3, t: 3 }), P({ f: 38, h: -7, t: 7 })] },
  seated_calf: {
    mode: "alternate",
    duration: 1.8,
    anchor: "hips",
    hand: "none",
    poses: [P({ h: 90, k: 90, s: 40, e: 60 }), P({ h: 84, k: 90, s: 40, e: 60 })],
    scene: [{ kind: "bench", x: 70, y: 108, w: 40 }],
  },
  seated_machine: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    hand: "none",
    poses: [P({ t: -6, h: 90, k: 90, s: 25, e: 40 }), P({ t: -2, h: 84, k: 86, s: 25, e: 40 })],
    scene: [{ kind: "bench", x: 70, y: 108, w: 40 }, { kind: "machine", x: 58, y: 40, w: 10, h: 70 }],
  },
  back_extension: {
    mode: "alternate",
    duration: 2.4,
    anchor: "feet",
    body: 45,
    hand: "none",
    poses: [P({ t: 70, s: 150, e: 140 }), P({ t: 0, s: 150, e: 140 })],
    scene: [{ kind: "bench", x: 104, y: 118, w: 26, tilt: 45 }],
  },
  // ------------------------------------------------------------ drag ---
  bent_row: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "barbell", poses: [P({ t: 55, h: 38, k: 46, s: 55 }), P({ t: 55, h: 38, k: 46, s: -8, e: 88 })] },
  db_row: {
    mode: "alternate",
    duration: 2.2,
    anchor: "feet",
    hand: "dumbbell",
    poses: [P({ t: 74, h: 38, k: 44, s: 74, sb: 74 }), P({ t: 74, h: 38, k: 44, s: 4, e: 86, sb: 74 })],
    scene: [{ kind: "bench", x: 116, y: 128, w: 40 }],
  },
  seated_row: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    hand: "handle",
    poses: [P({ t: 12, h: 85, k: 25, s: 100 }), P({ t: -8, h: 85, k: 25, s: 25, e: 70 })],
    scene: [{ kind: "pulley", x: 186, y: 84 }],
  },
  pull_up: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hands",
    hand: "none",
    poses: [P({ h: 10, k: 50, s: 178 }), P({ t: -6, h: 14, k: 55, s: 28, e: 150 })],
    scene: [{ kind: "pullup", at: "hand" }],
  },
  pulldown: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hips",
    hand: "handle",
    poses: [P({ t: -6, h: 90, k: 90, s: 172 }), P({ t: -16, h: 90, k: 90, s: 34, e: 140 })],
    scene: [{ kind: "pulley", x: 100, y: 6 }, { kind: "bench", x: 70, y: 108, w: 40 }],
  },
  straight_arm: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "handle", poses: [P({ t: 25, h: 10, k: 15, s: 150 }), P({ t: 25, h: 10, k: 15, s: 30 })], scene: [{ kind: "pulley", x: 180, y: 20 }] },
  inverted_row: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hands",
    body: -72,
    hand: "none",
    poses: [P({ s: 90 }), P({ s: 30, e: 100 })],
    scene: [{ kind: "lowbar", at: "hand" }],
  },
  shrug: { mode: "alternate", duration: 1.6, anchor: "hips", hand: "barbell", poses: [P({}), P({ y: -5, s: 2 })] },
  face_pull: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "handle", poses: [P({ t: -4, s: 95 }), P({ t: -6, s: 95, e: 125 })], scene: [{ kind: "pulley", x: 186, y: 50 }] },
  reverse_fly: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "dumbbell", poses: [P({ t: 55, h: 34, k: 44, s: 55, e: 10 }), P({ t: 55, h: 34, k: 44, s: 20, e: 40 })] },
  // ---------------------------------------------------------- tryck ---
  bench_press: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hips",
    body: -90,
    hand: "barbell",
    poses: [P({ h: 5, k: 95, s: 92, x: -10, y: -12 }), P({ h: 5, k: 95, s: 28, e: 68, x: -10, y: -12 })],
    scene: [{ kind: "bench", x: 40, y: 98, w: 80 }],
  },
  incline_press: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hips",
    body: -55,
    hand: "dumbbell",
    poses: [P({ h: 35, k: 90, s: 95, x: -4, y: -8 }), P({ h: 35, k: 90, s: 28, e: 70, x: -4, y: -8 })],
    scene: [{ kind: "bench", x: 44, y: 96, w: 60, tilt: -35 }],
  },
  fly: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hips",
    body: -90,
    hand: "dumbbell",
    poses: [P({ h: 5, k: 95, s: 92, e: 12, x: -10, y: -12 }), P({ h: 5, k: 95, s: 12, e: 22, x: -10, y: -12 })],
    scene: [{ kind: "bench", x: 40, y: 98, w: 80 }],
  },
  chest_press: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    hand: "handle",
    poses: [P({ t: -10, h: 90, k: 90, s: 35, e: 100 }), P({ t: -10, h: 90, k: 90, s: 90, e: 0 })],
    scene: [{ kind: "bench", x: 70, y: 108, w: 40 }, { kind: "machine", x: 56, y: 40, w: 10, h: 70 }],
  },
  push_up: { mode: "alternate", duration: 2.2, anchor: "toes", body: 90, hand: "none", track: { kind: "plank" }, poses: [P({ s: 90 }), P({ s: 34, e: 70 })] },
  dip: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hands",
    hand: "none",
    poses: [P({ t: 6, h: 10, k: 70, s: 6 }), P({ t: 22, h: 14, k: 70, s: -62, e: 92 })],
    scene: [{ kind: "dip", at: "hand" }],
  },
  bench_dip: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hands",
    hand: "none",
    feet: "shin",
    poses: [P({ h: 85, k: 10, s: -20 }), P({ t: 4, h: 85, k: 10, s: -70, e: 85 })],
    scene: [{ kind: "benchgrip", at: "hand" }],
  },
  overhead_press: { mode: "alternate", duration: 2.4, anchor: "feet", hand: "barbell", track: { kind: "bar" }, poses: [P({ ...RACK }), P({ t: -3, s: 176 })] },
  push_press: { mode: "alternate", duration: 1.8, anchor: "feet", hand: "barbell", track: { kind: "bar" }, poses: [P({ ...RACK }), P({ h: 22, k: 38, ...RACK }), P({ t: -3, s: 176 })] },
  db_press: { mode: "alternate", duration: 2.4, anchor: "feet", hand: "dumbbell", track: { kind: "bar" }, poses: [P({ s: 75, e: 140 }), P({ s: 172, e: 6 })] },
  seated_press: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hips",
    hand: "dumbbell",
    poses: [P({ t: -4, h: 90, k: 90, s: 75, e: 128 }), P({ t: -4, h: 90, k: 90, s: 172, e: 6 })],
    scene: [{ kind: "bench", x: 70, y: 108, w: 40 }],
  },
  landmine: { supported: true, mode: "alternate", duration: 2.2, anchor: "feet", hand: "barbell", poses: [P({ t: 8, h: 10, k: 15, s: 60, e: 120 }), P({ t: 12, h: 10, k: 15, s: 140, e: 0 })] },
  handstand_pu: { mode: "alternate", duration: 2.4, anchor: "hands", body: 180, hand: "none", poses: [P({ s: 180 }), P({ s: 140, e: 88 })] },
  raise: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "dumbbell", poses: [P({ s: 4, e: 10 }), P({ s: 88, e: 10 })] },
  upright_row: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "barbell", poses: [P(armTo(0, 4, 57)), P(armTo(0, 8, 30)), P(armTo(0, 9, 4))] },
  // ---------------------------------------------------------- armar ---
  curl: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "dumbbell", poses: [P({ s: 4 }), P({ s: 12, e: 138 })] },
  barbell_curl: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "barbell", poses: [P({ s: 4 }), P({ s: 12, e: 138 })] },
  pushdown: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "handle", poses: [P({ t: 8, s: 6, e: 110 }), P({ t: 8, s: 6, e: 4 })], scene: [{ kind: "pulley", x: 132, y: 12 }] },
  overhead_ext: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "dumbbell", poses: [P({ s: 172, e: 135 }), P({ s: 172, e: 4 })] },
  skull_crusher: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    body: -90,
    hand: "barbell",
    poses: [P({ h: 5, k: 95, s: 100, e: 4, x: -10, y: -12 }), P({ h: 5, k: 95, s: 100, e: 112, x: -10, y: -12 })],
    scene: [{ kind: "bench", x: 40, y: 98, w: 80 }],
  },
  kickback: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "dumbbell", poses: [P({ t: 62, h: 20, k: 28, s: -6, e: 66 }), P({ t: 62, h: 20, k: 28, s: -6, e: 2 })] },
  // ------------------------------------------------------------ bål ---
  plank: { mode: "alternate", duration: 3.2, anchor: "toes", body: 90, hand: "none", track: { kind: "plank" }, poses: [P({ s: 90, e: -90 }), P({ s: 90, e: -90, t: -1.5, h: 1.5 })] },
  side_plank: { mode: "alternate", duration: 3.2, anchor: "toes", body: 90, hand: "none", track: { kind: "plank" }, poses: [P({ s: 90, e: -90 }), P({ s: 90, e: -90, t: -2, h: 2 })] },
  dead_bug: {
    mode: "alternate",
    duration: 2.4,
    anchor: "hips",
    body: -90,
    hand: "none",
    poses: [P({ s: 90, sb: 90, h: 90, k: 90, hb: 90, kb: 90, y: 6 }), P({ s: 170, sb: 90, h: 90, k: 90, hb: 15, kb: 5, y: 6 })],
  },
  bird_dog: {
    mode: "alternate",
    duration: 2.6,
    anchor: "hips",
    hand: "none",
    poses: [P({ t: 90, k: 90, s: 90, sb: 90, y: 40 }), P({ t: 90, k: 90, s: 180, sb: 90, hb: -90, kb: 0, y: 40 })],
  },
  hanging_raise: { mode: "alternate", duration: 2.4, anchor: "hands", hand: "none", poses: [P({ s: 178, k: 5 }), P({ s: 178, h: 92, k: 5 })], scene: [{ kind: "pullup", at: "hand" }] },
  knee_raise: { mode: "alternate", duration: 2.2, anchor: "hands", hand: "none", poses: [P({ s: 178, k: 5 }), P({ s: 178, h: 100, k: 110 })], scene: [{ kind: "pullup", at: "hand" }] },
  ab_wheel: {
    mode: "alternate",
    duration: 2.6,
    anchor: "hips",
    hand: "wheel",
    feet: "shin",
    ground: true,
    track: { kind: "plank" },
    // Knäståendes: hjulet under axlarna → rulla ut med rak bål, knäna i golvet.
    poses: [P({ t: 40, h: -10, k: 100, s: 40 }), P({ t: 72, h: -40, k: 130, s: 160 })],
  },
  crunch: { mode: "alternate", duration: 2.2, anchor: "hips", body: -90, hand: "none", poses: [P({ h: 50, k: 110, s: 150, e: 150, y: 70 }), P({ t: 32, h: 50, k: 110, s: 150, e: 150, y: 70 })] },
  cable_crunch: {
    mode: "alternate",
    duration: 2.2,
    anchor: "hips",
    hand: "handle",
    poses: [P({ t: 20, h: 0, k: 90, s: 160, e: 150, y: 38 }), P({ t: 75, h: -10, k: 90, s: 160, e: 150, y: 38 })],
    scene: [{ kind: "pulley", x: 110, y: 8 }],
  },
  russian_twist: { mode: "alternate", duration: 1.6, anchor: "hips", hand: "ball", poses: [P({ t: -38, h: 70, k: 80, s: 80, e: 40, y: 52 }), P({ t: -38, h: 70, k: 80, s: 110, e: 40, y: 52 })] },
  hollow: { mode: "alternate", duration: 3, anchor: "hips", body: -90, hand: "none", poses: [P({ t: 18, h: 25, s: 175, y: 70 }), P({ t: 20, h: 27, s: 172, y: 69 })] },
  pallof: { mode: "alternate", duration: 2.2, anchor: "feet", hand: "handle", poses: [P({ h: 12, k: 18, s: 40, e: 100 }), P({ h: 12, k: 18, s: 90, e: 0 })], scene: [{ kind: "pulley", x: 186, y: 88 }] },
  woodchop: { mode: "alternate", duration: 2, anchor: "feet", hand: "handle", poses: [P({ s: 160, e: 0 }), P({ t: 30, h: 20, k: 35, s: 30, e: 0 })], scene: [{ kind: "pulley", x: 180, y: 16 }] },
  // ------------------------------------------------------- helkropp ---
  clean: { mode: "alternate", duration: 2, anchor: "feet", hand: "barbell", poses: [P(PULL_START), P({ t: -6, s: -4 }), P({ t: -4, k: 4, ...armTo(-4, 6, 40) }), P({ t: -4, k: 6, ...armTo(-4, 8, 22) }), P({ t: 6, h: 24, k: 36, ...armTo(6, 8, 4) }), P({ t: 14, h: 40, k: 58, ...RACK })] },
  snatch: { mode: "alternate", duration: 2, anchor: "feet", hand: "barbell", poses: [P(PULL_START), P({ t: -6, s: -4 }), P({ t: -4, k: 4, ...armTo(-4, 6, 36) }), P({ t: -4, k: 6, ...armTo(-4, 8, 8) }), P({ t: 6, h: 30, k: 44, ...armTo(6, 4, -30) }), P({ t: 10, h: 50, k: 70, ...armTo(10, 2, -50) }), P({ t: 16, h: 70, k: 100, ...armTo(16, 0, -57) })] },
  thruster: { mode: "alternate", duration: 2, anchor: "feet", hand: "barbell", track: { kind: "bar" }, poses: [P({ t: 22, h: 102, k: 134, ...RACK }), P({ t: -3, s: 176 })] },
  kb_clean_press: { mode: "alternate", duration: 2.4, anchor: "feet", hand: "kettlebell", poses: [P({ t: 50, h: 40, k: 60, s: 50 }), P({ s: 60, e: 135 }), P({ s: 176 })] },
  getup: { supported: true, mode: "alternate", duration: 3.4, anchor: "feet", hand: "kettlebell", poses: [P({ t: 4, h: 85, k: 88, hb: -28, kb: 115, s: 176 }), P({ s: 176 })] },
  burpee: {
    mode: "cycle",
    duration: 2.4,
    anchor: "feet",
    hand: "none",
    feet: "shin",
    ground: true,
    poses: [P({}), P({ t: 40, h: 110, k: 135, s: 60 }), P(PLANK), P({ t: 40, h: 110, k: 135, s: 60 }), P({ s: 176, y: -14 })],
  },
  broad_jump: {
    mode: "cycle",
    duration: 2.6,
    anchor: "feet",
    hand: "none",
    feet: "shin",
    ground: true,
    poses: [P({ t: 40, h: 110, k: 135, s: 60 }), P(PLANK), P({ t: 40, h: 110, k: 135, s: 60 }), P({ t: 30, h: 60, k: 30, s: 160, y: -14, x: 18 }), P({ t: 30, h: 90, k: 110, s: -30, x: 30 })],
  },
  box_jump: {
    mode: "cycle",
    duration: 2.2,
    anchor: "feet",
    hand: "none",
    feet: "shin",
    ground: true,
    poses: [P({}), P({ t: 32, h: 70, k: 95, s: -35 }), P({ t: 10, h: 40, k: 30, s: 160, y: -44, x: 22 }), P({ t: 20, h: 70, k: 100, s: 60, y: -40, x: 44 }), P({ y: -40, x: 44 })],
    scene: [{ kind: "box", x: 128, y: 146, w: 46, h: 40 }],
  },
  battle_ropes: { mode: "alternate", duration: 0.7, anchor: "feet", hand: "handle", poses: [P({ t: 20, h: 45, k: 60, s: 40, e: 30, sb: 85 }), P({ t: 20, h: 45, k: 60, s: 85, e: 30, sb: 40 })] },
  mountain_climber: { mode: "alternate", duration: 0.9, anchor: "hips", body: 90, hand: "none", ground: true, track: { kind: "plank" }, poses: [P({ s: 90, h: 85, k: 110, hb: 0, kb: 0 }), P({ s: 90, h: 0, k: 0, hb: 85, kb: 110 })] },
  // ------------------------------------------------------- kondition ---
  run: {
    mode: "cycle",
    feet: "shin",
    ground: true,
    duration: 0.72,
    anchor: "hips",
    hand: "none",
    poses: [
      P({ t: 8, h: 32, k: 18, hb: -22, kb: 100, s: -38, e: 95, sb: 40, eb: 95 }),
      P({ t: 8, h: 0, k: 40, hb: 20, kb: 120, s: 0, e: 95, sb: 0, eb: 95, y: -4 }),
      P({ t: 8, h: -22, k: 100, hb: 32, kb: 18, s: 40, e: 95, sb: -38, eb: 95 }),
      P({ t: 8, h: 20, k: 120, hb: 0, kb: 40, s: 0, e: 95, sb: 0, eb: 95, y: -4 }),
    ],
  },
  hill_run: {
    mode: "cycle",
    feet: "shin",
    ground: true,
    duration: 0.8,
    anchor: "hips",
    hand: "none",
    poses: [
      P({ t: 16, h: 45, k: 35, hb: -15, kb: 90, s: -38, e: 95, sb: 45, eb: 95 }),
      P({ t: 16, h: 10, k: 60, hb: 25, kb: 110, s: 0, e: 95, sb: 0, eb: 95, y: -4 }),
      P({ t: 16, h: -15, k: 90, hb: 45, kb: 35, s: 45, e: 95, sb: -38, eb: 95 }),
      P({ t: 16, h: 25, k: 110, hb: 10, kb: 60, s: 0, e: 95, sb: 0, eb: 95, y: -4 }),
    ],
  },
  walk: {
    mode: "cycle",
    feet: "shin",
    ground: true,
    duration: 1.3,
    anchor: "hips",
    hand: "none",
    poses: [P({ t: 4, h: 22, k: 4, hb: -16, kb: 18, s: -18, e: 15, sb: 18, eb: 15 }), P({ t: 4, h: -16, k: 18, hb: 22, kb: 4, s: 18, e: 15, sb: -18, eb: 15 })],
  },
  carry: {
    mode: "cycle",
    feet: "shin",
    ground: true,
    duration: 1.1,
    anchor: "hips",
    hand: "kettlebell",
    poses: [P({ t: 2, h: 20, k: 6, hb: -14, kb: 20 }), P({ t: 2, h: -14, k: 20, hb: 20, kb: 6 })],
  },
  stairs: {
    mode: "cycle",
    feet: "shin",
    duration: 1.4,
    anchor: "hips",
    hand: "none",
    poses: [P({ t: 10, h: 60, k: 70, hb: -5, kb: 10, s: 20, e: 30, sb: -10 }), P({ t: 10, h: -5, k: 10, hb: 60, kb: 70, s: -10, e: 30, sb: 20 })],
    scene: [{ kind: "machine", x: 120, y: 60, w: 8, h: 126 }],
  },
  bike: {
    mode: "cycle",
    feet: "shin",
    duration: 0.9,
    anchor: "hips",
    hand: "handle",
    poses: [P({ t: 30, h: 50, k: 95, hb: 95, kb: 70, s: 75, e: 20 }), P({ t: 30, h: 75, k: 60, hb: 70, kb: 105, s: 75, e: 20 }), P({ t: 30, h: 95, k: 70, hb: 50, kb: 95, s: 75, e: 20 }), P({ t: 30, h: 70, k: 105, hb: 75, kb: 60, s: 75, e: 20 })],
    scene: [{ kind: "erg", x: 88, y: 106, w: 70 }],
  },
  row_erg: {
    supported: true,
    mode: "cycle",
    duration: 2.2,
    anchor: "feet",
    hand: "handle",
    poses: [P({ t: 25, h: 115, k: 150, s: 75 }), P({ t: -22, h: 88, k: 5, s: 30, e: 85 }), P({ t: 25, h: 115, k: 150, s: 75 })],
    scene: [{ kind: "erg", x: 30, y: 104, w: 150 }],
  },
  ski_erg: { mode: "alternate", duration: 1.6, anchor: "feet", hand: "handle", poses: [P({ t: -4, s: 170, e: 10 }), P({ t: 42, h: 25, k: 40, s: 18, e: 0 })], scene: [{ kind: "machine", x: 150, y: 20, w: 12, h: 166 }] },
  jump_rope: { mode: "alternate", duration: 0.5, anchor: "hips", hand: "handle", feet: "shin", ground: true, poses: [P({ s: 20, e: 40, k: 10, h: 4 }), P({ s: 26, e: 46, y: -7, k: 4 })] },
  swim: {
    mode: "cycle",
    duration: 1.6,
    anchor: "hips",
    body: 90,
    hand: "none",
    poses: [P({ s: 180, sb: 10, h: 8, hb: -8, y: -30 }), P({ s: 90, sb: 100, h: -8, hb: 8, y: -30 }), P({ s: 10, sb: 180, h: 8, hb: -8, y: -30 }), P({ s: 100, sb: 90, h: -8, hb: 8, y: -30 })],
    scene: [{ kind: "water", y: 76 }],
  },
  sled_push: {
    mode: "cycle",
    feet: "shin",
    ground: true,
    duration: 1.2,
    anchor: "hips",
    hand: "none",
    poses: [P({ t: 55, h: 40, k: 50, hb: -35, kb: 30, s: 120, e: 20 }), P({ t: 55, h: -35, k: 30, hb: 40, kb: 50, s: 120, e: 20 })],
    scene: [{ kind: "sledpush", at: "hand" }],
  },
  sled_pull: { supported: true, mode: "alternate", duration: 1.2, anchor: "feet", hand: "none", poses: [P({ t: -14, h: 30, k: 40, s: 95, e: 0, sb: 40, eb: 70 }), P({ t: -14, h: 30, k: 40, s: 40, e: 70, sb: 95, eb: 0 })], scene: [{ kind: "sled", x: 168, y: 146 }] },
  wall_ball: { mode: "alternate", duration: 1.8, anchor: "feet", hand: "ball", track: { kind: "bar" }, poses: [P({ t: 20, h: 100, k: 132, s: 60, e: 120 }), P({ t: -4, s: 165, e: 10 })], scene: [{ kind: "target", x: 168, y: 28 }] },
  sandbag_lunge: { mode: "alternate", duration: 2.6, anchor: "feet", hand: "none", plant: { dx: 62 }, poses: [P({ t: 2, h: 24, k: 6, fb: 40, ...BACK_BAR }), P({ t: 4, h: 84, k: 86, fb: 62, ...BACK_BAR })] },
} satisfies Record<string, Motion>

export type MotionId = keyof typeof MOTIONS
void FLOOR
