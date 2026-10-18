/**
 * Passsaldo och kostbehörighet – samma regler som databasen
 * (session_balance / has_nutrition_access i migration v11):
 *
 *   betalda pass  = summan av pass i betalda köp hos PT:n
 *   använda pass  = schemalagda träningspass + aktiva kalenderpass utan kopplat
 *                   träningspass (preliminära, bekräftade och genomförda)
 *   kvar          = betalda − använda
 *
 * Avbokade pass räknas inte, så en avbokning ger tillbaka passet.
 */
import type { AppData, ID, TrainerService } from "@/types/domain"

export interface SessionBalance {
  paid: number
  used: number
  remaining: number
}

export function sessionBalance(data: AppData, trainerId: ID, clientId: ID): SessionBalance {
  const paid = data.purchases
    .filter((p) => p.trainerId === trainerId && p.clientId === clientId && p.status === "paid")
    .reduce((sum, p) => sum + p.sessions, 0)
  const clientTrainer = data.clients.find((c) => c.id === clientId)?.trainerId
  const workouts = data.workouts.filter((w) => w.clientId === clientId && (w.trainerId ?? clientTrainer) === trainerId).length
  const events = data.events.filter(
    (e) =>
      e.trainerId === trainerId &&
      e.clientId === clientId &&
      e.kind === "session" &&
      !e.workoutId &&
      (e.status === "pending" || e.status === "confirmed" || e.status === "completed")
  ).length
  const used = workouts + events
  return { paid, used, remaining: Math.max(0, paid - used) }
}

export function hasNutritionAccess(data: AppData, trainerId: ID, clientId: ID): boolean {
  return data.purchases.some((p) => p.trainerId === trainerId && p.clientId === clientId && p.status === "paid" && p.includesNutrition)
}

export const noCreditMessage = (b: SessionBalance) =>
  `Inga betalda pass kvar (${b.used} av ${b.paid} använda). Klienten behöver köpa fler pass.`

/** Aktiva tjänster för en PT, i menyordning: enstaka, paket, helhet, kost. */
export function activeServices(data: AppData, trainerId: ID): TrainerService[] {
  const order = { single: 0, package: 1, full: 2, nutrition: 3 } as const
  return data.services
    .filter((s) => s.trainerId === trainerId && s.active)
    .sort((a, b) => order[a.kind] - order[b.kind] || a.priceSek - b.priceSek)
}

/** "1 pass" / "5 pass" / "Kostcoaching" – kort beskrivning av vad som ingår. */
export function serviceSummary(s: Pick<TrainerService, "sessions" | "includesNutrition" | "durationWeeks">) {
  const parts: string[] = []
  if (s.sessions > 0) parts.push(`${s.sessions} pass`)
  if (s.includesNutrition) parts.push("kostcoaching")
  if (s.durationWeeks) parts.push(`${s.durationWeeks} veckor`)
  const text = parts.join(" · ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
