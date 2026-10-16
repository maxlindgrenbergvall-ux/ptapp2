"use client"

import { Ban, Dumbbell, UserRound } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addDays, addMinutes, atTime, localISODate, toHHMM } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import { formatShort, parseISODate } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { CalendarEvent, SessionMode } from "@/types/domain"

type Kind = "client" | "own" | "block"

const DURATIONS = [30, 45, 60, 75, 90, 120]

const KINDS: { value: Kind; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { value: "client", label: "Pass med klient", icon: UserRound, hint: "Boka in en klient (bekräftas direkt)" },
  { value: "own", label: "Eget pass", icon: Dumbbell, hint: "Gruppass, eget pass m.m." },
  { value: "block", label: "Blockera tid", icon: Ban, hint: "Lunch, semester – inga bokningar" },
]

/**
 * Skapa eller redigera en händelse i PT:ns kalender. Vid redigering är typen och
 * klienten låsta (som i databasen); tid, titel, plats och anteckning går att ändra.
 */
export function EventFormDialog({
  open,
  onOpenChange,
  initialStart,
  event,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialStart?: Date
  event?: CalendarEvent
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        {open && <EventForm key={event?.id ?? initialStart?.toISOString()} event={event} initialStart={initialStart} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function EventForm({ event, initialStart, onDone }: { event?: CalendarEvent; initialStart?: Date; onDone: () => void }) {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const clients = data.clients.filter((c) => c.trainerId === me.id && c.status !== "paused")
  const editing = Boolean(event)

  const start0 = event ? new Date(event.start) : (initialStart ?? atTime(addDays(new Date(), 1), "08:00"))
  const end0 = event ? new Date(event.end) : addMinutes(start0, 60)
  const [kind, setKind] = React.useState<Kind>(event ? (event.kind === "block" ? "block" : event.clientId ? "client" : "own") : "client")
  const [clientId, setClientId] = React.useState(event?.clientId ?? clients[0]?.id ?? "")
  const [title, setTitle] = React.useState(event?.title ?? "")
  const [date, setDate] = React.useState(localISODate(start0))
  const [time, setTime] = React.useState(toHHMM(start0))
  const [duration, setDuration] = React.useState(Math.round((end0.getTime() - start0.getTime()) / 60_000))
  const [allDay, setAllDay] = React.useState(Boolean(event && event.kind === "block" && duration >= 24 * 60 - 1))
  const [endDate, setEndDate] = React.useState(localISODate(addMinutes(end0, -1)))
  const [mode, setMode] = React.useState<SessionMode>(event?.mode ?? (trainer?.coachingMode === "remote" ? "remote" : "onsite"))
  const [location, setLocation] = React.useState(event?.location ?? "")
  const [notes, setNotes] = React.useState(event?.notes ?? "")
  const [workoutId, setWorkoutId] = React.useState(event?.workoutId ?? "")

  // Klientens planerade pass i närheten av datumet kan kopplas till bokningen.
  const workouts = data.workouts
    .filter((w) => w.clientId === clientId && w.status !== "completed" && w.status !== "skipped")
    .filter((w) => Math.abs(parseISODate(w.date).getTime() - parseISODate(date).getTime()) <= 7 * 86_400_000)
    .sort((a, b) => a.date.localeCompare(b.date))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const day = parseISODate(date)
    const start = kind === "block" && allDay ? day : atTime(day, time)
    const end = kind === "block" && allDay ? addDays(parseISODate(endDate), 1) : addMinutes(start, duration)
    if (end <= start) return toast.error("Sluttiden måste vara efter starttiden")
    if (kind === "client" && !clientId) return toast.error("Välj en klient")

    const base = {
      title: title.trim() || (kind === "block" ? "Upptagen" : kind === "own" ? "Eget pass" : "PT-pass"),
      start: start.toISOString(),
      end: end.toISOString(),
      mode,
      location: kind === "block" ? undefined : location.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    const error = editing
      ? actions.updateEvent(event!.id, { ...base, workoutId: kind === "client" ? workoutId || undefined : undefined })
      : actions.createEvent({
          ...base,
          kind: kind === "block" ? "block" : "session",
          status: "confirmed",
          clientId: kind === "client" ? clientId : undefined,
          workoutId: kind === "client" ? workoutId || undefined : undefined,
        })
    if (error) return toast.error("Kunde inte spara", { description: error })
    toast.success(editing ? "Ändringen är sparad" : kind === "block" ? "Tiden är blockerad" : "Passet är inlagt i kalendern")
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{editing ? "Ändra händelse" : "Ny händelse"}</DialogTitle>
        <DialogDescription>
          {kind === "block" ? "Blockerad tid kan inte bokas av klienter." : "Syns direkt i klientens kalender när en klient är vald."}
        </DialogDescription>
      </DialogHeader>

      {!editing && (
        <div role="radiogroup" aria-label="Typ" className="grid grid-cols-3 gap-2">
          {KINDS.map(({ value, label, icon: Icon, hint }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              title={hint}
              onClick={() => setKind(value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center text-xs transition-colors",
                kind === value ? "border-primary bg-primary/10 font-medium ring-1 ring-primary" : "hover:bg-muted"
              )}
            >
              <Icon className={cn("size-4", kind === value ? "text-primary" : "text-muted-foreground")} />
              {label}
            </button>
          ))}
        </div>
      )}

      {kind === "client" && !editing && (
        <div className="space-y-1.5">
          <Label>Klient</Label>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Du har inga aktiva klienter än.</p>
          ) : (
            <Select value={clientId} onValueChange={(v) => (setClientId(v), setWorkoutId(""))}>
              <SelectTrigger className="w-full" aria-label="Klient">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "pending" && " (ny förfrågan)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ev-title">Titel</Label>
        <Input
          id="ev-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder={kind === "block" ? "T.ex. Lunch, Semester" : kind === "own" ? "T.ex. Hyrox-gruppass" : "T.ex. Teknik knäböj"}
        />
      </div>

      {kind === "block" && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} /> Hela dagar (t.ex. semester)
        </label>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-date">{kind === "block" && allDay ? "Från" : "Datum"}</Label>
          <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {kind === "block" && allDay ? (
          <div className="space-y-1.5">
            <Label htmlFor="ev-end-date">Till och med</Label>
            <Input id="ev-end-date" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ev-time">Start</Label>
              <Input id="ev-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Längd</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="w-full" aria-label="Längd">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...DURATIONS, duration])]
                    .sort((a, b) => a - b)
                    .map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}` : `${d} min`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {kind !== "block" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Plats</Label>
              <div role="radiogroup" aria-label="Plats" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {(["onsite", "remote"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={cn("rounded-md py-1.5 text-sm", mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                  >
                    {m === "onsite" ? "På plats" : "Distans"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-location">{mode === "remote" ? "Länk (valfritt)" : "Adress/lokal"}</Label>
              <Input
                id="ev-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={200}
                placeholder={mode === "remote" ? "Videosamtal i appen" : "T.ex. Gym 1, Södermalm"}
              />
            </div>
          </div>
          {kind === "client" && workouts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Koppla till träningspass (valfritt)</Label>
              <Select value={workoutId || "none"} onValueChange={(v) => setWorkoutId(v === "none" ? "" : v)}>
                <SelectTrigger className="w-full" aria-label="Kopplat träningspass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inget kopplat pass</SelectItem>
                  {workouts.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} · {formatShort(w.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ev-notes">Anteckning</Label>
        <Textarea id="ev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Avbryt
        </Button>
        <Button type="submit" disabled={kind === "client" && !editing && clients.length === 0}>
          {editing ? "Spara ändringar" : kind === "block" ? "Blockera tid" : "Lägg in pass"}
        </Button>
      </DialogFooter>
    </form>
  )
}
