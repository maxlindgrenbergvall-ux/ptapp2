import type { Metadata } from "next"

import { PtOnboarding } from "@/components/pt/pt-onboarding"

export const metadata: Metadata = { title: "Kom igång som PT" }

/** Obligatorisk PT-onboarding (v22): profil och utbetalningar via Stripe. */
export default function PtOnboardingPage() {
  return <PtOnboarding />
}
