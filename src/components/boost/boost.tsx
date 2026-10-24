"use client"

/**
 * PT Boost: köpkortet i PT-portalen och märket "Utvald" som klienterna ser.
 * Utvalda PT:er är betalda placeringar och märks därför tydligt
 * (marknadsföringslagen: reklam ska kunna identifieras som reklam).
 */
import { Check, Loader2, Rocket, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BOOST_DAYS, BOOST_PRICE_SEK, boostDaysLeft, isBoosted } from "@/lib/boost"
import { useAppData } from "@/lib/data/store"
import { StoreBoostOffer } from "@/components/plus/store-purchase"
import { usePurchaseMode } from "@/lib/native/use-digital-purchases"
import { formatSek } from "@/lib/money"
import { cn } from "@/lib/utils"

/** Märket på utvalda PT:er (Hitta PT, profilen, rekommendationer). */
export function BoostedBadge({ className }: { className?: string }) {
  return (
    <Badge
      className={cn("gap-1 border-transparent bg-brand text-brand-foreground", className)}
      title="Utvald PT – betald placering"
      data-testid="boosted-badge"
    >
      <Sparkles className="size-3" aria-hidden /> Utvald
    </Badge>
  )
}

const formatUntil = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

/** PT-portalen: köp eller förläng PT Boost (199 kr för 7 dagar). */
export function BoostCard() {
  const { data, me, mode, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const [pending, setPending] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  // Webben: Stripe. iPhone-appen: App Store. Android-appen: inte än (Google Play Billing).
  const purchase = usePurchaseMode()

  // Tillbaka från Stripe: /pt/profil?boost=klar&session_id=cs_… eller ?boost=avbrutet.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get("boost")
    if (!result) return
    const sessionId = params.get("session_id")
    window.history.replaceState(null, "", window.location.pathname)
    if (result === "avbrutet") {
      toast("Boostköpet avbröts – inget har dragits.")
      return
    }
    if (result !== "klar" || !sessionId) return
    let cancelled = false
    const run = async () => {
      setConfirming(true)
      // Webhooken brukar hinna först; annars frågar servern Stripe direkt.
      for (let i = 0; i < 8 && !cancelled; i++) {
        const status = await actions.confirmBoost(sessionId)
        if (status === "paid") {
          toast.success("Din profil är boostad!", { description: `Du syns som Utvald PT i ${BOOST_DAYS} dagar.` })
          break
        }
        if (status === "expired" || status === "unknown") {
          toast.error("Betalningen gick inte igenom. Försök igen.")
          break
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (!cancelled) setConfirming(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [actions])

  if (!trainer) return null
  const active = isBoosted(trainer)
  const daysLeft = boostDaysLeft(trainer)

  const buy = async () => {
    setPending(true)
    const error = await actions.buyBoost()
    if (error) {
      setPending(false)
      toast.error(error)
      return
    }
    if (mode === "demo") {
      setPending(false)
      toast.success(active ? `Boosten är förlängd med ${BOOST_DAYS} dagar` : "Din profil är boostad!", {
        description: "Demoläge: betalningen simuleras och inga pengar dras.",
      })
    }
    // Med Supabase skickas PT:n vidare till Stripe.
  }

  return (
    <Card className={cn("gap-3", active && "border-brand/60 bg-brand/5")} data-testid="boost-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="size-4 text-primary" /> PT Boost
          {active && <BoostedBadge className="ml-auto" />}
        </CardTitle>
        <CardDescription>
          {active
            ? `Aktiv till ${formatUntil(trainer.boostedUntil!)} · ${daysLeft} ${daysLeft === 1 ? "dag" : "dagar"} kvar`
            : `Syns först för klienter i ${BOOST_DAYS} dagar för ${formatSek(BOOST_PRICE_SEK)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm">
          {["Först i Hitta PT med märket Utvald", "Rekommenderas i klockan till klienter med matchande intressen", "Engångsköp – förnyas inte automatiskt"].map(
            (t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
              </li>
            )
          )}
        </ul>
        {!trainer.isPublished && <p className="text-sm text-muted-foreground">Publicera din profil först – boosten gäller profilen i PT-sökningen.</p>}
        {purchase === "store" && <StoreBoostOffer active={active} disabled={!trainer.isPublished} />}
        {purchase === "stripe" && (
        <Button className="w-full" onClick={() => void buy()} disabled={pending || confirming || !trainer.isPublished}>
          {pending || confirming ? <Loader2 className="animate-spin" /> : <Rocket />}
          {confirming
            ? "Bekräftar betalningen…"
            : active
              ? `Förläng ${BOOST_DAYS} dagar · ${formatSek(BOOST_PRICE_SEK)}`
              : `Boosta i ${BOOST_DAYS} dagar · ${formatSek(BOOST_PRICE_SEK)}`}
        </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {purchase === "none"
            ? "PT Boost kan inte köpas i den här appen än."
            : purchase === "store"
              ? ""
              : mode === "demo"
              ? "Demoläge: betalningen simuleras."
                : "Du betalar med kort via Stripe. En förlängning läggs efter din pågående boost."}{" "}
          Klienterna ser att utvalda PT:er är en betald placering.
        </p>
      </CardContent>
    </Card>
  )
}
