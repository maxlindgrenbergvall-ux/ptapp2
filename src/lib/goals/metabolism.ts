/**
 * Mål och kost (v30): ämnesomsättning, kaloribehov, makrofördelning och en
 * prognos vecka för vecka. Ren TypeScript utan beroenden – används i
 * intro-flödet, under Profil → Mål och i kostdagboken (dagsmål när ingen PT
 * har lagt upp ett kostschema).
 *
 * Alla värden bygger på genomsnittliga formler. Resultat varierar mellan
 * personer (genetik, ämnesomsättning, följsamhet) – se GOAL_DISCLAIMER.
 */
import type { ActivityLevel, GoalKey, MacroTargets, Sex } from "@/types/domain"

export const GOAL_DISCLAIMER =
  "Obs: Alla uppskattningar, kaloriberäkningar och grafer baseras på genomsnittliga formler. Resultat varierar från person till person beroende på genetik, ämnesomsättning och följsamhet, och kan komma att behöva justeras individuellt över tid."

// ---------------------------------------------------------------- mål ---
export const GOAL_KEYS: GoalKey[] = ["weight_loss", "muscle_gain", "bodybuilding", "recomp", "strength", "endurance", "health"]

export const GOAL_INFO: Record<GoalKey, { label: string; hint: string }> = {
  weight_loss: { label: "Viktnedgång", hint: "Tappa fett i lagom takt med ett kaloriunderskott" },
  muscle_gain: { label: "Ökad muskelmassa", hint: "Bygga muskler med ett litet kaloriöverskott" },
  bodybuilding: { label: "Bodybuilding", hint: "Muskelvolym och symmetri – hög träningsvolym och mycket protein" },
  recomp: { label: "Body recomposition", hint: "Bygga muskler och tappa fett samtidigt – vikten står ungefär still" },
  strength: { label: "Styrkeökning", hint: "Bli starkare – energi i balans och gott om protein" },
  endurance: { label: "Kondition & uthållighet", hint: "Mer kolhydrater för fyllda glykogendepåer och ork" },
  health: { label: "Hälsosam livsstil", hint: "Balanserad kost, energi i vardagen och stabil vikt" },
}

// --------------------------------------------------------- aktivitet ---
export const ACTIVITY_LEVELS: ActivityLevel[] = ["sedentary", "light", "moderate", "very"]

/** PAL-faktorer (standardvärden för Mifflin-St Jeor-beräkningar). */
export const ACTIVITY_INFO: Record<ActivityLevel, { label: string; hint: string; factor: number }> = {
  sedentary: { label: "Stillasittande", hint: "Kontorsjobb och lite rörelse", factor: 1.2 },
  light: { label: "Lätt aktiv", hint: "Promenader och träning 1–3 dagar i veckan", factor: 1.375 },
  moderate: { label: "Medel", hint: "Aktiv vardag eller träning 3–5 dagar i veckan", factor: 1.55 },
  very: { label: "Mycket aktiv", hint: "Fysiskt jobb eller träning 6–7 dagar i veckan", factor: 1.725 },
}

export const SEX_INFO: Record<Sex, { label: string }> = {
  female: { label: "Kvinna" },
  male: { label: "Man" },
  other: { label: "Annat / vill inte ange" },
}

// ------------------------------------------------------------- gränser ---
export const LIMITS = {
  age: { min: 13, max: 100 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 30, max: 300 },
} as const

/** Energi per kilo kroppsvikt: fettväv vid nedgång, blandad vävnad (inkl. uppbyggnadskostnad) vid ökning. */
export const KCAL_PER_KG_LOSS = 7700
export const KCAL_PER_KG_GAIN = 5500

/** Lägsta dagliga energiintag appen föreslår utan vårdkontakt. */
export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500, other: 1350 }

// ---------------------------------------------------------- formler ---
export interface BodyInput {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
}

