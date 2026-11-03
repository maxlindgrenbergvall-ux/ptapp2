"use client"

import { ArrowLeft, Check, ChevronDown, ClipboardCheck, Clock, Eye, History, Info, Minus, Pencil, PlayCircle, Plus, Repeat, Search, ShieldCheck, Timer, Trash2, TrendingDown, TrendingUp, TriangleAlert, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { CompletedWorkoutEditor } from "@/components/client/completed-workout-editor"
import { CustomBadge } from "@/components/exercises/custom-exercise-dialog"
import { RestSettingsButton } from "@/components/client/rest-settings"
import { EmptyState } from "@/components/common"
import { SyncIndicator } from "@/components/sync-indicator"
import { VideoEmbed } from "@/components/video-embed"
import { SaveAsTemplateDialog } from "@/components/workouts/save-template-dialog"
import { SortableList } from "@/components/workouts/sortable-list"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { confirmDialog } from "@/components/ui/confirm"
import { exerciseName, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatDay, todayISO } from "@/lib/date"
import { hasSetReps, repsLabel, targetRepsFor } from "@/lib/exercises/draft"
import { workoutExerciseFor } from "@/lib/exercises/custom"
import { matchesExercise } from "@/lib/exercises/search"
import { exercisesFromWorkout } from "@/lib/templates"
import { nextTarget, type ProgressionTarget } from "@/lib/progression"
import { cancelRestNotification, getRestPreference, restFinishedAlert, restSecondsFor, scheduleRestNotification } from "@/lib/rest-timer"
import { findLog, lastPerformance, lastSessionSets, setsDone, setsTotal, suggestSet } from "@/lib/training"
import { exercisesMissingWeights, groupBySection, hasWorkoutStarted, startsAtLabel, usesWeights, verifyBlocker } from "@/lib/workout-rules"
import { cn } from "@/lib/utils"
import type { Exercise, ScheduledWorkout, WorkoutExercise } from "@/types/domain"

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
  // Redigering av ett genomfört pass (helskärm).
  const [editing, setEditing] = React.useState(false)
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
  // Klienten kan ändra ordningen medan passet pågår (även i PT:ns pass – innehållet är låst).
  const canReorder = !trainerMode && !readOnly && workout.exercises.length > 1
  // Under passet (v32): lägg till set och övningar – även i PT:ns pass (som extra).
  const canExtend = !trainerMode && !readOnly && workout.status !== "completed"
  // Genomfört men inte klarmarkerat: kan redigeras i efterhand.
  const canEdit = !trainerMode && workout.status === "completed" && !workout.verifiedAt

  const onSetDone = (exercise: WorkoutExercise) => {
    // Vilotimern behövs bara när klienten tränar, inte när PT:n kontrollerar i efterhand.
    // Vilotid (v32): passets eller min egen (inställning före/under passet).
    const seconds = restSecondsFor(exercise.restSec, getRestPreference())
    if (seconds > 0 && !trainerMode) setRest({ endsAt: nowMs() + seconds * 1000, total: seconds })
    // Sista setet i övningen → öppna nästa ofärdiga övning.
    const doneSoFar = workout.logs.filter((l) => l.workoutExerciseId === exercise.id && l.done).length + 1
    if (doneSoFar >= exercise.sets) {
      const next = workout.exercises.find((e) => e.id !== exercise.id && !isExerciseDone(workout, e))
      if (next) setOpenId(next.id)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 pt-[var(--safe-top)] backdrop-blur">
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
              onClick={async () => {
                if (!(await confirmDialog({ title: `Ta bort "${workout.name}"?`, confirmLabel: "Ta bort", destructive: true }))) return
                actions.deleteOwnWorkout(workout.id)
                toast("Passet är borttaget")
                router.push(home)
              }}
            >
              <Trash2 />
            </Button>
          )}
          {!trainerMode && !readOnly && <RestSettingsButton />}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="edit-workout">
              <Pencil /> Redigera
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
            Passet är genomfört. {workout.clientComment && <>Din kommentar: &quot;{workout.clientComment}&quot;</>} Har du loggat fel? Tryck{" "}
            <b>Redigera</b> för att rätta vikter, reps, set och ordning.
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
            {(() => {
              const card = (exercise: WorkoutExercise, dragHandle?: React.ReactNode) => (
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
                  onAddSet={canExtend ? () => actions.addWorkoutSet(workout.id, exercise.id) : undefined}
                  onRemoveSet={canExtend && (exercise.extra || workout.byClient) ? () => actions.removeWorkoutSet(workout.id, exercise.id) : undefined}
                  onRemove={
                    canExtend && (exercise.extra || workout.byClient) && !workout.logs.some((l) => l.workoutExerciseId === exercise.id && l.done)
                      ? () => actions.removeExtraExercise(workout.id, exercise.id)
                      : undefined
                  }
                  dragHandle={dragHandle}
                />
              )
              // v34: dra i handtaget för att ändra ordningen (inom uppvärmning/huvuddel/nedvarvning).
              return canReorder && group.exercises.length > 1 ? (
                <SortableList
                  items={group.exercises}
                  as="ul"
                  className="space-y-3"
                  aria-label={`Övningar – ${group.label}`}
                  itemLabel={(e) => exerciseName(data, e.exerciseId, workout.clientId)}
                  onReorder={(ids) => actions.reorderWorkoutExercises(workout.id, ids)}
                  renderItem={(exercise, { handle }) => card(exercise, handle)}
                />
              ) : (
                group.exercises.map((exercise) => card(exercise))
              )
            })()}
          </section>
        ))}
        {canExtend && (
          // v32: inte låst till programmet – improvisera eller kör extra.
          <AddExerciseDialog
            onAdd={(entry) => {
              const id = actions.addWorkoutExercise(workout.id, entry)
              if (id) setOpenId(id)
              return Boolean(id)
            }}
          />
        )}
        {!readOnly && !trainerMode && workout.status !== "completed" && done === total && started && (
          <Button size="lg" className="h-14 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90" onClick={() => setFinishOpen(true)}>
            <Check /> Alla set klara – avsluta passet
          </Button>
        )}
        {!preview && workout.exercises.length > 0 && (
          // Spara passet (med vikterna som faktiskt lyftes) som mall – klienten bland sina mallar, PT:n bland sina.
          <div className="flex flex-col items-center gap-1 pt-2 text-center">
            <SaveAsTemplateDialog
              className="w-full sm:w-auto"
              defaultName={workout.name}
              getExercises={() => exercisesFromWorkout(workout, actions.newId)}
            />
            <p className="text-xs text-muted-foreground">
              {trainerMode ? "Återanvänd passet i passbyggaren." : "Läs in mallen nästa gång under Logga eget pass."}
            </p>
          </div>
        )}
      </div>

      {rest && !readOnly && <RestTimer rest={rest} onChange={setRest} />}
      <RestNotification rest={readOnly ? null : rest} />

      {editing && <CompletedWorkoutEditor workout={workout} onClose={() => setEditing(false)} />}

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
  onAddSet,
  onRemoveSet,
  onRemove,
  dragHandle,
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
  /** Ett set till (saknas = passet är låst). */
  onAddSet?: () => void
  /** Ta bort en övning man själv lagt till (utan avbockade set). */
  onRemove?: () => void
  /** Ta bort sista setet (egna pass och egna/extra övningar). */
  onRemoveSet?: () => void
  /** Handtag för drag-and-drop (saknas = ordningen är låst). */
  dragHandle?: React.ReactNode
}) {
  const { data } = useAppData()
  // PT:ns eget namn för klienten om det finns.
  const name = exerciseName(data, exercise.exerciseId, workout.clientId)
  const last = lastPerformance(exercise.exerciseId, history)
  const lastSets = workout.status === "completed" ? null : lastSessionSets(exercise.exerciseId, history)
  const libraryExercise = data.exercises.find((x) => x.id === exercise.exerciseId)
  const info = { equipment: libraryExercise?.equipment, muscleGroup: libraryExercise?.muscleGroup }
  // Progressiv överbelastning (v32): dagens mål för toppsetet ur historiken.
  const target = workout.status === "completed" ? null : nextTarget(exercise, history, info)
  const doneCount = workout.logs.filter((l) => l.workoutExerciseId === exercise.id && l.done).length
  const complete = doneCount >= exercise.sets
  // Viktövningar (skivstång, hantlar, maskin …) visar alltid kg – vikten måste fyllas i.
  const usesWeight = usesWeights(data.exercises.find((x) => x.id === exercise.exerciseId)) || (exercise.targetKg ?? 0) > 0 || (last?.kg ?? 0) > 0
  const panelId = `ex-${exercise.id}`

  return (
    <section className={cn("rounded-2xl border bg-card", open && "border-foreground/25 shadow-sm")}>
      <div className="flex items-center">
      <button onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular",
            complete ? "bg-brand text-brand-foreground" : "bg-muted"
          )}
        >
          {complete ? <Check className="size-4" strokeWidth={3} /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{name}</span>
            {exercise.extra && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary" data-testid="extra-badge">
                Extra
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground tabular">
            {exercise.sets} × {repsLabel(exercise)}
            {exercise.targetKg ? ` · ${exercise.targetKg} kg` : ""}
            {exercise.rpe ? ` · RPE ${exercise.rpe}` : ""} · {doneCount}/{exercise.sets} klara
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {dragHandle && <div className="shrink-0 pr-2">{dragHandle}</div>}
      </div>

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

          {target && target.kind !== "start" && <ProgressionHint target={target} usesWeight={usesWeight} />}

          {/* v34: vikterna sätts manuellt – eller hämtas från förra passet, set för set. */}
          {!readOnly && lastSets && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              data-testid="fill-last-session"
              onClick={() => {
                let filled = 0
                for (let i = 0; i < exercise.sets; i++) {
                  if (findLog(workout.logs, exercise.id, i)?.done) continue
                  const prev = lastSets[Math.min(i, lastSets.length - 1)]
                  onLog({ workoutExerciseId: exercise.id, setIndex: i, kg: prev.kg, reps: prev.reps, done: false })
                  filled++
                }
                toast.success(filled ? `${filled} set ifyllda från förra passet` : "Alla set är redan avbockade")
              }}
            >
              <History /> Som förra passet ({lastSets.map((x) => (x.kg ? `${x.kg.toLocaleString("sv-SE")}×${x.reps}` : `${x.reps}`)).slice(0, 4).join(", ")}
              {lastSets.length > 4 ? " …" : ""})
            </Button>
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
                info={info}
                usesWeight={usesWeight}
                readOnly={readOnly}
                onLog={onLog}
                onDone={onSetDone}
              />
            ))}
          </ol>
          {(onAddSet || onRemove || onRemoveSet) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {onAddSet && (
                <Button variant="ghost" size="sm" className="text-primary" onClick={onAddSet} disabled={exercise.sets >= 20} data-testid="add-set">
                  <Plus /> Lägg till set
                </Button>
              )}
              {onRemoveSet && exercise.sets > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={onRemoveSet}
                  disabled={workout.logs.some((l) => l.workoutExerciseId === exercise.id && l.setIndex === exercise.sets - 1 && l.done)}
                  data-testid="remove-set"
                >
                  <Minus /> Ta bort set
                </Button>
              )}
              {onRemove && (
                <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onRemove} aria-label={`Ta bort ${name} ur passet`}>
                  <Trash2 /> Ta bort
                </Button>
              )}
            </div>
          )}
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
  info,
  usesWeight,
  readOnly,
  onLog,
  onDone,
}: {
  setIndex: number
  exercise: WorkoutExercise
  workout: ScheduledWorkout
  history: ScheduledWorkout[]
  info?: { equipment?: string; muscleGroup?: Exercise["muscleGroup"] }
  usesWeight: boolean
  readOnly: boolean
  onLog: (log: { workoutExerciseId: string; setIndex: number; kg: number; reps: number; done: boolean }) => void
  onDone: () => void
}) {
  const logged = findLog(workout.logs, exercise.id, setIndex)
  const suggestion = suggestSet(exercise, setIndex, workout.logs, history, info)
  // Ändringar som inte sparats än: set som inte bockats av, eller ett tömt fält.
  // Ett fält kan tömmas helt (undefined) och fyllas i med valfritt värde.
  const [draft, setDraft] = React.useState<Partial<SetValues> | null>(null)
  const values: SetValues = { ...(logged ?? suggestion), ...draft }
  const isDone = logged?.done ?? false
  const [invalid, setInvalid] = React.useState(false)
  const ownTarget = hasSetReps(exercise) ? targetRepsFor(exercise, setIndex) : null

  const missing = (v: SetValues) => v.reps === undefined || (usesWeight && v.kg === undefined)
  const change = (patch: Partial<SetValues>) => {
    const next: SetValues = { ...values, ...patch }
    if (next.kg !== undefined) next.kg = Math.max(0, Math.round(next.kg * 4) / 4)
    if (next.reps !== undefined) next.reps = Math.max(0, Math.round(next.reps))
    if (!missing(next)) setInvalid(false)
    // Redan avbockat set med ifyllda fält: rätta loggen direkt. Annars: håll som utkast.
    if (logged && !missing(next)) {
      onLog({ ...logged, kg: next.kg ?? 0, reps: next.reps! })
      setDraft(null)
    } else setDraft(next)
  }

  // Ökar vid varje avbockning: bocken "poppar" (bara när den bockas av, inte vid sidladdning).
  const [pop, setPop] = React.useState(0)
  const toggle = () => {
    if (isDone) {
      onLog({ workoutExerciseId: exercise.id, setIndex, kg: values.kg ?? 0, reps: values.reps ?? 0, done: false })
      return
    }
    // Valideringen sker först här – när setet sparas som genomfört.
    if (missing(values)) {
      setInvalid(true)
      toast.error(values.reps === undefined ? `Fyll i reps för set ${setIndex + 1}` : `Fyll i vikten för set ${setIndex + 1}`)
      return
    }
    onLog({ workoutExerciseId: exercise.id, setIndex, kg: values.kg ?? 0, reps: values.reps!, done: true })
    setDraft(null)
    setPop((n) => n + 1)
    navigator.vibrate?.(15)
    onDone()
  }

  return (
    <li className={cn("grid grid-cols-[2rem_1fr_1fr_3.5rem] items-center gap-2 rounded-xl p-1 transition-colors duration-300", isDone && "bg-brand/15")}>
      <span className="flex flex-col items-center text-center leading-tight">
        <span className="text-sm font-semibold tabular">{setIndex + 1}</span>
        {/* Eget rep-mål för setet (pyramid, drop-set …). */}
        {ownTarget && (
          <span className="text-[10px] text-muted-foreground tabular" aria-label={`Mål ${ownTarget} reps`}>
            {ownTarget}
          </span>
        )}
      </span>
      {usesWeight ? (
        <Stepper
          value={values.kg}
          step={2.5}
          unit="kg"
          disabled={readOnly}
          invalid={(invalid || isDone) && values.kg === undefined}
          onChange={(kg) => change({ kg })}
          label={`Vikt set ${setIndex + 1}`}
        />
      ) : (
        <span className="text-center text-muted-foreground">–</span>
      )}
      <Stepper
        value={values.reps}
        step={1}
        unit="reps"
        disabled={readOnly}
        invalid={(invalid || isDone) && values.reps === undefined}
        placeholder={ownTarget ?? undefined}
        onChange={(reps) => change({ reps })}
        label={`Reps set ${setIndex + 1}`}
      />
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
        <Check key={pop} className={cn("size-6", pop > 0 && isDone && "animate-pop")} strokeWidth={3} />
      </button>
    </li>
  )
}

