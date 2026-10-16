/**
 * Affärsregel: Coavira hanterar inga gratispass (inga avräkningar mellan
 * plattformen och PT:er för pass utan betalning). Samma regler finns som
 * constraints i databasen (20261019000000_v6_auth_onboarding_no_free.sql).
 */
import type { TrainerOffer } from "@/types/domain"

export const MAX_DISCOUNT_PERCENT = 99
const FREE_WORDS = /(^|[^\p{L}])(gratis|kostnadsfri\p{L}*|free)(?![\p{L}])/iu

/** Nämner texten gratis/kostnadsfritt? */
export const mentionsFree = (text: string) => FREE_WORDS.test(text)

/** Är erbjudandet i praktiken ett gratispass? Sådana visas och sparas aldrig. */
export function isFreeOffer(o: Pick<TrainerOffer, "priceSek" | "discountPercent" | "title" | "description">) {
  return (
    (o.discountPercent !== undefined && o.discountPercent > MAX_DISCOUNT_PERCENT) ||
    o.priceSek === 0 ||
    mentionsFree(`${o.title} ${o.description}`)
  )
}
