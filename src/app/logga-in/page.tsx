import type { Metadata } from "next"
import { Suspense } from "react"

import { LoginForm } from "@/components/auth/login-form"
import { StartSplash } from "@/components/start-splash"

export const metadata: Metadata = { title: "Logga in" }

export default function LoginPage() {
  return (
    <>
      <StartSplash />
      <Suspense>
        {/* v80: "Välkommen tillbaka" med e-posten ifylld när enheten minns kontot. */}
        <LoginForm />
      </Suspense>
    </>
  )
}

