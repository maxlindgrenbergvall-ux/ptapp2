import type { Metadata } from "next"
import { Suspense } from "react"

import { CrmLoginForm } from "@/components/crm/crm-login-form"

export const metadata: Metadata = { title: "Logga in – CRM", robots: { index: false, follow: false } }

export default function CrmLoginPage() {
  return (
    <Suspense>
      <CrmLoginForm />
    </Suspense>
  )
}
