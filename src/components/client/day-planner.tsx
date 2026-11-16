"use client"

import { CalendarPlus, Check, ChevronLeft, ChevronRight, Dumbbell, History, Layers, Play, Trash2, Utensils } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { OwnWorkoutDialog } from "@/components/client/own-workout-dialog"
import { EmptyState } from "@/components/common"
import { WorkoutHistoryDialog } from "@/components/workouts/workout-history-dialog"
import { NutritionShortcut } from "@/components/nutrition/daily-nutrition"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { trainableDays } from "@/lib/active-split"
import { exerciseName } from "@/lib/data/selectors"
import { MoveWorkoutButton } from "@/components/workouts/move-workout"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, parseISODate } from "@/lib/date"
import { myTemplates } from "@/lib/templates"
import { setsDone, setsTotal } from "@/lib/training"
import { cn } from "@/lib/utils"
import type { ID, ISODate, ScheduledWorkout, WorkoutTemplate } from "@/types/domain"

const WEEKDAYS = ["M", "T", "O", "T", "F", "L", "S"]
/** Hur långt man kan bläddra i veckoremsan. */
export const WEEKS_BACK = 4
export const WEEKS_AHEAD = 4
/** Kost kan loggas en månad bakåt och planeras en vecka framåt (samma som Kost-sidan). */
export const FOOD_DAYS_BACK = 30
export const FOOD_DAYS_AHEAD = 7

export const mondayOf = (date: ISODate) => addDays(date, -((parseISODate(date).getDay() + 6) % 7))

export interface StripDay {
  date: ISODate
  /** Minst ett pass den dagen. */
  hasWorkout: boolean
  /** Alla pass den dagen klara. */
  done: boolean
  /** Något planerat eller loggat (pass eller mat). */
  planned: boolean
}

/** Veckans sju dagar med markeringar – ren funktion så att den kan testas. */
export function stripWeek(monday: ISODate, workouts: Pick<ScheduledWorkout, "date" | "status">[], foodDates: Set<ISODate>): StripDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const w = workouts.filter((x) => x.date === date && x.status !== "skipped")
    return {
      date,
      hasWorkout: w.length > 0,
      done: w.length > 0 && w.every((x) => x.status === "completed"),
      planned: w.length > 0 || foodDates.has(date),
    }
  })
}

/**
 * Veckoremsan på Idag (v51): varje dag är en knapp. Vald dag fylls med
 * limegrönt, idag har en ring, och dagar med pass eller mat har en liten
 * limegrön prick (bock när passen är klara). Pilarna bläddrar veckovis.
 */
