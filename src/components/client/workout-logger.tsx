"use client"

import { ArrowLeft, Check, ChevronDown, Info, Minus, PlayCircle, Plus, Timer, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/common"
import { SyncIndicator } from "@/components/sync-indicator"
import { VideoEmbed } from "@/components/video-embed"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { exerciseName, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatDay } from "@/lib/date"
import { findLog, lastPerformance, setsDone, setsTotal, suggestSet } from "@/lib/training"
import { cn } from "@/lib/utils"
import type { ScheduledWorkout, WorkoutExercise } from "@/types/domain"

/*
 * UX-principer för loggen (används mellan set, ofta med en hand och svettiga fingrar):
 * - Varje set är förifyllt (förra setet → förra passet → PT:ns mål), så normalfallet är
 *   ETT tryck: bocka av.
 * - Stora tryckytor (≥ 44 px), steg om 2,5 kg / 1 rep, inga tangentbord i onödan.
 * - Vilotimern startar automatiskt efter avbockat set.
 * - Aktuell övning är uppfälld, resten hopfällda; nästa övning öppnas när en är klar.
 * - Allt sparas direkt – appen kan stängas mitt i ett pass.
 */

export function WorkoutLogger({ workoutId }: { workoutId: string }) {
  const { data, actions, me } = useAppData()
  const router = useRouter()
  const workout = data.workouts.find((w) => w.id === workoutId && w.clientId === me.id)
  const history = React.useMemo(
    () => workoutsFor(data, me.id).filter((w) => w.id !== workoutId),
    [data, me.id, workoutId]
  )
  const [rest, setRest] = React.useState<{ endsAt: number; total: number } | null>(null)
  const [finishOpen, setFinishOpen] = React.useState(false)

  const firstOpen = workout?.exercises.find((e) => !isExerciseDone(workout, e))?.id ?? null
  const [openId, setOpenId] = React.useState<string | null>(firstOpen)

  if (!workout) {
    return (
      <div className="p-4">
        <EmptyState icon={X} title="Passet hittades inte" />
        <Button asChild variant="link" className="mt-2 w-full">
          <Link href="/klient">Till dagsvyn</Link>
        </Button>
      </div>
    )
  }

  const readOnly = workout.status === "completed"
  const done = setsDone(workout)
  const total = setsTotal(workout)

  const onSetDone = (exercise: WorkoutExercise) => {
    if (exercise.restSec > 0) setRest({ endsAt: nowMs() + exercise.restSec * 1000, total: exercise.restSec })
    // Sista setet i övningen → öppna nästa ofärdiga övning.
    const doneSoFar = workout.logs.filter((l) => l.workoutExerciseId === exercise.id && l.done).length + 1
    if (doneSoFar >= exercise.sets) {
      const next = workout.exercises.find((e) => e.id !== exercise.id && !isExerciseDone(workout, e))
      if (next) setOpenId(next.id)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Tillbaka"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/klient"))}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{workout.name}</h1>
            <p className="text-xs text-muted-foreground">{formatDay(workout.date)}</p>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => setFinishOpen(true)} disabled={done === 0}>
              Avsluta
            </Button>
          )}
        </div>
        <Progress value={(done / total) * 100} className="h-1 rounded-none" aria-label={`${done} av ${total} set klara`} />
        <SyncIndicator className="mx-4 my-2" />
      </header>

      <div className="flex-1 space-y-3 p-4 pb-32">
        {readOnly && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Passet är genomfört. {workout.clientComment && <>Din kommentar: &quot;{workout.clientComment}&quot;</>}
          </p>
        )}
        {workout.exercises.map((exercise, idx) => (
          <ExerciseCard
            key={exercise.id}
            index={idx}
            workout={workout}
            exercise={exercise}
            history={history}
            open={openId === exercise.id}
            onToggle={() => setOpenId(openId === exercise.id ? null : exercise.id)}
            readOnly={readOnly}
            onLog={(log) => actions.logSet(workout.id, log)}
            onSetDone={() => onSetDone(exercise)}
          />
        ))}
        {!readOnly && done === total && (
          <Button size="lg" className="h-14 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90" onClick={() => setFinishOpen(true)}>
            <Check /> Alla set klara – avsluta passet
          </Button>
        )}
      </div>

      {rest && !readOnly && <RestTimer rest={rest} onChange={setRest} />}

      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        workout={workout}
        onFinish={(comment) => {
          actions.setWorkoutStatus(workout.id, "completed", comment || undefined)
          if (comment) actions.sendMessage(me.id, comment, workout.id)
          toast.success("Snyggt jobbat! Passet är sparat.", { description: comment ? "Din kommentar skickades till din PT." : undefined })
          router.push("/klient")
        }}
      />
    </div>
  )
}

/** Anropas bara från händelsehanterare (avbockat set), aldrig under rendering. */
function nowMs() {
  return Date.now()
}

