"use client"

import { ArrowUpRight, Check, MessageSquareText, ShieldCheck } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { exerciseName } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatDay } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { ID, ScheduledWorkout } from "@/types/domain"

const num = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })

/** Det som faktiskt gjordes i ett pass: avbockade set per övning, i passets ordning. */
export function performedSets(workout: ScheduledWorkout) {
  return workout.exercises.map((e) => {
    const sets = workout.logs.filter((l) => l.workoutExerciseId === e.id && l.done).sort((a, b) => a.setIndex - b.setIndex)
    return { exercise: e, sets, volume: sets.reduce((s, l) => s + Math.max(0, l.kg) * Math.max(0, l.reps), 0) }
  })
}

/**
 * Historik för ett avklarat pass (v52): exakt vilka vikter, reps och set som
 * genomfördes – övning för övning – plus volym och kommentarer. Öppnas från
 * översikten och kalendern när man trycker på ett pass med grön bock.
 */
export function WorkoutHistoryDialog({
  workoutId,
  onOpenChange,
  href,
}: {
  /** Passet som visas (null = stängd). */
  workoutId: ID | null
  onOpenChange: (open: boolean) => void
  /** Länk till hela passvyn (redigera loggen m.m.). */
  href?: (id: ID) => string
}) {
  const { data } = useAppData()
  const workout = workoutId ? data.workouts.find((w) => w.id === workoutId) : undefined
  // Behåll innehållet medan rutan tonar ut.
  const [last, setLast] = React.useState<ScheduledWorkout | undefined>(workout)
  if (workout && workout !== last) setLast(workout)
  const w = workout ?? last
  if (!w) return null
  const rows = performedSets(w)
  const done = rows.reduce((s, r) => s + r.sets.length, 0)
  const planned = w.exercises.reduce((s, e) => s + e.sets, 0)
  const volume = Math.round(rows.reduce((s, r) => s + r.volume, 0))
  return (
    <Dialog open={Boolean(workout)} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[88dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 sm:max-w-md" data-testid="workout-history">
        <DialogHeader className="items-stretch text-left">
          <div className="flex items-center gap-3 pr-10">
            <span className="settle-in flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-5" strokeWidth={3} aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">{w.name}</DialogTitle>
              <DialogDescription>
                {formatDay(w.date)} · genomfört
                {w.verifiedAt && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-success">
                    <ShieldCheck className="size-3.5" aria-hidden /> klarmarkerat av PT
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="-mx-1 space-y-3 overflow-y-auto px-1">
          <dl className="grid grid-cols-3 gap-2 text-center" aria-label="Passet i siffror">
            {[
              ["Set", `${done}/${planned}`],
              ["Övningar", String(rows.filter((r) => r.sets.length).length)],
              ["Volym", `${volume.toLocaleString("sv-SE")} kg`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-muted/30 px-2 py-2.5">
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
                <dd className="mt-0.5 text-base font-bold tracking-tight tabular">{value}</dd>
              </div>
            ))}
          </dl>

          <ol className="space-y-2" aria-label="Genomförda övningar">
            {rows.map(({ exercise: e, sets }, i) => (
              <li key={e.id} className="rise-in rounded-xl border bg-card p-3" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} data-testid="history-exercise">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{exerciseName(data, e.exerciseId, w.clientId)}</span>
                  <span className={cn("shrink-0 text-xs tabular", sets.length >= e.sets ? "text-primary" : "text-muted-foreground")}>
                    {sets.length}/{e.sets} set
                  </span>
                </div>
                {sets.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Set">
                    {sets.map((l) => (
                      <li key={l.setIndex} className="flex items-center gap-1.5 rounded-lg bg-muted/50 py-1 pr-2.5 pl-1 text-xs tabular" data-testid="history-set">
                        <span className="flex size-5 items-center justify-center rounded-md bg-background text-[10px] font-semibold text-muted-foreground">{l.setIndex + 1}</span>
                        {l.kg > 0 ? (
                          <span>
                            <span className="font-semibold">{num(l.kg)} kg</span> × {l.reps}
                          </span>
                        ) : (
                          <span className="font-semibold">{l.reps} reps</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Inga set loggade.</p>
                )}
              </li>
            ))}
          </ol>

          {(w.clientComment || w.trainerComment) && (
            <div className="space-y-2">
              {w.clientComment && <Comment label="Din kommentar" text={w.clientComment} />}
              {w.trainerComment && <Comment label="PT:ns kommentar" text={w.trainerComment} />}
            </div>
          )}
        </div>

        {href && (
          <Button asChild variant="outline" className="w-full">
            <Link href={href(w.id)}>
              Öppna hela passet <ArrowUpRight />
            </Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Comment({ label, text }: { label: string; text: string }) {
  return (
    <p className="flex gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
      <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="break-words whitespace-pre-wrap">{text}</span>
      </span>
    </p>
  )
}
