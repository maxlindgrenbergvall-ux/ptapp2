// Enhetstest för mål- och kostberäkningarna (src/lib/goals/metabolism.ts).
//   npx tsx --tsconfig tsconfig.json e2e/goals.unit.ts
import { bmr, chartSeries, clampRate, computePlan, goalOverview, planMode, projectWeeks, tdee } from "@/lib/goals/metabolism"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const near = (a: number, b: number, tol = 0.51) => Math.abs(a - b) <= tol

// Mifflin-St Jeor: 10 × 80 + 6,25 × 180 − 5 × 30 + 5 = 1 780 kcal.
const man = { sex: "male" as const, age: 30, heightCm: 180, weightKg: 80 }
check(near(bmr(man), 1780), `BMR man 80 kg/180 cm/30 år = ${bmr(man)} (1 780)`)
// 10 × 65 + 6,25 × 165 − 5 × 35 − 161 = 1 345,25 kcal.
const woman = { sex: "female" as const, age: 35, heightCm: 165, weightKg: 65 }
check(near(bmr(woman), 1345.25, 0.01), `BMR kvinna 65 kg/165 cm/35 år = ${bmr(woman)} (1 345,25)`)
check(near(bmr({ ...woman, sex: "other" }), 1345.25 + 83, 0.01), "Annat: medelvärdet av män och kvinnor (−78)")
check(near(tdee(man, "moderate"), 1780 * 1.55), "TDEE = BMR × 1,55 (medel)")
check(near(tdee(man, "sedentary"), 1780 * 1.2) && near(tdee(man, "very"), 1780 * 1.725), "aktivitetsfaktorer 1,2 och 1,725")

// Lägen och reglaget
check(planMode(["weight_loss"]) === "cut" && planMode(["muscle_gain"]) === "bulk", "viktnedgång = underskott, muskelmassa = överskott")
check(planMode(["weight_loss", "muscle_gain"]) === "recomp" && planMode(["recomp"]) === "recomp", "båda samtidigt (eller rekomp) = rekomp")
check(planMode(["endurance", "health"]) === "maintain", "kondition/hälsa = energibalans")
check(clampRate("cut", -2) === -1 && clampRate("cut", -0.1) === -0.25, "nedgång: −0,25 till −1,0 kg/vecka")
check(clampRate("cut", 0.25) === -0.5, "fel tecken (gammalt bulkvärde) → standardtakt")
check(clampRate("bulk", 1) === 0.5, "ökning: högst +0,5 kg/vecka")

// Reglaget styr kalorierna: −0,5 kg/v = 7 700 × 0,5 / 7 = 550 kcal underskott.
const base = { ...man, activity: "moderate" as const, goals: ["weight_loss" as const] }
const std = computePlan({ ...base, weeklyChangeKg: -0.5 })
check(near(std.tdee - std.targets.kcal, 550, 10), `standard: ${std.tdee} − ${std.targets.kcal} = ca 550 kcal underskott`)
const gentle = computePlan({ ...base, weeklyChangeKg: -0.25 })
const intense = computePlan({ ...base, weeklyChangeKg: -1 })
check(gentle.targets.kcal > std.targets.kcal && std.targets.kcal > intense.targets.kcal, `skonsam ${gentle.targets.kcal} > standard ${std.targets.kcal} > intensiv ${intense.targets.kcal}`)
check(std.targets.protein === 160, `protein vid nedgång 2,0 g/kg = ${std.targets.protein} g`)
const kcalFromMacros = std.targets.protein * 4 + std.targets.carbs * 4 + std.targets.fat * 9
check(near(kcalFromMacros, std.targets.kcal, 12), `makrona summerar till kalorimålet (${kcalFromMacros} ≈ ${std.targets.kcal})`)
check(intense.warnings.some((w) => /1 %/.test(w)), "intensiv takt (> 1 % av vikten) ger en varning")

// Energigolvet: en liten person med intensiv takt äter inte under BMR.
const small = computePlan({ sex: "female", age: 30, heightCm: 158, weightKg: 55, activity: "sedentary", goals: ["weight_loss"], weeklyChangeKg: -1 })
check(small.floored && small.targets.kcal >= small.bmr - 10 && small.targets.kcal >= 1200, `golv: ${small.targets.kcal} kcal ≥ BMR ${small.bmr} och 1 200`)
check(small.effectiveWeeklyChangeKg > -1 && small.warnings.some((w) => /Takten blir/.test(w)), `faktisk takt visas (${small.effectiveWeeklyChangeKg} kg/v)`)

// Uthållighet: minst ~5 g kolhydrater per kg när energin räcker.
const endur = computePlan({ ...man, activity: "very", goals: ["endurance"], weeklyChangeKg: 0 })
check(endur.carbsPerKg >= 4.9, `kondition: ${endur.carbsPerKg} g kolhydrater/kg`)
check(endur.dailyAdjustKcal === Math.round(endur.targets.kcal - tdee(man, "very")) && Math.abs(endur.dailyAdjustKcal) < 10, "kondition: energi i balans")

// BMI > 30: protein räknas på referensvikten (BMI 27,5).
const heavy = computePlan({ ...man, weightKg: 130, activity: "light", goals: ["weight_loss"], weeklyChangeKg: -0.5 })
check(heavy.targets.protein < 130 * 2 && near(heavy.targets.protein, 27.5 * 1.8 ** 2 * 2, 1), `BMI > 30: protein ${heavy.targets.protein} g (inte 260 g)`)

// Prognos
const cut = goalOverview({ ...base, weeklyChangeKg: -0.5 })
const w12 = projectWeeks({ ...base, weeklyChangeKg: -0.5 }, cut.plan, 12)[12]
check(w12.weightDelta < -4.5 && w12.weightDelta > -6.6, `12 veckor à −0,5: ${w12.weightDelta} kg (planar ut när TDEE sjunker)`)
check(cut.series.length === 1 && cut.series[0].key === "weightDelta", "bara viktnedgång: en linje (vikt)")
const target = goalOverview({ ...base, weeklyChangeKg: -0.5, targetWeightKg: 75 })
check(target.reachedWeek !== null && target.reachedWeek >= 9 && target.reachedWeek <= 12, `målvikt 75 kg nås vecka ${target.reachedWeek}`)
check(target.points.at(-1)!.weightKg === 75, "vikten ligger kvar på målvikten efteråt")
const bulk = goalOverview({ ...base, goals: ["muscle_gain"], weeklyChangeKg: 0.25 })
check(bulk.series.length === 1 && bulk.series[0].key === "leanDelta" && bulk.points.at(-1)!.leanDelta > 0.8, `muskelmassa: +${bulk.points.at(-1)!.leanDelta} kg på 12 veckor`)
const both = goalOverview({ ...base, goals: ["weight_loss", "muscle_gain"], weeklyChangeKg: -0.25 })
check(both.series.map((s) => s.key).join() === "fatDelta,leanDelta", "två mål samtidigt: två linjer (fett och muskler)")
const last = both.points.at(-1)!
check(last.fatDelta < 0 && last.leanDelta > 0 && Math.abs(last.weightDelta) < Math.abs(last.fatDelta), `rekomp: fett ${last.fatDelta}, muskler +${last.leanDelta}, vikt ${last.weightDelta} kg`)
check(chartSeries(["strength", "weight_loss"]).length === 2, "styrka + viktnedgång: två linjer")
check(chartSeries(["health"])[0].key === "weightDelta", "hälsa: stabil vikt")

if (failed) {
  console.log(`${failed} test misslyckades`)
  process.exit(1)
}
console.log("ALLA MÅLBERÄKNINGAR GODKÄNDA")
