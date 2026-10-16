/**
 * Lediga tider och krockkontroll. Samma regler som databasfunktionen
 * available_slots (supabase/migrations/*_v4_calendar.sql), så att demoläget
 * beter sig som produktionen:
 *  - veckoregler per ISO-veckodag; datumregler ersätter veckoreglerna den dagen
 *  - en tid är ledig om den inte överlappar en aktiv händelse (väntande eller
 *    bekräftad bokning, eget pass eller blockering)
 *  - tider inom PT:ns minsta framförhållning visas inte
 */
import { addDays, addMinutes, atTime, isoWeekday, localISODate, overlaps, startOfDay } from "@/lib/calendar/time"
import type { AvailabilityRule, CalendarEvent, Slot } from "@/types/domain"

export const ACTIVE_STATUSES = ["pending", "confirmed"] as const
export const isActive = (e: CalendarEvent) => e.status === "pending" || e.status === "confirmed"

export function computeSlots({
  trainerId,
  rules,
  events,
  from,
  to,
  minNoticeMinutes = 120,
  now = new Date(),
}: {
  trainerId: string
  rules: AvailabilityRule[]
  events: CalendarEvent[]
  from: Date
  to: Date
  minNoticeMinutes?: number
  now?: Date
}): Slot[] {
  const own = rules.filter((r) => r.trainerId === trainerId)
  const busy = events.filter((e) => e.trainerId === trainerId && isActive(e)).map((e) => [new Date(e.start), new Date(e.end)] as const)
  const earliest = new Date(Math.max(from.getTime(), now.getTime() + minNoticeMinutes * 60_000))
  const out: Slot[] = []

  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    const iso = localISODate(day)
    const dated = own.filter((r) => r.date === iso)
    const dayRules = dated.length ? dated : own.filter((r) => r.weekday === isoWeekday(day))
    for (const r of dayRules) {
      const close = atTime(day, r.end)
      for (let s = atTime(day, r.start); addMinutes(s, r.slotMinutes) <= close; s = addMinutes(s, r.slotMinutes)) {
        const e = addMinutes(s, r.slotMinutes)
        if (s < earliest || e > to) continue
        if (busy.some(([bs, be]) => overlaps(s, e, bs, be))) continue
        out.push({ start: s.toISOString(), end: e.toISOString() })
      }
    }
  }
  // Överlappande regler kan ge samma tid två gånger.
  const seen = new Set<string>()
  return out
    .filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)))
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** Första aktiva händelse som krockar med [start, end) hos PT:n, om någon. */
export function findConflict(events: CalendarEvent[], trainerId: string, start: Date, end: Date, ignoreId?: string) {
  return events.find(
    (e) => e.trainerId === trainerId && e.id !== ignoreId && isActive(e) && overlaps(start, end, new Date(e.start), new Date(e.end))
  )
}

/** Dagar (lokala ISO-datum) som har minst en ledig tid. */
export const daysWithSlots = (slots: Slot[]) => [...new Set(slots.map((s) => localISODate(new Date(s.start))))]

