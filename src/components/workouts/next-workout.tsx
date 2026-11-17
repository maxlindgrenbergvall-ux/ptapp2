"use client"

import { CalendarRange, ChevronRight, Moon, Play, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { addRestDay, isRestDay, MAX_SPLIT_DAYS, nextSplitAction, removeRestDay, reorderSplitDays, weekProgress } from "@/lib/active-split"
import { SortableList } from "@/components/workouts/sortable-list"
import { exerciseName } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { cn } from "@/lib/utils"

/**
 * "Nästa pass" (v43) på startsidan: en stor knapp som direkt startar passet som
 * står på tur i det aktiva schemat. Är ett pass redan påbörjat från schemat
 * öppnas det i stället. Under knappen: veckans pass mot målet dagar/vecka.
 * Utan aktivt schema leder kortet till Träningsschema.
 */
export function NextWorkoutCard() {
  const { data, actions, me } = useAppData()
  const router = useRouter()
  const split = data.activeSplits.find((s) => s.clientId === me.id)
  const next = nextSplitAction(split, data.workouts)

  if (!split || next.kind === "none") {
    return (
      <Link
        href="/klient/schema"
        className="flex items-center gap-3 rounded-2xl border border-dashed p-4 transition-colors hover:bg-muted/50"
        data-testid="next-workout-empty"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <CalendarRange className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Hitta ett upplägg</span>
          <span className="block text-sm text-muted-foreground">Välj ett färdigt upplägg att testa, eller bygg ditt eget – sedan räcker det att trycka på Nästa pass.</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    )
  }

  const open = next.kind === "open" ? data.workouts.find((w) => w.id === next.workoutId) : undefined
  const day = open ? undefined : split.days[next.dayIndex]
  const title = open ? open.name.split(": ").at(-1) : day!.name
  const exercises = open ? open.exercises : day!.exercises
  const names = exercises.map((e) => exerciseName(data, e.exerciseId, me.id)).filter(Boolean)
  const week = weekProgress(split, data.workouts, todayISO())

  const start = () => {
    const id = actions.startNextSplitWorkout()
    if (!id) return toast.error("Upplägget saknar övningar")
    router.push(`/klient/pass/${id}`)
  }

  return (
    <section className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 shadow-card" aria-labelledby="next-title" data-testid="next-workout-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="next-title" className="text-xs font-medium tracking-wide text-primary uppercase">
            {open ? "Påbörjat pass" : "Nästa pass"} · {split.short || split.name}
          </p>
          <p className="truncate text-xl font-bold tracking-tight" data-testid="next-workout-day">
            {title}
          </p>
          <p className="line-clamp-1 text-sm text-muted-foreground">{names.join(" · ")}</p>
        </div>
        <Link href="/klient/schema" className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline">
          Upplägg
        </Link>
      </div>
      <Button
        size="lg"
        className="h-14 w-full bg-brand text-lg font-semibold text-brand-foreground shadow-float transition-[background-color,scale] duration-200 ease-[var(--ease-out-soft)] hover:bg-brand/90 active:scale-[0.97]"
        onClick={() => {
          navigator.vibrate?.(10)
          start()
        }}
        data-testid="next-workout"
      >
        <Play className="size-5 fill-current" /> Nästa pass
      </Button>
      {/* Veckans pass mot målet (dagar per vecka). */}
      <div className="flex items-center gap-2" aria-label={`${week.done} av ${week.goal} pass denna vecka`} data-testid="week-progress">
        <div className="flex flex-1 gap-1" aria-hidden>
          {Array.from({ length: Math.max(week.goal, week.done) }, (_, i) => (
            // v46: veckans avklarade pass fylls i ett i taget, från vänster.
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
              {i < week.done && <span className="block h-full origin-left animate-in rounded-full bg-primary duration-500 ease-[var(--ease-out-soft)] fill-mode-backwards slide-in-from-left-full" style={{ animationDelay: `${150 + i * 90}ms` }} />}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular">
          {week.done} av {week.goal} pass denna vecka
        </span>
      </div>
    </section>
  )
}

/** Stabilt id per dag (för drag-and-drop) – dagarna har inget eget id i databasen. */
const dayIds = new WeakMap<object, string>()
let daySeq = 0
const dayId = (d: object) => dayIds.get(d) ?? (dayIds.set(d, `dag-${++daySeq}`), dayIds.get(d)!)

/**
 * Det aktiva upplägget: dagarna i ordning, vilken som står på tur och dagar per
 * vecka. v52: dagarna – även vilodagarna – flyttas med drag-and-drop (eller pil
 * upp/ned på handtaget), och vilodagar läggs till och tas bort direkt här.
 */
export function ActiveSplitOverview({ onChange }: { onChange: () => void }) {
  const { data, actions, me } = useAppData()
  const split = data.activeSplits.find((s) => s.clientId === me.id)
  if (!split) return null
  const next = nextSplitAction(split, data.workouts)
  const upNext = next.kind === "create" ? next.dayIndex : -1
  const items = split.days.map((d, i) => ({ id: dayId(d), day: d, index: i }))
  return (
    <div className="space-y-4" data-testid="active-split">
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
        <div>
          {/* v59: upplägg som PT:n tilldelat visar vem det kommer från. */}
          <p className="text-xs text-muted-foreground" data-testid="split-owner">
            {split.assignedBy ? `Från ${data.trainers.find((tr) => tr.id === split.assignedBy)?.name ?? "din PT"}` : "Ditt upplägg"}
          </p>
          <p className="text-lg font-semibold">{split.name}</p>
        </div>
        <SortableList
          items={items}
          className="space-y-1.5"
          aria-label="Passen i ordning"
          itemLabel={(it) => (isRestDay(it.day) ? "Vilodag" : it.day.name)}
          onReorder={(ids) => actions.updateSplitDays((s) => reorderSplitDays(s, ids.map((id) => items.find((it) => it.id === id)!.index)))}
          renderItem={({ day: d, index: i }, { handle }) => {
            const rest = isRestDay(d)
            const nr = split.days.slice(0, i + 1).filter((x) => !isRestDay(x)).length
            return (
              <div
                className={cn("flex items-center gap-2 rounded-xl border bg-card px-2 py-2", i === upNext && "border-primary bg-primary/5", rest && "border-dashed bg-transparent")}
                data-testid={rest ? "active-rest-day" : "active-day"}
              >
                {handle}
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i === upNext ? "bg-primary text-primary-foreground" : "bg-muted", rest && "text-muted-foreground")}>
                  {rest ? <Moon className="size-3.5" aria-hidden /> : nr}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{rest ? "Vilodag" : d.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{rest ? "Återhämtning" : `${d.exercises.length} övningar${d.focus ? ` · ${d.focus}` : ""}`}</span>
                </span>
                {i === upNext && <span className="shrink-0 text-xs font-medium text-primary">På tur</span>}
                {rest && (
                  <Button variant="ghost" size="icon-sm" aria-label="Ta bort vilodagen" onClick={() => actions.updateSplitDays((s) => removeRestDay(s, i))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            )
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          disabled={split.days.length >= MAX_SPLIT_DAYS}
          onClick={() => actions.updateSplitDays((s) => addRestDay(s))}
          data-testid="active-add-rest"
        >
          <Moon /> Lägg till vilodag
        </Button>
        <p className="text-xs text-muted-foreground">Dra i handtaget för att flytta ett pass eller en vilodag. Nästa pass hoppar över vilodagarna.</p>
        <div className="space-y-2">
          <p id="active-days" className="text-sm font-medium">
            Dagar i veckan
          </p>
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby="active-days">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={split.daysPerWeek === n}
                aria-label={`${n} dagar per vecka`}
                onClick={() => actions.setSplitDaysPerWeek(n)}
                className={cn(
                  "min-h-11 rounded-xl border text-sm font-semibold tabular transition-colors",
                  split.daysPerWeek === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/60"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onChange} data-testid="change-split">
          Byt upplägg
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => {
            actions.stopActiveSplit()
            toast.success("Upplägget är avslutat", { description: "Dina genomförda pass ligger kvar." })
          }}
          data-testid="stop-split"
        >
          Avsluta upplägget
        </Button>
      </div>
    </div>
  )
}
