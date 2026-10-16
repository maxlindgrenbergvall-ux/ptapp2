/**
 * Vilken avisering en kalenderändring ger, och till vem.
 *
 * Exakt samma regler som triggern notify_calendar_change() i
 * supabase/migrations/20261018000000_v5_reschedule_notifications_offers.sql.
 * I Supabase-läget skapar databasen aviseringen; i demoläget används den här
 * funktionen så att båda lägena beter sig likadant.
 */
import type { AppNotification, CalendarEvent, ID, NotificationKind } from "@/types/domain"

export function notificationKindFor(prev: CalendarEvent | undefined, next: CalendarEvent, actorId: ID): NotificationKind | null {
  if (next.kind !== "session" || !next.clientId) return null
  if (actorId !== next.trainerId && actorId !== next.clientId) return null

  if (!prev) {
    if (next.status === "pending") return actorId === next.clientId ? "booking_requested" : "booking_proposed"
    if (next.status === "confirmed") return "booking_confirmed"
    return null
  }
  if (next.status === "cancelled" && prev.status !== "cancelled") {
    return prev.status === "pending" && prev.awaiting === "trainer" && actorId === next.trainerId ? "booking_declined" : "event_cancelled"
  }
  if (next.status === "confirmed" && prev.status === "pending") {
    return actorId === next.clientId ? "reschedule_accepted" : "booking_confirmed"
  }
  if ((next.status === "pending" || next.status === "confirmed") && (next.start !== prev.start || next.end !== prev.end)) {
    return "event_rescheduled"
  }
  return null
}

/** Aviseringar till motparten för alla händelser som ändrats mellan två tillstånd. */
export function diffNotifications(
  before: CalendarEvent[],
  after: CalendarEvent[],
  actor: { id: ID; name: string },
  newId: () => ID,
  now = new Date().toISOString()
): AppNotification[] {
  const old = new Map(before.map((e) => [e.id, e]))
  const out: AppNotification[] = []
  for (const next of after) {
    const prev = old.get(next.id)
    if (prev === next) continue
    const kind = notificationKindFor(prev, next, actor.id)
    if (!kind) continue
    out.push({
      id: newId(),
      userId: actor.id === next.trainerId ? next.clientId! : next.trainerId,
      actorId: actor.id,
      actorName: actor.name,
      kind,
      eventId: next.id,
      title: next.title,
      start: next.start,
      end: next.end,
      ...(kind === "event_rescheduled" && prev ? { previousStart: prev.start, previousEnd: prev.end } : {}),
      createdAt: now,
    })
  }
  return out
}
