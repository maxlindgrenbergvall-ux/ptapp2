import type { Metadata } from "next"
import { Suspense } from "react"

import { PtLoginForm } from "@/components/auth/pt-login-form"
import { StartSplash } from "@/components/start-splash"

export const metadata: Metadata = { title: "PT-inloggning" }

export default function PtLoginPage() {
  return (
    <>
      <StartSplash />
      <Suspense>
        <PtLoginForm />
      </Suspense>
    </>
  )
}
