import type { Metadata } from "next"

import { AuthCard } from "@/components/auth/auth-card"
import { TermsContent } from "@/components/legal/terms-content"

export const metadata: Metadata = { title: "Villkor" }

// OBS: Utkast. Sammanfattar hur plattformen fungerar idag. Fullständiga
// användarvillkor ska granskas juridiskt innan lansering.
export default function TermsPage() {
  return (
    <AuthCard title="Villkor i korthet" description="Kortversion – utkast inför lansering.">
      <TermsContent />
    </AuthCard>
  )
}
