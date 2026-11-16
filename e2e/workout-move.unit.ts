// Enhetstest för att flytta pass (v56): vad som får flyttas, byt plats och dagnamn.
//   npx tsx --tsconfig tsconfig.json e2e/workout-move.unit.ts
import { canMove, dayName, moveBlock, moveDays, planMove } from "@/lib/workout-move"
import { createSeedData } from "@/lib/data/seed"
import { reducer } from "@/lib/data/state"
import type { ScheduledWorkout } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const w = (id: string, date: string, extra: Partial<ScheduledWorkout> = {}) =>
  ({ id, clientId: "c1", trainerId: null, byClient: true, date, name: id, status: "planned", logs: [], exercises: [], ...extra }) as unknown as ScheduledWorkout

check(canMove(w("a", "2026-11-16")), "eget planerat pass kan flyttas")
check(moveBlock(w("a", "2026-11-16", { status: "completed" })) === "done", "genomfört pass flyttas inte")
check(moveBlock(w("a", "2026-11-16", { status: "skipped" })) === "done", "hoppat pass flyttas inte")
check(moveBlock(w("a", "2026-11-16", { status: "in_progress" })) === "started", "påbörjat pass flyttas inte")
check(moveBlock(w("a", "2026-11-16", { logs: [{ done: true }] as never })) === "started", "pass med avbockade set flyttas inte")
check(moveBlock(w("a", "2026-11-16", { eventId: "ev1" })) === "booked", "bokat pass flyttas via kalendern")
check(moveBlock(w("a", "2026-11-16", { trainerId: "t1", byClient: false })) === "pt", "PT:ns pass flyttas inte av klienten (databasen stoppar det)")
check(moveBlock(w("a", "2026-11-16", { trainerId: undefined, byClient: undefined })) === "pt", "pass utan byClient räknas som PT:ns (äldre data)")
check(moveBlock(w("a", "2026-11-16", { trainerId: "t1", byClient: true })) === "pt", "pass med trainer_id kan inte flyttas av klienten (triggern stoppar det)")

const days = moveDays("2026-11-16")
check(days.length === 14 && days[0] === "2026-11-16" && days[13] === "2026-11-29", "dagväljaren visar idag + 13 dagar")
check(moveDays("2026-12-30", 4).join() === "2026-12-30,2026-12-31,2027-01-01,2027-01-02", "dagarna går över årsskiftet")

const a = w("a", "2026-11-16")
const b = w("b", "2026-11-18")
const pt = w("pt", "2026-11-19", { trainerId: "t1", byClient: false })
const done = w("d", "2026-11-20", { status: "completed" })
const other = w("o", "2026-11-21", { clientId: "c2" })
const all = [a, b, pt, done, other]
check(planMove(all, a, "2026-11-16").kind === "same", "samma dag = inget händer")
check(planMove(all, a, "2026-11-17").kind === "move", "ledig dag = flytta direkt")
const swap = planMove(all, a, "2026-11-18")
check(swap.kind === "swap" && swap.other.id === "b", "dag med ett eget pass = byt plats")
const busy = planMove(all, a, "2026-11-19")
check(busy.kind === "busy" && busy.others[0].id === "pt", "dag med PT:ns pass = går att lägga båda, men inte byta")
check(planMove(all, a, "2026-11-20").kind === "move", "ett genomfört pass räknas inte som upptaget")
check(planMove(all, a, "2026-11-21").kind === "move", "andra klienters pass räknas inte")
check(planMove([...all, w("b2", "2026-11-18")], a, "2026-11-18").kind === "busy", "två pass samma dag = inget byte, bara lägg till")

check(dayName("2026-11-16", "2026-11-16") === "idag", "idag")
check(dayName("2026-11-17", "2026-11-16") === "imorgon", "imorgon")
check(dayName("2026-11-18", "2026-11-16") === "onsdag", "veckodag på svenska")

// Reducern: setWorkoutDate ändrar bara datumet.
const s0 = createSeedData("2026-11-16")
const target = s0.workouts[0]
const s1 = reducer(s0, { type: "setWorkoutDate", workoutId: target.id, date: "2027-01-05" })!
const moved = s1.workouts.find((x) => x.id === target.id)!
check(moved.date === "2027-01-05" && moved.name === target.name && moved.exercises.length === target.exercises.length, "setWorkoutDate flyttar passet och behåller allt annat")
check(s1.workouts.length === s0.workouts.length, "inga pass försvinner")

if (failed) {
  console.log(`${failed} fel`)
  process.exit(1)
}
