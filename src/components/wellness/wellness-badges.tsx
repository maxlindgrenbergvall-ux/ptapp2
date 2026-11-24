/**
 * Friskvård i Hitta PT och på profiler (v75).
 *
 * Diskret limegrön badge: "Friskvård" plus de portaler PT:n tar emot (ePassi,
 * Benifex, Edenred). Visas när PT:n har ett portalavtal eller ett aktivt
 * friskvårdspaket. Paketets egen badge: "Godkänt för friskvård".
 */
import { HeartPulse } from "lucide-react"

import { cn } from "@/lib/utils"
import { WELLNESS_CHECKOUT_TEXT } from "@/lib/wellness/pricing"
import type { AppData, Trainer, TrainerService } from "@/types/domain"

export const portalsOf = (t: Pick<Trainer, "acceptsEpassi" | "acceptsBenifex" | "acceptsEdenred">) =>
  [t.acceptsEpassi && "ePassi", t.acceptsBenifex && "Benifex", t.acceptsEdenred && "Edenred"].filter(Boolean) as string[]

export const hasWellnessPackage = (data: Pick<AppData, "services">, trainerId: string) =>
  data.services.some((s) => s.trainerId === trainerId && s.active && s.isWellnessPackage)

/** Tar PT:n friskvårdsbidrag (portalavtal eller friskvårdspaket i appen)? Filtret i Hitta PT. */
export const offersWellness = (data: Pick<AppData, "services">, t: Trainer) => portalsOf(t).length > 0 || hasWellnessPackage(data, t.id)

const LIME = "border-[#84cc16]/40 bg-[#84cc16]/12 text-[#3f6212] dark:text-[#a3e635]"

export function WellnessBadge({ trainer, data, className }: { trainer: Trainer; data: Pick<AppData, "services">; className?: string }) {
  if (!offersWellness(data, trainer)) return null
  const portals = portalsOf(trainer)
  return (
    <span
      className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium", LIME, className)}
      data-testid="wellness-badge"
      title={portals.length ? `Tar emot friskvårdsbidrag via ${portals.join(", ")}` : "Friskvårdspaket med kvitto för friskvårdsbidrag"}
    >
      <HeartPulse className="size-3" aria-hidden />
      Friskvård{portals.length ? ` / ${portals.join(", ")}` : ""}
    </span>
  )
}

/** På paketet (tjänstemenyn och paketbyggaren). */
export function WellnessPackageBadge({ service, className }: { service: Pick<TrainerService, "isWellnessPackage">; className?: string }) {
  if (!service.isWellnessPackage) return null
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[#84cc16] px-2 text-[10px] font-semibold text-[#131916]", className)} data-testid="wellness-package-badge">
      Godkänt för friskvård
    </span>
  )
}

/**
 * Friskvårdsrutan i kassan (v75): påminner om friskvårdsbidraget och att ett kvitto
 * skapas direkt efter köpet. Samma text visas på Stripes betalsida (custom_text).
 */

export function WellnessCheckoutNudge({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", LIME, className)} data-testid="wellness-checkout-nudge">
      <HeartPulse className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{WELLNESS_CHECKOUT_TEXT}</span>
    </p>
  )
}
