"use client"

import { Gift } from "lucide-react"
import * as React from "react"

import { normalizeReferralCode, REFERRAL_CODE, REFERRAL_PLUS_DAYS, rememberReferral, storedReferral } from "@/lib/plus"
import { cn } from "@/lib/utils"

/**
 * Visas på Kom igång och Registrera när besökaren kommit via en
 * inbjudningslänk (/ref/KOD → ?ref=KOD). Koden sparas i webbläsaren och
 * förifylls i välkomststeget, där den löses in när kontot skapats.
 */
export function ReferralBanner({ className }: { className?: string }) {
  const [code, setCode] = React.useState<string | null>(null)
  React.useEffect(() => {
    const fromUrl = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref") ?? "")
    if (REFERRAL_CODE.test(fromUrl)) rememberReferral(fromUrl)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage finns bara i webbläsaren.
    setCode(REFERRAL_CODE.test(fromUrl) ? fromUrl : storedReferral())
  }, [])
  if (!code) return null
  return (
    <div
      className={cn("flex items-start gap-3 rounded-xl border border-brand/50 bg-brand/10 px-4 py-3 text-left text-sm", className)}
      data-testid="referral-banner"
    >
      <Gift className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <p>
        <span className="block font-semibold">Du är inbjuden!</span>
        Skapa ett konto så får du {REFERRAL_PLUS_DAYS} dagar Coavira Plus gratis. Koden <span className="font-mono font-semibold">{code}</span> fylls i
        automatiskt.
      </p>
    </div>
  )
}
