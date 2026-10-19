/**
 * Rekommenderade PT:er för kostcoaching ("Dagens kost"):
 *  1. klientens nuvarande PT:er som erbjuder kostcoaching (och har en aktiv kosttjänst),
 *  2. annars andra publicerade PT:er som säljer kostcoaching, rangordnade efter
 *     kostinriktning, klientens intressen och betyg.
 */
import { myTrainers } from "@/lib/data/selectors"
import type { AppData, ID, Trainer, TrainerService } from "@/types/domain"

export interface NutritionPick {
  trainer: Trainer
  service: TrainerService
}

const nutritionService = (data: AppData, trainerId: ID) =>
  data.services
    .filter((s) => s.trainerId === trainerId && s.active && s.includesNutrition)
    .sort((a, b) => Number(b.kind === "nutrition") - Number(a.kind === "nutrition") || a.priceSek - b.priceSek)[0]

/**
 * Erbjuder PT:n kostschema på riktigt? Kräver BÅDE att PT:n kryssat i "Kost" i
 * sin profil OCH att hen har en aktiv tjänst som innehåller kostcoaching.
 * Används av sökfiltret "Kostschema", taggen på PT-profilen och rekommendationerna.
 */
export function offersNutritionPlan(data: AppData, trainer: Trainer): boolean {
  return trainer.offersNutrition && nutritionService(data, trainer.id) !== undefined
}

export function nutritionRecommendations(data: AppData, clientId: ID): { mine: NutritionPick[]; others: NutritionPick[] } {
  const mineIds = new Set(myTrainers(data, clientId).map((t) => t.id))
  const interests = new Set(data.clients.find((c) => c.id === clientId)?.interests ?? [])
  const pick = (t: Trainer): NutritionPick[] => {
    const service = offersNutritionPlan(data, t) ? nutritionService(data, t.id) : undefined
    return service ? [{ trainer: t, service }] : []
  }
  const mine = myTrainers(data, clientId).flatMap(pick)
  const score = (t: Trainer) =>
    (t.specialties.includes("kost") ? 3 : 0) +
    (t.specialties.includes("viktminskning") ? 1 : 0) +
    t.specialties.filter((s) => interests.has(s)).length +
    t.rating / 5
  const others = data.trainers
    .filter((t) => t.isPublished && !mineIds.has(t.id))
    .sort((a, b) => score(b) - score(a))
    .flatMap(pick)
  return { mine, others }
}
