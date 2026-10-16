/**
 * Kalenderposter: bokningar/pass/blockeringar och planerade träningspass
 * (schemalagda pass utan bokad tid) i en gemensam form för vyerna.
 *
 * Färgkodning (alltid med text/ikon bredvid, aldrig bara färg):
 *   Gul  = väntar på bekräftelse
 *   Grön = bekräftat pass
 *   Blå  = planerat träningspass utan bokning
 *   Grå  = blockerad tid · Dämpad grön = genomfört · Överstruken = avbokat
 */
import { addDays, DAY, overlaps, startOfDay } from "@/lib/calendar/time"
import { parseISODate } from "@/lib/date"
import type { AppData, CalendarEvent, ScheduledWorkout } from "@/types/domain"

export type Tone = "pending" | "confirmed" | "completed" | "cancelled" | "block" | "planned"

export interface CalItem {
  id: string
  start: Date
  end: Date
  /** Heldagsposter (planerade pass, långa blockeringar) visas i en egen rad överst. */
  allDay: boolean
  title: string
  subtitle?: string
  tone: Tone
  event?: CalendarEvent
  workout?: ScheduledWorkout
}

export const TONE_LABEL: Record<Tone, string> = {
  pending: "Väntar på bekräftelse",
  confirmed: "Bekräftat pass",
  completed: "Genomfört",
  cancelled: "Avbokat",
  block: "Blockerad tid",
  planned: "Planerat träningspass",
}

/** Klasser för en post. Text står i textfärg; färgen bärs av bakgrund och vänsterkant. */
export const TONE_CLASS: Record<Tone, string> = {
  pending: "border-l-warning bg-warning/20 hover:bg-warning/30",
  confirmed: "border-l-primary bg-primary/15 hover:bg-primary/25",
  completed: "border-l-primary/40 bg-primary/5 text-muted-foreground hover:bg-primary/10",
  cancelled: "border-l-muted-foreground/40 bg-muted/60 text-muted-foreground line-through",
  block:
    "border-l-muted-foreground/60 bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)] text-muted-foreground hover:bg-muted",
  planned: "border-l-chart-1 bg-chart-1/15 hover:bg-chart-1/25",
}

/** Liten färgprick för legender och listor. */
export const TONE_DOT: Record<Tone, string> = {
  pending: "bg-warning",
  confirmed: "bg-primary",
  completed: "bg-primary/40",
  cancelled: "bg-muted-foreground/40",
  block: "bg-muted-foreground/60",
  planned: "bg-chart-1",
}

export function toneOf(e: CalendarEvent): Tone {
  if (e.kind === "block") return "block"
  return e.status
}

const LONG = DAY - 60_000

export function buildItems(
  data: AppData,
  trainerId: string,
  opts: { showCancelled: boolean; clientName: (id: string) => string }
): CalItem[] {
  const events = data.events.filter((e) => e.trainerId === trainerId && (opts.showCancelled || e.status !== "cancelled"))
  const linked = new Set(events.filter((e) => e.workoutId && e.status !== "cancelled").map((e) => e.workoutId))
  const clientIds = new Set(data.clients.filter((c) => c.trainerId === trainerId).map((c) => c.id))

  const items: CalItem[] = events.map((e) => {
    const start = new Date(e.start)
    const end = new Date(e.end)
    const who = e.clientId ? opts.clientName(e.clientId) : undefined
    const workout = e.workoutId ? data.workouts.find((w) => w.id === e.workoutId) : undefined
    return {
      id: e.id,
      start,
      end,
      allDay: end.getTime() - start.getTime() >= LONG,
      title: e.kind === "block" ? e.title || "Upptagen" : who ?? (e.title || "Eget pass"),
      subtitle: e.kind === "block" ? undefined : [who ? e.title : undefined, workout?.name].filter(Boolean).join(" · ") || undefined,
      tone: toneOf(e),
      event: e,
    }
  })

  // Planerade pass (schemalagda i passbyggaren) utan bokad tid → blå heldagsposter.
  for (const w of data.workouts) {
    if (!clientIds.has(w.clientId) || linked.has(w.id) || w.status === "completed" || w.status === "skipped") continue
    const day = parseISODate(w.date)
    items.push({
      id: `w-${w.id}`,
      start: day,
      end: addDays(day, 1),
      allDay: true,
      title: opts.clientName(w.clientId),
      subtitle: w.name,
      tone: "planned",
      workout: w,
    })
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Poster som berör en viss dag. */
export function itemsOnDay(items: CalItem[], day: Date) {
  const s = startOfDay(day)
  const e = addDays(s, 1)
  return items.filter((i) => overlaps(i.start, i.end, s, e))
}

/**
 * Lägger överlappande poster sida vid sida: varje post får en kolumn och antalet
 * kolumner i sin grupp (för bredd/position i tidsrutnätet).
 */
export function layoutColumns(items: CalItem[]) {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())
  const out = new Map<string, { col: number; cols: number }>()
  let group: CalItem[] = []
  let groupEnd = 0
  let colEnds: number[] = []
  const flush = () => {
    const cols = colEnds.length
    for (const i of group) out.set(i.id, { col: out.get(i.id)!.col, cols })
    group = []
    colEnds = []
  }
  for (const item of sorted) {
    if (group.length && item.start.getTime() >= groupEnd) flush()
    let col = colEnds.findIndex((end) => end <= item.start.getTime())
    if (col === -1) {
      col = colEnds.length
      colEnds.push(item.end.getTime())
    } else colEnds[col] = item.end.getTime()
    out.set(item.id, { col, cols: 1 })
    group.push(item)
    groupEnd = Math.max(groupEnd, item.end.getTime())
  }
  flush()
  return out
}
