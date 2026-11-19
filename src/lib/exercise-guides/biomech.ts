/**
 * Biomekaniska kontroller för guide-atleten (v62). Används av enhetstestet
 * (e2e/exercise-guides.unit.ts) för att hålla animationerna trovärdiga:
 *
 *   - Balans: tyngdpunkten (inklusive redskapet) ligger över stödytan
 *     (häl → tå) i varje bildruta för stående övningar.
 *   - Stångbana: skivstången går lodrätt över mittfoten i knäböj, marklyft,
 *     press m.fl. (där stången ska vara över mittfoten).
 *   - Golvkontakt: fötterna går inte igenom golvet och svävar inte.
 */
import { footMode, frames, joints, type Joints, type Motion } from "@/lib/exercise-guides/figure"

type Pt = { x: number; y: number }
const rad = (d: number) => (d * Math.PI) / 180
const rot = (p: Pt, deg: number): Pt => ({ x: p.x * Math.cos(rad(deg)) - p.y * Math.sin(rad(deg)), y: p.x * Math.sin(rad(deg)) + p.y * Math.cos(rad(deg)) })

/** Ledernas världsläge per bildruta. */
export function worldFrames(m: Motion): { at: number; j: Joints }[] {
  const feet = footMode(m)
  return frames(m).map(({ at, pose, root }) => {
    const j = joints(pose, feet)
    const w = Object.fromEntries(Object.entries(j).map(([k, p]) => {
      const r = rot(p, m.body ?? 0)
      return [k, { x: r.x + root.x, y: r.y + root.y }]
    })) as unknown as Joints
    return { at, j: w }
  })
}

import { comX, loadOf } from "@/lib/exercise-guides/figure"
export { comX, loadOf }

/**
 * Stödytan (x) i bildrutan: den förankrade foten bär alltid (plant: häl → tå,
 * hälen uppe: framfoten), den bortre foten när den står på samma höjd eller är
 * planterad (bakre foten i utfall, på bänken i split squat).
 */
export function support(j: Joints, m: Pick<Motion, "plant">, tol = 1.5): [number, number] {
  const xs: number[] = []
  const foot = (heel: Pt, toe: Pt, sole: number) => {
    if (Math.abs(heel.y - sole) <= tol && Math.abs(toe.y - sole) <= tol) xs.push(heel.x, toe.x)
    else xs.push(toe.x - 4, toe.x)
  }
  const sole = Math.max(j.heel.y, j.toe.y)
  foot(j.heel, j.toe, sole)
  if (m.plant || Math.abs(Math.max(j.heelB.y, j.toeB.y) - sole) <= tol) foot(j.heelB, j.toeB, Math.max(j.heelB.y, j.toeB.y))
  return [Math.min(...xs), Math.max(...xs)]
}

/** Fristående stående övning (balansen ska gå ihop av egen kraft). */
export function freeStanding(m: Motion): boolean {
  return (m.anchor === "feet" || m.anchor === "toes") && !m.body && !m.supported && !m.ground
}

/** Största avvikelse (enheter) mellan tyngdpunkten och stödytan över alla bildrutor. */
export function balanceError(m: Motion): number {
  return Math.max(
    ...worldFrames(m).map(({ j }) => {
      const [a, b] = support(j, m)
      const c = comX(j, loadOf(m))
      return Math.max(a - c, c - b, 0)
    })
  )
}

export const midfoot = (j: Joints) => (j.heel.x + j.toe.x) / 2
