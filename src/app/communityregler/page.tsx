import type { Metadata } from "next"

import { AuthCard } from "@/components/auth/auth-card"
import { CommunityContent } from "@/components/legal/community-content"
import { LEGAL_VERSION } from "@/lib/legal"

export const metadata: Metadata = { title: "Communityregler" }

// OBS: Utkast (v65). Ingår i användaravtalet och ska granskas juridiskt innan lansering.
export default function CommunityRulesPage() {
  return (
    <AuthCard title="Communityregler" description={`Version ${LEGAL_VERSION} · en del av Coaviras användaravtal · utkast inför lansering.`}>
      <CommunityContent />
    </AuthCard>
  )
}
