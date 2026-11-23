import type { Metadata } from "next"

import { SignupForm } from "@/components/auth/signup-form"
import { StartSplash } from "@/components/start-splash"

export const metadata: Metadata = { title: "Skapa konto" }

export default function SignupPage() {
  return (
    <>
      <StartSplash />
      <SignupForm />
    </>
  )
}
