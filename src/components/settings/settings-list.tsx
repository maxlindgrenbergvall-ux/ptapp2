"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Inställningsrader (v37) – en sammanhållen lista i ett kort i stället för ett
 * kort per inställning. Samma utseende i Profil och Inställningar, byggd för
 * mobilen: hela raden är tryckyta (minst 56 px), kort text, värdet till höger.
 */
export function SettingsGroup({ title, children, className, ...rest }: { title?: string; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("space-y-1.5", className)} {...rest}>
      {title && <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>}
      <ul className="divide-y overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">{children}</ul>
    </section>
  )
}

function RowBody({ icon: Icon, label, hint, value }: { icon: LucideIcon; label: string; hint?: React.ReactNode; value?: React.ReactNode }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-muted-foreground tabular">{value}</span>}
    </>
  )
}

const rowClass = "flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/60 sm:px-4"

/** Rad som går till en annan sida. */
export function SettingsLinkRow({ href, icon, label, hint, value, ...rest }: { href: string; icon: LucideIcon; label: string; hint?: React.ReactNode; value?: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <li>
      <Link href={href} className={rowClass} {...rest}>
        <RowBody icon={icon} label={label} hint={hint} value={value} />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

/** Rad med en kryssruta (på/av) – hela raden är klickbar. */
export function SettingsToggleRow({
  id,
  icon,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
  testId,
  ...rest
}: {
  id: string
  icon: LucideIcon
  label: string
  hint?: React.ReactNode
  checked: boolean
  disabled?: boolean
  onCheckedChange: (v: boolean) => void
  testId?: string
} & Omit<React.LiHTMLAttributes<HTMLLIElement>, "onChange">) {
  return (
    <li {...rest}>
      <label htmlFor={id} className={cn(rowClass, "cursor-pointer")}>
        <RowBody icon={icon} label={label} hint={hint} />
        <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onCheckedChange(v === true)} className="size-5 shrink-0" data-testid={testId} />
      </label>
    </li>
  )
}

/** Rad som öppnar en avskalad dialog med inställningen (t.ex. vilotid). */
export function SettingsDialogRow({
  icon,
  label,
  hint,
  value,
  title,
  description,
  children,
  testId,
}: {
  icon: LucideIcon
  label: string
  hint?: React.ReactNode
  value?: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
  testId?: string
}) {
  return (
    <li>
      <Dialog>
        <DialogTrigger asChild>
          <button type="button" className={rowClass} data-testid={testId}>
            <RowBody icon={icon} label={label} hint={hint} value={value} />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </li>
  )
}
