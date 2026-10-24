"use client"

/**
 * Felvyn när något går fel (felgränserna error.tsx/global-error.tsx och
 * laddningsfel i datalagret). Skiljer på "ingen uppkoppling" och andra fel,
 * försöker igen automatiskt när nätet kommer tillbaka och visar aldrig
 * tekniska detaljer – bara en felkod (digest) som går att matcha mot loggarna.
 */
import { Home, RefreshCw, TriangleAlert, WifiOff } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function useOnline() {
  return React.useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange)
      window.addEventListener("offline", onChange)
      return () => {
        window.removeEventListener("online", onChange)
        window.removeEventListener("offline", onChange)
      }
    },
    () => navigator.onLine,
    () => true
  )
}

export function ErrorFallback({
  retry,
  digest,
  message,
  homeHref = "/",
  fullScreen = false,
}: {
  /** Försök rendera om (felgränsens retry) – annars laddas sidan om. */
  retry?: () => void
  digest?: string
  /** Egen förklaring (t.ex. från datalagret). */
  message?: string
  homeHref?: string
  fullScreen?: boolean
}) {
  const online = useOnline()
  const again = React.useCallback(() => (retry ? retry() : window.location.reload()), [retry])

  // Tillbaka online: försök igen direkt.
  const wasOffline = React.useRef(!online)
  React.useEffect(() => {
    if (!online) wasOffline.current = true
    else if (wasOffline.current) {
      wasOffline.current = false
      again()
    }
  }, [online, again])

  const Icon = online ? TriangleAlert : WifiOff
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-4 px-6 py-12 text-center", fullScreen && "min-h-svh")}
      data-testid="error-fallback"
    >
      <span className={cn("flex size-14 items-center justify-center rounded-2xl", online ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning")}>
        <Icon className="size-7" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h1 className="text-xl font-semibold">{online ? "Något gick fel" : "Ingen uppkoppling"}</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {online
            ? (message ?? "Sidan kunde inte visas just nu. Din data är sparad – försök igen om en stund.")
            : "Kontrollera mobildata eller wifi. Vi försöker igen automatiskt när du är online. Ändringar du gjort sparas på enheten tills dess."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={again}>
          <RefreshCw /> Försök igen
        </Button>
        <Button variant="outline" asChild>
          {/* Vanlig länk: en hel sidladdning tar sig ur ett trasigt tillstånd. */}
          <a href={homeHref}>
            <Home /> Till startsidan
          </a>
        </Button>
      </div>
      {digest && <p className="text-xs text-muted-foreground">Felkod: {digest}</p>}
    </div>
  )
}
