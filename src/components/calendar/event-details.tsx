"use client"

import { Check, CheckCheck, Clock, Dumbbell, MapPin, MessageSquare, Pencil, Trash2, Video, X } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { TONE_DOT, TONE_LABEL, type CalItem } from "@/components/calendar/items"
import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDayLong, formatTimeRange } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import { formatDay } from "@/lib/date"
import { cn } from "@/lib/utils"
import { SESSION_MODE_LABEL, type CalendarEvent } from "@/types/domain"

/** Detaljer för en kalenderpost med åtgärder efter status. */
export function EventDetailsDialog({
  item,
  onOpenChange,
  onEdit,
}: {
  item: CalItem | null
  onOpenChange: (o: boolean) => void
  onEdit: (e: CalendarEvent) => void
}) {
  const { data, actions } = useAppData()
  const close = () => onOpenChange(false)
  if (!item) return null
  const ev = item.event
  const client = ev?.clientId ? data.clients.find((c) => c.id === ev.clientId) : item.workout ? data.clients.find((c) => c.id === item.workout!.clientId) : undefined
  const workout = item.workout ?? (ev?.workoutId ? data.workouts.find((w) => w.id === ev.workoutId) : undefined)
  const past = new Date(item.end) < new Date()

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={cn("size-2.5 rounded-full", TONE_DOT[item.tone])} aria-hidden />
            {TONE_LABEL[item.tone]}
          </div>
          <DialogTitle>{ev ? (ev.kind === "block" ? ev.title || "Upptagen" : ev.title || "Pass") : workout?.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {item.allDay
              ? workout
                ? `${formatDay(workout.date)} · ingen tid bokad`
                : `${formatDayLong(item.start)} – ${formatDayLong(new Date(item.end.getTime() - 60_000))}`
              : `${formatDayLong(item.start)} · ${formatTimeRange(item.start, item.end)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {client && (
            <Link href={`/pt/klienter/${client.id}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/60">
              <PersonAvatar name={client.name} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{client.name}</div>
                <div className="truncate text-xs text-muted-foreground">{client.goal || "Klient"}</div>
              </div>
            </Link>
          )}
          {ev && ev.kind === "session" && (
            <p className="flex items-center gap-2">
              {ev.mode === "remote" ? <Video className="size-4 text-muted-foreground" /> : <MapPin className="size-4 text-muted-foreground" />}
              {SESSION_MODE_LABEL[ev.mode]}
              {ev.location && <span className="text-muted-foreground">· {ev.location}</span>}
            </p>
          )}
          {workout && (
            <p className="flex items-center gap-2">
              <Dumbbell className="size-4 text-muted-foreground" /> {workout.name}
              {item.tone === "planned" && <span className="text-muted-foreground">(schemalagt i passbyggaren)</span>}
            </p>
          )}
          {ev?.notes && <blockquote className="rounded-lg bg-muted px-3 py-2">&quot;{ev.notes}&quot;</blockquote>}
          {ev?.status === "cancelled" && ev.cancelledBy && (
            <p className="text-xs text-muted-foreground">Avbokat av {ev.cancelledBy === ev.trainerId ? "dig" : client?.name ?? "klienten"}.</p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {ev?.status === "pending" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  actions.respondToRequest(ev.id, false)
                  toast("Förfrågan nekad")
                  close()
                }}
              >
                <X /> Neka
              </Button>
              <Button
                onClick={() => {
                  actions.respondToRequest(ev.id, true)
                  toast.success("Bokningen är bekräftad och syns i klientens kalender")
                  close()
                }}
              >
                <Check /> Acceptera
              </Button>
            </>
          )}
          {ev?.status === "confirmed" && ev.kind === "session" && (
            <>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (!window.confirm(client ? `Avboka passet med ${client.name}? Klienten ser avbokningen direkt.` : "Avboka passet?")) return
                  actions.setEventStatus(ev.id, "cancelled")
                  toast("Passet är avbokat")
                  close()
                }}
              >
                Avboka
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onEdit(ev)}>
                  <Pencil /> Ändra
                </Button>
                {past && (
                  <Button
                    onClick={() => {
                      actions.setEventStatus(ev.id, "completed")
                      toast.success("Markerat som genomfört")
                      close()
                    }}
                  >
                    <CheckCheck /> Genomfört
                  </Button>
                )}
              </div>
            </>
          )}
          {ev?.kind === "block" && ev.status !== "cancelled" && (
            <>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  actions.deleteEvent(ev.id)
                  toast("Blockeringen är borttagen")
                  close()
                }}
              >
                <Trash2 /> Ta bort
              </Button>
              <Button variant="outline" onClick={() => onEdit(ev)}>
                <Pencil /> Ändra
              </Button>
            </>
          )}
          {client && (
            <Button asChild variant="ghost" className="sm:ml-auto">
              <Link href="/pt/meddelanden">
                <MessageSquare /> Chatt
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