const KIND_LABEL: Record<ProgressionTarget["kind"], string> = {
  increase_weight: "Öka vikten",
  add_reps: "Ett rep till",
  repeat: "Samma vikt",
  deload: "Avlastning",
  start: "Start",
  bodyweight: "Fler reps",
}

/**
 * Dagens mål (progressiv överbelastning): toppsetet ur förra passet och
 * nästa steg, med en kort förklaring. Alla set är förifyllda med målet
 * (raka set, v34) – vikten ändras fritt per set.
 */
function ProgressionHint({ target, usesWeight }: { target: ProgressionTarget; usesWeight: boolean }) {
  const kg = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 2 })
  const up = target.kind === "increase_weight" || target.kind === "add_reps" || target.kind === "bodyweight"
  return (
    <div className={cn("space-y-1 rounded-xl border px-3 py-2", target.kind === "deload" ? "border-warning/50 bg-warning/10" : "border-primary/30 bg-primary/5")} data-testid="progression-hint">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        {up ? <TrendingUp className="size-4 text-primary" /> : target.kind === "deload" ? <TrendingDown className="size-4 text-warning" /> : <Repeat className="size-4 text-muted-foreground" />}
        <span className="font-semibold">Mål idag:</span>
        <span className="font-semibold tabular" data-testid="progression-target">
          {usesWeight && target.kg > 0 ? `${kg(target.kg)} kg × ` : ""}
          {target.reps} reps
        </span>
        {target.deltaKg !== 0 && (
          <span className={cn("rounded-full px-1.5 text-xs font-medium tabular", target.deltaKg > 0 ? "bg-primary/15 text-primary" : "bg-warning/20")}>
            {target.deltaKg > 0 ? "+" : "−"}
            {kg(Math.abs(target.deltaKg))} kg
          </span>
        )}
        <span className="text-xs text-muted-foreground">· {KIND_LABEL[target.kind]}</span>
      </p>
      <p className="text-xs text-muted-foreground">{target.reason}</p>
    </div>
  )
}

