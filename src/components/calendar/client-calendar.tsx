"use client"

import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Hourglass,
  MapPin,
  MessageCircle,
  Play,
  Video,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { CalendarSyncButton } from "@/components/calendar/calendar-sync-dialog"
import { TONE_DOT } from "@/components/calendar/items"
import { ProposeTimeDialog } from "@/components/calendar/propose-time-dialog"
import { PersonAvatar } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  addDays,
  formatDayLong,
  formatDayShort,
  formatMonth,
  formatTimeRange,
  isoWeek,
  localISODate,
  sameDay,
  startOfDay,
  startOfWeek,
  WEEKDAY_SHORT,
} from "@/lib/calendar/time"
import { exerciseName } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { parseISODate } from "@/lib/date"
import { cn } from "@/lib/utils"
import { SESSION_MODE_LABEL, type CalendarEvent, type ScheduledWorkout } from "@/types/domain"
import { firstName } from "@/lib/names"

type Entry = { kind: "event"; at: Date; event: CalendarEvent } | { kind: "workout"; at: Date; workout: ScheduledWorkout }
type View = "week" | "list"

/**
 * Klientens kalender, byggd för mobilen:
 *  - Vecka (standard): veckoslider överst (svep eller pilar), och under den
 *    bara den valda dagens pass. Ingen lång lista att scrolla igenom.
 *  - Lista: alla kommande pass i ordning, för den som vill se allt.
 * Väntande tider och nya förslag från PT:n syns som en kort rad överst.
 */
