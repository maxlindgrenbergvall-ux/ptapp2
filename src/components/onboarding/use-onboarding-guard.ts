"use client"

import { usePathname, useRouter } from "next/navigation"
import * as React from "react"

import { useAppData } from "@/lib/data/store"
import { allowedDuringOnboarding, ONBOARDING_PATH_FOR } from "@/lib/onboarding"

/**
 * Andra skyddet för intro-flödet (v31): proxy.ts styr på flaggan i JWT:n, men en
 * token som utfärdades före uppgraderingen saknar den. Profilen (databasen) är
 * facit – är intro-flödet inte klart skickas användaren dit.
 */
export function useOnboardingGuard() {
  const { me } = useAppData()
  const pathname = usePathname()
  const router = useRouter()
  const blocked = me.onboardingCompleted === false && !allowedDuringOnboarding(me.role, pathname)
  React.useEffect(() => {
    if (blocked) router.replace(ONBOARDING_PATH_FOR[me.role])
  }, [blocked, me.role, router])
  return blocked
}