/** Värden i ett set under loggning. undefined = tomt fält. */
interface SetValues {
  kg?: number
  reps?: number
}

/**
 * Stort sifferfält med − och + (för svettiga fingrar). Fältet kan tömmas helt
 * och fyllas i med valfritt värde; tomt = undefined.
 */
export function Stepper({
  value,
  step,
  unit,
  label,
  disabled,
  invalid,
  placeholder,
  onChange,
}: {
  value: number | undefined
  step: number
  unit: string
  label: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  onChange: (v: number | undefined) => void
}) {
  const [text, setText] = React.useState<string | null>(null)
  const show = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","))
  const parse = (t: string) => {
    const n = Number(t.trim().replace(",", "."))
    return t.trim() === "" || !Number.isFinite(n) ? undefined : Math.max(0, n)
  }
  return (
    <div className={cn("flex h-12 items-center rounded-xl bg-muted", invalid && "ring-2 ring-destructive")}>
      {!disabled && (
        <button
          type="button"
          className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground active:text-foreground"
          aria-label={`Minska ${label}`}
          onClick={() => onChange(Math.max(0, (value ?? 0) - step))}
        >
          <Minus className="size-4" />
        </button>
      )}
      <input
        aria-label={`${label} (${unit})`}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder ?? "–"}
        value={text ?? show(value)}
        onFocus={(e) => {
          setText(show(value))
          e.target.select()
        }}
        onChange={(e) => {
          // Bara siffror och ett decimaltecken; fältet får vara tomt.
          const t = e.target.value.replace(/[^\d.,]/g, "")
          setText(t)
          onChange(parse(t))
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-full w-full min-w-0 bg-transparent text-center text-lg font-semibold tabular outline-none placeholder:text-muted-foreground/50 disabled:opacity-100"
      />
      {!disabled && (
        <button
          type="button"
          className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground active:text-foreground"
          aria-label={`Öka ${label}`}
          onClick={() => onChange((value ?? 0) + step)}
        >
          <Plus className="size-4" />
        </button>
      )}
    </div>
  )
}

