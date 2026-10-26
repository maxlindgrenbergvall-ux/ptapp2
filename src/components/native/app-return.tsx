"use client"

import * as React from "react"

import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { appDeepLink, appReturnTarget } from "@/lib/app-return"
import { isNativeApp } from "@/lib/native/app"

/**
 * /app-retur/<sökväg>: Stripe har skickat tillbaka hit efter betalningen.
 *  - I webbläsarvyn (SFSafariViewController/Custom Tabs): vidare till appens
 *    URL-schema. NativeBridge (appUrlOpen) stänger vyn och öppnar sidan i appen.
 *    Knappen finns kvar om systemet vill att man trycker själv.
 *  - I appens WebView (gamla app-versioner som betalade i WebView): direkt till sidan.
 */
export function AppReturn() {
  // Adressen läses i webbläsaren (undefined vid serverrenderingen).
  const target = React.useSyncExternalStore(
    noopSubscribe,
    () => appReturnTarget(window.location.pathname, window.location.search),
    () => undefined
  )

  React.useEffect(() => {
    if (!target) return
    if (isNativeApp()) window.location.replace(target)
    else window.location.replace(appDeepLink(target))
  }, [target])

  const paid = target ? /[?&]session_id=/.test(target) : false
  return (
    <AuthCard
      title={target === null ? "Länken fungerar inte" : paid ? "Tack! Betalningen är klar" : "Betalningen avbröts"}
      description={
        target === null
          ? "Gå tillbaka till Coavira-appen."
          : paid
            ? "Du skickas tillbaka till Coavira-appen."
            : "Inga pengar har dragits. Du skickas tillbaka till Coavira-appen."
      }
    >
      {target && (
        <Button asChild className="w-full">
          <a href={appDeepLink(target)}>Tillbaka till Coavira</a>
        </Button>
      )}
      <p className="text-muted-foreground mt-3 text-center text-xs">Eller stäng fönstret med Klar uppe till vänster.</p>
    </AuthCard>
  )
}

const noopSubscribe = () => () => {}
