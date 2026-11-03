// Enhetstest för kalorimätaren (src/lib/activity/summary.ts).
//   npx tsx --tsconfig tsconfig.json e2e/activity.unit.ts
import { daySummary, dedupeActivities, estimateKcal, sportLabel } from "@/lib/activity/summary"
import type { ActivityDay, ActivityLog } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const D = "2026-11-03"
const act = (p: Partial<ActivityLog>): ActivityLog => ({
  id: crypto.randomUUID(), clientId: "c1", source: "strava", externalId: crypto.randomUUID(), sport: "Run", name: "", startedAt: `${D}T07:00:00Z`, date: D, durationSec: 1800, ...p,
})
const day = (p: Partial<ActivityDay>): ActivityDay => ({ clientId: "c1", date: D, source: "apple_health", activeKcal: 0, ...p })

// Bara Strava: summan av passen.
const s1 = daySummary([act({ kcal: 380 }), act({ startedAt: `${D}T17:00:00Z`, kcal: 200, sport: "Ride" })], [], "c1", D)
check(s1.activeKcal === 580 && s1.activeMinutes === 60, `Strava: 380 + 200 = ${s1.activeKcal} kcal, ${s1.activeMinutes} min`)
// Telefonens dagssumma innehåller redan passet: ingen dubbelräkning (max).
const s2 = daySummary([act({ kcal: 380 })], [day({ activeKcal: 620, activeMinutes: 55, steps: 9400 })], "c1", D)
check(s2.activeKcal === 620 && s2.activeMinutes === 55 && s2.steps === 9400, `Apple Hälsa 620 + Strava 380 (ingår redan) = ${s2.activeKcal} kcal`)
check(s2.sources.join() === "apple_health,strava", "källorna visas")
// Samma pass från Strava och Apple Hälsa räknas en gång.
const dup = dedupeActivities([
  act({ source: "strava", kcal: 380, name: "Morgonlöpning" }),
  act({ source: "apple_health", startedAt: `${D}T07:02:00Z`, durationSec: 1750, kcal: 360, sport: "running" }),
])
check(dup.length === 1 && dup[0].source === "strava", "samma löprunda från två källor = ett pass (Strava vinner)")
// Uppmätta kalorier vinner över uppskattade.
const dup2 = dedupeActivities([act({ source: "strava", kcal: 300, kcalEstimated: true }), act({ source: "apple_health", startedAt: `${D}T07:01:00Z`, kcal: 410 })])
check(dup2.length === 1 && dup2[0].kcal === 410, "uppmätta kalorier går före uppskattade")
// Olika pass slås inte ihop.
check(dedupeActivities([act({}), act({ startedAt: `${D}T12:00:00Z` })]).length === 2, "två olika pass samma dag")
// Annan klient/dag räknas inte.
check(daySummary([act({ clientId: "c2", kcal: 500 }), act({ date: "2026-11-02", kcal: 500 })], [], "c1", D).activeKcal === 0, "bara rätt klient och dag")
// MET-uppskattning: löpning 9,8 MET × 70 kg × 0,5 h ≈ 343 kcal.
check(estimateKcal("Run", 1800, 70) === 343, `MET: 30 min löpning, 70 kg = ${estimateKcal("Run", 1800, 70)} kcal`)
check(sportLabel("Run") === "Löpning" && sportLabel("traditionalStrengthTraining") === "Styrketräning" && sportLabel("Kitesurf") === "Kitesurf", "sportnamn på svenska")

if (failed) {
  console.log(`${failed} test misslyckades`)
  process.exit(1)
}
console.log("KALORIMÄTAREN GODKÄND")
