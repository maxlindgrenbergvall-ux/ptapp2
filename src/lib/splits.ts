/**
 * Träningssplits (v32): färdiga upplägg som kan anpassas och bli ett schema.
 *
 *   Push/Pull/Legs (3 eller 6 dagar), Upper/Lower (4), 4-split (4),
 *   Bro split (5) och Full Body (3).
 *
 * En split är en lista med dagar; varje dag har övningar ur övningsbanken med
 * set, repintervall och vila (tunga basövningar 6–8 reps, isolering 10–15).
 * Repintervallen driver den progressiva överbelastningen (progression.ts).
 *
 * buildSchedule() lägger ut dagarna på valda veckodagar i N veckor – klienten
 * får planerade pass i kalendern, PT:n får mallar att tilldela.
 */
import { addDays, parseISODate } from "@/lib/date"
import type { ISODate, WorkoutExercise } from "@/types/domain"

export type SplitKey = "ppl" | "ppl6" | "upper_lower" | "four_split" | "bro_split" | "full_body"

export type SplitExercise = Omit<WorkoutExercise, "id">
export interface SplitDay {
  name: string
  focus: string
  exercises: SplitExercise[]
}
export interface Split {
  key: SplitKey | "custom"
  name: string
  short: string
  description: string
  level: "Nybörjare" | "Van" | "Avancerad" | "Alla nivåer"
  /** Rekommenderade veckodagar (0 = måndag … 6 = söndag). */
  weekdays: number[]
  days: SplitDay[]
}

// Hjälpare: tung basövning, medeltung, isolering.
const heavy = (exerciseId: string, sets = 4): SplitExercise => ({ exerciseId, sets, reps: "6–8", restSec: 150 })
const mid = (exerciseId: string, sets = 3): SplitExercise => ({ exerciseId, sets, reps: "8–10", restSec: 120 })
const iso = (exerciseId: string, sets = 3): SplitExercise => ({ exerciseId, sets, reps: "10–15", restSec: 75 })

const PUSH: SplitDay = {
  name: "Push",
  focus: "Bröst, axlar, triceps",
  exercises: [heavy("e-bench"), mid("e-ohp"), mid("e-incline"), iso("e-lateral", 4), iso("e-pushdown"), iso("e-ohext")],
}
const PULL: SplitDay = {
  name: "Pull",
  focus: "Rygg, baksida axlar, biceps",
  exercises: [heavy("e-deadlift", 3), mid("e-pullup"), mid("e-row"), iso("e-facepull"), iso("e-bbcurl"), iso("e-hammer")],
}
const LEGS: SplitDay = {
  name: "Legs",
  focus: "Framsida och baksida lår, säte, vader",
  exercises: [heavy("e-squat"), mid("e-rdl"), mid("e-legpress"), iso("e-legcurl"), iso("e-calfraise", 4), iso("e-hlr")],
}

