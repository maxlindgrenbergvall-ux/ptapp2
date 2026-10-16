/**
 * Hur aviseringar visas: gruppering och texter ur mottagarens perspektiv.
 */
import { formatDayShort, formatTimeRange } from "@/lib/calendar/time"
import type { AppNotification, NotificationKind, UserRole } from "@/types/domain"

export interface NotificationGroup {
  id: string
  kind: NotificationKind
  items: AppNotification[]
  actorName: string
  createdAt: string
  unread: boolean
}

/** Avbokningar från samma person inom en timme visas som en avisering ("avbokade 3 pass"). */
const GROUP_WINDOW_MS = 60 * 60_000

export function groupNotifications(list: AppNotification[]): NotificationGroup[] {
  const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const groups: NotificationGroup[] = []
  for (const n of sorted) {
    const last = groups.at(-1)
    if (
      last &&
      n.kind === "event_cancelled" &&
      last.kind === "event_cancelled" &&
      last.items[0].actorId === n.actorId &&
      new Date(last.items.at(-1)!.createdAt).getTime() - new Date(n.createdAt).getTime() <= GROUP_WINDOW_MS
    ) {
      last.items.push(n)
      last.unread ||= !n.readAt
      continue
    }
    groups.push({
      id: n.id,
      kind: n.kind,
      items: [n],
      actorName: n.actorName ?? "Någon",
      createdAt: n.createdAt,
      unread: !n.readAt,
    })
  }
  return groups
}

const when = (n: AppNotification) => (n.start && n.end ? `${formatDayShort(new Date(n.start))} ${formatTimeRange(new Date(n.start), new Date(n.end))}` : "")
const whenPrev = (n: AppNotification) =>
  n.previousStart && n.previousEnd ? `${formatDayShort(new Date(n.previousStart))} ${formatTimeRange(new Date(n.previousStart), new Date(n.previousEnd))}` : ""

/** Rubrik och detaljrad för en grupp, sett från mottagaren. */
export function describeGroup(g: NotificationGroup, role: UserRole): { title: string; detail: string; previous?: string } {
  // Klienten ser sin PT:s förnamn; PT:n ser klientens fullständiga namn (har många klienter).
  const who = role === "client" ? g.actorName.split(" ")[0] : g.actorName
  const n = g.items[0]
  switch (g.kind) {
    case "booking_requested":
      return { title: `${who} vill boka ett pass`, detail: when(n) }
    case "booking_proposed":
      return { title: `${who} föreslår ett pass`, detail: when(n) }
    case "booking_confirmed":
      return { title: role === "client" ? `${who} har bekräftat ditt pass` : `${who}s pass är bekräftat`, detail: when(n) }
    case "booking_declined":
      return { title: `${who} kunde inte ta din förfrågan`, detail: `${when(n)} · välj gärna en annan tid` }
    case "event_cancelled":
      return g.items.length > 1
        ? { title: `${who} avbokade ${g.items.length} pass`, detail: [...g.items].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")).map(when).join(" · ") }
        : { title: `${who} avbokade ett pass`, detail: when(n) }
    case "event_rescheduled":
      return {
        title: role === "client" ? `${who} har flyttat ditt pass` : `${who} föreslår en ny tid`,
        detail: when(n),
        previous: whenPrev(n) || undefined,
      }
    case "reschedule_accepted":
      return { title: `${who} accepterade den nya tiden`, detail: when(n) }
  }
}

/** "nyss", "för 5 min sedan", "för 3 h sedan", "igår", "12 okt." */
export function timeAgo(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const min = Math.round(diff / 60_000)
  if (min < 1) return "nyss"
  if (min < 60) return `för ${min} min sedan`
  const h = Math.round(min / 60)
  if (h < 24) return `för ${h} h sedan`
  if (h < 48) return "igår"
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
}
