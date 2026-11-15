"use client"

import { Building2, Megaphone, UserRound, type LucideIcon } from "lucide-react"

import { scoreTier } from "@/lib/crm/score"
import { EMAIL_STATUS_LABEL, SEGMENT_LABEL, STATUS_LABEL, type EmailStatus, type Segment, type Status } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

/** Anrop till /api/admin/crm. Kastar ett fel med serverns meddelande (visas i en toast). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown>
  ) {
    super(message)
  }
}
export async function crm<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch("/api/admin/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) })
  } catch {
    throw new ApiError("Ingen kontakt med servern", 0, {})
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new ApiError(String(data.error ?? "Något gick fel"), res.status, data)
  return data as T
}

/**
 * Status-badges i paletten: flödet går från neutral (ny) mot allt mer av
 * accentfärgen (kund). "Ej aktuell" är nedtonad. Färgen bär aldrig ensam
 * betydelsen – texten står alltid med.
 */
const STATUS_STYLE: Record<Status, string> = {
  new: "border-border bg-muted/60 text-foreground",
  qualified: "border-primary/40 text-primary",
  emailed: "border-primary/30 bg-primary/10 text-primary",
  replied: "border-primary/50 bg-primary/20 text-primary",
  customer: "border-primary bg-primary text-primary-foreground",
  not_relevant: "border-border text-muted-foreground",
}
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span data-status={status} className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-300", STATUS_STYLE[status], className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", status === "customer" ? "bg-primary-foreground" : status === "new" || status === "not_relevant" ? "bg-muted-foreground" : "bg-primary")} />
      {STATUS_LABEL[status]}
    </span>
  )
}

const SEGMENT_ICON: Record<Segment, LucideIcon> = { freelance: UserRound, influencer: Megaphone, gym_chain: Building2 }
export function SegmentBadge({ segment, className }: { segment: Segment; className?: string }) {
  const Icon = SEGMENT_ICON[segment]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground", className)}>
      <Icon className="size-3.5" aria-hidden /> {SEGMENT_LABEL[segment]}
    </span>
  )
}

/** Lead Score: siffra och en stapel som fylls (transform). Hög = accentfärg, låg = nedtonad. */
export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tier = scoreTier(score)
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label={`Lead score ${score} av 100`} data-score={score}>
      <span className={cn("w-7 text-right text-sm font-semibold tabular", tier === "high" ? "text-primary" : tier === "mid" ? "text-foreground" : "text-muted-foreground")}>{score}</span>
      <span aria-hidden className="block h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full w-full origin-left rounded-full transition-transform duration-700 ease-[var(--ease-out-soft)]", tier === "high" ? "bg-primary" : tier === "mid" ? "bg-primary/55" : "bg-muted-foreground/50")}
          style={{ transform: `scaleX(${score / 100})` }}
        />
      </span>
    </span>
  )
}

const EMAIL_STYLE: Record<EmailStatus, string> = {
  queued: "text-muted-foreground",
  sending: "text-foreground",
  sent: "text-primary",
  delivered: "text-primary",
  bounced: "text-destructive",
  complained: "text-destructive",
  failed: "text-destructive",
  cancelled: "text-muted-foreground line-through",
}
export function EmailStatusText({ status }: { status: EmailStatus }) {
  return <span className={cn("text-xs font-medium whitespace-nowrap", EMAIL_STYLE[status])}>{EMAIL_STATUS_LABEL[status]}</span>
}

const DATE = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" })
const DATETIME = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })
export const fmtDate = (iso: string) => DATE.format(new Date(iso))
export const fmtDateTime = (iso: string) => DATETIME.format(new Date(iso))

/** Fältetikett + innehåll, samma utseende i alla formulär. */
export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}