/**
 * Basal ämnesomsättning (BMR) enligt Mifflin-St Jeor (1990):
 *   10 × vikt (kg) + 6,25 × längd (cm) − 5 × ålder + s
 * där s = +5 för män och −161 för kvinnor. "Annat" använder medelvärdet (−78).
 */
export function bmr({ sex, age, heightCm, weightKg }: BodyInput): number {
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s
}

/** Totalt dagligt energibehov (TDEE) = BMR × aktivitetsfaktor. */
export function tdee(body: BodyInput, activity: ActivityLevel): number {
  return bmr(body) * ACTIVITY_INFO[activity].factor
}

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2

export const ageFromBirthYear = (birthYear: number, today = new Date()) => today.getFullYear() - birthYear

// ------------------------------------------------------- takt (reglaget) ---
export type PlanMode = "cut" | "bulk" | "recomp" | "maintain"

/**
 * Kostplanens läge utifrån målen. Viktnedgång + muskelmassa (eller uttalad
 * rekomp) blir rekomp: litet underskott, mycket protein, muskler upp och fett ned.
 */
export function planMode(goals: GoalKey[]): PlanMode {
  const has = (g: GoalKey) => goals.includes(g)
  const muscle = has("muscle_gain") || has("bodybuilding")
  if (has("recomp") || (has("weight_loss") && muscle)) return "recomp"
  if (has("weight_loss")) return "cut"
  if (muscle) return "bulk"
  return "maintain"
}

export interface RatePreset {
  value: number
  label: string
}
export interface RateRange {
  min: number
  max: number
  step: number
  default: number
  presets: RatePreset[]
}

/** Reglagets intervall i kg per vecka (negativt = nedgång) för varje läge. */
export const RATE_RANGES: Record<PlanMode, RateRange> = {
  cut: {
    min: -1,
    max: -0.25,
    step: 0.05,
    default: -0.5,
    presets: [
      { value: -0.25, label: "Skonsam" },
      { value: -0.5, label: "Standard" },
      { value: -1, label: "Intensiv" },
    ],
  },
  bulk: {
    min: 0.1,
    max: 0.5,
    step: 0.05,
    default: 0.25,
    presets: [
      { value: 0.1, label: "Försiktig" },
      { value: 0.25, label: "Standard" },
      { value: 0.5, label: "Snabb" },
    ],
  },
  recomp: {
    min: -0.5,
    max: 0,
    step: 0.05,
    default: -0.25,
    presets: [
      { value: 0, label: "Balans" },
      { value: -0.25, label: "Standard" },
      { value: -0.5, label: "Mer fettfokus" },
    ],
  },
  maintain: { min: 0, max: 0, step: 0.05, default: 0, presets: [] },
}

const round = (n: number, step = 1) => Math.round(n / step) * step
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Reglagets värde inom lägets intervall (byter man mål hamnar takten rätt). */
export function clampRate(mode: PlanMode, rate: number | undefined): number {
  const r = RATE_RANGES[mode]
  if (rate === undefined || !Number.isFinite(rate)) return r.default
  // Fel tecken (t.ex. +0,25 från ett tidigare bulkmål när man nu vill gå ned) → lägets standard.
  if ((mode === "cut" && rate >= 0) || (mode === "bulk" && rate <= 0)) return r.default
  return round(clamp(rate, r.min, r.max), 0.05)
}

/** Takten i ord, t.ex. "−0,5 kg/vecka". */
export function formatRate(rate: number): string {
  if (Math.abs(rate) < 0.001) return "±0 kg/vecka"
  const s = Math.abs(rate).toLocaleString("sv-SE", { maximumFractionDigits: 2 })
  return `${rate < 0 ? "−" : "+"}${s} kg/vecka`
}

// ------------------------------------------------------------ kostplan ---
export interface PlanInput extends BodyInput {
  activity: ActivityLevel
  goals: GoalKey[]
  /** Önskad viktförändring per vecka (reglaget). */
  weeklyChangeKg: number
}

