/**
 * Sammanfattning och kommentar efter ett avslutat pass (v51).
 *
 * Allt räknas fram ur loggen – inga uppskattningar (ingen 1RM), bara det som
 * faktiskt lyftes. Kommentaren väljs med fasta regler i prioritetsordning och
 * säger något konkret om just det här passet: ett rekord, veckans mål, en
 * comeback, en svit – annars tiden på dygnet. Samma pass ger alltid samma
 * text. Ingen AI, inga superlativ, inga utropstecken på löpande band.
 *
 * Ren TypeScript – enhetstestad i e2e/workout-summary.unit.ts.
 */
import { addDays, parseISODate } from "@/lib/date"
import type { ID, ISODate, ScheduledWorkout } from "@/types/domain"

export interface PersonalRecord {
  exerciseId: ID
  kg: number
  previousKg: number
}

export interface WorkoutSummary {
  setsDone: number
  setsTotal: number
  /** Summa kg × reps för avbockade set. */
  volumeKg: number
  /** Övningar där tyngsta setet slog det tidigare bästa (bara övningar med historik). */
  records: PersonalRecord[]
  /** Genomförda pass denna vecka (mån–sön), inklusive det här. */
  weekCount: number
  /** Veckor i rad (till och med denna) med minst ett genomfört pass. */
  streakWeeks: number
  /** Dagar sedan förra genomförda passet, eller null om det här är det första. */
  daysSinceLast: number | null
  /** Alla genomförda pass, inklusive det här. */
  totalCompleted: number
}

const mondayOf = (d: ISODate) => addDays(d, -((parseISODate(d).getDay() + 6) % 7))
const daysBetween = (a: ISODate, b: ISODate) => Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)

/** `history` = klientens övriga pass (alla statusar går bra – bara genomförda räknas). */
export function summarizeWorkout(workout: ScheduledWorkout, history: ScheduledWorkout[]): WorkoutSummary {
  const done = workout.logs.filter((l) => l.done)
  const setsTotal = workout.exercises.reduce((s, e) => s + e.sets, 0)
  const volumeKg = Math.round(done.reduce((s, l) => s + Math.max(0, l.kg) * Math.max(0, l.reps), 0))

  const past = history.filter((w) => w.id !== workout.id && w.clientId === workout.clientId && w.status === "completed")
  const earlier = past.filter((w) => w.date <= workout.date)

  // Tyngsta avbockade set per övning (exerciseId), i det här passet och tidigare.
  const best = (w: ScheduledWorkout) => {
    const m = new Map<ID, number>()
    for (const l of w.logs) {
      if (!l.done || !(l.kg > 0) || !(l.reps > 0)) continue
      const ex = w.exercises.find((e) => e.id === l.workoutExerciseId)
      if (!ex) continue
      m.set(ex.exerciseId, Math.max(m.get(ex.exerciseId) ?? 0, l.kg))
    }
    return m
  }
  const prev = new Map<ID, number>()
  for (const w of earlier) for (const [id, kg] of best(w)) prev.set(id, Math.max(prev.get(id) ?? 0, kg))
  const records: PersonalRecord[] = []
  for (const [exerciseId, kg] of best(workout)) {
    const previousKg = prev.get(exerciseId)
    if (previousKg !== undefined && kg > previousKg) records.push({ exerciseId, kg, previousKg })
  }
  records.sort((a, b) => b.kg - b.previousKg - (a.kg - a.previousKg))

  const all = [...earlier, workout]
  const thisMonday = mondayOf(workout.date)
  const weekCount = all.filter((w) => mondayOf(w.date) === thisMonday).length
  const weeks = new Set(all.map((w) => mondayOf(w.date)))
  let streakWeeks = 0
  for (let m = thisMonday; weeks.has(m); m = addDays(m, -7)) streakWeeks++
  const last = earlier.map((w) => w.date).sort().at(-1)

  return {
    setsDone: done.length,
    setsTotal,
    volumeKg,
    records,
    weekCount,
    streakWeeks,
    daysSinceLast: last ? daysBetween(last, workout.date) : null,
    totalCompleted: past.length + 1,
  }
}

export interface Feedback {
  /** Vilken regel som valdes (för test och analys). */
  kind: "partial" | "record" | "goal" | "comeback" | "streak" | "first" | "morning" | "evening" | "default"
  headline: string
  body: string
}

const kg = (n: number) => `${n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`
const ORDINAL = ["", "Första", "Andra", "Tredje", "Fjärde", "Femte", "Sjätte", "Sjunde"]

/**
 * Kommentaren efter passet. `hour` = klockan när passet sparades (0–23),
 * `goal` = schemats dagar per vecka (om klienten har ett aktivt schema),
 * `exerciseName` = visningsnamn för en övning.
 */
export function workoutFeedback(
  s: WorkoutSummary,
  opts: { hour: number; goal?: number; exerciseName: (id: ID) => string }
): Feedback {
  const { hour, goal } = opts

  if (s.setsTotal > 0 && s.setsDone / s.setsTotal < 0.5) {
    return {
      kind: "partial",
      headline: "Passet är sparat",
      body: `${s.setsDone} av ${s.setsTotal} set. Ett kortare pass är fortfarande ett pass – rutinen håller.`,
    }
  }

  const top = s.records[0]
  if (top) {
    const more = s.records.length > 1 ? ` Rekord i ${s.records.length} övningar totalt.` : ""
    return {
      kind: "record",
      headline: `Nytt rekord i ${opts.exerciseName(top.exerciseId)}`,
      body: `${kg(top.kg)} – ${kg(top.kg - top.previousKg)} mer än ditt förra bästa.${more}`,
    }
  }

  if (goal && s.weekCount === goal) {
    return {
      kind: "goal",
      headline: "Veckans mål är nått",
      body: `${s.weekCount} av ${goal} pass den här veckan. Resten av veckan är bonus – eller återhämtning.`,
    }
  }

  if (s.daysSinceLast !== null && s.daysSinceLast >= 10) {
    return {
      kind: "comeback",
      headline: "Tillbaka i gymmet",
      body: `${s.daysSinceLast} dagar sedan förra passet. Att komma igång igen är det svåra, och det är gjort.`,
    }
  }

  if (s.streakWeeks >= 3) {
    return {
      kind: "streak",
      headline: `${s.streakWeeks} veckor i rad`,
      body: `Du har tränat varje vecka i ${s.streakWeeks} veckor. Det är jämnheten som ger resultat.`,
    }
  }

  if (s.totalCompleted === 1) {
    return {
      kind: "first",
      headline: "Första passet är loggat",
      body: "Nu finns en startpunkt. Nästa gång ser du hur du ligger till mot i dag.",
    }
  }

  const nth = s.weekCount <= 7 ? ORDINAL[s.weekCount] : `${s.weekCount}:e`
  const weekLine = `${nth} passet den här veckan.`

  if (hour >= 4 && hour < 9) {
    return { kind: "morning", headline: "Klart före nio", body: `${weekLine} Dagens träning är redan avbockad.` }
  }
  if (hour >= 20 || hour < 4) {
    return { kind: "evening", headline: "Kvällspasset är gjort", body: `${weekLine} Ät något med protein och sov gott – det är då musklerna byggs.` }
  }
  return {
    kind: "default",
    headline: "Passet är klart",
    body: s.volumeKg > 0 ? `${weekLine} ${kg(s.volumeKg)} lyft totalt på ${s.setsDone} set.` : `${weekLine} ${s.setsDone} set avklarade.`,
  }
}
