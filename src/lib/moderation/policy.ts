/**
 * Regler för bildfiltret (v29). Modellen (nsfwjs, MobileNetV2) ger en
 * sannolikhet per klass: Drawing, Hentai, Neutral, Porn och Sexy.
 *
 *  - Blockera: tydligt sexuellt innehåll (Porn eller Hentai högt).
 *  - Flagga (sparas men loggas för granskning): gränsfall.
 *  - "Sexy" ensamt blockerar aldrig – vanliga porträtt, träningskläder och
 *    badkläder får ofta höga värden där (en porträttbild i pikétröja gav 0,87
 *    vid testet). Det räcker inte för att stoppa en profilbild.
 */
export const MODERATION_CLASSES = ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"] as const
export type ModerationClass = (typeof MODERATION_CLASSES)[number]
export type ModerationScores = Record<ModerationClass, number>

export type ModerationDecision =
  | { action: "allow" }
  | { action: "flag"; reason: string }
  | { action: "block"; reason: string }

export const THRESHOLDS = {
  block: { porn: 0.7, hentai: 0.7, explicit: 0.8 },
  flag: { porn: 0.4, hentai: 0.4, sexy: 0.95 },
} as const

export function decide(s: ModerationScores): ModerationDecision {
  const explicit = s.Porn + s.Hentai
  if (s.Porn >= THRESHOLDS.block.porn) return { action: "block", reason: `porn ${s.Porn.toFixed(2)}` }
  if (s.Hentai >= THRESHOLDS.block.hentai) return { action: "block", reason: `hentai ${s.Hentai.toFixed(2)}` }
  if (explicit >= THRESHOLDS.block.explicit) return { action: "block", reason: `explicit ${explicit.toFixed(2)}` }
  if (s.Porn >= THRESHOLDS.flag.porn) return { action: "flag", reason: `porn ${s.Porn.toFixed(2)}` }
  if (s.Hentai >= THRESHOLDS.flag.hentai) return { action: "flag", reason: `hentai ${s.Hentai.toFixed(2)}` }
  if (s.Sexy >= THRESHOLDS.flag.sexy) return { action: "flag", reason: `sexy ${s.Sexy.toFixed(2)}` }
  return { action: "allow" }
}

/** Meddelandet användaren ser när en bild stoppas. */
export const BLOCKED_MESSAGE = "Bilden stoppades av vårt innehållsfilter eftersom den verkar innehålla olämpligt innehåll. Välj en annan bild."
