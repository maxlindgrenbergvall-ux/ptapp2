// Enhetstest för progressiv överbelastning (src/lib/progression.ts).
//   npx tsx --tsconfig tsconfig.json e2e/progression.unit.ts
import { AUTO_INCREMENT_KG, nextTarget, parseRepRange, setPlan, weightIncrement } from "@/lib/progression"
import type { ScheduledWorkout } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

let n = 0
const session = (date: string, exerciseId: string, sets: [number, number][]): ScheduledWorkout => {
  const id = `w${++n}`
  return {
    id,
    clientId: "c1",
    templateId: null,
    name: "Pass",
    date,
    status: "completed",
    exercises: [{ id: `${id}-e`, exerciseId, sets: sets.length, reps: "8", restSec: 120 }],
    logs: sets.map(([kg, reps], i) => ({ workoutExerciseId: `${id}-e`, setIndex: i, kg, reps, done: true })),
  } as ScheduledWorkout
}
const barbell = { equipment: "Skivstång", muscleGroup: "ben" as const }

// Repintervall
check(same(parseRepRange("8–10"), { min: 8, max: 10 }) && same(parseRepRange("6-8"), { min: 6, max: 8 }), "intervall 8–10 och 6-8")
check(same(parseRepRange("8"), { min: 6, max: 8 }), "fast mål 8 = 6–8 (målet är taket)")
check(same(parseRepRange("5"), { min: 4, max: 5 }) && same(parseRepRange("3"), { min: 3, max: 3 }), "5 → 4–5, 3 → 3")
check(parseRepRange("AMRAP") === null && parseRepRange("500 m") === null && parseRepRange("30 s") === null, "AMRAP, distans och tid är inte reps")
// Viktsteg
check(weightIncrement("Skivstång") === 2.5 && weightIncrement("Hantlar") === 2 && weightIncrement("Kettlebell") === 4, "steg: skivstång 2,5, hantlar 2, kettlebell 4")
check(weightIncrement("Maskin", "ben") === 5 && weightIncrement("Kabel", "rygg") === 2.5 && weightIncrement("Kroppsvikt") === 0, "maskin ben 5, kabel 2,5, kroppsvikt = reps")

// v63: automatisk viktökning – förra toppsetet + 1,25 kg, samma reps (inom intervallet).
check(AUTO_INCREMENT_KG === 1.25, "automatisk ökning: 1,25 kg")
const rdl = { exerciseId: "e-rdl", reps: "8" }
const t1 = nextTarget(rdl, [session("2026-11-01", "e-rdl", [[130, 8], [135, 8], [140, 8]])], barbell)!
check(t1.kind === "increase_weight" && t1.kg === 141.25 && t1.reps === 8 && t1.deltaKg === 1.25, `140 × 8 → ${t1.kg} × ${t1.reps} (+${t1.deltaKg} kg)`)
check(/1,25 kg/.test(t1.reason) && /140 kg × 8/.test(t1.reason), `förklaring: "${t1.reason}"`)
const t2 = nextTarget(rdl, [session("2026-11-04", "e-rdl", [[142.5, 6]])], barbell)!
check(t2.kg === 143.75 && t2.reps === 6, `142,5 × 6 → ${t2.kg} × ${t2.reps}`)
// Under intervallet: vikten ökar ändå 1,25 kg, reps-målet blir golvet.
const t3 = nextTarget(rdl, [session("2026-11-04", "e-rdl", [[142.5, 4]])], barbell)!
check(t3.kg === 143.75 && t3.reps === 6, `142,5 × 4 → ${t3.kg} × ${t3.reps}`)
// Senaste passet gäller, inte äldre.
const t4 = nextTarget(rdl, [session("2026-11-07", "e-rdl", [[100, 8]]), session("2026-11-04", "e-rdl", [[142.5, 5]])], barbell)!
check(t4.kg === 101.25, `senaste passet avgör: ${t4.kg} kg`)
// Hantlar: samma +1,25 kg.
const t5 = nextTarget({ exerciseId: "e-db", reps: "8–12" }, [session("2026-11-01", "e-db", [[24, 12]])], { equipment: "Hantlar" })!
check(t5.kg === 25.25 && t5.reps === 12, `hantlar 24 × 12 → ${t5.kg} × ${t5.reps}`)
// Kroppsvikt: fler reps.
const t6 = nextTarget({ exerciseId: "e-pull", reps: "6–10" }, [session("2026-11-01", "e-pull", [[0, 9]])], { equipment: "Kroppsvikt" })!
check(t6.kind === "bodyweight" && t6.reps === 10 && t6.kg === 0, "chins 9 reps → 10 reps")
// Ingen historik: PT:ns startvikt, annars inget förslag.
check(nextTarget({ exerciseId: "e-x", reps: "8", targetKg: 60 }, [], barbell)?.kind === "start", "ny övning med PT:ns startvikt")
check(nextTarget({ exerciseId: "e-x", reps: "8" }, [], barbell) === null, "ny övning utan startvikt: inget mål")

// v34: raka set – ingen automatisk stegring i vikt mellan seten.
const plan = setPlan({ sets: 3, reps: "8" }, t1)
check(plan.every((s) => s.kg === 141.25 && s.reps === 8), `alla set på målet: ${plan.map((s) => `${s.kg}×${s.reps}`).join(", ")}`)
check(new Set(plan.map((s) => s.kg)).size === 1, "ingen stegring mellan seten")
const own = setPlan({ sets: 3, reps: "8", setReps: ["12", "10", "6"] }, t1)
check(own.map((s) => s.reps).join("/") === "12/10/6" && own.every((s) => s.kg === 141.25), `PT:ns reps per set behålls, samma vikt: ${own.map((s) => `${s.kg}×${s.reps}`).join(", ")}`)
check(same(setPlan({ sets: 5, reps: "8" }, t1).map((s) => s.kg), [141.25, 141.25, 141.25, 141.25, 141.25]), "fem set: raka set på målet")

if (failed) {
  console.log(`${failed} test misslyckades`)
  process.exit(1)
}
console.log("PROGRESSIONEN GODKÄND")
