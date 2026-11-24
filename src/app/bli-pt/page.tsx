import type { Metadata } from "next"

import { PtIntroCarousel } from "@/components/pt-onboarding/intro-carousel"

export const metadata: Metadata = { title: "Bli PT på Coavira" }

/** Steg 0 (v76): PT-introt före kontot – tre kort och "Skapa PT-konto". */
export default function BecomePtPage() {
  return <PtIntroCarousel />
}
