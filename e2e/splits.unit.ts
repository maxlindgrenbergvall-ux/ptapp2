// Enhetstest för träningssplits (src/lib/splits.ts).
//   npx tsx --tsconfig tsconfig.json e2e/splits.unit.ts
import library from "@/lib/exercise-library.json"
import { parseRepRange } from "@/lib/progression"
import { buildSchedule, cloneSplit, customSplit, SPLITS, splitByKey, weekdayOf } from "@/lib/splits"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const ids = new Set((library as { id: string }[]).map((e) => e.id))

check(SPLITS.map((s) => s.key).join() === "ppl,ppl6,upper_lower,four_split,bro_split,full_body", "PPL, PPL×2, Upper/Lower, 4-split, Bro split och Full Body")
const missing = SPLITS.flatMap((s) => s.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))).filter((id) => !ids.has(id))
check(missing.length === 0, `alla övningar finns i övningsbanken${missing.length ? `: ${missing.join(", ")}` : ""}`)
check(SPLITS.every((s) => s.days.every((d) => d.exercises.every((e) => parseRepRange(e.reps)))), "alla övningar har repintervall (driver progressionen)")
check(SPLITS.every((s) => s.weekdays.length === s.days.length || s.key === "ppl6"), "rekommenderade veckodagar = antal dagar")

// Schemat: PPL mån/ons/fre i 2 veckor från en måndag.
const ppl = splitByKey("ppl")
const sessions = buildSchedule(ppl, ppl.weekdays, "2026-11-09", 2)
check(sessions.length === 6, `PPL 2 veckor = 6 pass (${sessions.length})`)
check(sessions.map((s) => s.name.split(": ")[1]).join() === "Push,Pull,Legs,Push,Pull,Legs", "dagarna roteras i ordning")
check(sessions.every((s) => [0, 2, 4].includes(weekdayOf(s.date))), "bara på valda veckodagar (mån, ons, fre)")
// Fler dagar i spliten än träningsdagar: rotationen fortsätter över veckorna.
const ul = buildSchedule(splitByKey("upper_lower"), [0, 3], "2026-11-09", 2)
check(ul.map((s) => s.dayIndex).join() === "0,1,2,3", "Upper/Lower på två dagar i veckan går runt över två veckor")
// Anpassning ändrar inte biblioteket.
const mine = cloneSplit(ppl)
mine.days[0].exercises.pop()
check(ppl.days[0].exercises.length === 6 && mine.days[0].exercises.length === 5, "anpassad kopia påverkar inte biblioteket")
// Egen split.
const own = customSplit(3)
check(own.days.length === 3 && own.weekdays.join() === "0,2,4", "egen split med 3 dagar: mån/ons/fre")
check(buildSchedule(own, own.weekdays, "2026-11-09", 4).length === 0, "tomma dagar ger inga pass")

if (failed) {
  console.log(`${failed} test misslyckades`)
  process.exit(1)
}
console.log("SPLITS GODKÄNDA")
