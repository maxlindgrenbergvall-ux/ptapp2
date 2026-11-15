// Enhetstest för följsamhet per vecka (v52).
//   npx tsx --tsconfig tsconfig.json e2e/adherence.unit.ts
import { adherenceByWeek } from "@/lib/data/selectors"

let failed = 0
const check = (c: boolean, m: string) => { console.log(c ? "ok  " : "FAIL", m); if (!c) failed++ }
const w = (date: string, status: "completed" | "planned" | "skipped") => ({ date, status })
// Idag: onsdag 2026-11-18. Veckorna börjar måndag 2/11, 9/11 och 16/11.
const weeks = adherenceByWeek(
  [w("2026-11-03", "completed"), w("2026-11-05", "planned"), w("2026-11-16", "completed"), w("2026-11-17", "skipped"), w("2026-11-18", "planned"), w("2026-11-20", "planned")],
  3,
  "2026-11-18"
)
check(weeks.map((x) => x.start).join() === "2026-11-02,2026-11-09,2026-11-16", "tre veckor, måndag först, äldst först")
check(weeks[0].pct === 50 && weeks[0].done === 1 && weeks[0].due === 2, "vecka 1: 1 av 2 = 50 %")
check(weeks[1].pct === null && weeks[1].due === 0, "vecka utan schemalagda pass: lucka (null), inte 0 %")
check(weeks[2].pct === 50 && weeks[2].due === 2, "innevarande vecka: dagens och kommande pass räknas inte")
console.log(failed ? `\n${failed} fel` : "\nFÖLJSAMHET GODKÄND")
process.exit(failed ? 1 : 0)
