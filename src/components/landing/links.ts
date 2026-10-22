import { BRAND } from "@/lib/brand"

/**
 * Butikslänkarna. Tomma tills apparna är publicerade – då visar brickorna en
 * "Släpps snart"-ruta. Sätt NEXT_PUBLIC_APP_STORE_URL och
 * NEXT_PUBLIC_PLAY_STORE_URL i Vercel när apparna finns i butikerna.
 */
export const STORE_URLS = {
  ios: process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || null,
  android: process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || null,
} as const

/**
 * Alla länkar från landningssidan på ett ställe. Coavira är en mobilapp – här
 * finns inga inloggnings- eller portallänkar, bara nedladdning, support och
 * de sidor App Store och Google Play kräver (integritet och villkor).
 */
export const LINKS = {
  support: "/support",
  privacy: "/integritet",
  terms: "/villkor",
  supportEmail: `mailto:${BRAND.supportEmail}`,
  contact: `mailto:${BRAND.contactEmail}`,
  /** PT-konton skapas av Coavira efter manuell verifiering av certifikat. */
  ptApply: `mailto:${BRAND.certificationEmail}?subject=${encodeURIComponent("Jag vill bli PT på Coavira")}`,
  /** Ankaret för nedladdningssektionen längst ner. */
  download: "#ladda-ned",
} as const

/** Ankare för menyn. */
export const NAV = [
  { href: "#funktioner", label: "Funktioner" },
  { href: "#mal", label: "Dina mål" },
  { href: "#kommunikation", label: "Chatt & samtal" },
  { href: "#priser", label: "Priser" },
] as const
