"use client"

import { CloudOff, Loader2, TriangleAlert } from "lucide-react"

import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

/**
 * Visar om ändringar ligger kvar i offlinekön. Syns inte alls när allt är synkat,
 * så det stör inte i normalfallet.
 */
export function SyncIndicator({ className }: { className?: string }) {
  const { sync, mode } = useAppData()
  if (mode === "demo" || (sync.status === "synced" && sync.pending === 0)) return null

  const label =
    sync.status === "offline"
      ? `Offline – ${sync.pending} ${sync.pending === 1 ? "ändring sparad" : "ändringar sparade"} lokalt`
      : sync.status === "error"
        ? "Allt kunde inte sparas"
        : "Synkar…"
  const Icon = sync.status === "offline" ? CloudOff : sync.status === "error" ? TriangleAlert : Loader2

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        sync.status === "offline" && "border-warning/50 bg-warning/10",
        className
      )}
    >
      <Icon className={cn("size-3.5", sync.status === "syncing" && "animate-spin")} aria-hidden />
      {label}
    </span>
  )
}
