"use client"

import { LayoutTemplate, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { confirmDialog } from "@/components/ui/confirm"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"
import type { WorkoutTemplate } from "@/types/domain"

/**
 * Snabbval av mall: en rad med chips som går att svepa i sidled på mobilen.
 * Ett tryck läser in mallen; krysset tar bort den (med bekräftelse).
 */
export function TemplatePicker({
  templates,
  onPick,
  activeId,
  canDelete = true,
  className,
}: {
  templates: WorkoutTemplate[]
  onPick: (template: WorkoutTemplate) => void
  activeId?: string | null
  canDelete?: boolean
  className?: string
}) {
  const { actions } = useAppData()
  if (!templates.length) return null
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <LayoutTemplate className="size-3.5" /> Använd mall
      </p>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Mina mallar" data-testid="template-picker">
        {[...templates].sort((a, b) => a.name.localeCompare(b.name, "sv")).map((t) => (
          <li key={t.id} className="shrink-0">
            <span
              className={cn(
                "inline-flex h-9 items-center rounded-full border bg-card text-sm shadow-xs transition-colors",
                activeId === t.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/60"
              )}
            >
              <button type="button" className="h-full max-w-48 truncate pr-1 pl-3.5" onClick={() => onPick(t)} aria-pressed={activeId === t.id}>
                {t.name}
                <span className="ml-1 text-xs text-muted-foreground tabular">· {t.exercises.length}</span>
              </button>
              {canDelete && (
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                  aria-label={`Ta bort mallen ${t.name}`}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: `Ta bort mallen "${t.name}"?`, description: "Pass du redan skapat från mallen påverkas inte.", confirmLabel: "Ta bort", destructive: true }))) return
                    actions.deleteTemplate(t.id)
                    toast("Mallen är borttagen")
                  }}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
