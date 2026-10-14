import { Star } from "lucide-react"
import type * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { SPECIALTY_LABEL, type ClientStatus, type Specialty } from "@/types/domain"

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function PersonAvatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback className="bg-secondary font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

export function SpecialtyBadge({ specialty }: { specialty: Specialty }) {
  return <Badge variant="secondary">{SPECIALTY_LABEL[specialty]}</Badge>
}

const STATUS: Record<ClientStatus, { label: string; dot: string }> = {
  active: { label: "Aktiv", dot: "bg-success" },
  paused: { label: "Pausad", dot: "bg-warning" },
  pending: { label: "Ny förfrågan", dot: "bg-chart-1" },
}

/** Status visas alltid med text + prick, aldrig bara färg. */
export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const s = STATUS[status]
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </Badge>
  )
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular">
      <Star className="size-3.5 fill-current text-warning" aria-hidden />
      <span className="font-medium">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-muted-foreground">({count})</span>}
      <span className="sr-only">av 5 stjärnor</span>
    </span>
  )
}

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
      <Icon className="size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

export function MacroBar({ label, unit, value, target }: { label: string; unit: string; value: number; target: number }) {
  const pct = target ? Math.round((value / target) * 100) : 0
  const off = target > 0 && Math.abs(pct - 100) > 10
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular">
          <span className="font-medium">{value}</span>
          <span className="text-muted-foreground"> / {target} {unit}</span>
        </span>
      </div>
      <Progress value={Math.min(pct, 100)} className="h-2" aria-label={`${label}: ${pct} procent av målet`} />
      {off && (
        <p className="text-xs text-muted-foreground tabular">
          {value > target ? `${value - target} ${unit} över målet` : `${target - value} ${unit} kvar`}
        </p>
      )}
    </div>
  )
}
