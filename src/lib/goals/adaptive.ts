/**
 * Dynamisk viktkurva (v34): planen räknas om löpande med klientens FAKTISKA
 * förbränning och träningsfrekvens – från Apple Hälsa / Health Connect, Strava
 * och passen som loggas i appen – i stället för den aktivitetsnivå som valdes i
 * intro-flödet.
 *
 * 1. Mätfönster: de senaste 28 dagarna (aldrig före målets startdag).
 * 2. Energibehov per dag i fönstret:
 *      dag med telefonens dagssumma:  BMR × 1,1 + aktiv energi
 *        (aktiv energi från HealthKit/Health Connect innehåller all rörelse –
 *         promenader, vardag och pass; 1,1 = matens termiska effekt)
 *      annars:                        BMR × 1,2 + passens kalorier
 *        (1,2 = stillasittande vardag; passen från Strava och appen läggs till)
 *    Passens kalorier: Strava/klockans siffra, annars uppskattning (MET).
 *    Pass loggade i appen räknas bara om ingen synkad styrketräning finns samma
 *    dag (annars blir samma pass dubbelräknat).
 * 3. Förtroende: fullt efter 14 dagars data; dessförinnan vägs det uppmätta
 *    ihop med planens antagande (BMR × aktivitetsfaktor), linjärt.
 * 4. Träningsfrekvens (pass/vecka, utan dubbletter) skalar muskeltillväxten:
 *    3 pass/vecka eller fler = full effekt, 0 pass = ingen.
 * 5. Kurvan förankras i den senaste vägningen och simuleras vecka för vecka
 *    framåt (energibehovet räknas om med den nya vikten). Planens kurva ligger
 *    kvar som jämförelse.
 *
 * Ren TypeScript utan React – enhetstestad i e2e/adaptive.unit.ts.
 */
import { addDays, parseISODate, todayISO } from "@/lib/date"
import { daySummary, estimateKcal } from "@/lib/activity/summary"
import {
  ACTIVITY_INFO,
  ageFromBirthYear,
  bmr,
  computePlan,
  projectWeeks,
  type NutritionPlanResult,
  type PlanInput,
  type ProjectionPoint,
} from "@/lib/goals/metabolism"
import type { ActivityDay, ActivityLog, ActivitySource, GoalProfile, ISODate, ScheduledWorkout, WeightEntry } from "@/types/domain"

const DAY = 86_400_000
export const WINDOW_DAYS = 28
export const FULL_CONFIDENCE_DAYS = 14
/** Matens termiska effekt – läggs på BMR när telefonen mäter all aktiv energi. */
const TEF = 1.1
/** Stillasittande vardag (inkl. matens termiska effekt) – när bara passen är kända. */
const SEDENTARY = 1.2
/** Uppskattad tid per avbockat set i appen (inkl. vila), minuter. */
const MIN_PER_SET = 2.5
const STRENGTH_SPORTS = /weight|strength|crossfit|workout|hiit|functional/i

export type CurveBasis = "device" | "workouts" | "plan"

export interface AdaptiveInputs {
  goal: GoalProfile
  weightLog: WeightEntry[]
  activities: ActivityLog[]
  activityDays: ActivityDay[]
  workouts: ScheduledWorkout[]
  today?: ISODate
}

export interface AdaptiveResult {
  plan: NutritionPlanResult
  /** Planens kurva från start (som i intro-flödet). */
  planned: ProjectionPoint[]
  /** Uppdaterad prognos från den senaste vägningen och framåt, som förändring från startvikten. */
  adaptive: ProjectionPoint[]
  /** Veckan (sedan start) som är "nu". */
  nowWeek: number
  /** Vikten kurvan utgår från och varifrån den kommer. */
  anchor: { weightKg: number; date: ISODate | null }
  /** Planens antagna energibehov vid nuvarande vikt (BMR × aktivitetsfaktor). */
  plannedTdee: number
  /** Uppmätt energibehov (sammanvägt med planen tills fullt förtroende). */
  measuredTdee: number
  /** Genomsnittlig aktiv energi per dag i fönstret (uppmätt + uppskattad). */
  avgActiveKcal: number
  /** Pass per vecka i fönstret (synkade + appen, utan dubbletter). */
  sessionsPerWeek: number
  /** Dagar med data i fönstret och förtroendet 0–1. */
  dataDays: number
  confidence: number
  basis: CurveBasis
  sources: (ActivitySource | "app")[]
  /** Målvikten nås enligt plan resp. uppdaterad prognos (vecka sedan start), om målvikt finns. */
  plannedReachWeek: number | null
  adaptiveReachWeek: number | null
  leanScale: number
}

const round = (n: number, step = 1) => Math.round(n / step) * step
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Kalorier för ett pass loggat i appen: avbockade set × 2,5 min, styrketräning (MET 5). */
export function appWorkoutKcal(w: ScheduledWorkout, weightKg: number): { kcal: number; minutes: number } {
  const sets = w.logs.filter((l) => l.done).length
  const minutes = clamp(sets * MIN_PER_SET, sets ? 15 : 0, 120)
  return { kcal: estimateKcal("weighttraining", minutes * 60, weightKg), minutes }
}

