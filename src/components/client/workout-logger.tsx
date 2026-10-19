"use client"

import { ArrowLeft, Check, ChevronDown, ClipboardCheck, Clock, Eye, Info, Minus, PlayCircle, Plus, ShieldCheck, Timer, Trash2, TriangleAlert, X } from "lucide-react"
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
import { formatDay, todayISO } from "@/lib/date"
import { findLog, lastPerformance, setsDone, setsTotal, suggestSet } from "@/lib/training"
import { exercisesMissingWeights, groupBySection, hasWorkoutStarted, startsAtLabel, usesWeights, verifyBlocker } from "@/lib/workout-rules"
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

/**
 * Samma passvy används i tre lägen:
 * - klienten loggar (eller förhandsgranskar ett kommande pass innan det startar),
 * - klientens egna pass (egen tracking),
 * - PT:n kontrollerar/rättar vikter, reps och set och klarmarkerar passet.
 */
export function WorkoutLogger({ workoutId, mode = "client", backHref }: { workoutId: string; mode?: "client" | "trainer"; backHref?: string }) {
  const { data, actions, me } = useAppData()
  const router = useRouter()
  const trainerMode = mode === "trainer"
  const workout = data.workouts.find(
    (w) =>
      w.id === workoutId &&
      (trainerMode
        ? !w.byClient && (w.trainerId ?? data.clients.find((c) => c.id === w.clientId)?.trainerId) === me.id
        : w.clientId === me.id)
  )
  const clientId = workout?.clientId ?? me.id
  const history = workoutsFor(data, clientId).filter((w) => w.id !== workoutId)
  const [rest, setRest] = React.useState<{ endsAt: number; total: number } | null>(null)
  const [finishOpen, setFinishOpen] = React.useState(false)
  // Kommande pass visas som förhandsvisning tills dagen (eller tills klienten startar ändå).
  const [startEarly, setStartEarly] = React.useState(false)
  const home = backHref ?? (trainerMode ? "/pt" : "/klient")

  const firstOpen = workout?.exercises.find((e) => !isExerciseDone(workout, e))?.id ?? null
  const [openId, setOpenId] = React.useState<string | null>(firstOpen)

  if (!workout) {
    return (
      <div className="p-4">
        <EmptyState icon={X} title="Passet hittades inte" />
        <Button asChild variant="link" className="mt-2 w-full">
          <Link href={home}>{trainerMode ? "Tillbaka" : "Till dagsvyn"}</Link>
        </Button>
      </div>
    )
  }

  const today = todayISO()
  const preview = !trainerMode && workout.status === "planned" && workout.date > today && !startEarly
  // Klarmarkerat av PT:n = låst för båda. Klientens genomförda pass kan PT:n fortfarande rätta och klarmarkera.
  const readOnly = Boolean(workout.verifiedAt) || preview || (!trainerMode && workout.status === "completed")
  // Äldre pass saknar trainerId – då är det klientens PT. Egna pass har ingen PT.
  const trainerId = workout.byClient ? undefined : (workout.trainerId ?? data.clients.find((c) => c.id === workout.clientId)?.trainerId ?? undefined)
  const trainer = trainerId ? data.trainers.find((t) => t.id === trainerId) : undefined
  const clientName = data.clients.find((c) => c.id === workout.clientId)?.name
  const done = setsDone(workout)
  const total = setsTotal(workout)
  // Tidsspärr: passet kan inte markeras som genomfört (eller klarmarkeras) innan det har ägt rum.
  // Klienten kan ändå se passet och logga set i förväg.
  const started = hasWorkoutStarted(data, workout)
  const startsAt = started ? "" : startsAtLabel(data, workout)
  const sections = groupBySection(workout.exercises)

  const onSetDone = (exercise: WorkoutExercise) => {
    // Vilotimern behövs bara när klienten tränar, inte när PT:n kontrollerar i efterhand.
    if (exercise.restSec > 0 && !trainerMode) setRest({ endsAt: nowMs() + exercise.restSec * 1000, total: exercise.restSec })
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
            onClick={() => (window.history.length > 1 ? router.back() : router.push(home))}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{workout.name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {formatDay(workout.date)}
              {trainerMode && clientName ? ` · ${clientName}` : workout.byClient ? " · Eget pass" : trainer ? ` · ${trainer.name}` : ""}
            </p>
          </div>
          {workout.byClient && !trainerMode && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Ta bort passet"
              onClick={() => {
                if (!window.confirm(`Ta bort "${workout.name}"?`)) return
                actions.deleteOwnWorkout(workout.id)
                toast("Passet är borttaget")
                router.push(home)
              }}
            >
              <Trash2 />
            </Button>
          )}
          {trainerMode && !workout.verifiedAt && (
            <Button size="sm" onClick={() => setFinishOpen(true)} disabled={!started} title={started ? undefined : `Kan klarmarkeras ${startsAt}`}>
              <ClipboardCheck /> Klarmarkera
            </Button>
          )}
          {!trainerMode && !readOnly && workout.status !== "completed" && (
            <Button size="sm" onClick={() => setFinishOpen(true)} disabled={done === 0 || !started} title={started ? undefined : `Kan avslutas ${startsAt}`}>
              Avsluta
            </Button>
          )}
        </div>
        <Progress value={(done / total) * 100} className="h-1 rounded-none" aria-label={`${done} av ${total} set klara`} />
        <SyncIndicator className="mx-4 my-2" />
      </header>

      <div className="flex-1 space-y-3 p-4 pb-32">
        {preview && (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="workout-preview">
            <p className="flex items-center gap-2 font-medium">
              <Eye className="size-4 text-primary" /> Förhandsvisning
            </p>
            <p className="text-muted-foreground">
              Så här ser passet {formatDay(workout.date).toLowerCase()} ut{trainer ? ` – upplagt av ${trainer.name}` : ""}. Loggningen öppnas på passdagen.
            </p>
            <Button size="sm" variant="outline" onClick={() => setStartEarly(true)}>
              <PlayCircle /> Starta ändå nu
            </Button>
          </div>
        )}
        {!started && !preview && !workout.verifiedAt && workout.status !== "completed" && (
          <p className="flex gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-testid="workout-not-started">
            <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              {trainerMode
                ? `Passet har inte ägt rum än. Du kan se och förbereda programmet, men det kan klarmarkeras först ${startsAt}.`
                : `Du kan följa passet och logga set redan nu, men det kan markeras som genomfört först ${startsAt}.`}
            </span>
          </p>
        )}
        {trainerMode && !workout.verifiedAt && started && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Kontrollera vad som faktiskt gjordes: fyll i/rätta vikterna (krävs för viktövningar), reps och set, bocka av genomförda set och tryck sedan{" "}
            <b>Klarmarkera</b>.
            {workout.status === "completed" && workout.clientComment && <> Klientens kommentar: &quot;{workout.clientComment}&quot;</>}
          </p>
        )}
        {workout.status === "completed" && !trainerMode && !workout.verifiedAt && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Passet är genomfört. {workout.clientComment && <>Din kommentar: &quot;{workout.clientComment}&quot;</>}
          </p>
        )}
        {workout.verifiedAt && (
          <div className="space-y-1 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm" data-testid="workout-verified">
            <p className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="size-4 text-success" /> Klarmarkerat av {trainerMode ? "dig" : (trainer?.name ?? "din PT")}
            </p>
            {workout.trainerComment && <p>&quot;{workout.trainerComment}&quot;</p>}
            {workout.clientComment && <p className="text-xs text-muted-foreground">Klientens kommentar: &quot;{workout.clientComment}&quot;</p>}
          </div>
        )}
        {sections.map((group) => (
          <section key={group.section} className="space-y-3" aria-label={group.label} data-section={group.section}>
            {/* Rubriker bara när passet har uppvärmning/nedvarvning. */}
            {sections.length > 1 || group.section !== "main" ? (
              <h2 className="px-1 pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
            ) : null}
            {group.exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                index={workout.exercises.indexOf(exercise)}
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
          </section>
        ))}
        {!readOnly && !trainerMode && workout.status !== "completed" && done === total && started && (
          <Button size="lg" className="h-14 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90" onClick={() => setFinishOpen(true)}>
            <Check /> Alla set klara – avsluta passet
          </Button>
        )}
      </div>

      {rest && !readOnly && <RestTimer rest={rest} onChange={setRest} />}

      {trainerMode ? (
        <VerifyDialog
          open={finishOpen}
          onOpenChange={setFinishOpen}
          workout={workout}
          onVerify={(comment) => {
            const error = actions.verifyWorkout(workout.id, comment)
            if (error) return toast.error(error)
            toast.success("Passet är klarmarkerat", { description: `${clientName ?? "Klienten"} ser din kontroll och kommentar.` })
            router.push(home)
          }}
        />
      ) : (
        <FinishDialog
          open={finishOpen}
          onOpenChange={setFinishOpen}
          workout={workout}
          onFinish={(comment) => {
            const error = actions.setWorkoutStatus(workout.id, "completed", comment || undefined)
            if (error) return toast.error(error)
            // Kommentaren går till passets PT (egna pass har ingen PT).
            const pt = workout.trainerId ?? (workout.byClient ? undefined : data.clients.find((c) => c.id === me.id)?.trainerId ?? undefined)
            if (comment && pt) actions.sendMessage(me.id, comment, workout.id, { trainerId: pt })
            toast.success("Snyggt jobbat! Passet är sparat.", { description: comment && pt ? "Din kommentar skickades till din PT." : undefined })
            router.push(home)
          }}
        />
      )}
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
  // Viktövningar (skivstång, hantlar, maskin …) visar alltid kg – vikten måste fyllas i.
  const usesWeight = usesWeights(data.exercises.find((x) => x.id === exercise.exerciseId)) || (exercise.targetKg ?? 0) > 0 || (last?.kg ?? 0) > 0
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

/** PT:ns kontrollfönster: sammanfattning av vad som gjordes + kommentar, sedan klarmarkering. */
function VerifyDialog({
  open,
  onOpenChange,
  workout,
  onVerify,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  workout: ScheduledWorkout
  onVerify: (comment: string) => void
}) {
  const { data } = useAppData()
  const [comment, setComment] = React.useState("")
  const done = setsDone(workout)
  const total = setsTotal(workout)
  // Vikterna får inte lämnas tomma: alla genomförda set i viktövningar måste ha en vikt.
  const missing = new Set(exercisesMissingWeights(data, workout).map((e) => e.id))
  const blocker = verifyBlocker(data, workout)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Klarmarkera passet</DialogTitle>
          <DialogDescription>
            {done} av {total} set genomförda. Kontrollera sammanfattningen – klienten ser den tillsammans med din kommentar.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-xl border text-sm" aria-label="Genomfört">
          {workout.exercises.map((e) => {
            const sets = workout.logs.filter((l) => l.workoutExerciseId === e.id && l.done).sort((a, b) => a.setIndex - b.setIndex)
            return (
              <li key={e.id} className={cn("flex items-start justify-between gap-3 px-3 py-2", missing.has(e.id) && "bg-destructive/10")}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{exerciseName(data, e.exerciseId, workout.clientId)}</span>
                  <span className="block text-xs text-muted-foreground tabular">
                    {sets.length ? sets.map((l) => (l.kg ? `${l.kg}×${l.reps}` : `${l.reps}`)).join(", ") : "Inga set"}
                  </span>
                  {missing.has(e.id) && (
                    <span className="flex items-center gap-1 text-xs font-medium text-destructive" data-testid="weights-missing">
                      <TriangleAlert className="size-3" /> Vikt saknas
                    </span>
                  )}
                </span>
                <span className={cn("shrink-0 text-xs tabular", sets.length >= e.sets ? "text-success" : "text-muted-foreground")}>
                  {sets.length}/{e.sets}
                </span>
              </li>
            )
          })}
        </ul>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Kommentar om passet (teknik, känsla, nästa steg)…"
          rows={3}
          maxLength={1000}
          aria-label="Kommentar om passet"
        />
        {blocker && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {blocker}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fortsätt rätta
          </Button>
          <Button onClick={() => onVerify(comment.trim())} disabled={Boolean(blocker)}>
            <ClipboardCheck /> Bekräfta genomfört
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
