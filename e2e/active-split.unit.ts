// Enhetstest för det aktiva träningsschemat (v43): "Nästa pass", rotation och veckans pass.
//   npx tsx --tsconfig tsconfig.json e2e/active-split.unit.ts
import { advanceSplit, nextDayIndex, nextSplitAction, suggestedDaysPerWeek, weekProgress, weekStart } from "@/lib/active-split"
import type { ActiveSplit, ScheduledWorkout } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const ex = (exerciseId: string) => ({ exerciseId, sets: 3, reps: "8–10", restSec: 90 })
const split: ActiveSplit = {
  clientId: "c1",
  name: "Push/Pull/Legs",
  short: "PPL",
  key: "ppl",
  days: [
    { name: "Push", focus: "", exercises: [ex("e-bench")] },
    { name: "Pull", focus: "", exercises: [ex("e-row")] },
    { name: "Legs", focus: "", exercises: [ex("e-squat")] },
  ],
  daysPerWeek: 3,
  nextDay: 0,
  updatedAt: "2026-11-06T08:00:00Z",
}
const w = (id: string, status: ScheduledWorkout["status"], date = "2026-11-06"): ScheduledWorkout => ({ id, clientId: "c1", templateId: null, name: "x", date, exercises: [], status, logs: [] })

// ---- rotation ---
let a = nextSplitAction(split, [])
check(a.kind === "create" && a.dayIndex === 0 && a.name === "PPL: Push", "första gången: Push")
let s = advanceSplit(split, 0, "w1", "t")
check(s.nextDay === 1 && s.currentWorkoutId === "w1", "efter start: Pull står på tur, passet är kopplat")
a = nextSplitAction(s, [w("w1", "in_progress")])
check(a.kind === "open" && a.workoutId === "w1", "påbörjat pass öppnas igen i stället för ett nytt")
a = nextSplitAction(s, [w("w1", "planned")])
check(a.kind === "open", "planerat men inte startat pass öppnas också")
a = nextSplitAction(s, [w("w1", "completed")])
check(a.kind === "create" && a.dayIndex === 1 && a.name === "PPL: Pull", "när passet är klart: Pull")
a = nextSplitAction(s, [w("w1", "skipped")])
check(a.kind === "create" && a.dayIndex === 1, "överhoppat pass: nästa dag")
a = nextSplitAction(s, [])
check(a.kind === "create" && a.dayIndex === 1, "borttaget pass: nästa dag")
s = advanceSplit(s, 2, "w3", "t")
check(s.nextDay === 0, "efter Legs: tillbaka till Push (roterar)")

// ---- tomma dagar hoppas över ---
const gap: ActiveSplit = { ...split, days: [split.days[0], { name: "Tom", focus: "", exercises: [] }, split.days[2]], nextDay: 1 }
check(nextDayIndex(gap) === 2, "dag utan övningar hoppas över")
check(nextSplitAction({ ...split, days: [{ name: "Tom", focus: "", exercises: [] }] }, []).kind === "none", "schema utan övningar: inget pass")
check(nextSplitAction(undefined, []).kind === "none", "inget aktivt schema: inget pass")

// ---- veckans pass mot dagar/vecka ---
check(weekStart("2026-11-06") === "2026-11-02" && weekStart("2026-11-08") === "2026-11-02" && weekStart("2026-11-09") === "2026-11-09", "veckan börjar på måndag")
const p = weekProgress({ ...split, daysPerWeek: 4 }, [w("a", "completed", "2026-11-02"), w("b", "completed", "2026-11-05"), w("c", "planned", "2026-11-06"), w("d", "completed", "2026-11-01")], "2026-11-06")
check(p.done === 2 && p.goal === 4 && !p.reached, `2 av 4 pass denna vecka (förra veckans räknas inte)`)
check(suggestedDaysPerWeek(3) === 3 && suggestedDaysPerWeek(6) === 5 && suggestedDaysPerWeek(1) === 3, "förslag: 3–5 dagar per vecka")

console.log(failed ? `\n${failed} fel` : "\nSCHEMAT GODKÄNT")
process.exit(failed ? 1 : 0)
