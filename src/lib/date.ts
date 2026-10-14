import type { ISODate } from "@/types/domain"

/** Lokal kalenderdag som `YYYY-MM-DD` (inte UTC, så att "idag" stämmer kvällstid). */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d)
}

const dayFmt = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" })
const shortFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" })
const timeFmt = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" })
const slotFmt = new Intl.DateTimeFormat("sv-SE", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

export const formatDay = (date: ISODate) => capitalize(dayFmt.format(parseISODate(date)))
export const formatShort = (date: ISODate) => shortFmt.format(parseISODate(date))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatSlot = (iso: string) => slotFmt.format(new Date(iso))

/** "idag", "igår", "3 dagar sedan" … för senaste-aktivitet-kolumner. */
export function relativeDay(date: ISODate, today: ISODate = todayISO()): string {
  const diff = Math.round(
    (parseISODate(today).getTime() - parseISODate(date).getTime()) / 86_400_000
  )
  if (diff === 0) return "idag"
  if (diff === 1) return "igår"
  if (diff === -1) return "imorgon"
  if (diff > 1) return `${diff} dagar sedan`
  return `om ${-diff} dagar`
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
