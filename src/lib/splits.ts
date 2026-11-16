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

export type SplitKey = "ppl" | "ppl6" | "upper_lower" | "four_split" | "bro_split" | "full_body" | "hyrox_prep" | "run_5k" | "run_10k" | "hybrid"
/** v58: kategorin i filtret Alla/Styrka/Löpning/Hyrox (ett upplägg kan höra till flera). */
export type SplitCategory = "strength" | "running" | "hyrox"

export type SplitExercise = Omit<WorkoutExercise, "id">
export interface SplitDay {
  name: string
  focus: string
  exercises: SplitExercise[]
  /** v52: vilodag (inga övningar) – kan flyttas fritt i ordningen. */
  rest?: boolean
  /** v58: nyckel i ordboken (plans.day.* / plans.focus.*) – namnet visas på användarens språk. */
  i18n?: string
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
  /** v58: saknas = styrka. */
  categories?: SplitCategory[]
}

export const splitCategories = (s: Pick<Split, "categories">): SplitCategory[] => s.categories ?? ["strength"]

// v58: löpning, Hyrox-stationer och block. distanceM i meter, tempo i s/km.
const run = (exerciseId: string, distanceM: number, sets = 1, paceSecPerKm?: number, restSec = 0, blockId?: string): SplitExercise => ({
  exerciseId,
  trackingType: "running",
  sets,
  reps: "",
  restSec,
  distanceM,
  ...(paceSecPerKm ? { paceSecPerKm } : {}),
  ...(blockId ? { blockId } : {}),
})
const station = (exerciseId: string, rounds: number, opts: { distanceM?: number; reps?: string; blockId?: string } = {}): SplitExercise => ({
  exerciseId,
  trackingType: "conditioning",
  sets: rounds,
  reps: opts.reps ?? "",
  restSec: 0,
  ...(opts.distanceM ? { distanceM: opts.distanceM } : {}),
  ...(opts.blockId ? { blockId: opts.blockId } : {}),
})

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

/** v58: löpning, Hyrox och hybrid – färdiga upplägg under "Upplägg / Tips". */
SPLITS.push(
  {
    key: "hyrox_prep",
    name: "Hyrox Race Prep",
    short: "Hyrox",
    description: "Fyra pass mot loppet: race-simulering i block, löpintervaller, Hyrox-styrka och ett lugnt zon 2-pass.",
    level: "Alla nivåer",
    weekdays: [0, 1, 3, 5],
    categories: ["hyrox"],
    days: [
      {
        name: "Race-simulering",
        focus: "Löpning + stationer i varv",
        i18n: "hyrox_sim",
        exercises: [
          // Block A: 4 varv 1000 m löpning + 50 m Sled Push. Block B: 4 varv 1000 m + 25 Wall Balls.
          run("e-hyrox-run", 1000, 4, 300, 0, "sim-a"),
          station("e-sledpush", 4, { distanceM: 50, blockId: "sim-a" }),
          run("e-hyrox-run", 1000, 4, 300, 0, "sim-b"),
          station("e-wallball", 4, { reps: "25", blockId: "sim-b" }),
        ],
      },
      { name: "Löpintervaller", focus: "1000 m i racefart", i18n: "hyrox_intervals", exercises: [run("e-intervals", 1000, 6, 280, 90)] },
      {
        name: "Hyrox-styrka",
        focus: "Ben, grepp och bål",
        i18n: "hyrox_strength",
        exercises: [heavy("e-squat", 4), mid("e-rdl"), station("e-sandbag", 3, { distanceM: 50 }), station("e-farmers", 3, { distanceM: 100 }), station("e-sledpull", 3, { distanceM: 25 })],
      },
      { name: "Zon 2", focus: "Lugnt, kunna prata", i18n: "zone2", exercises: [run("e-long-run", 10000, 1, 390)] },
    ],
  },
  {
    key: "run_5k",
    name: "5 km Löpning",
    short: "5 km",
    description: "Tre löppass i veckan mot 5 km: intervaller, tempo och ett längre lugnt pass.",
    level: "Nybörjare",
    weekdays: [1, 3, 5],
    categories: ["running"],
    days: [
      { name: "Intervaller", focus: "Snabbt med vila", i18n: "run_intervals", exercises: [run("e-intervals", 800, 6, 300, 90)] },
      { name: "Tempo / tröskel", focus: "Comfortably hard", i18n: "run_tempo", exercises: [run("e-tempo-run", 4000, 1, 320)] },
      { name: "Långpass", focus: "Lugnt och långt", i18n: "run_long", exercises: [run("e-long-run", 8000, 1, 400)] },
    ],
  },
  {
    key: "run_10k",
    name: "10 km Löpning",
    short: "10 km",
    description: "Fyra löppass mot 10 km: intervaller, tröskel, distans och långpass i zon 2.",
    level: "Van",
    weekdays: [0, 2, 4, 6],
    categories: ["running"],
    days: [
      { name: "Intervaller", focus: "Snabbt med vila", i18n: "run_intervals", exercises: [run("e-intervals", 1000, 5, 285, 90)] },
      { name: "Tempo / tröskel", focus: "Comfortably hard", i18n: "run_tempo", exercises: [run("e-tempo-run", 6000, 1, 305)] },
      { name: "Lugn distans", focus: "Återhämtning", i18n: "run_easy", exercises: [run("e-run", 6000, 1, 380)] },
      { name: "Långpass", focus: "Lugnt och långt", i18n: "run_long", exercises: [run("e-long-run", 14000, 1, 390)] },
    ],
  },
  {
    key: "hybrid",
    name: "Hybrid Styrka + Kondition",
    short: "Hybrid",
    description: "Styrka och kondition i samma vecka: tunga lyft plus en motor som håller i Hyrox och löpning.",
    level: "Van",
    weekdays: [0, 1, 3, 4],
    categories: ["strength", "hyrox"],
    days: [
      { name: "Överkropp + motor", focus: "Press, drag och ergometer", i18n: "hybrid_upper", exercises: [heavy("e-bench"), heavy("e-row"), mid("e-ohp"), station("e-skierg", 4, { distanceM: 250 })] },
      { name: "Underkropp + motor", focus: "Knäböj, marklyft och släde", i18n: "hybrid_lower", exercises: [heavy("e-squat"), heavy("e-deadlift", 3), station("e-sledpush", 4, { distanceM: 25 })] },
      { name: "Löpintervaller", focus: "1000 m i racefart", i18n: "hyrox_intervals", exercises: [run("e-intervals", 1000, 5, 290, 90)] },
      {
        name: "Kondition (stationer)",
        focus: "SkiErg, rodd och wall balls",
        i18n: "hybrid_engine",
        exercises: [station("e-skierg", 3, { distanceM: 500, blockId: "eng" }), station("e-row-erg", 3, { distanceM: 500, blockId: "eng" }), station("e-wallball", 3, { reps: "20", blockId: "eng" })],
      },
    ],
  }
)

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
    name: "Eget upplägg",
    short: "Eget",
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
