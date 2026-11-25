"use client"

/**
 * Statusraden överst i PT-dashboarden (v76): EN kompakt, klickbar rad med det
 * viktigaste som återstår – i stället för långa onboardingtexter. Ordning:
 * Stripe → företagsuppgifter → första paketet → bild och presentation →
 * granskning av certifikat → publicera. Inget kvar = ingen rad.
 */
import { ChevronRight, Loader2 } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { useAppData } from "@/lib/data/store"
import { BRAND } from "@/lib/brand"
import { useT } from "@/lib/i18n/provider"
import { openCheckout } from "@/lib/native/checkout"
import { useActivation } from "@/lib/pt-activation"
import { needsVerification } from "@/lib/wellness/verification"
import { demoPayoutsDone } from "@/lib/pt-onboarding-flow"
import { missingProfileParts } from "@/lib/pt-onboarding"
import { fetchMyBusiness, isBusinessComplete } from "@/lib/wellness/api"

type Key = "statusStripe" | "statusCompany" | "statusPackage" | "statusWellness" | "statusProfile" | "statusReview" | "statusPublish"

export function PtStatusRow() {
  const t = useT()
  const { data, me, mode } = useAppData()
  const trainer = data.trainers.find((x) => x.id === me.id)
  const [business, setBusiness] = React.useState<boolean | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [payoutsDemo] = React.useState(() => (mode === "demo" ? demoPayoutsDone() : true))
  const activation = useActivation()

  React.useEffect(() => {
    let alive = true
    fetchMyBusiness(me).then(
      (b) => alive && setBusiness(isBusinessComplete(b)),
      () => alive && setBusiness(true)
    )
    return () => {
      alive = false
    }
  }, [me])

  if (!trainer) return null
  const payouts = mode === "demo" ? payoutsDemo : trainer.payoutsReady !== false
  const hasService = data.services.some((s) => s.trainerId === me.id && s.active)
  const profileMissing = missingProfileParts({ name: trainer.name, avatarUrl: trainer.avatarUrl ?? "", specialties: trainer.specialties, bio: trainer.bio }).length > 0
  const certified = trainer.certifications.length > 0

  const items: { key: Key; href?: string; onClick?: () => void }[] = [
    // v81: Stripe och första paketet ligger i aktiveringschecklistan (ActivationGate).
    activation.activated && !payouts && { key: "statusStripe" as const, onClick: () => void connect() },
    business === false && { key: "statusCompany" as const, href: "/pt/profil#friskvard" },
    // v81: portalavtal som inte är verifierade än (eller nekades).
    needsVerification(trainer) && { key: "statusWellness" as const, href: "/pt/profil#friskvard" },
    activation.activated && !hasService && { key: "statusPackage" as const, href: "/pt/profil#tjanster" },
    profileMissing && { key: "statusProfile" as const, href: "/pt/profil" },
    !certified && { key: "statusReview" as const, href: `mailto:${BRAND.certificationEmail}?subject=${encodeURIComponent("Certifikat för granskning")}` },
    certified && !profileMissing && !trainer.isPublished && { key: "statusPublish" as const, href: "/pt/profil" },
  ].filter(Boolean) as { key: Key; href?: string; onClick?: () => void }[]

  async function connect() {
    if (mode === "demo") return toast("Demoläge: Stripe kopplas i den riktiga appen.")
    setBusy(true)
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { url?: string; done?: boolean; error?: string }
      if (body.done) return window.location.reload()
      if (!body.url) return toast.error(body.error ?? t("ptOnboarding.stripeError"))
      await openCheckout(body.url)
    } catch {
      toast.error(t("ptOnboarding.stripeError"))
    } finally {
      setBusy(false)
    }
  }

  const first = items[0]
  if (!first) return null
  const cls =
    "group flex min-h-11 w-full items-center gap-3 rounded-xl border border-[#84cc16]/35 bg-[#84cc16]/8 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[#84cc16]/14"
  const inner = (
    <>
      <span className="size-2 shrink-0 rounded-full bg-[#84cc16]" aria-hidden />
      <span className="min-w-0 flex-1">{t(`ptOnboarding.${first.key}`)}</span>
      {items.length > 1 && <span className="shrink-0 text-xs text-muted-foreground tabular">+{items.length - 1}</span>}
      {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <ChevronRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />}
    </>
  )
  return (
    <div className="mb-4" data-testid="pt-status-row" data-status={first.key}>
      {first.onClick ? (
        <button type="button" className={cls} onClick={first.onClick} disabled={busy}>
          {inner}
        </button>
      ) : first.href!.startsWith("mailto:") ? (
        <a className={cls} href={first.href}>
          {inner}
        </a>
      ) : (
        <Link className={cls} href={first.href!}>
          {inner}
        </Link>
      )}
    </div>
  )
}
