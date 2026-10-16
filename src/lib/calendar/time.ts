/** Tidshjälpare för kalendern. Allt räknas i användarens lokala tid (svensk tid för våra användare). */

export const MINUTE = 60_000
export const DAY = 24 * 60 * MINUTE

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * MINUTE)
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** ISO-veckodag: 1 = måndag … 7 = söndag. */
export const isoWeekday = (d: Date) => ((d.getDay() + 6) % 7) + 1
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -(isoWeekday(d) - 1))
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

/** "HH:MM" på en viss dag → Date (lokal tid). */
export function atTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
}

export const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** Överlappar två halvöppna intervall [aStart, aEnd) och [bStart, bEnd)? */
export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd

export function localISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("sv-SE", o)
const timeFmt = fmt({ hour: "2-digit", minute: "2-digit" })
const dayFmt = fmt({ weekday: "long", day: "numeric", month: "long" })
const shortDayFmt = fmt({ weekday: "short", day: "numeric", month: "short" })
const monthFmt = fmt({ month: "long", year: "numeric" })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const formatTime = (d: Date) => timeFmt.format(d)
export const formatTimeRange = (start: Date, end: Date) => `${timeFmt.format(start)}–${timeFmt.format(end)}`
export const formatDayLong = (d: Date) => cap(dayFmt.format(d))
export const formatDayShort = (d: Date) => cap(shortDayFmt.format(d))
export const formatMonth = (d: Date) => cap(monthFmt.format(d))
export const WEEKDAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"]
export const WEEKDAY_LONG = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"]

/** ISO-veckonummer. */
export function isoWeek(d: Date) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 4 - isoWeekday(d))
  const yearStart = new Date(t.getFullYear(), 0, 1)
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7)
}
