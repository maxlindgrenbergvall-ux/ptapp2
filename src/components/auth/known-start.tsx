"use client"

/**
 * Kom igång (v80): känner enheten igen kontot visas "Välkommen tillbaka" med
 * inloggningsrutan direkt, annars startsidan (children). Skriptet KNOWN_SCRIPT
 * döljer startsidan innan den målas, så att den inte blinkar förbi.
 */
import * as React from "react"

import { LoginForm } from "@/components/auth/login-form"
import { KNOWN_CLASS } from "@/lib/known-account"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { useKnownAccount } from "@/lib/use-known-account"

export function KnownStart({ children }: { children: React.ReactNode }) {
  const known = useKnownAccount()
  const show = Boolean(known && isSupabaseEnabled)
  // Ogiltigt minne (eller demoläget): visa startsidan igen.
  React.useEffect(() => {
    if (!show) document.documentElement.classList.remove(KNOWN_CLASS)
  }, [show])
  if (show) {
    return (
      <React.Suspense>
        <LoginForm start />
      </React.Suspense>
    )
  }
  return <div data-start-default>{children}</div>
}
