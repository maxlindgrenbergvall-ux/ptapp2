// Enhetstest för styrkestatistiken (v39): bara faktiska lyft – inga uppskattade maxlyft.
//   npx tsx --tsconfig tsconfig.json e2e/lifts.unit.ts
import * as training from "@/lib/training"
import { exerciseHistory, heavierSet, topSetSeries } from "@/lib/training"
import type { ScheduledWorkout } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const w = (date: string, sets: [number, number][], ex = "e-squat"): ScheduledWorkout => ({
  id: `w-${date}`,
  clientId: "c1",
  templateId: null,
  name: "Ben",
  date,
  status: "completed",
  exercises: [{ id: `x-${date}`, exerciseId: ex, sets: sets.length, reps: "5", restSec: 120 }],
  logs: sets.map(([kg, reps], i) => ({ workoutExerciseId: `x-${date}`, setIndex: i, kg, reps, done: true })),
})

check(!Object.keys(training).some((k) => /one.?rep|1rm|e1rm|epley|brzycki|relative/i.test(k)), `inga maxlyft-funktioner exporteras (${Object.keys(training).length} exporter)`)
check(heavierSet({ kg: 100, reps: 5 }, { kg: 102.5, reps: 3 }).kg === 102.5, "tyngre vikt vinner")
check(heavierSet({ kg: 100, reps: 5 }, { kg: 100, reps: 6 }).reps === 6, "lika vikt: flest reps vinner")
check(heavierSet({ kg: 100, reps: 8 }, { kg: 95, reps: 12 }).kg === 100, "fler reps på lägre vikt räknas inte som tyngre (ingen omräkning)")

const hist = [w("2026-10-01", [[90, 8], [100, 5], [100, 4]]), w("2026-10-08", [[100, 6]]), w("2026-10-15", [[95, 10]]), w("2026-10-22", [[105, 3]])]
const series = topSetSeries("e-squat", hist)
check(series.map((p) => `${p.kg}×${p.reps}`).join(" ") === "100×5 100×6 95×10 105×3", `tyngsta set per pass: ${series.map((p) => `${p.kg}×${p.reps}`).join(", ")}`)
const sessions = exerciseHistory("e-squat", hist).reverse()
check(sessions.map((s) => s.isPR).join(",") === "false,true,false,true", "personbästa: samma vikt fler reps (100×6) och tyngre (105×3) – inte 95×10")
check(sessions[0].topSet?.kg === 100 && sessions[0].topSet.reps === 5 && sessions[0].volume === 90 * 8 + 100 * 5 + 100 * 4, "tillfället: tyngsta set och volym ur faktiska set")
check(sessions.every((s) => !("e1rm" in s)), "inga e1RM-fält i historiken")

check(!("liftKpis" in training) && !("weeklySetsByMuscle" in training), "v40: lyft-KPI:er och veckovolym är borttagna")

console.log(failed ? `\n${failed} fel` : "\nLYFTEN GODKÄNDA (bara faktiska lyft)")
process.exit(failed ? 1 : 0)
