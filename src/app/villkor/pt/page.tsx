import type { Metadata } from "next"

import { AuthCard } from "@/components/auth/auth-card"
import { PtAgreementContent } from "@/components/legal/pt-agreement-content"

export const metadata: Metadata = { title: "PT-avtal" }

// OBS: Utkast (version 2026-11). Avtalet ska granskas juridiskt innan lansering.
// En ny version kräver att alla PT:er godkänner på nytt (legal_version() i databasen).
export default function PtAgreementPage() {
  return (
    <AuthCard title="PT-avtal" description="Version 2026-11 · utkast inför lansering. Godkänns i PT:ns intro-flöde.">
      <PtAgreementContent />
    </AuthCard>
  )
}
