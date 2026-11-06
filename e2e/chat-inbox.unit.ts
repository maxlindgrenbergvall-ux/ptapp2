// Enhetstest för inkorgen (v42): olästa, sortering, förhandsvisning och adresser.
//   npx tsx --tsconfig tsconfig.json e2e/chat-inbox.unit.ts
import { clientInbox, previewOf, sortInbox, trainerInbox, unreadTotal } from "@/lib/chat/inbox"
import { createSeedData } from "@/lib/data/seed"
import type { AppData, Message } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}

const base = createSeedData("2026-11-06")
const msg = (id: string, threadId: string, trainerId: string, senderId: string, sentAt: string, body = "hej", readAt?: string): Message => ({ id, threadId, trainerId, senderId, sentAt, body, readAt })
const t1 = base.trainers[0].id
const [ca, cb] = base.clients.filter((c) => c.trainerId === t1)
const data: AppData = {
  ...base,
  messages: [
    msg("m1", ca.id, t1, t1, "2026-11-05T08:00:00Z", "Bra pass igår!", "2026-11-05T09:00:00Z"),
    msg("m2", ca.id, t1, ca.id, "2026-11-05T10:00:00Z", "Tack!"),
    msg("m3", cb.id, t1, cb.id, "2026-11-04T10:00:00Z", "Kan vi flytta torsdag?"),
    msg("m4", cb.id, t1, cb.id, "2026-11-04T10:05:00Z", "  Eller fredag  \n kanske "),
    msg("m5", ca.id, t1, t1, "2026-11-05T11:00:00Z", "Härligt"),
  ],
}

// ---- PT:ns inkorg ---
const pt = trainerInbox(data, t1)
const a = pt.find((r) => r.threadId === ca.id)!
const b = pt.find((r) => r.threadId === cb.id)!
check(b.unread === 2 && a.unread === 1, `olästa per klient (${cb.name}: ${b.unread}, ${ca.name}: ${a.unread})`)
check(b.preview === "Eller fredag kanske", `förhandsvisning: senaste meddelandet, ihoptryckta mellanslag ("${b.preview}")`)
check(a.preview === "Du: Härligt" && a.last?.id === "m5", "eget senaste meddelande visas som Du: …")
check(a.href === `/pt/meddelanden/${ca.id}` && b.href === `/pt/meddelanden/${cb.id}`, "varje rad leder till konversationen")
check(unreadTotal(pt) === 3, "totalt 3 olästa")
const unreadRows = pt.filter((r) => r.unread > 0)
check(pt.slice(0, unreadRows.length).every((r) => r.unread > 0), "olästa konversationer ligger överst")

// ---- klientens inkorg ---
const cl = clientInbox(data, ca.id)
const mine = cl.find((r) => r.trainerId === t1)!
check(mine.unread === 1 && mine.href === `/klient/chatt/${t1}`, `klienten: 1 oläst från PT:n, länk ${mine.href}`)
const read = { ...data, messages: data.messages.map((m) => (m.senderId === t1 ? { ...m, readAt: "2026-11-05T12:00:00Z" } : m)) }
check(clientInbox(read, ca.id).find((r) => r.trainerId === t1)!.unread === 0, "lästa meddelanden räknas inte")
check(trainerInbox(read, t1).find((r) => r.threadId === ca.id)!.unread === 1, "olästa räknas per mottagare: klientens svar är fortfarande oläst för PT:n")

// ---- trådarna hålls isär per PT ---
const other = base.trainers.find((t) => t.id !== t1)!
const multi: AppData = { ...data, messages: [...data.messages, msg("x1", ca.id, other.id, other.id, "2026-11-06T07:00:00Z", "Hej från en annan PT")] }
check(trainerInbox(multi, t1).find((r) => r.threadId === ca.id)!.unread === 1, "en annan PT:s meddelande syns inte i PT:ns tråd")

// ---- förhandsvisning: samtal och bilagor ---
check(previewOf(msg("c", ca.id, t1, t1, "", "📵 Missat videosamtal"), ca.id) === "Missat videosamtal", "missat samtal")
check(previewOf({ ...msg("i", ca.id, t1, ca.id, "", ""), attachments: [{ id: "a", name: "x.jpg", mime: "image/jpeg", size: 1, kind: "image", ref: "r" }] }, ca.id) === "Du: Bild", "bild utan text")
check(previewOf(undefined, ca.id) === "Ingen konversation än", "ingen konversation")

// ---- sortering ---
const s = sortInbox([
  { ...a, key: "1", unread: 0, last: msg("n", "", "", "", "2026-11-06T10:00:00Z") },
  { ...a, key: "2", unread: 1, last: msg("o", "", "", "", "2026-11-01T10:00:00Z") },
  { ...a, key: "3", unread: 0, last: undefined },
])
check(s.map((r) => r.key).join(",") === "2,1,3", `oläst först, sedan nyast, tomma sist (${s.map((r) => r.key)})`)

console.log(failed ? `\n${failed} fel` : "\nINKORGEN GODKÄND")
process.exit(failed ? 1 : 0)
