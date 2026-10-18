"use client"

import { CheckCircle2, Clock, Loader2 } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"

type Status = "checking" | "paid" | "pending" | "failed"

/**
 * Hit kommer klienten tillbaka från Stripe. Vi frågar servern (som frågar
 * Stripe) tills betalningen är bekräftad och laddar sedan om appen så att de
 * nya passen och kostcoachingen syns.
 */
export function PurchaseReturn() {
  const [status, setStatus] = React.useState<Status>("checking")

  React.useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id")
    if (!sessionId) {
      const t = window.setTimeout(() => setStatus("failed"), 0)
      return () => window.clearTimeout(t)
    }
    let cancelled = false
    let tries = 0
    const check = async () => {
      tries++
      const res = await fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`).catch(() => null)
      const body = (await res?.json().catch(() => null)) as { status?: string } | null
      if (cancelled) return
      if (body?.status === "paid") {
        setStatus("paid")
        // Hel omladdning: datalagret hämtar köpen, passen och den nya relationen.
        window.setTimeout(() => window.location.replace("/klient"), 1500)
      } else if (body?.status === "expired" || body?.status === "unknown") {
        setStatus("failed")
      } else if (tries < 15) {
        window.setTimeout(() => void check(), 2000)
      } else {
        setStatus("pending")
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center" role="status">
      {status === "checking" && (
        <>
          <Loader2 className="size-10 animate-spin text-primary" />
          <h1 className="text-xl font-semibold">Bekräftar betalningen…</h1>
        </>
      )}
      {status === "paid" && (
        <>
          <CheckCircle2 className="size-12 text-primary" />
          <h1 className="text-xl font-semibold">Tack! Betalningen är klar</h1>
          <p className="text-sm text-muted-foreground">Dina pass är upplåsta och din PT ser dig nu i sin klientöversikt.</p>
        </>
      )}
      {status === "pending" && (
        <>
          <Clock className="size-12 text-warning" />
          <h1 className="text-xl font-semibold">Betalningen behandlas</h1>
          <p className="text-sm text-muted-foreground">Det kan ta en liten stund. Passen dyker upp automatiskt när betalningen är klar.</p>
          <Button asChild>
            <Link href="/klient">Till startsidan</Link>
          </Button>
        </>
      )}
      {status === "failed" && (
        <>
          <h1 className="text-xl font-semibold">Vi hittar ingen betalning</h1>
          <p className="text-sm text-muted-foreground">Inget har dragits. Försök gärna igen från din PT:s profil.</p>
          <Button asChild>
            <Link href="/klient/hitta">Hitta PT</Link>
          </Button>
        </>
      )}
    </div>
  )
}