function isExerciseDone(workout: ScheduledWorkout, exercise: WorkoutExercise) {
  return workout.logs.filter((l) => l.workoutExerciseId === exercise.id && l.done).length >= exercise.sets
}

function ExerciseCard({
  index,
  workout,
  exercise,
  history,
  open,
  onToggle,
  readOnly,
  onLog,
  onSetDone,
}: {
  index: number
  workout: ScheduledWorkout
  exercise: WorkoutExercise
  history: ScheduledWorkout[]
  open: boolean
  onToggle: () => void
  readOnly: boolean
  onLog: (log: { workoutExerciseId: string; setIndex: number; kg: number; reps: number; done: boolean }) => void
  onSetDone: () => void
}) {
  const { data } = useAppData()
  // PT:ns eget namn för klienten om det finns.
  const name = exerciseName(data, exercise.exerciseId, workout.clientId)
  const last = lastPerformance(exercise.exerciseId, history)
  const doneCount = workout.logs.filter((l) => l.workoutExerciseId === exercise.id && l.done).length
  const complete = doneCount >= exercise.sets
  const usesWeight = (exercise.targetKg ?? 0) > 0 || (last?.kg ?? 0) > 0
  const panelId = `ex-${exercise.id}`

  return (
    <section className={cn("rounded-2xl border bg-card", open && "border-foreground/25 shadow-sm")}>
      <button onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-3 p-4 text-left">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular",
            complete ? "bg-brand text-brand-foreground" : "bg-muted"
          )}
        >
          {complete ? <Check className="size-4" strokeWidth={3} /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block text-xs text-muted-foreground tabular">
            {exercise.sets} × {exercise.reps}
            {exercise.targetKg ? ` · ${exercise.targetKg} kg` : ""}
            {exercise.rpe ? ` · RPE ${exercise.rpe}` : ""} · {doneCount}/{exercise.sets} klara
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id={panelId} className="space-y-3 px-4 pb-4">
          {(exercise.notes || exercise.videoUrl || last) && (
            <div className="space-y-1.5 rounded-lg bg-muted px-3 py-2 text-sm">
              {exercise.notes && (
                <p className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0" /> {exercise.notes}
                </p>
              )}
              {exercise.videoUrl && <ExerciseVideo source={exercise.videoUrl} title={name} />}
              {last && (
                <p className="text-xs text-muted-foreground tabular">
                  Förra gången: {last.kg ? `${last.kg} kg × ` : ""}
                  {last.reps}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-[2rem_1fr_1fr_3.5rem] items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <span>Set</span>
            <span className="text-center">{usesWeight ? "Kg" : "–"}</span>
            <span className="text-center">Reps</span>
            <span />
          </div>
          <ol className="space-y-2">
            {Array.from({ length: exercise.sets }, (_, setIndex) => (
              <SetRow
                key={setIndex}
                setIndex={setIndex}
                exercise={exercise}
                workout={workout}
                history={history}
                usesWeight={usesWeight}
                readOnly={readOnly}
                onLog={onLog}
                onDone={onSetDone}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function SetRow({
  setIndex,
  exercise,
  workout,
  history,
  usesWeight,
  readOnly,
  onLog,
  onDone,
}: {
  setIndex: number
  exercise: WorkoutExercise
  workout: ScheduledWorkout
  history: ScheduledWorkout[]
  usesWeight: boolean
  readOnly: boolean
  onLog: (log: { workoutExerciseId: string; setIndex: number; kg: number; reps: number; done: boolean }) => void
  onDone: () => void
}) {
  const logged = findLog(workout.logs, exercise.id, setIndex)
  const suggestion = suggestSet(exercise, setIndex, workout.logs, history)
  // Ej sparade justeringar för set som inte bockats av ännu.
  const [draft, setDraft] = React.useState<{ kg: number; reps: number } | null>(null)
  const values = logged ?? draft ?? suggestion
  const isDone = logged?.done ?? false

  const change = (patch: Partial<{ kg: number; reps: number }>) => {
    const next = { kg: values.kg, reps: values.reps, ...patch }
    next.kg = Math.max(0, Math.round(next.kg * 4) / 4)
    next.reps = Math.max(0, Math.round(next.reps))
    // Redan avbockat set: rätta loggen direkt. Annars: håll som utkast.
    if (logged) onLog({ ...logged, ...next })
    else setDraft(next)
  }

  const toggle = () => {
    if (isDone) {
      onLog({ workoutExerciseId: exercise.id, setIndex, kg: values.kg, reps: values.reps, done: false })
      return
    }
    onLog({ workoutExerciseId: exercise.id, setIndex, kg: values.kg, reps: values.reps, done: true })
    navigator.vibrate?.(15)
    onDone()
  }

  return (
    <li className={cn("grid grid-cols-[2rem_1fr_1fr_3.5rem] items-center gap-2 rounded-xl p-1 transition-colors", isDone && "bg-brand/15")}>
      <span className="text-center text-sm font-semibold tabular">{setIndex + 1}</span>
      {usesWeight ? (
        <Stepper value={values.kg} step={2.5} unit="kg" disabled={readOnly} onChange={(kg) => change({ kg })} label={`Vikt set ${setIndex + 1}`} />
      ) : (
        <span className="text-center text-muted-foreground">–</span>
      )}
      <Stepper value={values.reps} step={1} unit="reps" disabled={readOnly} onChange={(reps) => change({ reps })} label={`Reps set ${setIndex + 1}`} />
      <button
        onClick={toggle}
        disabled={readOnly}
        aria-pressed={isDone}
        aria-label={isDone ? `Ångra set ${setIndex + 1}` : `Bocka av set ${setIndex + 1}`}
        className={cn(
          "flex h-12 items-center justify-center rounded-xl border-2 transition-all active:scale-95 disabled:active:scale-100",
          isDone ? "border-brand bg-brand text-brand-foreground" : "border-muted-foreground/30 text-muted-foreground hover:border-foreground"
        )}
      >
        <Check className="size-6" strokeWidth={3} />
      </button>
    </li>
  )
}

function Stepper({
  value,
  step,
  unit,
  label,
  disabled,
  onChange,
}: {
  value: number
  step: number
  unit: string
  label: string
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const [text, setText] = React.useState<string | null>(null)
  return (
    <div className="flex h-12 items-center rounded-xl bg-muted">
      {!disabled && (
        <button className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground active:text-foreground" aria-label={`Minska ${label}`} onClick={() => onChange(value - step)}>
          <Minus className="size-4" />
        </button>
      )}
      <input
        aria-label={`${label} (${unit})`}
        inputMode="decimal"
        disabled={disabled}
        value={text ?? String(value).replace(".", ",")}
        onFocus={(e) => {
          setText(String(value).replace(".", ","))
          e.target.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number((text ?? "").replace(",", "."))
          if (Number.isFinite(n) && text !== null && text.trim() !== "") onChange(n)
          setText(null)
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-full w-full min-w-0 bg-transparent text-center text-lg font-semibold tabular outline-none disabled:opacity-100"
      />
      {!disabled && (
        <button className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground active:text-foreground" aria-label={`Öka ${label}`} onClick={() => onChange(value + step)}>
          <Plus className="size-4" />
        </button>
      )}
    </div>
  )
}

function RestTimer({
  rest,
  onChange,
}: {
  rest: { endsAt: number; total: number }
  onChange: (r: { endsAt: number; total: number } | null) => void
}) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [])

  const left = Math.max(0, Math.ceil((rest.endsAt - now) / 1000))
  const finished = left === 0

  React.useEffect(() => {
    if (finished) navigator.vibrate?.([120, 80, 120])
  }, [finished])

  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, "0")

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border p-3 shadow-lg backdrop-blur",
          finished ? "border-brand bg-brand text-brand-foreground" : "bg-background/95"
        )}
        role="timer"
        aria-live={finished ? "assertive" : "off"}
      >
        <Timer className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs opacity-80">{finished ? "Vilan är slut" : "Vila"}</div>
          <div className="text-2xl leading-none font-bold tabular">
            {mm}:{ss}
          </div>
        </div>
        {!finished && (
          <Button variant="secondary" size="sm" onClick={() => onChange({ ...rest, endsAt: rest.endsAt + 15_000 })}>
            +15 s
          </Button>
        )}
        <Button variant={finished ? "secondary" : "ghost"} size="sm" onClick={() => onChange(null)}>
          {finished ? "Kör!" : "Hoppa över"}
        </Button>
      </div>
    </div>
  )
}

function FinishDialog({
  open,
  onOpenChange,
  workout,
  onFinish,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  workout: ScheduledWorkout
  onFinish: (comment: string) => void
}) {
  const [comment, setComment] = React.useState("")
  const done = setsDone(workout)
  const total = setsTotal(workout)
  const quick = ["Kändes lätt 💪", "Lagom tungt", "Tungt idag", "Ont någonstans – vill prata"]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avsluta passet?</DialogTitle>
          <DialogDescription>
            {done} av {total} set är avbockade.{done < total && " Set som inte bockats av räknas som ej gjorda."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <button key={q} onClick={() => setComment(q)} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">
                {q}
              </button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kommentar till din PT (valfritt)" rows={3} maxLength={1000} />
        </div>
        <DialogFooter>
          <Button size="lg" className="w-full bg-brand text-brand-foreground hover:bg-brand/90 sm:w-auto" onClick={() => onFinish(comment.trim())}>
            <Check /> Spara pass
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Videon fälls ut först på begäran, så att loggen förblir kompakt och inte laddar video i onödan. */
function ExerciseVideo({ source, title }: { source: string; title: string }) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-expanded={show}
        className="flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
      >
        <PlayCircle className="size-4" /> {show ? "Dölj instruktionsvideo" : "Visa instruktionsvideo"}
      </button>
      {show && <VideoEmbed source={source} title={`Instruktionsvideo: ${title}`} />}
    </div>
  )
}
