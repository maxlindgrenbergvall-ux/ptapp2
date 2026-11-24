import type { Metadata } from "next"

import { PtSignup } from "@/components/pt-onboarding/account-step"

export const metadata: Metadata = { title: "Skapa PT-konto" }

/** Steg 1 av 3 (v76): konto, företag och portaler – självregistrering för PT:er. */
export default function PtSignupPage() {
  return <PtSignup />
}
