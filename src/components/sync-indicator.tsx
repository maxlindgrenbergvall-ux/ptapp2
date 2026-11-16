"use client"

import { CloudOff, Loader2, TriangleAlert } from "lucide-react"
import * as React from "react"

import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

/** Så länge en vanlig synk får ta innan "Synkar…" visas (ms). */
const SYNC_GRACE_MS = 1500

/**
 * Visar om ändringar ligger kvar i offlinekön.
 *
 * v56: en flytande pill överst (position: fixed) i stället för ett element i
 * flödet – tidigare tryckte den ner hela sidan vid varje vattenglas eller
 * bockat set och drog upp den igen en sekund senare. Den tar ingen plats,
 * fångar inga tryck och animeras bara med transform/opacity. En vanlig synk
 * syns inte alls; pillen kommer bara vid offline, fel eller om synken dröjer.
 */
export function SyncIndicator({ className }: { className?: string }) {
  const { sync, mode } = useAppData()
  const busy = mode !== "demo" && !(sync.status === "synced" && sync.pending === 0)
  const urgent = sync.status === "offline" || sync.status === "error"
  const [slow, setSlow] = React.useState(false)

  React.useEffect(() => {
    if (!busy || urgent) return
    const t = window.setTimeout(() => setSlow(true), SYNC_GRACE_MS)
    return () => {
      window.clearTimeout(t)
      setSlow(false)
    }
  }, [busy, urgent])

  if (mode === "demo") return null
  const visible = busy && (urgent || slow)

  const label =
    sync.status === "offline"
      ? `Offline – ${sync.pending} ${sync.pending === 1 ? "ändring sparad" : "ändringar sparade"} lokalt`
      : sync.status === "error"
        ? "Allt kunde inte sparas"
        : "Synkar…"
  const Icon = sync.status === "offline" ? CloudOff : sync.status === "error" ? TriangleAlert : Loader2

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top,0px)+0.5rem)] z-50 flex justify-center px-4 transition-[opacity,transform] duration-300 ease-out will-change-transform motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
        className
      )}
      aria-hidden={!visible}
      data-testid="sync-indicator"
    >
      <span
        role="status"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1.5 text-xs shadow-float backdrop-blur",
          sync.status === "offline" && "border-warning/50 bg-warning/15",
          sync.status === "error" && "border-destructive/40"
        )}
      >
        {visible && (
          <>
            <Icon className={cn("size-3.5", sync.status === "syncing" && "animate-spin")} aria-hidden />
            {label}
          </>
        )}
      </span>
    </div>
  )
}
