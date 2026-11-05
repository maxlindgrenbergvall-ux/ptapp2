// Enhetstest för v35: tidsbaserad hälsning (målkorten ersattes i v40, se progress-summary.unit.ts).
//   npx tsx --tsconfig tsconfig.json e2e/v35.unit.ts
import { dayPart, greeting } from "@/lib/greeting"

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

console.log(failed ? `\n${failed} fel` : "\nV35 GODKÄND")
process.exit(failed ? 1 : 0)
