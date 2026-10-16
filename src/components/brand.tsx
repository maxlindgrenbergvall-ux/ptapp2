import Link from "next/link"

import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

/**
 * Coaviras märke: ett öppet "C" (coachen som omsluter) och en punkt i öppningen
 * (klienten på väg framåt). Ritas med currentColor så att det följer temat.
 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M17.2 7.2A7 7 0 1 0 17.2 16.8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="18.6" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

export function BrandMark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-brand text-brand-foreground",
        size === "sm" && "size-7 rounded-md",
        size === "md" && "size-8 rounded-lg",
        size === "lg" && "size-14 rounded-2xl",
        className
      )}
    >
      <BrandGlyph className={size === "lg" ? "size-8" : size === "md" ? "size-5" : "size-4"} />
    </span>
  )
}

/** Logga med namn. `suffix` används t.ex. för "PT" i PT-panelen. */
export function BrandLogo({ href = "/", suffix, size = "sm", className }: { href?: string; suffix?: string; size?: "sm" | "md"; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", size === "md" && "text-lg", className)} aria-label={`${BRAND.name} – startsidan`}>
      <BrandMark size={size} />
      {BRAND.name}
      {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
    </Link>
  )
}
