// Enhetstest för den dynamiska viktkurvan (src/lib/goals/adaptive.ts).
//   npx tsx --tsconfig tsconfig.json e2e/adaptive.unit.ts
import { addDays } from "@/lib/date"
import { adaptiveProjection, adaptiveSummary, appWorkoutKcal } from "@/lib/goals/adaptive"
import { bmr, computePlan, tdee } from "@/lib/goals/metabolism"
import type { ActivityDay, ActivityLog, GoalProfile, ScheduledWorkout } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}

const today = "2026-11-03"
const start = addDays(today, -28)
const goal: GoalProfile = {
  clientId: "c1",
  goals: ["weight_loss"],
  sex: "male",
  birthYear: 1996,
  heightCm: 180,
  startWeightKg: 90,
  currentWeightKg: 90,
  targetWeightKg: 82,
  activity: "moderate",
  weeklyChangeKg: -0.5,
  startedAt: start,
  targets: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
}
const base = { goal, weightLog: [], activities: [], activityDays: [], workouts: [], today }
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(today, -i))
const device = (kcal: number, n = 28): ActivityDay[] => days(n).map((date) => ({ clientId: "c1", date, source: "apple_health", activeKcal: kcal }))
const run = (date: string, kcal: number, id = date): ActivityLog => ({
  id,
  clientId: "c1",
  source: "strava",
  externalId: id,
  sport: "Run",
  name: "Löpning",
  startedAt: `${date}T07:00:00.000Z`,
  date,
  durationSec: 3000,
  kcal,
})
const lift = (date: string, sets: number): ScheduledWorkout => ({
  id: `w-${date}`,
  clientId: "c1",
  templateId: null,
  name: "Pass",
  date,
  exercises: [],
  status: "completed",
  logs: Array.from({ length: sets }, (_, i) => ({ workoutExerciseId: "x", setIndex: i, kg: 50, reps: 8, done: true })),
})

// ------------------------------------------------------- ingen data ---
const none = adaptiveProjection(base)
check(none.basis === "plan" && none.confidence === 0, "utan synk eller loggade pass: kurvan följer planen")
check(none.measuredTdee === none.plannedTdee, `utan data: uppmätt = planerat (${none.measuredTdee})`)
check(Math.abs(none.adaptive.at(-1)!.weightKg - none.planned.at(-1)!.weightKg) < 0.6, "utan data: uppdaterad prognos ≈ planen")
check(/följer planen/.test(adaptiveSummary(none)), "texten säger att kurvan följer planen")

// --------------------------------------- telefonen: hög förbränning ---
const bmr90 = bmr({ sex: "male", age: 30, heightCm: 180, weightKg: 90 })
const high = adaptiveProjection({ ...base, activityDays: device(1100) })
check(high.basis === "device" && high.confidence === 1, `28 dagar från Apple Hälsa: fullt förtroende (${high.dataDays} dagar)`)
check(Math.abs(high.measuredTdee - Math.round((bmr90 * 1.1 + 1100) / 10) * 10) <= 10, `TDEE = BMR × 1,1 + aktiv energi (${high.measuredTdee} ≈ ${Math.round(bmr90 * 1.1 + 1100)})`)
check(high.measuredTdee > high.plannedTdee, `hög förbränning > planens antagande (${high.measuredTdee} > ${high.plannedTdee})`)
check(high.adaptive.at(-1)!.weightKg < high.planned.at(-1)!.weightKg, "mer förbränning → kurvan går brantare nedåt")
check(high.adaptiveReachWeek !== null && high.plannedReachWeek !== null && high.adaptiveReachWeek < high.plannedReachWeek, `målvikten nås tidigare (v${high.adaptiveReachWeek} mot v${high.plannedReachWeek})`)

const low = adaptiveProjection({ ...base, activityDays: device(150) })
check(low.measuredTdee < low.plannedTdee && low.adaptive.at(-1)!.weightKg > low.planned.at(-1)!.weightKg, "låg förbränning → långsammare nedgång än planen")
check(/senare än planen/.test(adaptiveSummary(low)), `texten: ${adaptiveSummary(low)}`)

// -------------------------------------------------- delvis förtroende ---
const week = adaptiveProjection({ ...base, activityDays: device(900, 7) })
check(week.dataDays === 7 && week.confidence === 0.5, `7 dagar data → förtroende 0,5 (${week.confidence})`)
check(week.measuredTdee > week.plannedTdee && week.measuredTdee < high.measuredTdee, "halvt förtroende: mellan plan och uppmätt")

