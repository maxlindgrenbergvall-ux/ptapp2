/**
 * Samtal kräver en betalande relation: klienten har köpt en tjänst av PT:n
 * eller har ett bokat (bekräftat/genomfört) pass med hen. Ett gratiskonto kan
 * inte ringa någon PT. Samma regel som has_call_access i databasen (v14),
 * som också spärrar själva samtalskanalen (can_access_call).
 */
import { firstName } from "@/lib/names"
import type { AppData, ID } from "@/types/domain"

export function hasCallAccess(data: AppData, clientId: ID, trainerId: ID | undefined): boolean {
  if (!trainerId) return false
  return (
    data.purchases.some((p) => p.clientId === clientId && p.trainerId === trainerId && p.status === "paid") ||
    data.events.some(
      (e) => e.clientId === clientId && e.trainerId === trainerId && e.kind === "session" && (e.status === "confirmed" || e.status === "completed")
    )
  )
}

/** Förklaring när samtal är låsta, ur tittarens perspektiv. */
export function callLockedMessage(viewer: "client" | "trainer", peerName: string): string {
  return viewer === "client"
    ? `Samtal låses upp när du köpt en tjänst eller bokat ett pass med ${firstName(peerName)}.`
    : `Samtal låses upp när ${firstName(peerName)} köpt en tjänst eller bokat ett pass med dig.`
}