export interface NutritionPlanResult {
  mode: PlanMode
  bmr: number
  tdee: number
  /** Dagligt under-/överskott mot TDEE (negativt = underskott). */
  dailyAdjustKcal: number
  targets: MacroTargets
  /** Takten som faktiskt blir av (lägre än önskat om energigolvet slår till). */
  effectiveWeeklyChangeKg: number
  /** Energiintaget höjdes till golvet (BMR eller MIN_KCAL). */
  floored: boolean
  floorKcal: number
  proteinPerKg: number
  carbsPerKg: number
  warnings: string[]
}

/** Protein (g per kg referensvikt) per mål – det högsta av de valda målen gäller. */
const PROTEIN_PER_KG: Record<GoalKey, number> = {
  weight_loss: 2.0,
  muscle_gain: 1.8,
  bodybuilding: 2.0,
  recomp: 2.2,
  strength: 1.8,
  endurance: 1.5,
  health: 1.2,
}

/** Kolhydrater för uthållighet: minst 5 g/kg för fyllda glykogendepåer. */
const ENDURANCE_CARBS_PER_KG = 5

/**
 * Referensvikt för protein och fett: vid BMI över 30 räknas på vikten vid
 * BMI 27,5 – annars blir proteinmålet orimligt högt.
 */
export function referenceWeight(weightKg: number, heightCm: number): number {
  return bmi(weightKg, heightCm) > 30 ? 27.5 * (heightCm / 100) ** 2 : weightKg
}

/**
 * Kalorimål och makrofördelning. Reglaget (weeklyChangeKg) blir ett dagligt
 * under- eller överskott: kg/vecka × 7 700 kcal (nedgång) eller × 5 500 kcal
 * (ökning) delat på 7 dagar. Intaget går aldrig under BMR eller MIN_KCAL –
 * då visas den takt som faktiskt blir av.
 */
