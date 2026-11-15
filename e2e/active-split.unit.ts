import { addRestDay, isRestDay, moveSplitDay, nextDayIndex as nextIdx, removeRestDay, reorderSplitDays, restDay, withRestDays } from "../src/lib/active-split"
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


// ------------------------------------------------- vilodagar (v52) ---
{
  const ex = [{ exerciseId: "e-bench", sets: 3, reps: "8", restSec: 90 }]
  const d = (name: string): ActiveSplit["days"][number] => ({ name, focus: "", exercises: ex })
  const week = withRestDays([d("Push"), d("Pull"), d("Legs")], [0, 2, 4], restDay)
  const names = (s: { days: { name: string }[] }) => s.days.map((x) => x.name).join(",")
  const v = (c: unknown, m: string) => check(Boolean(c), m)
  v(names({ days: week }) === "Push,Vila,Pull,Vila,Legs,Vila,Vila", "PPL mån/ons/fre läggs ut med vilodagar emellan")
  v(withRestDays([d("A"), d("B")], [0], restDay).length === 2, "utan passande veckodagar: inga vilodagar")
  let s = { days: week, nextDay: 2 } // Pull står på tur
  s = moveSplitDay(s, 1, 5)
  v(names(s) === "Push,Pull,Vila,Legs,Vila,Vila,Vila" && s.days[s.nextDay].name === "Pull", "flytta en vilodag: samma pass står på tur")
  s = moveSplitDay(s, 1, 0)
  v(names(s).startsWith("Pull,Push") && s.days[s.nextDay].name === "Pull", "flytta ett pass: det står fortfarande på tur")
  s = reorderSplitDays(s, [1, 0, 2, 3, 4, 5, 6])
  v(names(s).startsWith("Push,Pull") && s.days[s.nextDay].name === "Pull", "dra och släpp: ny ordning, samma pass på tur")
  v(addRestDay(s) === s, "högst sju dagar")
  s = removeRestDay(s, 2)
  v(s.days.length === 6 && s.days[s.nextDay].name === "Pull", "ta bort en vilodag")
  v(removeRestDay(s, 0) === s, "ett träningspass tas inte bort som vilodag")
  s = addRestDay(s, 0)
  v(isRestDay(s.days[0]) && s.days[s.nextDay].name === "Pull", "vilodag först: passet på tur följer med")
  v(nextIdx({ days: s.days, nextDay: 0 }) === 1, "Nästa pass hoppar över vilodagar")
  const allRest = { days: [restDay(), restDay()], nextDay: 0 }
  v(nextIdx(allRest) === null, "bara vilodagar: inget pass på tur")
}

console.log(failed ? `\n${failed} fel` : "\nSCHEMAT GODKÄNT")
process.exit(failed ? 1 : 0)
