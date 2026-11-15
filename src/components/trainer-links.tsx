import { ArrowUpRight, Globe } from "lucide-react"

import { instagramHref, safeWebsiteHref, websiteLabel } from "@/lib/trainer-links"
import { cn } from "@/lib/utils"
import type { Trainer } from "@/types/domain"

/** Instagrams kameraform, ritad i samma linjestil som övriga ikoner. */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

const pill =
  "group inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-out-soft)] hover:border-primary/60 hover:bg-primary/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * PT:ns hemsida och Instagram som klickbara badges (v51). Visar ingenting när
 * PT:n inte fyllt i något. Länkarna öppnas i en ny flik utan att sidan får
 * tillgång till Coavira (noopener) och utan att skicka med var klienten kom ifrån.
 */
export function TrainerLinks({
  trainer,
  className,
  size = "md",
}: {
  trainer: Pick<Trainer, "websiteUrl" | "instagram" | "name">
  className?: string
  size?: "sm" | "md"
}) {
  const site = safeWebsiteHref(trainer.websiteUrl)
  const ig = instagramHref(trainer.instagram)
  if (!site && !ig) return null
  const sm = size === "sm"
  return (
    <ul className={cn("flex flex-wrap items-center justify-center gap-1.5", className)} aria-label={`Länkar till ${trainer.name}`} data-testid="trainer-links">
      {site && (
        <li className="min-w-0">
          <a href={site} target="_blank" rel="noopener noreferrer nofollow" className={cn(pill, sm && "h-7 px-2.5")} data-testid="trainer-website">
            <Globe className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{websiteLabel(site)}</span>
            <ArrowUpRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
            <span className="sr-only">(öppnas i en ny flik)</span>
          </a>
        </li>
      )}
      {ig && (
        <li className="min-w-0">
          <a href={ig} target="_blank" rel="noopener noreferrer nofollow" className={cn(pill, sm && "h-7 px-2.5")} data-testid="trainer-instagram">
            <InstagramGlyph className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">@{trainer.instagram}</span>
            <ArrowUpRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
            <span className="sr-only">(Instagram, öppnas i en ny flik)</span>
          </a>
        </li>
      )}
    </ul>
  )
}
