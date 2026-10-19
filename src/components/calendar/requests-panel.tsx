"use client"

import { ArrowRight, Check, Hourglass, Inbox, MapPin, Video, X } from "lucide-react"
import { toast } from "sonner"

import { PersonAvatar } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { findConflict } from "@/lib/calendar/slots"
import { formatDayShort, formatTimeRange } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import type { CalendarEvent } from "@/types/domain"

/** Väntande bokningsförfrågningar med Acceptera/Neka direkt i listan. */
export function RequestsPanel({ onShow, compact }: { onShow?: (e: CalendarEvent) => void; compact?: boolean }) {
  const { data, me, actions } = useAppData()
  const now = new Date().toISOString()
  const open = data.events
    .filter((e) => e.trainerId === me.id && e.status === "pending" && e.end > now)
    .sort((a, b) => a.start.localeCompare(b.start))
  // Förfrågningar och motförslag från klienter: PT:n ska svara.
  const pending = open.filter((e) => e.awaiting !== "client")
  // Tider PT:n föreslagit/flyttat: klienten ska svara.
  const awaitingClient = open.filter((e) => e.awaiting === "client")

  return (
    <section aria-labelledby="requests-title" className="space-y-3">
      <h2 id="requests-title" className="flex items-center gap-2 font-semibold">
        <Inbox className="size-4" /> Väntande förfrågningar
        {pending.length > 0 && <Badge className="bg-warning text-foreground tabular">{pending.length}</Badge>}
      </h2>
      {pending.length === 0 && <p className="text-sm text-muted-foreground">Inga obesvarade förfrågningar.</p>}
      <ul className="space-y-2">
        {pending.slice(0, compact ? 3 : undefined).map((e) => {
          const client = data.clients.find((c) => c.id === e.clientId)
          const start = new Date(e.start)
          const end = new Date(e.end)
          // Kan bara inträffa i demoläget; databasen tillåter inga överlapp.
          const clash = findConflict(
            data.events.filter((x) => x.status === "confirmed"),
            me.id,
            start,
            end,
            e.id
          )
          return (
            <li key={e.id} className="rounded-xl border border-l-4 border-l-warning bg-card p-3">
              <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => onShow?.(e)}>
                <PersonAvatar name={client?.name ?? "?"} src={client?.avatarUrl} className="size-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{client?.name ?? "Ny klient"}</span>
                    {client?.status === "pending" && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Ny klient
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm tabular">
                    {formatDayShort(start)} · {formatTimeRange(start, end)}
                  </div>
                  {e.previousStart && e.previousEnd && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground tabular">
                      Ny tid föreslagen av klienten · tidigare <span className="line-through">{formatTimeRange(new Date(e.previousStart), new Date(e.previousEnd))}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {e.mode === "remote" ? <Video className="size-3" /> : <MapPin className="size-3" />}
                    {e.mode === "remote" ? "Distans" : "På plats"}
                  </div>
                  {e.notes && <p className="mt-1 line-clamp-2 text-xs">&quot;{e.notes}&quot;</p>}
                  {clash && <p className="mt-1 text-xs text-destructive">Krockar med {clash.title}</p>}
                </div>
              </button>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={Boolean(clash)}
                  onClick={() => {
                    actions.respondToRequest(e.id, true)
                    toast.success(`Bokat med ${client?.name ?? "klienten"}`, { description: `${formatDayShort(start)} ${formatTimeRange(start, end)}` })
                  }}
                >
                  <Check /> Acceptera
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    actions.respondToRequest(e.id, false)
                    toast("Förfrågan nekad – tiden är ledig igen")
                  }}
                >
                  <X /> Neka
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {awaitingClient.length > 0 && !compact && (
        <div className="space-y-2 pt-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Hourglass className="size-3.5" /> Väntar på klientens svar ({awaitingClient.length})
          </h3>
          <ul className="space-y-1.5">
            {awaitingClient.map((e) => {
              const client = data.clients.find((c) => c.id === e.clientId)
              const start = new Date(e.start)
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onShow?.(e)}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-warning/60 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{client?.name ?? "Klient"}</span>
                    {e.previousStart && <ArrowRight className="size-3 text-muted-foreground" />}
                    <span className="shrink-0 text-xs tabular">
                      {formatDayShort(start)} {formatTimeRange(start, new Date(e.end))}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