/** Notisen "Vilan är slut" följer timern: schemaläggs, flyttas vid ±15 s och tas bort vid hoppa över. */
function RestNotification({ rest }: { rest: { endsAt: number } | null }) {
  const endsAt = rest?.endsAt ?? null
  React.useEffect(() => {
    if (endsAt === null || !getRestPreference().alert || endsAt <= Date.now()) return
    void scheduleRestNotification(endsAt)
    return () => void cancelRestNotification()
  }, [endsAt])
  return null
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
    if (finished && getRestPreference().alert) restFinishedAlert()
  }, [finished])

  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, "0")
  /** ±15 s. Under 15 s kvar avslutar "-15 s" vilan (0:00) – aldrig negativ tid. */
  const adjust = (deltaMs: number) => {
    const at = Date.now()
    onChange({ ...rest, endsAt: Math.max(at, Math.max(rest.endsAt, at) + deltaMs) })
    setNow(at)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg p-3 pb-[max(0.75rem,var(--safe-bottom))]">
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
          <>
            <Button variant="secondary" size="sm" onClick={() => adjust(-15_000)} aria-label="15 sekunder kortare vila">
              −15 s
            </Button>
            <Button variant="secondary" size="sm" onClick={() => adjust(15_000)} aria-label="15 sekunder längre vila">
              +15 s
            </Button>
          </>
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
      <DialogContent className="sm:max-w-md">
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

/**
 * "Lägg till övning" mitt i passet (v32): sök i övningsbanken (egna övningar
 * först) och lägg till med ett tryck. Set, reps och vila följer övningens
 * förval; dagens mål räknas ur historiken som för alla övningar.
 */
function AddExerciseDialog({ onAdd }: { onAdd: (entry: Omit<WorkoutExercise, "id">) => boolean }) {
  const { data } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState("")
  const query = q.trim().toLowerCase()
  const matches = data.exercises
    .filter((e) => matchesExercise(e, query))
    .sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)))
    .slice(0, 8)
  const add = (e: Exercise) => {
    const base = workoutExerciseFor(e, "x")
    const { id: _id, ...entry } = base
    void _id
    const ok = onAdd({
      ...entry,
      reps: e.custom ? base.reps : e.muscleGroup === "kondition" ? "500 m" : "8–12",
      // Vilotid enligt min inställning (passets vila saknas för en extra övning).
      restSec: getRestPreference().seconds,
    })
    if (!ok) return toast.error("Passet har redan max antal övningar")
    toast.success(`${e.name} är tillagd`)
    setOpen(false)
    setQ("")
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), !o && setQ(""))}>
      <Button variant="outline" className="h-12 w-full border-dashed" onClick={() => setOpen(true)} data-testid="add-exercise">
        <Plus /> Lägg till övning
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till övning</DialogTitle>
          <DialogDescription>Kör extra eller byt ut något – PT:ns program ligger kvar.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök övning, t.ex. hip thrust" className="h-11 pl-8" aria-label="Sök övning" />
        </div>
        <ul className="max-h-[50vh] divide-y overflow-y-auto overscroll-contain rounded-xl border" aria-label="Övningar att lägga till">
          {matches.map((e) => (
            <li key={e.id}>
              <button type="button" className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60" onClick={() => add(e)}>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {e.custom && <CustomBadge />}
                <Plus className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Ingen övning hittades.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
