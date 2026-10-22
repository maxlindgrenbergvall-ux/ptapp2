/**
 * PT Boost: 199 kr för 7 dagars synlighet. Priset och längden bestäms av
 * databasen (create_boost_checkout) – konstanterna här är bara för visning
 * och för demoläget.
 */
import type { Specialty, Trainer } from "@/types/domain"

export const BOOST_PRICE_SEK = 199
export const BOOST_DAYS = 7
/** Högst så många utvalda PT:er i klockans rekommendationer. */
export const MAX_BOOSTED_RECOMMENDATIONS = 2

/** Är PT:n utvald just nu? */
export const isBoosted = (t: Pick<Trainer, "boostedUntil">, now = Date.now()) => Boolean(t.boostedUntil && Date.parse(t.boostedUntil) > now)

/** Hela dagar kvar av boosten (avrundat uppåt), 0 om den inte är aktiv. */
export function boostDaysLeft(t: Pick<Trainer, "boostedUntil">, now = Date.now()) {
  if (!isBoosted(t, now)) return 0
  return Math.ceil((Date.parse(t.boostedUntil!) - now) / 86_400_000)
}

/** Ny sluttid när en boost köps: läggs efter en pågående boost, annars från nu (som databasen). */
export function extendBoost(current: string | undefined, now = Date.now()): string {
  const start = Math.max(now, current ? Date.parse(current) : 0)
  return new Date(start + BOOST_DAYS * 86_400_000).toISOString()
}

/**
 * Utvalda PT:er att rekommendera i klientens klocka: publicerade, boostade,
 * med en inriktning som klienten visat intresse för (starkast intresse först).
 * Högst `limit` st, inga bortvalda och inga PT:er klienten redan tränar med.
 * Id:t (för sett/bortvalt) byts när boosten förlängs, så att en ny period kan visas igen.
 */
export function matchBoostedTrainers(
  trainers: Trainer[],
  scores: { category: Specialty; score: number }[],
  opts: { dismissed?: string[]; excludeTrainerIds?: string[]; limit?: number; now?: number } = {}
): { id: string; trainer: Trainer; category: Specialty }[] {
  const now = opts.now ?? Date.now()
  const dismissed = new Set(opts.dismissed ?? [])
  const excluded = new Set(opts.excludeTrainerIds ?? [])
  return trainers
    .filter((t) => t.isPublished && isBoosted(t, now) && !excluded.has(t.id))
    .map((t) => {
      const best = scores.find((s) => t.specialties.includes(s.category))
      return { id: `boost:${t.id}:${t.boostedUntil}`, trainer: t, category: best?.category, score: best?.score ?? 0 }
    })
    .filter((x): x is { id: string; trainer: Trainer; category: Specialty; score: number } => x.score > 0 && !dismissed.has(x.id))
    .sort((a, b) => b.score - a.score || b.trainer.rating - a.trainer.rating)
    .slice(0, opts.limit ?? MAX_BOOSTED_RECOMMENDATIONS)
    .map(({ id, trainer, category }) => ({ id, trainer, category }))
}
