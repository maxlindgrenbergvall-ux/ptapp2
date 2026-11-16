"use client"

import { ArrowLeftRight, CalendarArrowUp, Check } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAppData } from "@/lib/data/store"
import { parseISODate, todayISO } from "@/lib/date"
import { canMove, dayName, moveDays, planMove, type MovePlan } from "@/lib/workout-move"
import { cn } from "@/lib/utils"
import type { ScheduledWorkout } from "@/types/domain"

const SHORT = new Intl.DateTimeFormat("sv-SE", { weekday: "short" })

/** Flytta + toast med Ångra. Används av bladet och av drag-and-drop i veckovyn. */
export function useMoveWorkout() {
  const { actions } = useAppData()
  return React.useCallback(
    (workout: Pick<ScheduledWorkout, "id" | "date" | "name">, date: string, swapWith?: Pick<ScheduledWorkout, "id" | "name">) => {
      const from = workout.date
      const error = actions.moveWorkout(workout.id, date, swapWith?.id)
      if (error) {
        toast.error(error)
        return false
      }
      navigator.vibrate?.(8)
      const today = todayISO()
      toast.success(swapWith ? `${workout.name} och ${swapWith.name} bytte plats` : `${workout.name} flyttat till ${dayName(date, today)}`, {
        action: { label: "Ångra", onClick: () => void actions.moveWorkout(workout.id, from, swapWith?.id) },
      })
      return true
    },
    [actions]
  )
}

/**
 * "Flytta" på ett passkort (v56): en diskret knapp som öppnar en kompakt
 * dagväljare underifrån. Ett tryck på en dag flyttar passet direkt. Har dagen
 * redan ett eget pass erbjuds "Byt plats". Visas bara för pass som går att
 * flytta (klientens egna, planerade pass).
 */
export function MoveWorkoutButton({ workout, className, label = false }: { workout: ScheduledWorkout; className?: string; label?: boolean }) {
  const [open, setOpen] = React.useState(false)
  if (!canMove(workout)) return null
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={label ? "sm" : "icon-sm"}
        className={cn("text-muted-foreground hover:text-foreground", className)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={`Flytta ${workout.name} till en annan dag`}
        data-testid="move-workout"
      >
        <CalendarArrowUp /> {label && "Flytta"}
      </Button>
      <MoveSheet workout={workout} open={open} onOpenChange={setOpen} />
    </>
  )
}

function MoveSheet({ workout, open, onOpenChange }: { workout: ScheduledWorkout; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useAppData()
  const move = useMoveWorkout()
  const [today] = React.useState(todayISO)
  const [choice, setChoice] = React.useState<{ date: string; plan: MovePlan } | null>(null)
  const days = moveDays(today)
  const mine = data.workouts.filter((w) => w.clientId === workout.clientId)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Passets nuvarande dag syns direkt i raden.
  React.useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[data-current]")?.scrollIntoView({ inline: "center", block: "nearest" }))
  }, [open])

  const pick = (date: string) => {
    const plan = planMove(mine, workout, date)
    if (plan.kind === "same") return
    if (plan.kind === "move") {
      if (move(workout, date)) onOpenChange(false)
      return
    }
    setChoice({ date, plan })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setChoice(null)
        onOpenChange(o)
      }}
    >
      <SheetContent side="bottom" className="gap-3 rounded-t-3xl pb-[max(1rem,var(--safe-bottom))]" data-testid="move-sheet">
        <SheetHeader className="pb-0">
          <SheetTitle>Flytta {workout.name}</SheetTitle>
          <SheetDescription>Välj en dag – passet flyttas direkt.</SheetDescription>
        </SheetHeader>
        <div ref={listRef} className="-mt-1 flex snap-x gap-1.5 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="listbox" aria-label="Ny dag">
          {days.map((d) => {
            const plan = planMove(mine, workout, d)
            const current = d === workout.date
            const busy = plan.kind === "swap" || plan.kind === "busy"
            const chosen = choice?.date === d
            const date = parseISODate(d)
            return (
              <button
                key={d}
                type="button"
                role="option"
                aria-selected={chosen || current}
                aria-label={`${dayName(d, today)} ${date.getDate()}${current ? " (nuvarande dag)" : busy ? " – har redan ett pass" : ""}`}
                data-current={current || undefined}
                data-date={d}
                onClick={() => pick(d)}
                disabled={current}
                className={cn(
                  "flex min-h-16 w-14 shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-2xl border text-xs transition-[background-color,border-color,transform] duration-200 active:scale-95",
                  current ? "border-dashed border-muted-foreground/40 text-muted-foreground" : chosen ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card hover:border-primary/50"
                )}
              >
                <span className="capitalize">{d === today ? "Idag" : SHORT.format(date).replace(".", "")}</span>
                <span className="text-base font-semibold tabular">{date.getDate()}</span>
                <span className={cn("size-1.5 rounded-full", busy ? (chosen ? "bg-primary-foreground" : "bg-primary") : "bg-transparent")} aria-hidden />
              </button>
            )
          })}
        </div>
        {choice && (choice.plan.kind === "swap" || choice.plan.kind === "busy") && (
          <div className="rise-in mx-4 space-y-2 rounded-2xl border border-border/70 bg-muted/40 p-3" data-testid="move-choice">
            <p className="text-sm">
              <span className="capitalize">{dayName(choice.date, today)}</span> har redan{" "}
              <b>{choice.plan.kind === "swap" ? choice.plan.other.name : choice.plan.others.map((o) => o.name).join(", ")}</b>.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {choice.plan.kind === "swap" && (
                <Button
                  onClick={() => move(workout, choice.date, (choice.plan as Extract<MovePlan, { kind: "swap" }>).other) && onOpenChange(false)}
                  data-testid="move-swap"
                >
                  <ArrowLeftRight /> Byt plats med {choice.plan.other.name}
                </Button>
              )}
              <Button variant="outline" onClick={() => move(workout, choice.date) && onOpenChange(false)} data-testid="move-anyway">
                <Check /> Lägg båda samma dag
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
