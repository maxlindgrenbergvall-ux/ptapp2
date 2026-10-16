import type { Metadata } from "next"
import { Suspense } from "react"

import { PtLoginForm } from "@/components/auth/pt-login-form"

export const metadata: Metadata = { title: "PT-inloggning" }

export default function PtLoginPage() {
  return (
    <Suspense>
      <PtLoginForm />
    </Suspense>
  )
}