export function computePlan(input: PlanInput): NutritionPlanResult {
  const goals: GoalKey[] = input.goals.length ? input.goals : ["health"]
  const mode = planMode(goals)
  const rate = clampRate(mode, input.weeklyChangeKg)
  const base = bmr(input)
  const total = tdee(input, input.activity)
  const adjust = rate < 0 ? (rate * KCAL_PER_KG_LOSS) / 7 : (rate * KCAL_PER_KG_GAIN) / 7
  const floorKcal = Math.max(MIN_KCAL[input.sex], round(base, 10))
  const raw = total + adjust
  const floored = raw < floorKcal && adjust < 0
  const kcal = round(floored ? floorKcal : raw, 10)
  const dailyAdjust = kcal - total
  const effective = dailyAdjust < 0 ? (dailyAdjust * 7) / KCAL_PER_KG_LOSS : (dailyAdjust * 7) / KCAL_PER_KG_GAIN

  // --- makron
  const ref = referenceWeight(input.weightKg, input.heightCm)
  const proteinPerKg = Math.max(...goals.map((g) => PROTEIN_PER_KG[g]))
  let protein = round(ref * proteinPerKg)
  const fatMin = 0.6 * ref
  // Hälsosam livsstil: lite mer fett (30 %), annars 25 % av energin.
  const fatShare = goals.every((g) => g === "health") ? 0.3 : 0.25
  let fat = Math.max(fatMin, (kcal * fatShare) / 9)
  let carbs = (kcal - protein * 4 - fat * 9) / 4
  if (goals.includes("endurance")) {
    // Uthållighet: frigör energi till kolhydrater genom att sänka fettet mot 20 % (eller 0,6 g/kg).
    const wanted = ENDURANCE_CARBS_PER_KG * input.weightKg
    if (carbs < wanted) {
      const lowestFat = Math.max(fatMin, (kcal * 0.2) / 9)
      const freed = Math.min(fat - lowestFat, ((wanted - carbs) * 4) / 9)
      fat -= Math.max(0, freed)
      carbs = (kcal - protein * 4 - fat * 9) / 4
    }
  }
  if (carbs < 50) {
    // Mycket lågt energiintag: behåll minst 50 g kolhydrater (hjärnans behov) genom att sänka fettet först, sedan proteinet.
    fat = Math.max(fatMin, fat - ((50 - carbs) * 4) / 9)
    carbs = (kcal - protein * 4 - fat * 9) / 4
    if (carbs < 50) {
      protein = Math.max(round(ref * 1.2), protein - round(50 - carbs))
      carbs = (kcal - protein * 4 - fat * 9) / 4
    }
  }
  const targets: MacroTargets = { kcal, protein: round(protein), carbs: Math.max(0, round(carbs)), fat: round(fat) }

  // --- varningar
  const warnings: string[] = []
  const b = bmi(input.weightKg, input.heightCm)
  if (floored) {
    warnings.push(
      `Underskottet begränsas så att du inte äter under ${floorKcal} kcal per dag (din basala ämnesomsättning eller lägsta rekommenderade intag). Takten blir då ungefär ${formatRate(round(effective, 0.05))}.`
    )
  }
  if (rate < 0 && Math.abs(effective) > input.weightKg * 0.01) {
    warnings.push("Mer än 1 % av kroppsvikten per vecka är en snabb takt. Risken ökar att du tappar muskler och energi – överväg en lugnare takt.")
  }
  if (b < 18.5 && rate < 0) {
    warnings.push("Ditt BMI är under 18,5. Viktnedgång rekommenderas inte – prata gärna med vården eller en dietist.")
  }
  if (input.age < 18 && rate < 0) {
    warnings.push("Är du under 18 år? Ät inte med underskott utan att först prata med skolsköterska, vården eller en dietist.")
  }

  return {
    mode,
    bmr: Math.round(base),
    tdee: Math.round(total),
    dailyAdjustKcal: Math.round(dailyAdjust),
    targets,
    effectiveWeeklyChangeKg: Math.round(effective * 100) / 100,
    floored,
    floorKcal,
    proteinPerKg,
    carbsPerKg: Math.round((targets.carbs / input.weightKg) * 10) / 10,
    warnings,
  }
}

// ------------------------------------------------------------ prognos ---
export interface ProjectionPoint {
  week: number
  /** Beräknad kroppsvikt (kg). */
  weightKg: number
  /** Förändring från start (kg): total vikt, fettmassa och muskelmassa. */
  weightDelta: number
  fatDelta: number
  leanDelta: number
}

/** Ungefärlig muskeltillväxt per vecka för en tränande person (nybörjare–van), kg. */
const LEAN_POTENTIAL: Record<Sex, number> = { male: 0.11, female: 0.06, other: 0.085 }

/**
 * Prognos vecka för vecka. Energibehovet räknas om varje vecka med den nya
 * vikten (så nedgången planar ut naturligt) medan kalorimålet ligger fast.
 * När en målvikt nås hålls vikten (energi i balans) resten av perioden.
 * Muskeltillväxten antas bara med ett träningsmål (muskler, rekomp, styrka)
 * och avtar långsamt med tiden.
 */
