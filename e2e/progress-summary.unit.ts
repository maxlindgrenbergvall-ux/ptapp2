// Enhetstest för Framstegs-korten (v40): Viktnedgång / Tappat fett och Ökad muskelmassa.
//   npx tsx --tsconfig tsconfig.json e2e/progress-summary.unit.ts
import { addDays } from "@/lib/date"
import { adaptiveProjection } from "@/lib/goals/adaptive"
import { progressSummary } from "@/lib/goals/progress-summary"
import type { GoalProfile, ScheduledWorkout } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}

const today = "2026-11-03"
const goal: GoalProfile = {
  clientId: "c1",
  goals: ["weight_loss"],
  sex: "male",
  birthYear: 1994,
  heightCm: 180,
  startWeightKg: 90,
  currentWeightKg: 90,
  targetWeightKg: 82,
  activity: "moderate",
  weeklyChangeKg: -0.5,
  startedAt: addDays(today, -42),
  targets: { kcal: 2400, protein: 180, carbs: 230, fat: 70 },
}
const lift = (date: string): ScheduledWorkout => ({
  id: `w-${date}`,
  clientId: "c1",
  templateId: null,
  name: "Ben",
  date,
  status: "completed",
  exercises: [{ id: `x-${date}`, exerciseId: "e-squat", sets: 3, reps: "8", restSec: 120 }],
  logs: [0, 1, 2].map((i) => ({ workoutExerciseId: `x-${date}`, setIndex: i, kg: 80, reps: 8, done: true })),
})
const proj = (g: GoalProfile, weightLog: { date: string; kg: number }[], workouts: ScheduledWorkout[] = []) =>
  adaptiveProjection({ goal: g, weightLog, activities: [], activityDays: [], workouts, today })

// ---- viktnedgång: faktiska vägningar, kvar till målvikten ---
const log = [{ date: addDays(today, -1), kg: 86 }]
const a = progressSummary(goal, log, proj(goal, log))
check(a.fat.title === "Viktnedgång" && a.fat.value === "−4 kg" && !a.fat.estimated, `viktnedgång: ${a.fat.value}`)
check(a.fat.detail === "4 kg kvar till 82 kg" && a.fat.progress === 0.5 && a.fat.trend === "good", `kvar till målvikten (${a.fat.detail}, ${a.fat.progress})`)
check(a.muscle.title === "Ökad muskelmassa" && a.muscle.estimated && /kg$/.test(a.muscle.value), `muskelmassa: beräknad (${a.muscle.value} · ${a.muscle.detail})`)
const reached = [{ date: today, kg: 81.5 }]
const b = progressSummary(goal, reached, proj(goal, reached))
check(b.fat.detail === "Målvikten 82 kg är nådd!" && b.fat.progress === 1, "målvikten nådd")

// ---- muskelmål: Tappat fett (beräknat) + muskeltillväxt som följer träningen ---
const mg: GoalProfile = { ...goal, goals: ["muscle_gain"], weeklyChangeKg: 0.25, targetWeightKg: 95 }
const workouts = Array.from({ length: 12 }, (_, i) => lift(addDays(today, -2 - i * 3)))
const c = progressSummary(mg, [], proj(mg, [], workouts))
check(c.fat.title === "Tappat fett" && c.fat.estimated, `annat mål än viktnedgång: Tappat fett (${c.fat.value} · ${c.fat.detail})`)
check(c.muscle.value.startsWith("+") && c.muscle.trend === "good", `muskelmål med träning: ökning (${c.muscle.value})`)
check(/pass\/vecka|enligt planen/.test(c.muscle.detail), `muskelkortet anger träningsunderlaget (${c.muscle.detail})`)

// ---- utan mål: bara vägningarna ---
const none = progressSummary(undefined, [{ date: "2026-10-01", kg: 80 }, { date: "2026-11-01", kg: 78.6 }], null)
check(none.fat.value === "−1,4 kg" && none.fat.trend === "good" && none.muscle.value === "–", `utan mål: ${none.fat.value}, muskel –`)
const empty = progressSummary(undefined, [], null)
check(empty.fat.value === "–" && /Logga din vikt/.test(empty.fat.detail), "utan vägningar: uppmaning att logga")

console.log(failed ? `\n${failed} fel` : "\nFRAMSTEGSKORTEN GODKÄNDA")
process.exit(failed ? 1 : 0)