export const SPLITS: Split[] = [
  {
    key: "ppl",
    name: "Push/Pull/Legs",
    short: "PPL",
    description: "Tre pass i veckan: tryck, drag och ben. Varje muskel en gång i veckan med hög kvalitet.",
    level: "Alla nivåer",
    weekdays: [0, 2, 4],
    days: [PUSH, PULL, LEGS],
  },
  {
    key: "ppl6",
    name: "Push/Pull/Legs × 2",
    short: "PPL 6",
    description: "Sex pass i veckan – varje muskel två gånger. För dig som vill maximera volymen.",
    level: "Avancerad",
    weekdays: [0, 1, 2, 3, 4, 5],
    days: [PUSH, PULL, LEGS, { ...PUSH, name: "Push 2" }, { ...PULL, name: "Pull 2" }, { ...LEGS, name: "Legs 2" }],
  },
  {
    key: "upper_lower",
    name: "Upper/Lower",
    short: "Över/Under",
    description: "Fyra pass: överkropp och underkropp två gånger var. Balans mellan styrka och volym.",
    level: "Van",
    weekdays: [0, 1, 3, 4],
    days: [
      { name: "Överkropp A", focus: "Tung press och rodd", exercises: [heavy("e-bench"), heavy("e-row"), mid("e-ohp"), mid("e-latpull"), iso("e-curl"), iso("e-pushdown")] },
      { name: "Underkropp A", focus: "Knäböj och baksida", exercises: [heavy("e-squat"), mid("e-rdl"), mid("e-bss"), iso("e-legcurl"), iso("e-calfraise", 4)] },
      { name: "Överkropp B", focus: "Lutande press och drag", exercises: [heavy("e-inclinebb"), heavy("e-pullup"), mid("e-db-ohp"), mid("e-cablerow"), iso("e-lateral"), iso("e-facepull")] },
      { name: "Underkropp B", focus: "Marklyft och säte", exercises: [heavy("e-deadlift", 3), mid("e-hipthrust"), mid("e-legpress"), iso("e-legext"), iso("e-seatedcalf", 4)] },
    ],
  },
  {
    key: "four_split",
    name: "4-split",
    short: "4-split",
    description: "Fyra pass med två muskelgrupper per pass: mycket volym och gott om återhämtning.",
    level: "Van",
    weekdays: [0, 1, 3, 4],
    days: [
      { name: "Bröst & triceps", focus: "Press", exercises: [heavy("e-bench"), mid("e-incline"), iso("e-cablefly"), iso("e-dip"), iso("e-pushdown"), iso("e-skullcrusher")] },
      { name: "Rygg & biceps", focus: "Drag", exercises: [heavy("e-row"), mid("e-pullup"), mid("e-cablerow"), iso("e-straightarm"), iso("e-bbcurl"), iso("e-preacher")] },
      { name: "Ben", focus: "Lår, säte och vader", exercises: [heavy("e-squat"), mid("e-rdl"), mid("e-legpress"), iso("e-legcurl"), iso("e-legext"), iso("e-calfraise", 4)] },
      { name: "Axlar & mage", focus: "Axlar och bål", exercises: [heavy("e-ohp"), iso("e-lateral", 4), iso("e-reardelt"), iso("e-facepull"), iso("e-hlr"), iso("e-cablecrunch")] },
    ],
  },
  {
    key: "bro_split",
    name: "Bro split",
    short: "Bro split",
    description: "Klassisk bodybuildingsplit: en muskelgrupp per dag, fem dagar i veckan.",
    level: "Avancerad",
    weekdays: [0, 1, 2, 3, 4],
    days: [
      { name: "Bröst", focus: "Bröst", exercises: [heavy("e-bench"), mid("e-incline"), mid("e-chestpress"), iso("e-cablefly"), iso("e-pecdeck")] },
      { name: "Rygg", focus: "Rygg", exercises: [heavy("e-deadlift", 3), mid("e-pullup"), mid("e-tbarrow"), mid("e-latpull"), iso("e-straightarm")] },
      { name: "Axlar", focus: "Axlar", exercises: [heavy("e-ohp"), mid("e-arnold"), iso("e-lateral", 4), iso("e-reardelt"), iso("e-shrug")] },
      { name: "Ben", focus: "Ben", exercises: [heavy("e-squat"), mid("e-hacksquat"), mid("e-rdl"), iso("e-legext"), iso("e-legcurl"), iso("e-calfraise", 4)] },
      { name: "Armar", focus: "Biceps och triceps", exercises: [mid("e-closegrip"), mid("e-bbcurl"), iso("e-skullcrusher"), iso("e-inclinecurl"), iso("e-pushdown"), iso("e-hammer")] },
    ],
  },
  {
    key: "full_body",
    name: "Full Body",
    short: "Helkropp",
    description: "Tre helkroppspass: varje muskel tre gånger i veckan. Effektivt för nybörjare och tidspressade.",
    level: "Nybörjare",
    weekdays: [0, 2, 4],
    days: [
      { name: "Helkropp A", focus: "Knäböj, bänk, rodd", exercises: [heavy("e-squat", 3), heavy("e-bench", 3), mid("e-row"), iso("e-lateral"), iso("e-plank")] },
      { name: "Helkropp B", focus: "Marklyft, axelpress, chins", exercises: [heavy("e-deadlift", 3), heavy("e-ohp", 3), mid("e-chinup"), iso("e-legcurl"), iso("e-hlr")] },
      { name: "Helkropp C", focus: "Benpress, lutande press, latsdrag", exercises: [mid("e-legpress"), mid("e-incline"), mid("e-latpull"), iso("e-hipthrust"), iso("e-curl")] },
    ],
  },
]

export const WEEKDAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"]

export function splitByKey(key: SplitKey): Split {
  return SPLITS.find((s) => s.key === key)!
}

/** Djup kopia (så att anpassningar inte ändrar biblioteket). */
export function cloneSplit(split: Split): Split {
  return { ...split, weekdays: [...split.weekdays], days: split.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) })) }
}

/** Egen split från grunden: N tomma dagar. */
export function customSplit(days: number): Split {
  const n = Math.min(7, Math.max(1, days))
  const weekdays = [[2], [0, 3], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]][n - 1]
  return {
    key: "custom",
    name: "Egen split",
    short: "Egen",
    description: "Ditt eget upplägg.",
    level: "Alla nivåer",
    weekdays,
    days: Array.from({ length: n }, (_, i) => ({ name: `Dag ${i + 1}`, focus: "", exercises: [] })),
  }
}

export interface ScheduledSession {
  date: ISODate
  dayIndex: number
  name: string
  exercises: SplitExercise[]
}

/** Måndag (0) … söndag (6) för ett datum. */
export const weekdayOf = (date: ISODate) => (parseISODate(date).getDay() + 6) % 7

/**
 * Lägg ut splitens dagar på valda veckodagar i `weeks` veckor från `start`.
 * Dagarna roteras i ordning (PPL på mån/ons/fre: Push, Pull, Legs, Push …),
 * så att en split med fler dagar än träningsdagar per vecka ändå går runt.
 */
export function buildSchedule(split: Pick<Split, "days" | "name">, weekdays: number[], start: ISODate, weeks: number): ScheduledSession[] {
  const days = split.days.filter((d) => d.exercises.length > 0)
  const wd = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort()
  if (!days.length || !wd.length) return []
  const out: ScheduledSession[] = []
  const total = Math.min(26, Math.max(1, weeks)) * 7
  let next = 0
  for (let i = 0; i < total; i++) {
    const date = addDays(start, i)
    if (!wd.includes(weekdayOf(date))) continue
    const day = days[next % days.length]
    out.push({ date, dayIndex: next % days.length, name: `${split.name}: ${day.name}`, exercises: day.exercises.map((e) => ({ ...e })) })
    next++
  }
  return out
}
