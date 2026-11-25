"use client"

import { ArrowRight, Layers, Timer, Trophy } from "lucide-react"

import { AnimatedNumber, DrawnCheck, FillBar } from "@/components/motion"
import { RewardBadge, type RewardKind } from "@/components/rewards"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { nextSplitAction } from "@/lib/active-split"
import { exerciseName } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { summarizeWorkout, workoutFeedback } from "@/lib/workout-summary"
import { formatDuration } from "@/lib/workout-timer"
import { cn } from "@/lib/utils"
import type { ScheduledWorkout } from "@/types/domain"

/**
 * Sammanfattningen direkt efter "Spara pass" (v51): en personlig kommentar
 * (fasta regler, se lib/workout-summary.ts), set, volym och rekord, och
 * veckans framsteg. Allt glider in i tur och ordning; med "minska rörelse"
 * syns allt direkt. Stannar tills klienten trycker Klar.
 */
export function WorkoutSummaryView({
  workout,
  hour,
  commentSent,
  durationSec,
  onDone,
}: {
  workout: ScheduledWorkout
  hour: number
  commentSent: boolean
  /** v73: passtimerns tid (saknas om timern aldrig startade). */
  durationSec?: number | null
  onDone: () => void
}) {
  const { data } = useAppData()
  const history = data.workouts.filter((w) => w.clientId === workout.clientId)
  const s = summarizeWorkout(workout, history)
  const split = data.activeSplits.find((x) => x.clientId === workout.clientId)
  const name = (id: string) => exerciseName(data, id, workout.clientId) || "övningen"
  const fb = workoutFeedback(s, { hour, goal: split?.daysPerWeek, exerciseName: name })
  const next = split ? nextSplitAction(split, data.workouts) : null
  const goal = split?.daysPerWeek
  const pct = goal ? Math.min(100, Math.round((s.weekCount / goal) * 100)) : 0

  // v52: små utmärkelser för det som faktiskt hände i passet (inga deltagarpriser).
  const earned: { kind: RewardKind; label: string }[] = [
    ...(s.records.length ? [{ kind: "record" as const, label: s.records.length === 1 ? "Nytt rekord" : `${s.records.length} nya rekord` }] : []),
    ...(goal && s.weekCount === goal ? [{ kind: "week_goal" as const, label: "Veckans mål" }] : []),
    ...(s.streakWeeks >= 2 ? [{ kind: "streak" as const, label: `${s.streakWeeks} veckor i rad` }] : []),
  ]

  const tiles = [
    { label: "Set", value: s.setsDone, suffix: `/${s.setsTotal}` },
    { label: "Volym", value: s.volumeKg, suffix: " kg" },
    { label: "Rekord", value: s.records.length, suffix: "" },
  ]
  // v81: passets längd (tyst passtimer) som egen bricka – "48 min" eller "1 tim 15 min".
  const duration = durationSec ? formatDuration(durationSec) : null

  return (
    <div className="flex flex-col items-center gap-4 pt-2 text-center" data-testid="workout-saved" data-feedback={fb.kind} role="status">
      <span className="settle-in relative flex size-16 items-center justify-center rounded-full bg-brand text-brand-foreground">
        <DrawnCheck play={1} className="size-8" />
        <span aria-hidden className="ring-burst [animation-delay:120ms]" />
      </span>
      <div className="space-y-1.5">
        <DialogTitle className="rise-in text-xl text-balance [animation-delay:120ms]" data-testid="summary-headline">
          {fb.headline}
        </DialogTitle>
        <DialogDescription className="rise-in mx-auto max-w-xs text-pretty [animation-delay:200ms]" data-testid="summary-body">
          {fb.body}
        </DialogDescription>
      </div>

      {earned.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Det här passet gav" data-testid="summary-badges">
          {earned.map((b, i) => (
            <li key={b.kind} className="rise-in flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 py-1 pr-3 pl-1 text-xs font-medium" style={{ animationDelay: `${240 + i * 90}ms` }}>
              <RewardBadge kind={b.kind} size="sm" delay={300 + i * 90} />
              {b.label}
            </li>
          ))}
        </ul>
      )}

      {duration && (
        <div
          className="rise-in flex w-full items-center justify-between rounded-2xl border border-[#84cc16]/35 bg-[#84cc16]/10 px-4 py-3 [animation-delay:260ms]"
          data-testid="summary-duration"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Timer className="size-4 text-[#84cc16]" aria-hidden /> Passets tid
          </span>
          <span className="text-lg font-bold tracking-tight tabular">{duration}</span>
        </div>
      )}

      <dl className="grid w-full grid-cols-3 gap-2" aria-label="Passet i siffror" data-testid="summary-tiles">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="rise-in rounded-xl border bg-muted/30 px-2 py-3"
            style={{ animationDelay: `${280 + i * 70}ms` }}
          >
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.label}</dt>
            <dd className="mt-0.5 text-lg font-bold tracking-tight tabular">
              <AnimatedNumber value={t.value} duration={700} />
              <span className="text-xs font-medium text-muted-foreground">{t.suffix}</span>
            </dd>
          </div>
        ))}
      </dl>

      {s.records.length > 0 && (
        <ul className="rise-in w-full space-y-1.5 text-left [animation-delay:500ms]" aria-label="Nya rekord" data-testid="summary-records">
          {s.records.slice(0, 3).map((r) => (
            <li key={r.exerciseId} className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <Trophy className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{name(r.exerciseId)}</span>
              <span className="shrink-0 tabular text-muted-foreground">
                {r.previousKg.toLocaleString("sv-SE")} → <span className="font-semibold text-foreground">{r.kg.toLocaleString("sv-SE")} kg</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rise-in w-full space-y-2 rounded-xl border px-3 py-3 text-left [animation-delay:560ms]" data-testid="summary-week">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">Den här veckan</span>
          <span className="tabular text-muted-foreground">
            {s.weekCount}
            {goal ? ` av ${goal}` : ""} pass
          </span>
        </div>
        {goal ? (
          <FillBar value={pct} role="progressbar" aria-label="Veckans pass" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} />
        ) : (
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: Math.max(3, s.weekCount) }, (_, i) => (
              <span key={i} className={cn("h-2 flex-1 rounded-full", i < s.weekCount ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        )}
        {next?.kind === "create" && (
          <p className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground" data-testid="summary-next">
            <Layers className="size-3.5 shrink-0" aria-hidden /> Nästa pass: <span className="truncate font-medium text-foreground">{next.name}</span>
          </p>
        )}
      </div>

      {commentSent && <p className="text-xs text-muted-foreground">Din kommentar skickades till din PT.</p>}

      <Button size="lg" className="rise-in h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90 [animation-delay:640ms]" onClick={onDone} data-testid="summary-done" autoFocus>
        Klar <ArrowRight />
      </Button>
    </div>
  )
}
