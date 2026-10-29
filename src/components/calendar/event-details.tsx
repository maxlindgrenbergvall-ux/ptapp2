"use client"

import { ArrowRight, Check, CheckCheck, ClipboardCheck, Clock, Dumbbell, Hourglass, MapPin, MessageSquare, Move, Pencil, ShieldCheck, Trash2, Video, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { TONE_DOT, TONE_LABEL, type CalItem } from "@/components/calendar/items"
import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { confirmDialog } from "@/components/ui/confirm"
import { formatDayLong, formatDayShort, formatTimeRange } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import { formatDay } from "@/lib/date"
import { cn } from "@/lib/utils"
import { hasWorkoutStarted } from "@/lib/workout-rules"
import { SESSION_MODE_LABEL, type CalendarEvent } from "@/types/domain"
import { firstName } from "@/lib/names"

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
              <PersonAvatar name={client.name} src={client.avatarUrl} className="size-9" />
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
            <div className="space-y-1.5 rounded-xl border p-3">
              <p className="flex items-center gap-2 font-medium">
                <Dumbbell className="size-4 text-muted-foreground" /> {workout.name}
                {workout.verifiedAt && (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-success">
                    <ShieldCheck className="size-3.5" /> Klarmarkerat
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {workout.exercises.length} övningar
                {item.tone === "planned" && " · schemalagt i passbyggaren"}
              </p>
              {client && !workout.byClient && (
                <Button asChild size="sm" variant={workout.verifiedAt ? "outline" : "default"} className="w-full">
                  <Link href={`/pt/klienter/${client.id}/pass/${workout.id}`}>
                    <ClipboardCheck /> {workout.verifiedAt ? "Visa passet" : hasWorkoutStarted(data, workout) ? "Kontrollera och klarmarkera" : "Öppna programmet"}
                  </Link>
                </Button>
              )}
            </div>
          )}
          {ev && ev.kind === "session" && ev.clientId && !workout && ev.status !== "cancelled" && <AttachProgram eventId={ev.id} />}
          {ev?.status === "pending" && (
            <div className="space-y-1 rounded-lg border border-dashed border-warning/70 bg-warning/10 px-3 py-2">
              <p className="flex items-center gap-1.5 font-medium">
                <Hourglass className="size-3.5 text-warning" />
                {ev.awaiting === "client" ? `Väntar på att ${firstName(client?.name, "klienten")} svarar` : "Väntar på ditt svar"}
              </p>
              {ev.previousStart && ev.previousEnd && (
                <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground tabular">
                  <span className="line-through">
                    {formatDayShort(new Date(ev.previousStart))} {formatTimeRange(new Date(ev.previousStart), new Date(ev.previousEnd))}
                  </span>
                  <ArrowRight className="size-3" /> {formatDayShort(new Date(ev.start))} {formatTimeRange(new Date(ev.start), new Date(ev.end))}
                </p>
              )}
              {!past && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Move className="size-3" /> Preliminärt – dra passet i kalendern eller välj Flytta för att föreslå en annan tid.
                </p>
              )}
            </div>
          )}
          {ev?.notes && <blockquote className="rounded-lg bg-muted px-3 py-2">&quot;{ev.notes}&quot;</blockquote>}
          {ev?.status === "cancelled" && ev.cancelledBy && (
            <p className="text-xs text-muted-foreground">Avbokat av {ev.cancelledBy === ev.trainerId ? "dig" : client?.name ?? "klienten"}.</p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {ev?.status === "pending" && ev.awaiting !== "client" && (
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
              <div className="flex gap-2">
                {!past && (
                  <Button variant="outline" onClick={() => onEdit(ev)}>
                    <Move /> Flytta
                  </Button>
                )}
                <Button
                  onClick={() => {
                    actions.respondToRequest(ev.id, true)
                    toast.success("Bokningen är bekräftad och syns i klientens kalender")
                    close()
                  }}
                >
                  <Check /> Acceptera
                </Button>
              </div>
            </>
          )}
          {ev?.status === "pending" && ev.awaiting === "client" && (
            <>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!(await confirmDialog({ title: "Dra tillbaka förslaget?", description: `${client?.name ?? "Klienten"} aviseras.`, confirmLabel: "Dra tillbaka", cancelLabel: "Behåll", destructive: true }))) return
                  actions.setEventStatus(ev.id, "cancelled")
                  toast("Förslaget är tillbakadraget")
                  close()
                }}
              >
                Dra tillbaka
              </Button>
              {!past && (
                <Button variant="outline" onClick={() => onEdit(ev)}>
                  <Move /> Flytta
                </Button>
              )}
            </>
          )}
          {ev?.status === "confirmed" && ev.kind === "session" && (
            <>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!(await confirmDialog({ title: client ? `Avboka passet med ${client.name}?` : "Avboka passet?", description: client ? "Klienten ser avbokningen direkt." : undefined, confirmLabel: "Avboka", cancelLabel: "Behåll", destructive: true }))) return
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
                {past && !workout && (
                  <Button
                    onClick={() => {
                      const error = actions.setEventStatus(ev.id, "completed")
                      if (error) return toast.error(error)
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

/**
 * PT: koppla ett träningsprogram till ett bokat pass, så att både PT och
 * klient ser övningarna (klienten kan förhandsgranska innan passet).
 */
function AttachProgram({ eventId }: { eventId: string }) {
  const { data, me, actions } = useAppData()
  const templates = data.templates.filter((t) => t.trainerId === me.id)
  const [templateId, setTemplateId] = React.useState("")
  if (!templates.length) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        Inget program kopplat. Skapa en mall i <Link href="/pt/pass" className="underline">Passbyggaren</Link> för att koppla ett program.
      </p>
    )
  }
  return (
    <div className="space-y-1.5 rounded-xl border border-dashed p-3" data-testid="attach-program">
      <p className="text-xs text-muted-foreground">Koppla ett träningsprogram som ni båda ser under passet.</p>
      <div className="flex gap-2">
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className="min-w-0 flex-1" aria-label="Träningsprogram">
            <SelectValue placeholder="Välj program" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!templateId}
          onClick={() => {
            const tpl = templates.find((t) => t.id === templateId)
            if (!tpl) return
            const error = actions.attachProgram(eventId, tpl)
            if (error) return toast.error(error)
            toast.success(`${tpl.name} är kopplat till passet`, { description: "Klienten kan förhandsgranska övningarna i sin kalender." })
          }}
        >
          Koppla
        </Button>
      </div>
    </div>
  )
}
