import assert from "node:assert/strict"
import { summarizeWorkout, workoutFeedback } from "../src/lib/workout-summary"
import type { ScheduledWorkout } from "../src/types/domain"

let n = 0
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++; console.log("  ok  ", msg) }

const w = (id: string, date: string, sets: [kg: number, reps: number, done?: boolean][], status: ScheduledWorkout["status"] = "completed", exerciseId = "squat"): ScheduledWorkout => ({
  id, clientId: "c1", templateId: null, name: id, date, status,
  exercises: [{ id: `${id}-e`, exerciseId, sets: sets.length, reps: "8" } as ScheduledWorkout["exercises"][number]],
  logs: sets.map(([kg, reps, done = true], i) => ({ workoutExerciseId: `${id}-e`, setIndex: i, kg, reps, done })),
})
const name = (id: string) => ({ squat: "Knäböj", bench: "Bänkpress" })[id] ?? id
const fb = (cur: ScheduledWorkout, hist: ScheduledWorkout[], hour = 14, goal?: number) => workoutFeedback(summarizeWorkout(cur, hist), { hour, goal, exerciseName: name })

// Onsdag 2026-11-18.
const today = w("today", "2026-11-18", [[100, 5], [100, 5], [90, 8]])
const s = summarizeWorkout(today, [])
ok(s.volumeKg === 100 * 5 * 2 + 90 * 8, "volym = kg × reps för avbockade set")
ok(s.setsDone === 3 && s.setsTotal === 3, "set räknas")
ok(s.totalCompleted === 1 && s.daysSinceLast === null, "första passet")
ok(fb(today, []).kind === "first", "första passet får egen kommentar")

const older = w("old", "2026-11-16", [[95, 5]])
const rec = fb(today, [older])
ok(rec.kind === "record" && rec.headline === "Nytt rekord i Knäböj", "rekord: tyngre än förra bästa")
ok(/100 kg – 5 kg mer/.test(rec.body), "rekordtexten anger vikt och skillnad")
ok(summarizeWorkout(w("t", "2026-11-18", [[100, 5]], "completed", "bench"), [older]).records.length === 0, "ny övning är inget rekord")
ok(summarizeWorkout(today, [older, w("x", "2026-11-17", [[200, 5, false]])]).records.length === 1, "ej avbockade set räknas inte som tidigare bästa")
ok(summarizeWorkout(today, [older, w("future", "2026-11-20", [[150, 5]])]).records.length === 1, "senare pass påverkar inte rekordet")
ok(summarizeWorkout(today, [w("p", "2026-11-17", [[150, 5]], "planned")]).totalCompleted === 1, "planerade pass räknas inte")

const same = w("same", "2026-11-17", [[100, 5]])
ok(fb(today, [same], 14, 2).kind === "goal", "veckans mål nått (2 av 2)")
ok(fb(today, [same], 14, 3).kind !== "goal", "inte nått vid 2 av 3")
ok(fb(today, [w("long", "2026-11-02", [[120, 5]])]).kind === "comeback", "comeback efter 16 dagar")
const streak = [w("a", "2026-11-11", [[120, 5]]), w("b", "2026-11-04", [[120, 5]])]
ok(summarizeWorkout(today, streak).streakWeeks === 3, "tre veckor i rad")
ok(fb(today, streak).kind === "streak", "svit-kommentar")
const base = [w("y", "2026-11-17", [[120, 5]])]
ok(fb(today, base, 7).kind === "morning", "morgonpass")
ok(fb(today, base, 21).kind === "evening", "kvällspass")
const d = fb(today, base, 14)
ok(d.kind === "default" && d.body.startsWith("Andra passet den här veckan."), "dagtid: vilket pass i veckan")
ok(fb(w("half", "2026-11-18", [[100, 5], [0, 0, false], [0, 0, false]]), base).kind === "partial", "under hälften av seten: ärlig kommentar")
ok(JSON.stringify(fb(today, base, 14)) === JSON.stringify(fb(today, base, 14)), "samma pass ger samma text")
const all = [rec, d, fb(today, base, 7), fb(today, base, 21), fb(today, streak), fb(today, [])]
ok(all.every((f) => !/!/.test(f.headline + f.body)), "inga utropstecken")
ok(all.every((f) => !/fantastisk|otrolig|grym|stjärna|bäst i världen|🔥|💪/i.test(f.headline + f.body)), "inga tomma superlativ eller emojis")
console.log(`\n${n} kontroller godkända`)
