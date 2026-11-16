/**
 * Flytta pass (v56) – rena funktioner, enhetstestade i e2e/workout-move.unit.ts.
 *
 * Klienten flyttar sina EGNA planerade pass med ett tryck (eller drag-and-drop
 * i veckovyn). PT:ns pass och bokade tider flyttas inte här: databasen låter
 * inte klienten ändra datum på PT:ns pass, och en bokad tid flyttas via
 * kalenderns "Föreslå ny tid" så att PT:n får frågan.
 */
import { addDays, parseISODate } from "@/lib/date"
import type { ISODate, ScheduledWorkout } from "@/types/domain"

export type MoveBlock = "done" | "started" | "booked" | "pt"
export const MOVE_BLOCK_TEXT: Record<MoveBlock, string> = {
  done: "Passet är redan genomfört",
  started: "Passet är påbörjat – avsluta det eller logga det den här dagen",
  booked: "Bokat pass med PT – föreslå en ny tid i kalendern",
  pt: "PT:ns pass – be din PT flytta det, eller skriv i chatten",
}

type W = Pick<ScheduledWorkout, "id" | "date" | "status" | "logs" | "eventId" | "trainerId" | "byClient" | "clientId" | "name">

/** Varför passet inte kan flyttas (null = det går). */
export function moveBlock(w: W): MoveBlock | null {
  if (w.status === "completed" || w.status === "skipped") return "done"
  if (w.status === "in_progress" || w.logs.some((l) => l.done)) return "started"
  if (w.eventId) return "booked"
  // Bara klientens egna pass (trainer_id null i databasen). Saknat trainerId utan byClient = PT:ns pass i äldre data.
  if (!w.byClient || w.trainerId) return "pt"
  return null
}
export const canMove = (w: W) => moveBlock(w) === null

/** Dagarna man kan välja: idag och två veckor framåt. */
export function moveDays(today: ISODate, count = 14): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i))
}

export type MovePlan =
  | { kind: "same" }
  | { kind: "move" }
  /** Dagen har ett eget pass som kan byta plats. */
  | { kind: "swap"; other: W }
  /** Dagen har pass som inte går att byta med (PT:ns eller bokade) – flytta ändå går bra. */
  | { kind: "busy"; others: W[] }

/** Vad händer om passet flyttas till `date`? */
export function planMove(workouts: W[], workout: W, date: ISODate): MovePlan {
  if (date === workout.date) return { kind: "same" }
  const there = workouts.filter((x) => x.id !== workout.id && x.clientId === workout.clientId && x.date === date && x.status !== "skipped" && x.status !== "completed")
  if (!there.length) return { kind: "move" }
  const swappable = there.filter(canMove)
  if (there.length === 1 && swappable.length === 1) return { kind: "swap", other: swappable[0] }
  return { kind: "busy", others: there }
}

const WEEKDAY = new Intl.DateTimeFormat("sv-SE", { weekday: "long" })
/** "tisdag", "idag", "imorgon". */
export function dayName(date: ISODate, today: ISODate): string {
  if (date === today) return "idag"
  if (date === addDays(today, 1)) return "imorgon"
  return WEEKDAY.format(parseISODate(date))
}
