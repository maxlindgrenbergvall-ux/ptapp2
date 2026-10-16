"use client"

import { CalendarPlus, CheckCircle2, ChevronRight, Dumbbell, Hourglass, MapPin, MessageCircle, Play, Video, XCircle } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { TONE_DOT } from "@/components/calendar/items"
import { PersonAvatar } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { addDays, formatDayLong, formatTimeRange, localISODate, sameDay, startOfDay, startOfWeek, WEEKDAY_SHORT } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import { parseISODate } from "@/lib/date"
import { cn } from "@/lib/utils"
import { SESSION_MODE_LABEL, type CalendarEvent, type ScheduledWorkout } from "@/types/domain"

type Entry = { kind: "event"; at: Date; event: CalendarEvent } | { kind: "workout"; at: Date; workout: ScheduledWorkout }

/**
 * Klientens kalender: bokade pass med PT:n (bekräftade och väntande),
 * planerade träningspass och historik. Uppdateras direkt när PT:n svarar.
 */
export function ClientCalendar() {
  const { data, me } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)
  const trainer = client?.trainerId ? data.trainers.find((t) => t.id === client.trainerId) : undefined
  const now = new Date()
  const [showPast, setShowPast] = React.useState(false)

  const events = data.events.filter((e) => e.clientId === me.id)
  const upcomingEvents = events.filter((e) => new Date(e.end) >= now && (e.status === "pending" || e.status === "confirmed"))
  const pending = upcomingEvents.filter((e) => e.status === "pending")
  const linked = new Set(events.filter((e) => e.workoutId && e.status !== "cancelled").map((e) => e.workoutId))
  const today = startOfDay(now)
  const planned = data.workouts.filter(
    (w) => w.clientId === me.id && !linked.has(w.id) && (w.status === "planned" || w.status === "in_progress") && parseISODate(w.date) >= today
  )

  const upcoming: Entry[] = [
    ...upcomingEvents.map((event) => ({ kind: "event" as const, at: new Date(event.start), event })),
    ...planned.map((workout) => ({ kind: "workout" as const, at: parseISODate(workout.date), workout })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())

  const past = events
    .filter((e) => !upcomingEvents.includes(e))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 20)

  // Gruppera per dag.
  const groups = new Map<string, Entry[]>()
  for (const e of upcoming) {
    const key = localISODate(e.at)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mina pass</h1>
          <p className="text-sm text-muted-foreground">Bokade tider med din PT och planerad träning.</p>
        </div>
        <Button asChild size="sm">
          <Link href={trainer ? `/klient/hitta/${trainer.id}` : "/klient/hitta"}>
            <CalendarPlus /> Boka
          </Link>
        </Button>
      </div>

      {pending.length > 0 && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning/15 px-4 py-3 text-sm">
          <Hourglass className="size-5 shrink-0 text-warning" />
          <span>
            {pending.length === 1 ? "1 förfrågan väntar" : `${pending.length} förfrågningar väntar`} på bekräftelse från {trainer?.name.split(" ")[0] ?? "PT:n"}.
          </span>
        </div>
      )}

      <WeekStrip entries={upcoming} />

      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Inga kommande pass.{" "}
          <Link href={trainer ? `/klient/hitta/${trainer.id}` : "/klient/hitta"} className="font-medium text-primary underline-offset-4 hover:underline">
            Boka en tid
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, entries]) => (
            <section key={day} className="space-y-2" aria-label={formatDayLong(parseISODate(day))}>
              <h2 className="text-sm font-semibold text-muted-foreground">
                {sameDay(parseISODate(day), now) ? "Idag" : sameDay(parseISODate(day), addDays(now, 1)) ? "Imorgon" : formatDayLong(parseISODate(day))}
              </h2>
              <ul className="space-y-2">
                {entries.map((e) =>
                  e.kind === "event" ? <EventCard key={e.event.id} event={e.event} /> : <PlannedCard key={e.workout.id} workout={e.workout} />
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <button type="button" onClick={() => setShowPast((s) => !s)} className="flex w-full items-center justify-between text-sm font-semibold" aria-expanded={showPast}>
            Tidigare och avbokade
            <ChevronRight className={cn("size-4 transition-transform", showPast && "rotate-90")} />
          </button>
          {showPast && (
            <ul className="space-y-2">
              {past.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

/** Veckoremsa med prickar per dag (grön = bekräftat, gul = väntar, blå = planerat pass). */
function WeekStrip({ entries }: { entries: Entry[] }) {
  const monday = startOfWeek(new Date())
  const days = Array.from({ length: 14 }, (_, i) => addDays(monday, i))
  return (
    <ol className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Kommande två veckor">
      {days.map((d) => {
        const dayEntries = entries.filter((e) => sameDay(e.at, d))
        const tones = [
          ...new Set(dayEntries.map((e) => (e.kind === "workout" ? "planned" : e.event.status === "pending" ? "pending" : "confirmed"))),
        ] as ("planned" | "pending" | "confirmed")[]
        const today = sameDay(d, new Date())
        return (
          <li
            key={d.toISOString()}
            className={cn("flex w-11 shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-xs", today ? "bg-primary text-primary-foreground" : "bg-muted/50")}
            aria-label={`${formatDayLong(d)}: ${dayEntries.length} pass`}
          >
            <span aria-hidden className={cn(!today && "text-muted-foreground")}>
              {WEEKDAY_SHORT[(d.getDay() + 6) % 7].slice(0, 1)}
            </span>
            <span aria-hidden className="font-semibold tabular">
              {d.getDate()}
            </span>
            <span aria-hidden className="flex h-1.5 gap-0.5">
              {tones.map((t) => (
                <span key={t} className={cn("size-1.5 rounded-full", today && t === "confirmed" ? "bg-primary-foreground" : TONE_DOT[t])} />
              ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function StatusBadge({ event }: { event: CalendarEvent }) {
  switch (event.status) {
    case "pending":
      return (
        <Badge variant="outline" className="gap-1 border-warning/60 bg-warning/15 text-foreground">
          <Hourglass className="text-warning" /> Väntar på bekräftelse från PT
        </Badge>
      )
    case "confirmed":
      return (
        <Badge className="gap-1 bg-primary text-primary-foreground">
          <CheckCircle2 /> Bekräftat
        </Badge>
      )
    case "completed":
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 /> Genomfört
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <XCircle /> Avbokat
        </Badge>
      )
  }
}

function EventCard({ event }: { event: CalendarEvent }) {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === event.trainerId)
  const workout = event.workoutId ? data.workouts.find((w) => w.id === event.workoutId) : undefined
  const start = new Date(event.start)
  const end = new Date(event.end)
  const active = event.status === "pending" || event.status === "confirmed"
  const upcoming = end >= new Date()

  return (
    <li
      className={cn(
        "rounded-2xl border border-l-4 bg-card p-4",
        event.status === "pending" && "border-l-warning",
        event.status === "confirmed" && "border-l-primary",
        !active && "border-l-muted-foreground/30 opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={cn("text-lg font-semibold tabular", event.status === "cancelled" && "line-through")}>{formatTimeRange(start, end)}</div>
          {!upcoming && <div className="text-xs text-muted-foreground">{formatDayLong(start)}</div>}
          <div className="text-sm">{event.title || "PT-pass"}</div>
        </div>
        <StatusBadge event={event} />
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {trainer && (
          <div className="flex items-center gap-2">
            <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-6 text-[10px]" />
            {trainer.name}
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          {event.mode === "remote" ? <Video className="size-4" /> : <MapPin className="size-4" />}
          {SESSION_MODE_LABEL[event.mode]}
          {event.location && <span>· {event.location}</span>}
        </div>
        {workout && (
          <Link href={`/klient/pass/${workout.id}`} className="flex items-center gap-2 text-primary underline-offset-4 hover:underline">
            <Dumbbell className="size-4" /> {workout.name}
          </Link>
        )}
        {event.notes && <p className="rounded-lg bg-muted px-3 py-2 text-xs">&quot;{event.notes}&quot;</p>}
        {event.status === "cancelled" && event.cancelledBy && (
          <p className="text-xs text-muted-foreground">{event.cancelledBy === me.id ? "Du avbokade passet." : "PT:n avbokade eller nekade tiden."}</p>
        )}
      </div>

      {active && upcoming && (
        <div className="mt-3 flex flex-wrap gap-2">
          {event.mode === "remote" && event.status === "confirmed" && (
            <Button asChild size="sm" variant="secondary">
              <Link href="/klient/chatt">
                <MessageCircle /> Till chatten
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              const q = event.status === "pending" ? "Dra tillbaka bokningsförfrågan?" : "Avboka passet? Din PT ser avbokningen direkt."
              if (!window.confirm(q)) return
              actions.setEventStatus(event.id, "cancelled")
              toast(event.status === "pending" ? "Förfrågan återkallad" : "Passet är avbokat")
            }}
          >
            {event.status === "pending" ? "Dra tillbaka" : "Avboka"}
          </Button>
        </div>
      )}
    </li>
  )
}

function PlannedCard({ workout }: { workout: ScheduledWorkout }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-l-4 border-l-chart-1 bg-card p-4">
      <Dumbbell className="size-5 shrink-0 text-chart-1" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{workout.name}</div>
        <div className="text-xs text-muted-foreground">Planerat träningspass · på egen hand</div>
      </div>
      {sameDay(parseISODate(workout.date), new Date()) && (
        <Button asChild size="sm">
          <Link href={`/klient/pass/${workout.id}`}>
            <Play /> Starta
          </Link>
        </Button>
      )}
    </li>
  )
}
