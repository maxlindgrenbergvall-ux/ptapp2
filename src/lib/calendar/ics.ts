/**
 * iCalendar (RFC 5545) för export och prenumeration i Google Calendar,
 * Outlook och Apple Kalender. Ren funktion utan beroenden – används både av
 * servern (prenumerationslänken) och i webbläsaren (ladda ner .ics).
 */
import { BRAND } from "@/lib/brand"

export interface IcsEvent {
  id: string
  title: string
  start: Date
  end: Date
  status: "pending" | "confirmed" | "cancelled" | "completed"
  location?: string
  description?: string
  /** Senast ändrad – låter kalenderappen se att passet flyttats. */
  updated?: Date
}

/** 20261020T070000Z */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** Escape enligt RFC 5545 §3.3.11. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")

/** Radbrytning ("folding") vid 75 oktetter, utan att dela UTF-8-tecken. */
function fold(line: string) {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ""
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74 // fortsättningsrader börjar med ett mellanslag
    if (enc.encode(current + ch).length > limit) {
      parts.push(current)
      current = ch
    } else current += ch
  }
  parts.push(current)
  return parts.join("\r\n ")
}

const STATUS: Record<IcsEvent["status"], string> = {
  pending: "TENTATIVE",
  confirmed: "CONFIRMED",
  completed: "CONFIRMED",
  cancelled: "CANCELLED",
}

export function buildIcs(events: IcsEvent[], opts: { name: string; now?: Date; host?: string }): string {
  const now = utc(opts.now ?? new Date())
  const host = opts.host ?? "coavira.fit"
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${BRAND.name}//Kalender//SV`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(opts.name)}`,
    "X-WR-TIMEZONE:Europe/Stockholm",
    // Hur ofta kalenderappen bör hämta om (Google/Outlook bestämmer själva i praktiken).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ]
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@${host}`,
      `DTSTAMP:${now}`,
      `DTSTART:${utc(e.start)}`,
      `DTEND:${utc(e.end)}`,
      `SUMMARY:${text(e.title)}`,
      `STATUS:${STATUS[e.status]}`,
      // SEQUENCE ökar när passet ändras, så att kalenderappen uppdaterar det.
      `SEQUENCE:${Math.floor((e.updated ?? e.start).getTime() / 1000) % 2_000_000_000}`,
      ...(e.updated ? [`LAST-MODIFIED:${utc(e.updated)}`] : []),
      ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []),
      "TRANSP:OPAQUE",
      "END:VEVENT"
    )
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}

/** Rubrik för ett pass i den externa kalendern. */
export function icsTitle(e: {
  kind: "session" | "block"
  title: string
  status: IcsEvent["status"]
  counterpart?: string | null
  role: "trainer" | "client"
}) {
  const prefix = e.status === "pending" ? "Preliminärt: " : ""
  if (e.kind === "block") return `${prefix}${e.title || "Upptagen"}`
  if (e.role === "client") return `${prefix}PT-pass med ${e.counterpart ?? "din PT"}`
  return `${prefix}${e.counterpart ? `${e.counterpart} – ${e.title || "PT-pass"}` : e.title || "Eget pass"}`
}

/** Länkar för att prenumerera på en .ics-URL i de vanliga kalenderapparna. */
export function subscribeLinks(httpsUrl: string, name: string) {
  const webcal = httpsUrl.replace(/^https?:\/\//, "webcal://")
  return {
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent(name)}`,
    office365: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent(name)}`,
    apple: webcal,
  }
}
