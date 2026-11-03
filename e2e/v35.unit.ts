// Enhetstest för v35: tidsbaserad hälsning och målkorten i Framsteg.
//   npx tsx --tsconfig tsconfig.json e2e/v35.unit.ts
import { addDays } from "@/lib/date"
import { dayPart, greeting } from "@/lib/greeting"
import { goalCards } from "@/lib/goals/overview"
import type { GoalProfile, ScheduledWorkout } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m)

// ---------------------------------------------------------- hälsningen ---
check(greeting(dayPart(at(5)), "Sara") === "God morgon Sara", "05:00 → God morgon Sara")
check(greeting(dayPart(at(9, 59)), "Sara") === "God morgon Sara", "09:59 → God morgon")
check(greeting(dayPart(at(10)), "Sara") === "Hej Sara!", "10:00 → Hej Sara!")
check(greeting(dayPart(at(17, 59)), "Sara") === "Hej Sara!", "17:59 → Hej Sara!")
check(greeting(dayPart(at(18)), "Sara") === "God kväll Sara", "18:00 → God kväll Sara")
check(greeting(dayPart(at(23, 30)), "Sara") === "God kväll Sara", "23:30 → God kväll")
check(greeting(dayPart(at(2)), "Sara") === "God kväll Sara", "02:00 (natt) → God kväll")
check(greeting(dayPart(at(4, 59)), "Sara") === "God kväll Sara", "04:59 → God kväll")
check(greeting("day", "") === "Hej!" && greeting("morning", null) === "God morgon", "utan förnamn: Hej! / God morgon")

// ---------------------------------------------------------- målkorten ---
const today = "2026-11-03"
const goal: GoalProfile = {
  clientId: "c1",
  goals: ["recomp", "weight_loss", "bodybuilding", "health"],
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
const lift = (date: string, kg: number, reps: number): ScheduledWorkout => ({
  id: `w-${date}`,
  clientId: "c1",
  templateId: null,
  name: "Ben",
  date,
  status: "completed",
  exercises: [{ id: `x-${date}`, exerciseId: "e-squat", sets: 3, reps: "5", restSec: 120 }],
  logs: [0, 1, 2].map((i) => ({ workoutExerciseId: `x-${date}`, setIndex: i, kg, reps, done: true })),
})
const workouts = [lift(addDays(today, -50), 100, 5), lift(addDays(today, -20), 105, 5), lift(addDays(today, -2), 110, 5)]
const cards = goalCards({ goal, weightLog: [{ date: addDays(today, -1), kg: 86 }], workouts, activities: [], activityDays: [], today })
check(cards.map((c) => c.key).join(",") === "weight_loss,bodybuilding,recomp,health", `bara valda mål, i målväljarens ordning (${cards.map((c) => c.key)})`)
const wl = cards.find((c) => c.key === "weight_loss")!
check(wl.value === "−4 kg" && wl.detail === "4 kg kvar till 82 kg" && wl.progress === 0.5 && wl.trend === "good", `viktnedgång: ${wl.value}, ${wl.detail}, förlopp ${wl.progress}`)
const rc = cards.find((c) => c.key === "recomp")!
check(rc.value === "+10 % styrka" && /Knäböj/.test(rc.detail), `rekomp: styrkan i knäböj (${rc.value} · ${rc.detail})`)
const bb = cards.find((c) => c.key === "bodybuilding")!
check(/pass\/v/.test(bb.value) && bb.detail.startsWith("3 avbockade set"), `bodybuilding: ${bb.value} · ${bb.detail}`)
const h = cards.find((c) => c.key === "health")!
check(h.value === "0 / 150 min" && h.progress === 0, "hälsa: aktiva minuter mot rekommendationen 150 min/vecka")
const reached = goalCards({ goal, weightLog: [{ date: today, kg: 81.5 }], workouts: [], activities: [], activityDays: [], today })
check(reached[0].detail === "Målvikten 82 kg är nådd!" && reached[0].progress === 1, "målvikten nådd")
check(goalCards({ goal: { ...goal, goals: [] }, weightLog: [], workouts: [], activities: [], activityDays: [], today }).length === 0, "inga mål: inga kort")

console.log(failed ? `\n${failed} fel` : "\nV35 GODKÄND")
process.exit(failed ? 1 : 0)
