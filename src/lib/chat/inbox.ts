/**
 * Inkorgen (v42): en rad per konversation (PT–klient-par) med senaste
 * meddelandet, antal olästa och adressen till konversationen.
 *
 *   Klienten: en rad per PT (aktiv, pausad eller väntande).
 *   PT:n:     en rad per klient.
 *
 * Olästa först, sedan senaste aktivitet. Ett meddelande är oläst för mig när
 * någon annan skickat det och `readAt` saknas – samma regel som i
 * markThreadRead (src/lib/data/store.tsx) och RLS-policyn för read_at.
 *
 * Ren TypeScript – enhetstestad i e2e/chat-inbox.unit.ts.
 */
import { parseCallLog } from "@/lib/calls/thread"
import type { AppData, ID, Message } from "@/types/domain"

export interface InboxThread {
  /** Unik nyckel: klient-id + PT-id. */
  key: string
  /** Tråd-id = klientens id. */
  threadId: ID
  trainerId: ID
  peer: { id: ID; name: string; avatarUrl?: string }
  last?: Message
  /** Förhandsvisning av senaste meddelandet ("Du: …", "Bild", "Missat samtal" …). */
  preview: string
  unread: number
  /** Klienten väntar på att PT:n accepterar – chatten är skrivskyddad tills dess. */
  pending: boolean
  href: string
}

const byTime = (a?: Message, b?: Message) => (b?.sentAt ?? "").localeCompare(a?.sentAt ?? "")

/** Senaste meddelandet som text i inkorgen. */
export function previewOf(m: Message | undefined, meId: ID): string {
  if (!m) return "Ingen konversation än"
  const call = !m.attachments?.length ? parseCallLog(m.body) : null
  const text = call
    ? call.missed
      ? `Missat ${call.kind === "video" ? "videosamtal" : "röstsamtal"}`
      : `${call.kind === "video" ? "Videosamtal" : "Röstsamtal"} · ${call.minutes} min`
    : m.body.trim()
      ? m.body.trim().replace(/\s+/g, " ")
      : m.attachments?.length
        ? m.attachments.every((a) => a.kind === "image")
          ? m.attachments.length > 1
            ? `${m.attachments.length} bilder`
            : "Bild"
          : "Bilaga"
        : ""
  return `${m.senderId === meId ? "Du: " : ""}${text}`
}

function thread(data: AppData, meId: ID, clientId: ID, trainerId: ID, peer: InboxThread["peer"], pending: boolean, href: string): InboxThread {
  const msgs = data.messages.filter((m) => m.threadId === clientId && m.trainerId === trainerId)
  const last = msgs.reduce<Message | undefined>((a, m) => (!a || m.sentAt > a.sentAt ? m : a), undefined)
  return {
    key: `${clientId}:${trainerId}`,
    threadId: clientId,
    trainerId,
    peer,
    last,
    preview: previewOf(last, meId),
    unread: msgs.filter((m) => m.senderId !== meId && !m.readAt).length,
    pending,
    href,
  }
}

/** Olästa först, sedan nyaste aktivitet, sedan namn. */
export function sortInbox(rows: InboxThread[]): InboxThread[] {
  return [...rows].sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || byTime(a.last, b.last) || a.peer.name.localeCompare(b.peer.name, "sv"))
}

/** Klientens inkorg: en konversation per PT. */
export function clientInbox(data: AppData, clientId: ID): InboxThread[] {
  const client = data.clients.find((c) => c.id === clientId)
  const ids = new Set(
    data.relationships.filter((r) => r.clientId === clientId && r.status !== "ended").map((r) => r.trainerId)
  )
  if (client?.trainerId) ids.add(client.trainerId)
  const rows = [...ids]
    .map((tid) => data.trainers.find((t) => t.id === tid))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => {
      const rel = data.relationships.find((r) => r.clientId === clientId && r.trainerId === t.id)
      const pending = rel ? rel.status === "pending" : client?.trainerId === t.id && client.status === "pending"
      return thread(data, clientId, clientId, t.id, { id: t.id, name: t.name, avatarUrl: t.avatarUrl }, pending, `/klient/chatt/${encodeURIComponent(t.id)}`)
    })
  return sortInbox(rows)
}

/** PT:ns inkorg: en konversation per klient. */
export function trainerInbox(data: AppData, trainerId: ID): InboxThread[] {
  const ids = new Set(data.relationships.filter((r) => r.trainerId === trainerId && r.status !== "ended").map((r) => r.clientId))
  for (const c of data.clients) if (c.trainerId === trainerId) ids.add(c.id)
  const rows = [...ids]
    .map((cid) => data.clients.find((c) => c.id === cid))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => {
      const rel = data.relationships.find((r) => r.clientId === c.id && r.trainerId === trainerId)
      const pending = rel ? rel.status === "pending" : c.status === "pending"
      return thread(data, trainerId, c.id, trainerId, { id: c.id, name: c.name, avatarUrl: c.avatarUrl }, pending, `/pt/meddelanden/${encodeURIComponent(c.id)}`)
    })
  return sortInbox(rows)
}

/** Totalt antal olästa i inkorgen (för brickan i menyn). */
export const unreadTotal = (rows: InboxThread[]) => rows.reduce((s, r) => s + r.unread, 0)
