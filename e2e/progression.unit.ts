// Enhetstest för progressiv överbelastning (src/lib/progression.ts).
//   npx tsx --tsconfig tsconfig.json e2e/progression.unit.ts
import { nextTarget, parseRepRange, setPlan, weightIncrement } from "@/lib/progression"
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

// Exemplet: 8 reps på 140 kg i RDL → 142,5 kg × 6.
const rdl = { exerciseId: "e-rdl", reps: "8" }
const t1 = nextTarget(rdl, [session("2026-11-01", "e-rdl", [[130, 8], [135, 8], [140, 8]])], barbell)!
check(t1.kind === "increase_weight" && t1.kg === 142.5 && t1.reps === 6 && t1.deltaKg === 2.5, `140 × 8 → ${t1.kg} × ${t1.reps} (+${t1.deltaKg} kg)`)
check(/142,5 kg/.test(t1.reason) && /6 reps/.test(t1.reason), `förklaring: "${t1.reason}"`)
// Inom intervallet: samma vikt, ett rep till.
const t2 = nextTarget(rdl, [session("2026-11-04", "e-rdl", [[142.5, 6]])], barbell)!
check(t2.kind === "add_reps" && t2.kg === 142.5 && t2.reps === 7, `142,5 × 6 → 142,5 × 7`)
// Under golvet en gång: samma vikt.
const t3 = nextTarget(rdl, [session("2026-11-04", "e-rdl", [[142.5, 4]])], barbell)!
check(t3.kind === "repeat" && t3.kg === 142.5 && t3.reps === 6, "4 reps (under golvet) → stanna på vikten")
// Två pass i rad under golvet: avlasta 10 %.
const t4 = nextTarget(rdl, [session("2026-11-07", "e-rdl", [[142.5, 4]]), session("2026-11-04", "e-rdl", [[142.5, 5]])], barbell)!
check(t4.kind === "deload" && t4.kg === 127.5 && t4.reps === 8, `två missar → avlastning till ${t4.kg} kg × ${t4.reps}`)
// Hantlar: steg 2 kg.
const t5 = nextTarget({ exerciseId: "e-db", reps: "8–12" }, [session("2026-11-01", "e-db", [[24, 12]])], { equipment: "Hantlar" })!
check(t5.kg === 26 && t5.reps === 8, "hantlar 24 × 12 → 26 × 8")
// Kroppsvikt: fler reps.
const t6 = nextTarget({ exerciseId: "e-pull", reps: "6–10" }, [session("2026-11-01", "e-pull", [[0, 9]])], { equipment: "Kroppsvikt" })!
check(t6.kind === "bodyweight" && t6.reps === 10 && t6.kg === 0, "chins 9 reps → 10 reps")
// Ingen historik: PT:ns startvikt, annars inget förslag.
check(nextTarget({ exerciseId: "e-x", reps: "8", targetKg: 60 }, [], barbell)?.kind === "start", "ny övning med PT:ns startvikt")
check(nextTarget({ exerciseId: "e-x", reps: "8" }, [], barbell) === null, "ny övning utan startvikt: inget mål")

// Pyramiden upp till toppsetet.
const plan = setPlan({ sets: 3, reps: "8" }, t1)
check(plan.at(-1)!.kg === 142.5 && plan.at(-1)!.reps === 6, "sista setet = toppsetet 142,5 × 6")
check(plan[0].reps === 8 && plan[1].reps === 7 && plan[0].kg < plan[1].kg && plan[1].kg < 142.5, `pyramid: ${plan.map((s) => `${s.kg}×${s.reps}`).join(", ")}`)
check(plan.every((s) => (s.kg * 4) % 10 === 0), "alla vikter i hela 2,5 kg")
const own = setPlan({ sets: 3, reps: "8", setReps: ["12", "10", "6"] }, t1)
check(own[0].reps === 12 && own[2].reps === 6 && own[2].kg === 142.5 && own[0].kg < own[1].kg, `PT:ns reps per set: ${own.map((s) => `${s.kg}×${s.reps}`).join(", ")}`)
check(same(setPlan({ sets: 2, reps: "8" }, t1).map((s) => s.kg), [142.5, 142.5]), "två set: raka set på målet")

if (failed) {
  console.log(`${failed} test misslyckades`)
  process.exit(1)
}
console.log("PROGRESSIONEN GODKÄND")