// ------------------------------------------- Strava + pass i appen ---
const stravaRuns = days(28).filter((_, i) => i % 7 === 0 || i % 7 === 3).map((d) => run(d, 600))
const strava = adaptiveProjection({ ...base, activities: stravaRuns })
check(strava.basis === "workouts" && strava.dataDays === 25, `bara Strava: grundbehov stillasittande + passen, räknat från första passet (${strava.dataDays} dagar)`)
const longTime = adaptiveProjection({ ...base, goal: { ...goal, startedAt: addDays(today, -60) }, activities: [...stravaRuns, run(addDays(today, -40), 600)] })
check(longTime.dataDays === 28, "synkat sedan tidigare: hela fönstret räknas (dagar utan pass = vilodagar)")
check(Math.abs(strava.sessionsPerWeek - 2) < 0.3, `träningsfrekvens från Strava: ${strava.sessionsPerWeek} pass/vecka`)
const expected = (bmr90 * 1.2 * strava.dataDays + 600 * stravaRuns.length) / strava.dataDays
check(Math.abs(strava.measuredTdee - expected) <= 15, `TDEE = BMR × 1,2 + passens kalorier i snitt (${strava.measuredTdee} ≈ ${Math.round(expected)})`)

const k = appWorkoutKcal(lift(today, 16), 90)
check(k.minutes === 40 && k.kcal > 250 && k.kcal < 450, `pass i appen: 16 set ≈ ${k.minutes} min, ${k.kcal} kcal`)
const withApp = adaptiveProjection({ ...base, activities: stravaRuns, workouts: days(28).filter((_, i) => i % 7 === 1).map((d) => lift(d, 16)) })
check(withApp.sessionsPerWeek > strava.sessionsPerWeek && withApp.sources.includes("app"), `appens pass räknas också (${withApp.sessionsPerWeek} pass/vecka)`)
check(withApp.measuredTdee > strava.measuredTdee, "appens pass ökar förbränningen")

// Dubbelräkning: samma styrkepass i Strava och appen räknas en gång.
const syncedLift: ActivityLog = { ...run(today, 300, "lift"), sport: "WeightTraining" }
const dup = adaptiveProjection({ ...base, activities: [syncedLift], workouts: [lift(today, 16)] })
check(dup.sessionsPerWeek === 1 && dup.sources.every((s) => s !== "app"), "styrkepass som redan synkats från Strava räknas inte igen från appen")
// Telefonens dagssumma innehåller redan passen: det största gäller, inte summan.
const both = adaptiveProjection({ ...base, activityDays: device(700, 1), activities: [run(today, 500)] })
check(Math.abs(both.avgActiveKcal - 700) <= 1, `dagssumma 700 + Strava 500 samma dag → 700 kcal, inte 1 200 (${both.avgActiveKcal})`)

// -------------------------------------------- förankring i vägningen ---
const weighed = adaptiveProjection({ ...base, weightLog: [{ date: addDays(today, -2), kg: 87.4 }] })
const anchorPoint = weighed.adaptive[0]
check(weighed.anchor.weightKg === 87.4 && anchorPoint.weightKg === 87.4, "kurvan utgår från den senaste vägningen (87,4 kg)")
check(anchorPoint.week === 3 && Math.abs(anchorPoint.weightDelta - -2.6) < 0.01, `ankaret ligger på rätt vecka (v${anchorPoint.week}) som −2,6 kg från start`)
check(weighed.adaptive.every((p, i) => i === 0 || p.week === anchorPoint.week + i), "prognosen fortsätter vecka för vecka från ankaret")

// ----------------------------------------- träningsfrekvens → muskler ---
const muscleGoal = { ...goal, goals: ["muscle_gain" as const], weeklyChangeKg: 0.25, targetWeightKg: undefined }
const lazy = adaptiveProjection({ ...base, goal: muscleGoal, activityDays: device(300) })
const busy = adaptiveProjection({ ...base, goal: muscleGoal, activityDays: device(300), workouts: days(28).filter((_, i) => i % 2 === 0).map((d) => lift(d, 18)) })
check(lazy.leanScale === 0 && lazy.adaptive.at(-1)!.leanDelta === 0, "data men inga pass → ingen beräknad muskeltillväxt")
check(busy.leanScale === 1 && busy.adaptive.at(-1)!.leanDelta > 0.5, `3+ pass/vecka → full muskeltillväxt (${busy.sessionsPerWeek} pass/vecka, +${busy.adaptive.at(-1)!.leanDelta} kg)`)

// ---------------------------------------------------- data före start ---
const before = adaptiveProjection({ ...base, goal: { ...goal, startedAt: addDays(today, -3) }, activityDays: device(900) })
check(before.dataDays === 4, `bara data sedan målets start räknas (${before.dataDays} dagar)`)
check(computePlan({ sex: "male", age: 30, heightCm: 180, weightKg: 90, activity: "moderate", goals: ["weight_loss"], weeklyChangeKg: -0.5 }).tdee === Math.round(tdee({ sex: "male", age: 30, heightCm: 180, weightKg: 90 }, "moderate")), "planen (intro-flödet) är oförändrad")

console.log(failed ? `\n${failed} fel` : "\nalla ok")
process.exit(failed ? 1 : 0)