export function ClientCalendar() {
  const { data, me } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)
  const trainer = client?.trainerId ? data.trainers.find((t) => t.id === client.trainerId) : undefined
  const now = new Date()
  const today = startOfDay(now)
  const [view, setView] = React.useState<View>("week")
  const [selected, setSelected] = React.useState<Date>(today)
  const [showPast, setShowPast] = React.useState(false)
  const [proposeFor, setProposeFor] = React.useState<CalendarEvent | null>(null)

  const events = data.events.filter((e) => e.clientId === me.id)
  const active = events.filter((e) => e.status === "pending" || e.status === "confirmed" || e.status === "completed")
  const upcomingEvents = events.filter((e) => new Date(e.end) >= now && (e.status === "pending" || e.status === "confirmed"))
  const pending = upcomingEvents.filter((e) => e.status === "pending" && e.awaiting !== "client")
  const needsAnswer = upcomingEvents.filter((e) => e.status === "pending" && e.awaiting === "client")
  const linked = new Set(events.filter((e) => e.workoutId && e.status !== "cancelled").map((e) => e.workoutId))
  const plannedAll = data.workouts.filter(
    (w) => w.clientId === me.id && !linked.has(w.id) && (w.status === "planned" || w.status === "in_progress")
  )

  // Allt som hör till kalendern (för veckoslidern och dagsvyn).
  const entries: Entry[] = [
    ...active.map((event) => ({ kind: "event" as const, at: new Date(event.start), event })),
    ...plannedAll.map((workout) => ({ kind: "workout" as const, at: parseISODate(workout.date), workout })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())
  const upcoming = entries.filter((e) =>
    e.kind === "event" ? upcomingEvents.includes(e.event) : parseISODate(e.workout.date) >= today
  )
  const dayEntries = entries.filter((e) => sameDay(e.at, selected))
  const nextAfter = upcoming.find((e) => startOfDay(e.at) > selected)

  const past = events
    .filter((e) => !upcomingEvents.includes(e))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 20)

  const jumpTo = (d: Date) => {
    setView("week")
    setSelected(startOfDay(d))
  }

  // Gruppera per dag (listvyn).
  const groups = new Map<string, Entry[]>()
  for (const e of upcoming) {
    const key = localISODate(e.at)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const bookHref = trainer ? `/klient/hitta/${trainer.id}` : "/klient/hitta"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Mina pass</h1>
        <div className="flex items-center gap-1.5">
          <CalendarSyncButton className="h-8" />
          <Button asChild size="sm" className="h-8">
            <Link href={bookHref}>
              <CalendarPlus /> Boka
            </Link>
          </Button>
        </div>
      </div>

      {(needsAnswer.length > 0 || pending.length > 0) && (
        <div className="space-y-1.5">
          {needsAnswer.length > 0 && (
            <button
              type="button"
              role="status"
              onClick={() => jumpTo(new Date(needsAnswer[0].start))}
              className="flex w-full items-center gap-2.5 rounded-xl border border-warning bg-warning/25 px-3 py-2.5 text-left text-sm transition-colors active:bg-warning/35"
            >
              <CalendarClock className="size-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                {firstName(trainer?.name, "Din PT")} har föreslagit {needsAnswer.length === 1 ? "en ny tid" : `${needsAnswer.length} nya tider`}.{" "}
                <span className="font-medium">Acceptera eller föreslå en annan tid.</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          )}
          {pending.length > 0 && (
            <p role="status" className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Hourglass className="size-3.5 shrink-0 text-warning" />
              {pending.length === 1 ? "1 förfrågan väntar" : `${pending.length} förfrågningar väntar`} på bekräftelse från {firstName(trainer?.name, "PT:n")}.
            </p>
          )}
        </div>
      )}

      <div role="tablist" aria-label="Visa" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(
          [
            ["week", "Vecka"],
            ["list", "Lista"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn("rounded-md py-1.5 transition-colors", view === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "week" ? (
        <>
          <WeekSlider selected={selected} onSelect={setSelected} entries={entries} />
          <section
            key={localISODate(selected)}
            aria-label={formatDayLong(selected)}
            className="animate-in fade-in-0 slide-in-from-bottom-1 space-y-2 duration-200 motion-reduce:animate-none"
          >
            <h2 className="text-sm font-semibold text-muted-foreground">
              {sameDay(selected, now) ? `Idag · ${formatDayLong(selected)}` : sameDay(selected, addDays(now, 1)) ? `Imorgon · ${formatDayLong(selected)}` : formatDayLong(selected)}
            </h2>
            {dayEntries.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                <p>Inga pass den här dagen.</p>
                {nextAfter ? (
                  <Button variant="secondary" size="sm" onClick={() => jumpTo(nextAfter.at)}>
                    Nästa: {formatDayShort(nextAfter.at)}
                    {nextAfter.kind === "event" ? ` ${formatTimeRange(nextAfter.at, new Date(nextAfter.event.end)).split("–")[0]}` : ""}
                    <ChevronRight />
                  </Button>
                ) : (
                  <Link href={bookHref} className="font-medium text-primary underline-offset-4 hover:underline">
                    Boka en tid
                  </Link>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {dayEntries.map((e) =>
                  e.kind === "event" ? (
                    <EventCard key={e.event.id} event={e.event} onPropose={setProposeFor} />
                  ) : (
                    <PlannedCard key={e.workout.id} workout={e.workout} />
                  )
                )}
              </ul>
            )}
          </section>
        </>
      ) : upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Inga kommande pass.{" "}
          <Link href={bookHref} className="font-medium text-primary underline-offset-4 hover:underline">
            Boka en tid
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day} className="space-y-2" aria-label={formatDayLong(parseISODate(day))}>
              <h2 className="text-sm font-semibold text-muted-foreground">
                {sameDay(parseISODate(day), now) ? "Idag" : sameDay(parseISODate(day), addDays(now, 1)) ? "Imorgon" : formatDayLong(parseISODate(day))}
              </h2>
              <ul className="space-y-2">
                {list.map((e) =>
                  e.kind === "event" ? (
                    <EventCard key={e.event.id} event={e.event} onPropose={setProposeFor} />
                  ) : (
                    <PlannedCard key={e.workout.id} workout={e.workout} />
                  )
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section className="space-y-2 border-t pt-4">
          <button type="button" onClick={() => setShowPast((s) => !s)} className="flex w-full items-center justify-between text-sm font-semibold" aria-expanded={showPast}>
            Tidigare och avbokade
            <ChevronRight className={cn("size-4 transition-transform", showPast && "rotate-90")} />
          </button>
          {showPast && (
            <ul className="space-y-2">
              {past.map((e) => (
                <EventCard key={e.id} event={e} onPropose={setProposeFor} />
              ))}
            </ul>
          )}
        </section>
      )}

      <ProposeTimeDialog event={proposeFor} onOpenChange={(o) => !o && setProposeFor(null)} />
    </div>
  )
}

/**
 * Veckoslider: sju dagar med prickar (grön = bekräftat, gul = väntar, blå =
 * planerat pass). Svep åt sidan eller använd pilarna för att byta vecka.
 */
function WeekSlider({ selected, onSelect, entries }: { selected: Date; onSelect: (d: Date) => void; entries: Entry[] }) {
  const monday = startOfWeek(selected)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const today = startOfDay(new Date())
  const [dir, setDir] = React.useState<1 | -1>(1)
  const touch = React.useRef<{ x: number; y: number } | null>(null)

  const step = (delta: 1 | -1) => {
    setDir(delta)
    onSelect(addDays(selected, delta * 7))
  }

  return (
    <div
      className="sticky top-14 z-10 -mx-4 border-b bg-background/95 px-4 pt-1 pb-2 backdrop-blur"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current
        touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        // Tydligt sidledssvep (inte en scroll) byter vecka.
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
      }}
    >
      <div className="mb-1.5 flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Föregående vecka" onClick={() => step(-1)}>
          <ChevronLeft />
        </Button>
        <span className="flex-1 text-center text-sm font-medium" aria-live="polite">
          {formatMonth(monday)} · v. {isoWeek(monday)}
        </span>
        {!sameDay(startOfWeek(today), monday) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setDir(today > selected ? 1 : -1)
              onSelect(today)
            }}
          >
            Idag
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Nästa vecka" onClick={() => step(1)}>
          <ChevronRight />
        </Button>
      </div>
      <ol
        key={localISODate(monday)}
        className={cn(
          "grid grid-cols-7 gap-1 animate-in fade-in-0 duration-300 motion-reduce:animate-none",
          dir === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6"
        )}
        aria-label={`Vecka ${isoWeek(monday)}`}
      >
        {days.map((d) => {
          const list = entries.filter((e) => sameDay(e.at, d))
          const tones = [
            ...new Set(list.map((e) => (e.kind === "workout" ? "planned" : e.event.status === "pending" ? "pending" : "confirmed"))),
          ] as ("planned" | "pending" | "confirmed")[]
          const isSel = sameDay(d, selected)
          const isToday = sameDay(d, today)
          return (
            <li key={d.toISOString()}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={isSel}
                aria-label={`${formatDayLong(d)}${isToday ? " (idag)" : ""}: ${list.length === 0 ? "inga pass" : `${list.length} pass`}`}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs transition-colors",
                  isSel ? "bg-primary text-primary-foreground shadow-sm" : isToday ? "bg-primary/10 text-foreground" : "active:bg-muted",
                  d < today && !isSel && "text-muted-foreground"
                )}
              >
                <span aria-hidden className={cn(!isSel && "text-muted-foreground")}>
                  {WEEKDAY_SHORT[(d.getDay() + 6) % 7].slice(0, 1)}
                </span>
                <span aria-hidden className="text-base leading-tight font-semibold tabular">
                  {d.getDate()}
                </span>
                <span aria-hidden className="flex h-1.5 gap-0.5">
                  {tones.map((t) => (
                    <span key={t} className={cn("size-1.5 rounded-full", isSel && t === "confirmed" ? "bg-primary-foreground" : TONE_DOT[t])} />
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StatusBadge({ event }: { event: CalendarEvent }) {
  switch (event.status) {
    case "pending":
      if (event.awaiting === "client") {
        return (
          <Badge variant="outline" className="gap-1 border-warning bg-warning/30 text-foreground">
            <CalendarClock className="text-warning" /> Ny tid – ditt svar behövs
          </Badge>
        )
      }
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

function EventCard({ event, onPropose }: { event: CalendarEvent; onPropose: (e: CalendarEvent) => void }) {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === event.trainerId)
  const workout = event.workoutId ? data.workouts.find((w) => w.id === event.workoutId) : undefined
  const start = new Date(event.start)
  const end = new Date(event.end)
  const active = event.status === "pending" || event.status === "confirmed"
  const upcoming = end >= new Date()
  const needsAnswer = event.status === "pending" && event.awaiting === "client" && upcoming
  const first = firstName(trainer?.name, "PT:n")

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

      {needsAnswer && (
        <div className="mt-3 rounded-xl bg-warning/15 p-3 text-sm">
          <p className="font-medium">
            {event.previousStart ? `${first} har flyttat passet` : `${first} föreslår den här tiden`}
          </p>
          {event.previousStart && event.previousEnd && (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular">
              <span className="line-through">
                {formatDayShort(new Date(event.previousStart))} {formatTimeRange(new Date(event.previousStart), new Date(event.previousEnd))}
              </span>
              <ArrowRight className="size-3" />
              <span className="font-medium text-foreground">
                {formatDayShort(start)} {formatTimeRange(start, end)}
              </span>
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                actions.acceptProposal(event.id)
                toast.success("Tiden är accepterad", { description: `${formatDayShort(start)} ${formatTimeRange(start, end)} med ${first}` })
              }}
            >
              <Check /> Acceptera tiden
            </Button>
            <Button size="sm" variant="outline" onClick={() => onPropose(event)}>
              <CalendarClock /> Föreslå ny tid
            </Button>
          </div>
        </div>
      )}

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
        {workout ? (
          <ProgramPreview workoutId={workout.id} upcoming={upcoming && active} />
        ) : (
          active &&
          upcoming && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Dumbbell className="size-3.5" /> {first} har inte lagt in något program för passet än.
            </p>
          )
        )}
        {event.notes && <p className="rounded-lg bg-muted px-3 py-2 text-xs">&quot;{event.notes}&quot;</p>}
        {event.status === "cancelled" && event.cancelledBy && (
          <p className="text-xs text-muted-foreground">{event.cancelledBy === me.id ? "Du avbokade passet." : `${first} avbokade eller nekade tiden.`}</p>
        )}
      </div>

      {active && upcoming && (
        <div className="mt-3 flex flex-wrap gap-2">
          {event.status === "pending" && event.awaiting === "trainer" && (
            <Button size="sm" variant="outline" onClick={() => onPropose(event)}>
              <CalendarClock /> Ändra tid
            </Button>
          )}
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
              const q = needsAnswer
                ? `Tacka nej till tiden? ${first} aviseras.`
                : event.status === "pending"
                  ? "Dra tillbaka bokningsförfrågan?"
                  : `Avboka passet? ${first} aviseras direkt.`
              if (!window.confirm(q)) return
              actions.setEventStatus(event.id, "cancelled")
              toast(needsAnswer ? "Du tackade nej" : event.status === "pending" ? "Förfrågan återkallad" : "Passet är avbokat")
            }}
          >
            {needsAnswer ? "Tacka nej" : event.status === "pending" ? "Dra tillbaka" : "Avboka"}
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

/**
 * Förhandsvisning av programmet för ett bokat pass: övningarna syns direkt i
 * kalendern och hela passet kan öppnas (i förhandsvisningsläge) före passdagen.
 */
function ProgramPreview({ workoutId, upcoming }: { workoutId: string; upcoming: boolean }) {
  const { data, me } = useAppData()
  const workout = data.workouts.find((w) => w.id === workoutId)
  if (!workout) return null
  const done = workout.status === "completed"
  return (
    <div className="space-y-2 rounded-xl border bg-muted/40 p-3" data-testid="program-preview">
      <p className="flex items-center gap-2 font-medium">
        <Dumbbell className="size-4 text-primary" /> {workout.name}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{workout.exercises.length} övningar</span>
      </p>
      <ol className="space-y-0.5 text-xs text-muted-foreground">
        {workout.exercises.slice(0, 6).map((e, i) => (
          <li key={e.id} className="flex justify-between gap-2">
            <span className="truncate">
              {i + 1}. {exerciseName(data, e.exerciseId, me.id)}
            </span>
            <span className="shrink-0 tabular">
              {e.sets} × {e.reps}
              {e.targetKg ? ` · ${e.targetKg} kg` : ""}
            </span>
          </li>
        ))}
        {workout.exercises.length > 6 && <li>+ {workout.exercises.length - 6} till</li>}
      </ol>
      <Button asChild size="sm" variant={upcoming ? "outline" : "secondary"} className="w-full">
        <Link href={`/klient/pass/${workout.id}`}>{done ? "Visa passet" : upcoming ? "Förhandsgranska passet" : "Öppna passet"}</Link>
      </Button>
    </div>
  )
}
