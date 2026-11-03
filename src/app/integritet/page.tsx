import type { Metadata } from "next"

import { PrivacyContent } from "@/components/legal/privacy-content"
import { AuthCard } from "@/components/auth/auth-card"

export const metadata: Metadata = { title: "Integritet" }

// OBS: Utkast. Ska granskas juridiskt och kompletteras med personuppgiftsansvarig,
// kontaktuppgifter och lagringstider innan lansering.
export default function PrivacyPage() {
  return (
    <AuthCard title="Så hanterar vi din data" description="Kortversion – utkast inför lansering.">
      <PrivacyContent />
    </AuthCard>
  )
}