export function WeekStrip({
  today,
  selected,
  onSelect,
  workouts,
  foodDates,
}: {
  today: ISODate
  selected: ISODate
  onSelect: (date: ISODate) => void
  workouts: Pick<ScheduledWorkout, "date" | "status">[]
  foodDates: Set<ISODate>
}) {
  const thisMonday = mondayOf(today)
  const monday = mondayOf(selected)
  const offset = Math.round((parseISODate(monday).getTime() - parseISODate(thisMonday).getTime()) / (7 * 86_400_000))
  const week = stripWeek(monday, workouts, foodDates)
  const listRef = React.useRef<HTMLOListElement>(null)

  /** Pil vänster/höger flyttar en dag, Home/End till veckans början/slut. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    let next: ISODate | null = step ? addDays(selected, step) : null
    if (e.key === "Home") next = monday
    if (e.key === "End") next = addDays(monday, 6)
    if (!next) return
    const min = addDays(thisMonday, -7 * WEEKS_BACK)
    const max = addDays(thisMonday, 7 * WEEKS_AHEAD + 6)
    if (next < min || next > max) return
    e.preventDefault()
    onSelect(next)
    // Fokus följer med till den nya dagen (efter omritning).
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus())
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Föregående vecka"
          disabled={offset <= -WEEKS_BACK}
          onClick={() => onSelect(addDays(monday, -7))}
          className="text-muted-foreground"
        >
          <ChevronLeft />
        </Button>
        <p className="text-xs font-medium text-muted-foreground" aria-live="polite" data-testid="week-label">
          {offset === 0 ? "Den här veckan" : offset === 1 ? "Nästa vecka" : offset === -1 ? "Förra veckan" : offset > 0 ? `Om ${offset} veckor` : `${-offset} veckor sedan`}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Nästa vecka"
          disabled={offset >= WEEKS_AHEAD}
          onClick={() => onSelect(addDays(monday, 7))}
          className="text-muted-foreground"
        >
          <ChevronRight />
        </Button>
      </div>
      <ol ref={listRef} className="grid grid-cols-7 gap-1" aria-label="Veckan" onKeyDown={onKeyDown} data-testid="week-strip">
        {week.map((d, i) => {
          const isToday = d.date === today
          const isSelected = d.date === selected
          const status = d.hasWorkout ? (d.done ? ", pass genomfört" : ", pass planerat") : d.planned ? ", mat loggad" : ""
          return (
            <li key={d.date}>
              <button
                type="button"
                data-date={d.date}
                data-planned={d.planned || undefined}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${formatDay(d.date)}${isToday ? " (idag)" : ""}${status}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onSelect(d.date)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-1 rounded-xl py-2 text-xs outline-none",
                  "transition-[background-color,color,transform,box-shadow] duration-200 ease-[var(--ease-out-soft)] active:scale-[0.94]",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
                  isToday && !isSelected && "ring-1 ring-primary/60 ring-inset"
                )}
              >
                <span aria-hidden>{WEEKDAYS[i]}</span>
                <span aria-hidden className={cn("text-sm font-semibold tabular", !isSelected && "text-foreground")}>
                  {parseISODate(d.date).getDate()}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full transition-colors duration-200",
                    d.done
                      ? isSelected
                        ? "bg-primary-foreground text-primary"
                        : "bg-primary text-primary-foreground"
                      : ""
                  )}
                >
                  {d.done ? (
                    <Check className="size-2.5" strokeWidth={3} />
                  ) : d.planned ? (
                    <span className={cn("size-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-primary")} data-testid="plan-dot" />
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Ett pass som kort (samma utseende som Dagens träning). */
export function WorkoutDayCard({ workout: w, clientId, future }: { workout: ScheduledWorkout; clientId: ID; future?: boolean }) {
  const { data, actions } = useAppData()
  const done = setsDone(w)
  const total = setsTotal(w)
  const names = w.exercises.map((e) => exerciseName(data, e.exerciseId, clientId)).filter(Boolean)
  const removable = future && w.byClient && w.status === "planned" && w.logs.length === 0
  const [history, setHistory] = React.useState(false)
  return (
    <Card className={cn("gap-4 py-5", w.status !== "completed" && "border-foreground/20")} data-testid="day-workout">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg">{w.name}</CardTitle>
            <CardDescription>
              {w.exercises.length} övningar · {total} set
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
          {/* v56: Flytta – byt dag med ett tryck (bara egna, planerade pass). */}
          <MoveWorkoutButton workout={w} className="-my-1" />
          {w.status === "completed" ? (
            <Badge className="bg-primary text-primary-foreground" data-testid="done-badge">
              <Check strokeWidth={3} /> Klart
            </Badge>
          ) : future ? (
            <Badge variant="outline" className="border-primary/40 text-foreground">
              <CalendarPlus className="text-primary" /> Planerat
            </Badge>
          ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <p className="line-clamp-2 text-sm text-muted-foreground">{names.join(" · ")}</p>
        {w.status === "in_progress" && (
          <div className="space-y-1">
            <Progress value={(done / total) * 100} className="h-1.5" aria-label="Avklarade set" />
            <p className="text-xs text-muted-foreground tabular">
              {done} av {total} set
            </p>
          </div>
        )}
        {future ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button asChild variant="outline" className="w-full">
              <Link href={`/klient/pass/${w.id}`}>Visa passet</Link>
            </Button>
            {removable && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Ta bort ${w.name}`}
                onClick={() => {
                  actions.deleteOwnWorkout(w.id)
                  toast("Passet är borttaget")
                }}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ) : w.status !== "completed" ? (
          <Button asChild size="lg" className="h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90">
            <Link href={`/klient/pass/${w.id}`}>
              <Play className="fill-current" />
              {w.status === "in_progress" ? "Fortsätt passet" : "Starta passet"}
            </Link>
          </Button>
        ) : (
          // v52: avklarat pass → historiken (vikter, reps och set) i en modal.
          <Button variant="outline" className="w-full" onClick={() => setHistory(true)} data-testid="open-history">
            <History /> Visa historik
          </Button>
        )}
      </CardContent>
      {w.status === "completed" && <WorkoutHistoryDialog workoutId={history ? w.id : null} onOpenChange={setHistory} href={(id) => `/klient/pass/${id}`} />}
    </Card>
  )
}

/**
 * Planera ett pass på ett datum: en dag ur det aktiva schemat eller en sparad
 * mall. Passet läggs på dagen som ett eget pass (turordningen i schemat ändras
 * inte – "Nästa pass" fortsätter som vanligt).
 */
export function PlanWorkoutDialog({ date, className }: { date: ISODate; className?: string }) {
  const { data, me, actions } = useAppData()
  const [open, setOpen] = React.useState(false)
  const split = data.activeSplits.find((s) => s.clientId === me.id)
  const days = split ? trainableDays(split) : []
  const templates = myTemplates(data, me.id)

  const plan = (name: string, exercises: Omit<WorkoutTemplate["exercises"][number], "id">[]) => {
    // Nya id sätts av createOwnWorkout.
    actions.createOwnWorkout(name, date, exercises.map((e) => ({ ...e, id: "" })))
    setOpen(false)
    toast.success(`Planerat till ${formatDay(date).toLowerCase()}`, { description: name })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn("w-full", className)} data-testid="plan-workout">
          <CalendarPlus /> Planera pass
        </Button>
      </DialogTrigger>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Planera pass</DialogTitle>
          <DialogDescription>{formatDay(date)}. Välj ett pass ur ditt upplägg eller en sparad mall.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60svh] space-y-4 overflow-y-auto">
          {split && days.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Layers className="size-3.5" /> {split.name}
              </h3>
              <ul className="space-y-1.5" aria-label="Pass i upplägget">
                {days.map((d) => (
                  <li key={d.index}>
                    <PlanOption
                      title={d.name}
                      meta={`${d.exercises.length} övningar`}
                      onClick={() => plan(`${split.short || split.name}: ${d.name}`, d.exercises)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {templates.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Dumbbell className="size-3.5" /> Mallar
              </h3>
              <ul className="space-y-1.5" aria-label="Sparade mallar">
                {templates.map((t) => (
                  <li key={t.id}>
                    <PlanOption title={t.name} meta={`${t.exercises.length} övningar`} onClick={() => plan(t.name, t.exercises)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!days.length && !templates.length && (
            <EmptyState
              compact
              icon={Layers}
              title="Inget upplägg eller mallar än"
              text="Välj ett upplägg under Upplägg, eller bygg ett eget pass direkt."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/klient/schema">Upplägg</Link>
                </Button>
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PlanOption({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-[border-color,background-color,transform] duration-200 hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{meta}</span>
      </span>
      <CalendarPlus className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  )
}

/** Vald dag som inte är idag: dagens pass och kost, med planering framåt. */
export function DayPlan({ date, today, clientId }: { date: ISODate; today: ISODate; clientId: ID }) {
  const { data } = useAppData()
  const future = date > today
  const workouts = data.workouts.filter((w) => w.clientId === clientId && w.date === date && w.status !== "skipped")
  const foodOk = date >= addDays(today, -FOOD_DAYS_BACK) && date <= addDays(today, FOOD_DAYS_AHEAD)
  return (
    // Nyckeln gör att innehållet glider in på nytt när man byter dag.
    <div key={date} className="rise-in space-y-5" data-testid="day-plan" data-date={date}>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Dumbbell className="size-4" /> {future ? "Planerad träning" : "Träning"}
          <span className="font-normal text-muted-foreground">· {formatDay(date)}</span>
        </h2>
        {workouts.length === 0 && (
          <Card className="py-2">
            <CardContent className="px-2">
              <EmptyState
                compact
                icon={future ? CalendarPlus : Dumbbell}
                title={future ? "Inget planerat än" : "Inget pass den här dagen"}
                text={future ? "Lägg in ett pass ur ditt upplägg, en mall eller ett eget pass – så ligger det klart när dagen kommer." : "Glömde du logga? Lägg in passet i efterhand."}
                data-testid="day-empty"
              />
            </CardContent>
          </Card>
        )}
        {workouts.map((w) => (
          <WorkoutDayCard key={w.id} workout={w} clientId={clientId} future={future} />
        ))}
        <div className={cn("grid gap-2", future && "grid-cols-2")}>
          {future && <PlanWorkoutDialog date={date} />}
          <OwnWorkoutDialog defaultDate={date} label={future ? "Bygg eget pass" : "Logga eget pass"} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Utensils className="size-4" /> {future ? "Planerad kost" : "Kost"}
          <span className="font-normal text-muted-foreground">· {formatDay(date)}</span>
        </h2>
        {foodOk ? (
          <NutritionShortcut clientId={clientId} date={date} />
        ) : (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="food-out-of-range">
            {future ? `Kosten kan planeras upp till ${FOOD_DAYS_AHEAD} dagar framåt.` : "Kostdagboken sparar en månad bakåt."}
          </p>
        )}
      </section>
    </div>
  )
}
