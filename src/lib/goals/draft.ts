/**
 * Utkast för mål-formuläret (intro-flödet och Profil → Mål): fälten får vara
 * tomma medan man fyller i, valideras här och blir en GoalProfile med
 * färdigräknade kalorimål.
 */
import { ageFromBirthYear, clampRate, computePlan, LIMITS, planMode, type PlanInput } from "@/lib/goals/metabolism"
import { todayISO } from "@/lib/date"
import type { ActivityLevel, GoalKey, GoalProfile, ID, Sex } from "@/types/domain"

export interface GoalDraft {
  goals: GoalKey[]
  sex?: Sex
  age?: number
  heightCm?: number
  weightKg?: number
  targetWeightKg?: number
  activity?: ActivityLevel
  weeklyChangeKg?: number
}

export type DraftField = "goals" | "sex" | "age" | "heightCm" | "weightKg" | "targetWeightKg" | "activity"

const inRange = (n: number | undefined, r: { min: number; max: number }) => n !== undefined && Number.isFinite(n) && n >= r.min && n <= r.max

/** Fel per fält (svenska meddelanden). Tomt objekt = utkastet går att spara. */
export function draftErrors(d: GoalDraft, fields?: DraftField[]): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {}
  const want = (f: DraftField) => !fields || fields.includes(f)
  if (want("weightKg") && !inRange(d.weightKg, LIMITS.weightKg)) e.weightKg = `Ange din vikt (${LIMITS.weightKg.min}–${LIMITS.weightKg.max} kg)`
  if (want("heightCm") && !inRange(d.heightCm, LIMITS.heightCm)) e.heightCm = `Ange din längd (${LIMITS.heightCm.min}–${LIMITS.heightCm.max} cm)`
  if (want("age") && !(inRange(d.age, LIMITS.age) && Number.isInteger(d.age))) e.age = `Ange din ålder (${LIMITS.age.min}–${LIMITS.age.max} år)`
  if (want("sex") && !d.sex) e.sex = "Välj kön (används i formeln för ämnesomsättningen)"
  if (want("activity") && !d.activity) e.activity = "Välj din aktivitetsnivå"
  if (want("goals") && d.goals.length === 0) e.goals = "Välj minst ett mål"
  if (want("targetWeightKg") && d.targetWeightKg !== undefined) {
    if (!inRange(d.targetWeightKg, LIMITS.weightKg)) e.targetWeightKg = `Målvikten ska vara ${LIMITS.weightKg.min}–${LIMITS.weightKg.max} kg`
    else if (d.weightKg !== undefined) {
      const mode = planMode(d.goals)
      if ((mode === "cut" || mode === "recomp") && d.targetWeightKg >= d.weightKg) e.targetWeightKg = "Målvikten ska vara lägre än din nuvarande vikt"
      if (mode === "bulk" && d.targetWeightKg <= d.weightKg) e.targetWeightKg = "Målvikten ska vara högre än din nuvarande vikt"
    }
  }
  return e
}

/** Underlaget för beräkningarna, eller null om något obligatoriskt saknas. */
export function planInput(d: GoalDraft): (PlanInput & { targetWeightKg?: number }) | null {
  const errors = draftErrors(d, ["weightKg", "heightCm", "age", "sex", "activity"])
  if (Object.keys(errors).length) return null
  const goals: GoalKey[] = d.goals.length ? d.goals : ["health"]
  const mode = planMode(goals)
  const target = d.targetWeightKg !== undefined && !draftErrors(d, ["targetWeightKg"]).targetWeightKg ? d.targetWeightKg : undefined
  return {
    sex: d.sex!,
    age: d.age!,
    heightCm: d.heightCm!,
    weightKg: d.weightKg!,
    activity: d.activity!,
    goals,
    weeklyChangeKg: clampRate(mode, d.weeklyChangeKg),
    targetWeightKg: mode === "maintain" ? undefined : target,
  }
}

export function draftFromProfile(p: GoalProfile | undefined, fallbackWeight?: number): GoalDraft {
  if (!p) return { goals: [], weightKg: fallbackWeight }
  return {
    goals: p.goals,
    sex: p.sex,
    age: ageFromBirthYear(p.birthYear),
    heightCm: p.heightCm,
    weightKg: p.currentWeightKg,
    targetWeightKg: p.targetWeightKg,
    activity: p.activity,
    weeklyChangeKg: p.weeklyChangeKg,
  }
}

/** Färdig GoalProfile (med kalorimål) från ett giltigt utkast. Startvikt och startdatum behålls från tidigare. */
export function profileFromDraft(d: GoalDraft, clientId: ID, previous?: GoalProfile): GoalProfile | null {
  if (Object.keys(draftErrors(d)).length) return null
  const input = planInput(d)
  if (!input) return null
  const plan = computePlan(input)
  const goalsChanged = previous && previous.goals.join() !== input.goals.join()
  return {
    clientId,
    goals: input.goals,
    sex: input.sex,
    birthYear: new Date().getFullYear() - input.age,
    heightCm: Math.round(input.heightCm * 10) / 10,
    // Ny period (nya mål) börjar från nuvarande vikt; annars behålls startvikten.
    startWeightKg: previous && !goalsChanged ? previous.startWeightKg : input.weightKg,
    currentWeightKg: Math.round(input.weightKg * 10) / 10,
    targetWeightKg: input.targetWeightKg,
    activity: input.activity,
    weeklyChangeKg: input.weeklyChangeKg,
    startedAt: previous && !goalsChanged ? previous.startedAt : todayISO(),
    targets: plan.targets,
  }
}
