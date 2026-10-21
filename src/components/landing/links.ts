import { BRAND } from "@/lib/brand"
import { START_PATH } from "@/lib/site"
import { PT_LOGIN_PATH } from "@/lib/supabase/config"

/** Alla länkar från landningssidan på ett ställe. */
export const LINKS = {
  /** Kom igång: Apple, Google eller e-post (klienter). */
  start: START_PATH,
  login: "/logga-in",
  signup: "/registrera",
  ptLogin: PT_LOGIN_PATH,
  privacy: "/integritet",
  terms: "/villkor",
  contact: `mailto:${BRAND.contactEmail}`,
  /** PT-konton skapas av Coavira efter manuell verifiering av certifikat. */
  ptApply: `mailto:${BRAND.certificationEmail}?subject=${encodeURIComponent("Jag vill bli PT på Coavira")}`,
} as const

/** Ankare för menyn. */
export const NAV = [
  { href: "#funktioner", label: "Funktioner" },
  { href: "#mal", label: "Dina mål" },
  { href: "#kommunikation", label: "Chatt & samtal" },
  { href: "#priser", label: "Priser" },
] as const
