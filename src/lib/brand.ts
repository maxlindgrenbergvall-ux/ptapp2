/** Varumärket på ett ställe: namn, beskrivning och färger för ikoner/manifest. */
export const BRAND = {
  name: "Coavira",
  tagline: "PT & träning",
  description: "Coavira kopplar ihop personliga tränare och klienter: program, kost, kalender och uppföljning på ett ställe.",
  /** Märkets limegröna accent (samma som --brand i ljust läge) och mörk bakgrund. */
  color: "#aced37",
  ink: "#0e1a01",
  /** Ansökan/verifiering för PT:er (certifikat granskas manuellt). */
  certificationEmail: "certifiering@coavira.fit",
  /** Allmän kontakt (landningssidans sidfot och villkor). */
  contactEmail: "kontakt@coavira.fit",
  /** Support för appen (supportsidan – krävs av App Store och Google Play). */
  supportEmail: "support@coavira.fit",
} as const
