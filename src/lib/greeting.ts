/**
 * Tidsbaserad hälsning på hemskärmen (v35), efter enhetens lokala klocka:
 *   05:00–09:59  "God morgon Sara"
 *   10:00–17:59  "Hej Sara!"
 *   18:00–04:59  "God kväll Sara"
 * Utan förnamn: "God morgon", "Hej!", "God kväll".
 */
export type DayPart = "morning" | "day" | "evening"

export const MORNING_START = 5
export const DAY_START = 10
export const EVENING_START = 18

export function dayPart(date: Date): DayPart {
  const h = date.getHours()
  if (h >= MORNING_START && h < DAY_START) return "morning"
  if (h >= DAY_START && h < EVENING_START) return "day"
  return "evening"
}

export function greeting(part: DayPart, name?: string | null): string {
  const n = name?.trim()
  if (part === "morning") return n ? `God morgon ${n}` : "God morgon"
  if (part === "evening") return n ? `God kväll ${n}` : "God kväll"
  return n ? `Hej ${n}!` : "Hej!"
}