export function projectWeeks(input: PlanInput & { targetWeightKg?: number }, plan: NutritionPlanResult, weeks: number): ProjectionPoint[] {
  const goals = input.goals
  const trains = goals.some((g) => g === "muscle_gain" || g === "bodybuilding" || g === "recomp" || g === "strength")
  const potential = LEAN_POTENTIAL[input.sex]
  const start = input.weightKg
  const target = input.targetWeightKg
  let weight = start
  let fat = 0
  let lean = 0
  let reached = false
  const points: ProjectionPoint[] = [{ week: 0, weightKg: start, weightDelta: 0, fatDelta: 0, leanDelta: 0 }]
  for (let week = 1; week <= weeks; week++) {
    const burn = tdee({ ...input, weightKg: weight }, input.activity)
    const balance = (plan.targets.kcal - burn) * 7
    let dWeight = balance < 0 ? balance / KCAL_PER_KG_LOSS : balance / KCAL_PER_KG_GAIN
    if (target !== undefined && !reached) {
      // Målvikten nås: stanna där (justerat intag efter det).
      if ((plan.mode === "cut" || plan.mode === "recomp") && dWeight < 0 && weight + dWeight <= target) {
        dWeight = target - weight
        reached = true
      } else if (plan.mode === "bulk" && dWeight > 0 && weight + dWeight >= target) {
        dWeight = target - weight
        reached = true
      }
    } else if (reached) {
      dWeight = 0
    }
    const decay = Math.max(0.5, 1 - week / 150)
    let dLean = 0
    if (trains) {
      if (plan.mode === "bulk") dLean = Math.min(potential * 1.4 * decay, Math.max(0, dWeight) * 0.55)
      else if (plan.mode === "recomp") dLean = potential * (plan.effectiveWeeklyChangeKg < -0.35 ? 0.4 : 0.6) * decay
      else if (plan.mode === "cut") dLean = potential * 0.2 * decay
      else dLean = potential * 0.5 * decay
    }
    weight += dWeight
    lean += dLean
    fat += dWeight - dLean
    // Två decimaler: jämna kurvor i grafen (texterna avrundar till en decimal).
    const r2 = (n: number) => Math.round(n * 100) / 100
    points.push({ week, weightKg: r2(weight), weightDelta: r2(weight - start), fatDelta: r2(fat), leanDelta: r2(lean) })
  }
  return points
}

/** Hur många veckor grafen visar: tills målvikten nås (+2) eller 12 veckor, 8–52. */
export function projectionHorizon(input: PlanInput & { targetWeightKg?: number }, plan: NutritionPlanResult): { weeks: number; reachedWeek: number | null } {
  if (input.targetWeightKg === undefined || plan.mode === "maintain") return { weeks: 12, reachedWeek: null }
  const long = projectWeeks(input, plan, 104)
  const target = input.targetWeightKg
  const hit = long.find((p) => p.week > 0 && (plan.mode === "bulk" ? p.weightKg >= target - 0.05 : p.weightKg <= target + 0.05))
  if (!hit) return { weeks: 26, reachedWeek: null }
  return { weeks: clamp(hit.week + 2, 8, 52), reachedWeek: hit.week }
}

// ------------------------------------------------------------- serier ---
export type SeriesKey = "weightDelta" | "fatDelta" | "leanDelta"
export interface ChartSeries {
  key: SeriesKey
  label: string
}

/**
 * Vilka linjer grafen visar. Fett- och muskelmål samtidigt (t.ex. viktnedgång
 * + muskelmassa, eller rekomp) ger två linjer i samma diagram.
 */
export function chartSeries(goals: GoalKey[]): ChartSeries[] {
  const has = (g: GoalKey) => goals.includes(g)
  const fatGoal = has("weight_loss") || has("recomp")
  const muscleGoal = has("muscle_gain") || has("bodybuilding") || has("strength") || has("recomp")
  if (fatGoal && muscleGoal) {
    return [
      { key: "fatDelta", label: "Fettmassa" },
      { key: "leanDelta", label: "Muskelmassa" },
    ]
  }
  if (has("weight_loss")) return [{ key: "weightDelta", label: "Vikt" }]
  if (muscleGoal) return [{ key: "leanDelta", label: "Muskelmassa" }]
  return [{ key: "weightDelta", label: "Vikt" }]
}

/** Allt som intro-flödet och Mål-vyn visar, i ett anrop. */
export function goalOverview(input: PlanInput & { targetWeightKg?: number }) {
  const plan = computePlan(input)
  const horizon = projectionHorizon(input, plan)
  const points = projectWeeks(input, plan, horizon.weeks)
  return { plan, points, series: chartSeries(input.goals.length ? input.goals : ["health"]), ...horizon }
}
