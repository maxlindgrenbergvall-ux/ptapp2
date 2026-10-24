"use client"

import { Gift, KeyRound } from "lucide-react"
import * as React from "react"

import { normalizeReferralCode, REFERRAL_CODE, REFERRAL_PLUS_DAYS, rememberReferral, storedReferral } from "@/lib/plus"
import { EXISTING_CLIENT_FEE_PERCENT } from "@/lib/payments/fees"
import { normalizePtInviteCode, PT_INVITE_CODE, rememberPtInvite, storedPtInvite } from "@/lib/pt-invites"
import { cn } from "@/lib/utils"

/**
 * Visas på Kom igång och Registrera när besökaren kommit via en
 * inbjudningslänk: en väns (/ref/KOD → ?ref=KOD) eller PT:ns
 * (/ref/EX-XXXXXX → ?ptkod=EX-XXXXXX). Koden sparas i webbläsaren och
 * förifylls i välkomststeget, där den löses in när kontot skapats.
 */
export function ReferralBanner({ className }: { className?: string }) {
  const [code, setCode] = React.useState<string | null>(null)
  const [ptCode, setPtCode] = React.useState<string | null>(null)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = normalizeReferralCode(params.get("ref") ?? "")
    if (REFERRAL_CODE.test(fromUrl)) rememberReferral(fromUrl)
    const ptFromUrl = params.get("ptkod") ? normalizePtInviteCode(params.get("ptkod")!) : ""
    if (PT_INVITE_CODE.test(ptFromUrl)) rememberPtInvite(ptFromUrl)
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage finns bara i webbläsaren. */
    setCode(REFERRAL_CODE.test(fromUrl) ? fromUrl : storedReferral())
    setPtCode(PT_INVITE_CODE.test(ptFromUrl) ? ptFromUrl : storedPtInvite())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])
  if (ptCode) {
    return (
      <div
        className={cn("flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-left text-sm", className)}
        data-testid="pt-invite-banner"
      >
        <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>
          <span className="block font-semibold">Din PT har bjudit in dig!</span>
          Skapa ett konto så kopplas du direkt till din PT, med {EXISTING_CLIENT_FEE_PERCENT} % serviceavgift. Koden{" "}
          <span className="font-mono font-semibold">{ptCode}</span> fylls i automatiskt.
        </p>
      </div>
    )
  }
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