function reachWeek(points: ProjectionPoint[], target: number | undefined, mode: NutritionPlanResult["mode"]): number | null {
  if (target === undefined || mode === "maintain") return null
  const hit = points.find((p) => p.week > 0 && (mode === "bulk" ? p.weightKg >= target - 0.05 : p.weightKg <= target + 0.05))
  return hit?.week ?? null
}

export function adaptiveProjection({ goal: g, weightLog, activities, activityDays, workouts, today = todayISO() }: AdaptiveInputs): AdaptiveResult {
  const startMs = parseISODate(g.startedAt).getTime()
  const weekOf = (date: ISODate) => Math.max(0, Math.floor((parseISODate(date).getTime() - startMs) / (7 * DAY)))
  const nowWeek = weekOf(today)
  const age = ageFromBirthYear(g.birthYear, parseISODate(today))
  const input: PlanInput & { targetWeightKg?: number } = {
    sex: g.sex,
    age,
    heightCm: g.heightCm,
    weightKg: g.startWeightKg,
    activity: g.activity,
    goals: g.goals,
    weeklyChangeKg: g.weeklyChangeKg,
    targetWeightKg: g.targetWeightKg,
  }
  const plan = computePlan(input)

  // ------------------------------------------------ förankring i vikten ---
  const weighIns = weightLog.filter((e) => e.date >= g.startedAt && e.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const lastWeighIn = weighIns.at(-1)
  // Ingen vägning sedan start → kurvan utgår från startvikten vid start.
  const anchorWeight = lastWeighIn?.kg ?? g.startWeightKg
  const anchorWeek = lastWeighIn ? weekOf(lastWeighIn.date) : 0

  // ----------------------------------------------------------- mätfönster ---
  const windowStart = [addDays(today, -(WINDOW_DAYS - 1)), g.startedAt].sort().at(-1)!
  const dates: ISODate[] = []
  for (let d = windowStart; d <= today; d = addDays(d, 1)) dates.push(d)
  const mine = activities.filter((a) => a.clientId === g.clientId && a.date >= windowStart && a.date <= today)
  const myDays = activityDays.filter((d) => d.clientId === g.clientId && d.date >= windowStart && d.date <= today)
  const appDone = workouts.filter((w) => w.clientId === g.clientId && w.status === "completed" && w.date >= windowStart && w.date <= today)

  // Vikt per dag för BMR: senaste vägningen fram till dagen (annars ankaret).
  const weightOn = (date: ISODate) => [...weighIns].reverse().find((e) => e.date <= date)?.kg ?? g.startWeightKg
  const bmrAt = (weightKg: number) => bmr({ sex: g.sex, age, heightCm: g.heightCm, weightKg })

  const sources = new Set<ActivitySource | "app">()
  let firstData: ISODate | null = null
  let sessions = 0
  const perDay = dates.map((date) => {
    const s = daySummary(mine, myDays, g.clientId, date)
    const w = weightOn(date)
    const hasDevice = myDays.some((d) => d.date === date)
    const syncedStrength = s.activities.some((a) => STRENGTH_SPORTS.test(a.sport))
    const app = syncedStrength ? [] : appDone.filter((x) => x.date === date)
    const appKcal = app.reduce((sum, x) => sum + appWorkoutKcal(x, w).kcal, 0)
    sessions += s.activities.length + app.length
    s.sources.forEach((x) => sources.add(x))
    if (app.length) sources.add("app")
    const hasData = hasDevice || s.activities.length > 0 || app.length > 0
    if (hasData && (!firstData || date < firstData)) firstData = date
    // Samma regel som kalorimätaren: det största av telefonens dagssumma (innehåller
    // klockans pass) och summan av passen (synkade + appens) – aldrig båda.
    const passKcal = s.activities.reduce((sum, a) => sum + (a.kcal ?? 0), 0)
    const active = Math.max(s.activeKcal, passKcal + appKcal)
    return { date, hasDevice, active, tdee: bmrAt(w) * (hasDevice ? TEF : SEDENTARY) + active }
  })

  // Dagar räknas från den första dagen med data – eller hela fönstret om klienten
  // synkade/loggade redan före fönstret (då betyder en dag utan pass vilodag).
  const trackedBefore =
    activities.some((a) => a.clientId === g.clientId && a.date < windowStart) ||
    activityDays.some((d) => d.clientId === g.clientId && d.date < windowStart) ||
    workouts.some((w) => w.clientId === g.clientId && w.status === "completed" && w.date < windowStart)
  const from = firstData && trackedBefore ? windowStart : firstData
  const counted = from ? perDay.filter((d) => d.date >= from) : []
  const dataDays = counted.length
  const basis: CurveBasis = counted.some((d) => d.hasDevice) ? "device" : dataDays ? "workouts" : "plan"
  const confidence = basis === "plan" ? 0 : clamp(dataDays / FULL_CONFIDENCE_DAYS, 0, 1)
  const avgActive = dataDays ? counted.reduce((s, d) => s + d.active, 0) / dataDays : 0

  const factor = ACTIVITY_INFO[g.activity].factor
  const plannedAt = (w: number) => bmrAt(w) * factor
  const deviceShare = dataDays ? counted.filter((d) => d.hasDevice).length / dataDays : 0
  // Uppmätt energibehov som funktion av vikten: BMR skalar med vikten, den aktiva energin ligger kvar.
  const baseMult = deviceShare * TEF + (1 - deviceShare) * SEDENTARY
  const measuredAt = (w: number) => (confidence ? confidence * (bmrAt(w) * baseMult + avgActive) + (1 - confidence) * plannedAt(w) : plannedAt(w))

  // Träningsfrekvens → muskeltillväxt (bara när vi faktiskt har träningsdata).
  const weeksInWindow = Math.max(1, dataDays / 7)
  const sessionsPerWeek = dataDays ? sessions / weeksInWindow : 0
  const leanScale = basis === "plan" ? 1 : confidence * clamp(sessionsPerWeek / 3, 0, 1) + (1 - confidence)

  // ------------------------------------------------------------- kurvor ---
  const horizon = Math.min(104, Math.max(12, nowWeek + 12))
  const planned = projectWeeks(input, plan, horizon)
  const remaining = Math.max(1, horizon - anchorWeek)
  const fromAnchor = projectWeeks({ ...input, weightKg: anchorWeight }, plan, remaining, { burn: measuredAt, leanScale })
  // Muskler hittills: planens muskeltillväxt fram till ankarveckan, skalad med träningsfrekvensen.
  const planAtAnchor = planned[Math.min(anchorWeek, planned.length - 1)]
  const anchorLean = planAtAnchor.leanDelta * leanScale
  const r2 = (n: number) => Math.round(n * 100) / 100
  const adaptive = fromAnchor.map((p) => ({
    week: anchorWeek + p.week,
    weightKg: p.weightKg,
    weightDelta: r2(p.weightKg - g.startWeightKg),
    leanDelta: r2(anchorLean + p.leanDelta),
    fatDelta: r2(p.weightKg - g.startWeightKg - (anchorLean + p.leanDelta)),
  }))

  // Målvikten nås – längre simulering så att även sena datum hittas.
  const longPlanned = projectWeeks(input, plan, 104)
  const longAdaptive = projectWeeks({ ...input, weightKg: anchorWeight }, plan, 104, { burn: measuredAt, leanScale }).map((p) => ({ ...p, week: anchorWeek + p.week }))

  return {
    plan,
    planned,
    adaptive,
    nowWeek,
    anchor: { weightKg: anchorWeight, date: lastWeighIn?.date ?? null },
    plannedTdee: round(plannedAt(anchorWeight), 10),
    measuredTdee: round(measuredAt(anchorWeight), 10),
    avgActiveKcal: round(avgActive),
    sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10,
    dataDays,
    confidence: Math.round(confidence * 100) / 100,
    basis,
    sources: [...sources],
    plannedReachWeek: reachWeek(longPlanned, g.targetWeightKg, plan.mode),
    adaptiveReachWeek: reachWeek(longAdaptive, g.targetWeightKg, plan.mode),
    leanScale: Math.round(leanScale * 100) / 100,
  }
}

/** Förklarande text till kurvan (svenska). */
export function adaptiveSummary(r: AdaptiveResult): string {
  if (r.basis === "plan") return "Ingen träning eller förbränning synkad än – kurvan följer planen. Koppla Apple Hälsa, Health Connect eller Strava, eller logga pass i appen."
  const diff = r.measuredTdee - r.plannedTdee
  const burn = `Din uppmätta förbränning är ca ${r.measuredTdee.toLocaleString("sv-SE")} kcal/dag (${diff >= 0 ? "+" : "−"}${Math.abs(diff).toLocaleString("sv-SE")} mot planens ${r.plannedTdee.toLocaleString("sv-SE")})`
  const freq = `${r.sessionsPerWeek.toLocaleString("sv-SE")} pass/vecka`
  const reach =
    r.adaptiveReachWeek !== null && r.plannedReachWeek !== null && r.adaptiveReachWeek !== r.plannedReachWeek
      ? ` Målvikten nås ca vecka ${r.adaptiveReachWeek} (${Math.abs(r.adaptiveReachWeek - r.plannedReachWeek)} veckor ${r.adaptiveReachWeek < r.plannedReachWeek ? "tidigare" : "senare"} än planen).`
      : r.adaptiveReachWeek !== null
        ? ` Målvikten nås ca vecka ${r.adaptiveReachWeek}.`
        : r.plannedReachWeek !== null && r.adaptiveReachWeek === null
          ? " Med den här förbränningen nås inte målvikten inom två år – senare än planen. Öka aktiviteten eller sänk kalorimålet."
          : ""
  const partial = r.confidence < 1 ? ` Bygger på ${r.dataDays} dagars data – säkrare efter ${14} dagar.` : ""
  return `${burn}, ${freq}.${reach}${partial}`
}
