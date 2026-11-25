"use client"

import { ArrowLeft, Check, ChevronDown, ClipboardCheck, Clock, Eye, History, Info, Minus, Pencil, PlayCircle, Plus, Repeat, ShieldCheck, Timer, Trash2, TrendingDown, TrendingUp, TriangleAlert, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { CompletedWorkoutEditor } from "@/components/client/completed-workout-editor"
import { CollapsePanel, DrawnCheck, FillBar } from "@/components/motion"
import { WorkoutSummaryView } from "@/components/client/workout-summary"
import { RestSettingsButton } from "@/components/client/rest-settings"
import { EmptyState } from "@/components/common"
import { ExerciseGuide } from "@/components/exercises/exercise-guide"
import { SaveAsTemplateDialog } from "@/components/workouts/save-template-dialog"
import { SortableList } from "@/components/workouts/sortable-list"
import { ExercisePicker } from "@/components/exercises/exercise-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { confirmDialog } from "@/components/ui/confirm"
import { exerciseName, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatDay, todayISO } from "@/lib/date"
import { hasSetReps, repsLabel, targetRepsFor } from "@/lib/exercises/draft"
import { workoutExerciseFor } from "@/lib/exercises/custom"
import { exercisesFromWorkout } from "@/lib/templates"
import { cleanDecimal, parseDecimal } from "@/lib/decimal-input"
import { AUTO_INCREMENT_KG, nextTarget, type ProgressionTarget } from "@/lib/progression"
import { cancelRestNotification, getRestPreference, primeAlertSound, restFinishedAlert, restSecondsFor, scheduleRestNotification } from "@/lib/rest-timer"
import { endWorkoutTimer, ensureWorkoutTimer } from "@/lib/workout-timer"
import { findLog, lastPerformance, lastSessionSets, setsDone, setsTotal, suggestSet } from "@/lib/training"
import { completeBlocker, exercisesMissingWeights, groupBySection, hasWorkoutStarted, startsAtLabel, usesWeights, verifyBlocker } from "@/lib/workout-rules"
import { useBounce } from "@/lib/spring"
import { prefersReducedMotion } from "@/lib/use-in-view"
import { cn } from "@/lib/utils"
import type { Exercise, ScheduledWorkout, SetLog, TrackingType, WorkoutExercise } from "@/types/domain"
import { TimeInput } from "@/components/workouts/adaptive-fields"
import { useT } from "@/lib/i18n/provider"
import { hasMessage } from "@/lib/i18n/translate"
import { blocks, formatDistance, formatPace, missingForType, paceOf, trackingTypeOf } from "@/lib/training-modes"

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
    // Ljudet låses upp medan användaren trycker, så att vilosignalen hörs även på iPhone.
    // (v74: passtimern påverkas inte av seten – den mäter hela passet.)
    if (!trainerMode) primeAlertSound()
    // Vilotimern behövs bara när klienten tränar, inte när PT:n kontrollerar i efterhand.
    // Vilotid (v32): passets eller min egen (inställning före/under passet).
    const seconds = restSecondsFor(exercise.restSec, getRestPreference())
    if (seconds > 0 && !trainerMode) setRest({ endsAt: nowMs() + seconds * 1000, total: seconds })
    // Sista setet i övningen → öppna nästa ofärdiga övning.
    const doneSoFar = workout.logs.filter((l) => l.workoutExerciseId === exercise.id && l.done).length + 1
    if (doneSoFar >= exercise.sets) {
      const next = workout.exercises.find((e) => e.id !== exercise.id && !isExerciseDone(workout, e))
      if (next) {
        setOpenId(next.id)
        // v56: kortet ovanför fälls ihop när nästa öppnas – iOS saknar scroll-anchoring, så sidan
        // hoppade. Lägg nästa övning mjukt i blick efter att layouten satt sig.
        // v68: korten fälls ihop/ut under ~300 ms – vänta tills de har satt sig.
        const settle = (fn: () => void) => (prefersReducedMotion() ? requestAnimationFrame(() => requestAnimationFrame(fn)) : window.setTimeout(fn, 340))
        settle(() => {
            const el = document.getElementById(`exercise-${next.id}`)
            if (!el) return
            const top = el.getBoundingClientRect().top
            const header = document.querySelector<HTMLElement>("[data-logger-header]")?.getBoundingClientRect().bottom ?? 0
            if (top < header + 8 || top > window.innerHeight * 0.6) {
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
              window.scrollTo({ top: window.scrollY + top - header - 12, behavior: reduce ? "auto" : "smooth" })
            }
        })
      }
    }
  }

  return (
    <div className="page-push flex min-h-svh flex-col">
      <header data-logger-header className="sticky top-0 z-20 border-b bg-background/95 pt-[var(--safe-top)] backdrop-blur">
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
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <p className="min-w-0 truncate">
                {formatDay(workout.date)}
                {trainerMode && clientName ? ` · ${clientName}` : workout.byClient ? " · Eget pass" : trainer ? ` · ${trainer.name}` : ""}
              </p>
              {/* v81: tyst passtimer – mäter passet i bakgrunden, längden visas i summeringen. */}
              {!trainerMode && !preview && !readOnly && workout.status !== "completed" && started && <SilentWorkoutTimer workoutId={workout.id} />}
            </div>
          </div>
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
        {/* v68: passets progress glider med fjädern för varje avbockat set. */}
        <FillBar
          value={total ? (done / total) * 100 : 0}
          className="h-1 rounded-none bg-primary/20"
          barClassName="rounded-none"
          role="progressbar"
          aria-label={`${done} av ${total} set klara`}
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          data-testid="workout-progress"
        />
      </header>

      <div className="flex-1 space-y-3 px-3 pt-3 pb-32 sm:p-4 sm:pb-32">
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
              // v58: block/varv – rubrik på blockets första övning, markering på alla.
              const blockOf = new Map<string, { name: string; first: boolean; rounds: number }>()
              for (const b of blocks(group.exercises)) {
                if (b.name) b.items.forEach((it, i) => blockOf.set(it.id, { name: b.name!, first: i === 0, rounds: it.sets }))
              }
              const card = (exercise: WorkoutExercise, dragHandle?: React.ReactNode) => (
                <ExerciseCard
                  block={blockOf.get(exercise.id)}
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
        {/* v37: flyttad från sidhuvudet – egna pass kan tas bort här, längst ned. */}
        {workout.byClient && !trainerMode && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              aria-label="Ta bort passet"
              onClick={async () => {
                if (!(await confirmDialog({ title: `Ta bort "${workout.name}"?`, confirmLabel: "Ta bort", destructive: true }))) return
                actions.deleteOwnWorkout(workout.id)
                toast("Passet är borttaget")
                router.push(home)
              }}
            >
              <Trash2 /> Ta bort passet
            </Button>
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
            const blocked = workout.status === "completed" ? null : completeBlocker(data, workout)
            if (blocked) {
              toast.error(blocked)
              return null
            }
            // v81: passets längd från den tysta passtimern sparas i historiken.
            const durationSec = endWorkoutTimer(workout.id)
            const error = actions.setWorkoutStatus(workout.id, "completed", comment || undefined, durationSec)
            if (error) {
              toast.error(error)
              return null
            }
            // Kommentaren går till passets PT (egna pass har ingen PT).
            const pt = workout.trainerId ?? (workout.byClient ? undefined : data.clients.find((c) => c.id === me.id)?.trainerId ?? undefined)
            if (comment && pt) actions.sendMessage(me.id, comment, workout.id, { trainerId: pt })
            return { commentSent: Boolean(comment && pt), durationSec }
          }}
          onDone={() => router.push(home)}
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
  block,
}: {
  index: number
  workout: ScheduledWorkout
  exercise: WorkoutExercise
  history: ScheduledWorkout[]
  open: boolean
  onToggle: () => void
  readOnly: boolean
  onLog: (log: SetLog) => void
  onSetDone: () => void
  /** Ett set till (saknas = passet är låst). */
  onAddSet?: () => void
  /** Ta bort en övning man själv lagt till (utan avbockade set). */
  onRemove?: () => void
  /** Ta bort sista setet (egna pass och egna/extra övningar). */
  onRemoveSet?: () => void
  /** Handtag för drag-and-drop (saknas = ordningen är låst). */
  dragHandle?: React.ReactNode
  /** v58: övningen ingår i ett block ("Block A · 4 varv"). */
  block?: { name: string; first: boolean; rounds: number }
}) {
  const { data, me } = useAppData()
  const t = useT()
  // PT:ns eget namn för klienten om det finns.
  const name = exerciseName(data, exercise.exerciseId, workout.clientId)
  const last = lastPerformance(exercise.exerciseId, history)
  const lastSets = workout.status === "completed" ? null : lastSessionSets(exercise.exerciseId, history)
  const libraryExercise = data.exercises.find((x) => x.id === exercise.exerciseId)
  const info = { equipment: libraryExercise?.equipment, muscleGroup: libraryExercise?.muscleGroup }
  // Progressiv överbelastning (v32): dagens mål för toppsetet ur historiken.
  // v58: löpning och kondition loggas med distans/tid – ingen viktprogression.
  const type = trackingTypeOf(exercise, libraryExercise)
  const target = workout.status === "completed" || type !== "strength" ? null : nextTarget(exercise, history, info)
  const hyroxHelp = hasMessage(`hyrox.${exercise.exerciseId}`) ? t(`hyrox.${exercise.exerciseId}`) : null
  const doneCount = workout.logs.filter((l) => l.workoutExerciseId === exercise.id && l.done).length
  const complete = doneCount >= exercise.sets
  // Räknar upp varje gång övningen går från ofärdig till klar (medan sidan är öppen).
  const [completion, setCompletion] = React.useState({ complete, n: 0 })
  if (completion.complete !== complete) setCompletion({ complete, n: complete ? completion.n + 1 : completion.n })
  const justCompleted = completion.n
  // v68: kortet studsar till när övningen blir klar.
  const [cardRef, kickCard] = useBounce<HTMLElement>()
  React.useEffect(() => {
    if (justCompleted > 0) kickCard(0.45)
  }, [justCompleted, kickCard])
  // Set som läggs till under passet glider in; ett borttaget set fälls ihop först.
  const [initialSets] = React.useState(exercise.sets)
  const removeLastSet = onRemoveSet
    ? () => {
        const row = document.querySelector<HTMLElement>(`#ex-${CSS.escape(exercise.id)} ol > li:last-child`)
        if (!row || prefersReducedMotion() || typeof row.animate !== "function") return onRemoveSet()
        const h = row.getBoundingClientRect().height
        row.style.pointerEvents = "none"
        row
          .animate(
            [
              { height: `${h}px`, opacity: 1 },
              { height: "0px", opacity: 0, marginTop: "0px", paddingTop: "0px", paddingBottom: "0px" },
            ],
            { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
          )
          .finished.then(onRemoveSet, onRemoveSet)
      }
    : undefined
  // Setet som står på tur: det första som inte är avbockat.
  const nextSet = complete || readOnly ? -1 : Array.from({ length: exercise.sets }, (_, i) => i).find((i) => !findLog(workout.logs, exercise.id, i)?.done) ?? -1
  // Viktövningar (skivstång, hantlar, maskin …) visar alltid kg – vikten måste fyllas i.
  const usesWeight = usesWeights(data.exercises.find((x) => x.id === exercise.exerciseId)) || (exercise.targetKg ?? 0) > 0 || (last?.kg ?? 0) > 0
  const panelId = `ex-${exercise.id}`

  return (
    <section
      ref={cardRef}
      id={`exercise-${exercise.id}`}
      className={cn("scroll-mt-28 rounded-2xl border bg-card transition-[border-color,box-shadow] duration-300", open && "border-foreground/25 shadow-sm", block && "border-l-4 border-l-primary")}
      data-tracking={type}
      data-block={block?.name}
    >
      {block?.first && (
        <p className="flex items-center gap-1.5 px-3 pt-2.5 text-xs font-semibold text-primary sm:px-4" data-testid="logger-block">
          <Repeat className="size-3.5" aria-hidden /> {t("fields.blockRounds", { name: block.name, n: block.rounds })}
        </p>
      )}
      <div className="flex items-center">
      <button onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left sm:p-4">
        {/* v46: när övningens sista set bockas av ritas bocken och brickan får en ring – inte vid sidladdning. */}
        <span
          key={justCompleted}
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular transition-colors duration-300",
            complete ? "bg-brand text-brand-foreground" : "bg-muted",
            complete && justCompleted > 0 && "animate-pop"
          )}
        >
          {complete ? <DrawnCheck play={justCompleted} className="size-4" /> : index + 1}
          {complete && justCompleted > 0 && <span aria-hidden className="ring-burst" />}
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
            {type === "strength" ? (
              <>
                {exercise.sets} × {repsLabel(exercise)}
                {exercise.targetKg ? ` · ${exercise.targetKg} kg` : ""}
                {exercise.rpe ? ` · RPE ${exercise.rpe}` : ""}
              </>
            ) : (
              <>
                {exercise.sets} × {[exercise.distanceM ? formatDistance(exercise.distanceM, t.tag) : "", exercise.reps].filter(Boolean).join(" · ")}
                {exercise.paceSecPerKm ? ` · ${formatPace(exercise.paceSecPerKm)}${t("fields.perKm")}` : ""}
              </>
            )}{" "}
            · {doneCount}/{exercise.sets} klara
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[var(--ease-out-soft)]", open && "rotate-180")} />
      </button>
      {dragHandle && <div className="shrink-0 pr-2">{dragHandle}</div>}
      </div>

      <CollapsePanel open={open} id={panelId} className="space-y-2.5 px-3 pb-3 sm:space-y-3 sm:px-4 sm:pb-4">
          {/* v60: Videoguide / Utförande direkt under övningen (fälls ut inline). Inte för egna övningar. */}
          <ExerciseGuide exercise={libraryExercise} name={name} className="-mx-1" />
          {/* v37: en samlad ruta – dagens mål, PT:ns anteckning och förra gången. */}
          {((target && target.kind !== "start") || exercise.notes || (last && type === "strength") || hyroxHelp) && (
            <div
              className={cn(
                "space-y-1.5 rounded-xl border px-3 py-2 text-sm",
                target?.kind === "deload" ? "border-warning/50 bg-warning/10" : target && target.kind !== "start" ? "border-primary/25 bg-primary/5" : "border-transparent bg-muted"
              )}
              data-testid="exercise-brief"
            >
              {target && target.kind !== "start" && <ProgressionHint target={target} usesWeight={usesWeight} />}
              {/* v58: Hyrox-stationerna har en kort hjälptext på användarens språk. */}
              {hyroxHelp && (
                <p className="flex gap-2 text-muted-foreground" data-testid="hyrox-help">
                  <Info className="mt-0.5 size-4 shrink-0" /> {hyroxHelp}
                </p>
              )}
              {exercise.notes && (
                <p className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {exercise.notes}
                </p>
              )}
              {last && type === "strength" && (
                <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular">
                  <span>
                    Förra gången: {last.kg ? `${last.kg} kg × ` : ""}
                    {last.reps}
                  </span>
                  {/* v40: övningshistoriken nås härifrån (Framsteg visar bara korten och kurvan). */}
                  {me.role === "client" && (
                    <Link
                      href={`/klient/framsteg/ovning/${encodeURIComponent(exercise.exerciseId)}`}
                      className="-my-1 inline-flex min-h-8 shrink-0 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                      data-testid="exercise-history-link"
                    >
                      <History className="size-3.5" aria-hidden /> Historik
                    </Link>
                  )}
                </p>
              )}
            </div>
          )}

          {type !== "strength" ? (
            // v58: löpning och kondition – distans och tid (eller reps/kal) per intervall/varv.
            <>
              <div data-testid="set-columns" className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-1.5 px-1 text-[11px] text-muted-foreground sm:grid-cols-[2rem_1fr_1fr_3.5rem] sm:gap-2">
                <span>{block ? t("fields.rounds") : type === "running" ? "#" : t("fields.rounds")}</span>
                <span className="text-center">{type === "running" ? t("fields.distanceKm") : exercise.distanceM ? t("fields.distanceM") : t("fields.repsOrCal")}</span>
                <span className="text-center">{t("fields.time")}</span>
                <span />
              </div>
              <ol className="space-y-2">
                {Array.from({ length: exercise.sets }, (_, setIndex) => (
                  <EnduranceRow
                    key={setIndex}
                    type={type}
                    setIndex={setIndex}
                    exercise={exercise}
                    workout={workout}
                    name={name}
                    readOnly={readOnly}
                    isNext={setIndex === nextSet}
                    fresh={setIndex >= initialSets}
                    onLog={onLog}
                    onDone={onSetDone}
                  />
                ))}
              </ol>
            </>
          ) : (
            <>
          <div data-testid="set-columns" className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-1.5 px-1 text-[11px] text-muted-foreground sm:grid-cols-[2rem_1fr_1fr_3.5rem] sm:gap-2">
            <span>Set</span>
            <span className="text-center">{usesWeight ? "Kg" : "–"}</span>
            <span className="text-center">Reps</span>
            {/* v34: vikterna sätts manuellt – eller hämtas från förra passet, set för set. */}
            {!readOnly && lastSets ? (
              <button
                type="button"
                className="-my-1 flex min-h-8 items-center justify-center gap-0.5 rounded-md text-[11px] font-medium text-primary hover:bg-primary/10"
                data-testid="fill-last-session"
                aria-label={`Som förra passet: ${lastSets.map((x) => (x.kg ? `${x.kg.toLocaleString("sv-SE")} kg × ${x.reps}` : `${x.reps} reps`)).join(", ")}`}
                title="Fyll i seten som förra passet"
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
                <History className="size-3" /> Förra
              </button>
            ) : (
              <span />
            )}
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
                isNext={setIndex === nextSet}
                fresh={setIndex >= initialSets}
                autoKg={target?.kind === "increase_weight" ? target.kg : undefined}
                onLog={onLog}
                onDone={onSetDone}
              />
            ))}
          </ol>
            </>
          )}
          {(onAddSet || onRemove || removeLastSet) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {onAddSet && (
                <Button variant="ghost" size="sm" className="text-primary" onClick={onAddSet} disabled={exercise.sets >= 20} data-testid="add-set">
                  <Plus /> Lägg till set
                </Button>
              )}
              {removeLastSet && exercise.sets > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={removeLastSet}
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
      </CollapsePanel>
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
  isNext,
  fresh,
  autoKg,
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
  /** Setet som står på tur – markeras diskret så att ögat hittar det efter en avbockning. */
  isNext: boolean
  /** v68: setet lades till under passet – glider in. */
  fresh?: boolean
  /** Dagens automatiska vikt (förra passet + 1,25 kg), om övningen har historik. */
  autoKg?: number
  onLog: (log: SetLog) => void
  onDone: () => void
}) {
  const logged = findLog(workout.logs, exercise.id, setIndex)
  const suggestion = suggestSet(exercise, setIndex, workout.logs, history, info)
  // Ändringar som inte sparats än: set som inte bockats av, eller ett tömt fält.
  // Ett fält kan tömmas helt (undefined) och fyllas i med valfritt värde.
  const [draft, setDraft] = React.useState<Partial<SetValues> | null>(null)
  const values: SetValues = { ...(logged ?? suggestion), ...draft }
  const isDone = logged?.done ?? false
  // Vikten är förinställd med +1,25 kg (inte loggad eller ändrad av klienten än).
  const isAutoKg = autoKg !== undefined && !logged && !(draft && "kg" in draft) && values.kg === autoKg
  const [invalid, setInvalid] = React.useState(false)
  const ownTarget = hasSetReps(exercise) ? targetRepsFor(exercise, setIndex) : null

  const missing = (v: SetValues) => v.reps === undefined || (usesWeight && v.kg === undefined)
  const change = (patch: Partial<SetValues>) => {
    const next: SetValues = { ...values, ...patch }
    // Valfri vikt (t.ex. 62,4) behålls – bara två decimaler, inget steg-avrundande.
    if (next.kg !== undefined) next.kg = Math.max(0, Math.round(next.kg * 100) / 100)
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
  // v68: raden studsar till lite när setet bockas av.
  const [rowRef, kickRow] = useBounce<HTMLLIElement>()
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
    kickRow(0.35)
    navigator.vibrate?.(15)
    onDone()
  }

  return (
    <li
      ref={rowRef}
      data-next={isNext || undefined}
      className={cn(
        "grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-1.5 rounded-xl p-1 transition-colors duration-300 sm:grid-cols-[2rem_1fr_1fr_3.5rem] sm:gap-2",
        isDone && "bg-brand/15",
        fresh && "rise-in"
      )}
    >
      <span className="flex flex-col items-center text-center leading-tight">
        <span className={cn("flex size-6 items-center justify-center rounded-full text-sm font-semibold tabular transition-colors duration-300", isNext && "bg-primary text-primary-foreground")}>{setIndex + 1}</span>
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
          highlight={isAutoKg ? `Förinställd: +${String(AUTO_INCREMENT_KG).replace(".", ",")} kg från förra passet` : undefined}
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
          "relative flex h-12 items-center justify-center rounded-xl border-2 transition-[background-color,border-color,color,scale] duration-200 active:scale-90 disabled:active:scale-100",
          isDone ? "border-brand bg-brand text-brand-foreground" : isNext ? "border-primary/60 text-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-foreground"
        )}
      >
        {/* v46: bocken ritas och knappen får en ring när setet bockas av (inte vid sidladdning). */}
        {isDone ? <DrawnCheck play={pop} className="size-6" /> : <Check className="size-6" strokeWidth={3} />}
        {isDone && pop > 0 && <span key={pop} aria-hidden className="ring-burst" />}
      </button>
    </li>
  )
}

/**
 * v58: ett intervall/varv för löpning och kondition. Löpning: distans (km) och
 * tid – tempot räknas fram. Kondition: distans (m) eller reps/kalorier, tid valfri.
 * Fälten får vara tomma; valideringen sker först när raden bockas av.
 */
function EnduranceRow({
  type,
  setIndex,
  exercise,
  workout,
  name,
  readOnly,
  isNext,
  fresh,
  onLog,
  onDone,
}: {
  type: Exclude<TrackingType, "strength">
  setIndex: number
  exercise: WorkoutExercise
  workout: ScheduledWorkout
  name: string
  readOnly: boolean
  isNext: boolean
  fresh?: boolean
  onLog: (log: SetLog) => void
  onDone: () => void
}) {
  const t = useT()
  const logged = findLog(workout.logs, exercise.id, setIndex)
  const usesReps = type === "conditioning" && !exercise.distanceM
  const planned = {
    distanceM: exercise.distanceM,
    reps: usesReps && /^\d+$/.test(exercise.reps.trim()) ? Number(exercise.reps.trim()) : undefined,
    durationSec: exercise.paceSecPerKm && exercise.distanceM ? Math.round((exercise.paceSecPerKm * exercise.distanceM) / 1000) : exercise.durationSec,
  }
  type V = { distanceM?: number; reps?: number; durationSec?: number }
  const [draft, setDraft] = React.useState<V | null>(null)
  const base: V = logged ? { distanceM: logged.distanceM, reps: logged.reps || undefined, durationSec: logged.durationSec } : { distanceM: planned.distanceM, reps: planned.reps }
  const v: V = { ...base, ...draft }
  const isDone = logged?.done ?? false
  const [invalid, setInvalid] = React.useState(false)
  const [pop, setPop] = React.useState(0)
  const [rowRef, kickRow] = useBounce<HTMLLIElement>()
  const toLog = (x: V, done: boolean): SetLog => ({
    workoutExerciseId: exercise.id,
    setIndex,
    kg: 0,
    reps: x.reps ?? 0,
    done,
    ...(x.distanceM !== undefined ? { distanceM: x.distanceM } : {}),
    ...(x.durationSec !== undefined ? { durationSec: x.durationSec } : {}),
  })
  const change = (patch: V) => {
    const next = { ...v, ...patch }
    if (!missingForType(type, next, false)) setInvalid(false)
    if (logged?.done && !missingForType(type, next, false)) {
      onLog(toLog(next, true))
      setDraft(null)
    } else setDraft(next)
  }
  const toggle = () => {
    if (isDone) return onLog(toLog(v, false))
    const missing = missingForType(type, v, false)
    if (missing) {
      setInvalid(true)
      toast.error(missing === "time" ? t("fields.fillTime", { what: name }) : t("fields.fillDistance", { what: name }))
      return
    }
    onLog(toLog(v, true))
    setDraft(null)
    setPop((n) => n + 1)
    kickRow(0.35)
    navigator.vibrate?.(15)
    onDone()
  }
  const pace = type === "running" ? paceOf(v.distanceM, v.durationSec) : undefined
  const label = type === "running" ? t("fields.intervalOf", { n: setIndex + 1 }) : t("fields.roundOf", { n: setIndex + 1 })
  return (
    <li
      ref={rowRef}
      data-next={isNext || undefined}
      className={cn(
        "grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-1.5 rounded-xl p-1 transition-colors duration-300 sm:grid-cols-[2rem_1fr_1fr_3.5rem] sm:gap-2",
        isDone && "bg-brand/15",
        fresh && "rise-in"
      )}
      data-testid="endurance-row"
    >
      <span className={cn("flex size-6 items-center justify-center justify-self-center rounded-full text-sm font-semibold tabular", isNext && "bg-primary text-primary-foreground")}>{setIndex + 1}</span>
      {type === "running" ? (
        <Stepper
          value={v.distanceM === undefined ? undefined : Math.round(v.distanceM) / 1000}
          step={0.1}
          unit="km"
          disabled={readOnly}
          invalid={(invalid || isDone) && v.distanceM === undefined}
          onChange={(km) => change({ distanceM: km === undefined ? undefined : Math.round(km * 1000) })}
          label={`${t("fields.distance")} ${label}`}
        />
      ) : usesReps ? (
        <Stepper value={v.reps} step={5} unit="reps" disabled={readOnly} invalid={(invalid || isDone) && v.reps === undefined} onChange={(reps) => change({ reps: reps === undefined ? undefined : Math.round(reps) })} label={`${t("fields.repsOrCal")} ${label}`} />
      ) : (
        <Stepper value={v.distanceM} step={10} unit="m" disabled={readOnly} invalid={(invalid || isDone) && v.distanceM === undefined} onChange={(m) => change({ distanceM: m === undefined ? undefined : Math.round(m) })} label={`${t("fields.distance")} ${label}`} />
      )}
      <div className="relative">
        <TimeInput
          value={v.durationSec}
          onValueChange={(sec) => change({ durationSec: sec })}
          disabled={readOnly}
          placeholder={planned.durationSec ? formatPace(planned.durationSec) : "m:ss"}
          aria-label={`${t("fields.time")} ${label}`}
          aria-invalid={(invalid && type === "running" && v.durationSec === undefined) || undefined}
          className="h-12 rounded-xl border-0 bg-muted text-center text-lg font-semibold"
        />
        {/* Tempot under tiden – fast plats, så raden inte ändrar höjd. */}
        <span className="pointer-events-none absolute inset-x-0 -bottom-3.5 h-3 text-center text-[10px] text-muted-foreground tabular">
          {pace ? `${formatPace(pace)}${t("fields.perKm")}` : ""}
        </span>
      </div>
      <button
        onClick={toggle}
        disabled={readOnly}
        aria-pressed={isDone}
        aria-label={isDone ? `Ångra ${label}` : `Bocka av ${label}`}
        className={cn(
          "relative flex h-12 items-center justify-center rounded-xl border-2 transition-[background-color,border-color,color,scale] duration-200 active:scale-90 disabled:active:scale-100",
          isDone ? "border-brand bg-brand text-brand-foreground" : isNext ? "border-primary/60 text-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-foreground"
        )}
      >
        {isDone ? <DrawnCheck play={pop} className="size-6" /> : <Check className="size-6" strokeWidth={3} />}
        {isDone && pop > 0 && <span key={pop} aria-hidden className="ring-burst" />}
      </button>
    </li>
  )
}

const KIND_LABEL: Record<ProgressionTarget["kind"], string> = {
  increase_weight: `+${String(AUTO_INCREMENT_KG).replace(".", ",")} kg från förra passet`,
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
    <div data-testid="progression-hint">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
      </p>
      {/* Förklaringen bakom "Varför?" – syns när man vill, tar ingen plats annars. */}
      <details className="group text-xs text-muted-foreground">
        <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 select-none [&::-webkit-details-marker]:hidden">
          {KIND_LABEL[target.kind]} · <span className="underline underline-offset-2">Varför?</span>
        </summary>
        <p className="pt-0.5">{target.reason}</p>
      </details>
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
  highlight,
  onChange,
}: {
  value: number | undefined
  step: number
  unit: string
  label: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  /** Förinställt värde (t.ex. +1,25 kg från förra passet): siffran blir limegrön, med förklaring för skärmläsare. */
  highlight?: string
  onChange: (v: number | undefined) => void
}) {
  const [text, setText] = React.useState<string | null>(null)
  const show = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","))
  const hintId = React.useId()
  // v68: siffran gör en liten studs vid − och +.
  const [numRef, kickNum] = useBounce<HTMLInputElement>()
  return (
    <div className={cn("flex h-12 items-center rounded-xl bg-muted transition-shadow duration-200", invalid && "ring-2 ring-destructive")}>
      {!disabled && (
        <button
          type="button"
          className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground transition-[color,scale] duration-150 active:scale-90 active:text-foreground sm:w-9"
          aria-label={`Minska ${label}`}
          onClick={() => {
            onChange(Math.max(0, (value ?? 0) - step))
            kickNum(-0.5)
          }}
        >
          <Minus className="size-4" />
        </button>
      )}
      {/* Siffran är ett eget fält: tryck → hela värdet markeras och sifferknappsatsen öppnas. */}
      <input
        ref={numRef}
        type="text"
        inputMode="decimal"
        pattern="[0-9.,]*"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={`${label} (${unit})`}
        aria-invalid={invalid || undefined}
        aria-describedby={highlight ? hintId : undefined}
        title={highlight}
        disabled={disabled}
        placeholder={placeholder ?? "–"}
        value={text ?? show(value)}
        onFocus={(e) => {
          setText(show(value))
          // iOS Safari/WKWebView nollställer markeringen efter fokus – markera igen nästa bildruta.
          const el = e.currentTarget
          el.select()
          const atFocus = el.value
          // Bara om inget har skrivits än – annars skulle snabb inmatning markeras om.
          requestAnimationFrame(() => {
            if (document.activeElement === el && el.value === atFocus) el.setSelectionRange(0, el.value.length)
          })
        }}
        onChange={(e) => {
          // Punkt eller komma, ett decimaltecken; fältet får vara helt tomt.
          const t = cleanDecimal(e.target.value)
          setText(t)
          onChange(parseDecimal(t))
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-center text-lg font-semibold tabular outline-none transition-colors selection:bg-primary/35 selection:text-foreground placeholder:text-muted-foreground/50 disabled:opacity-100",
          // Långa värden (86,25) får plats även på 360 px – aldrig under 16 px (iOS zoomar annars vid tryck).
          (text ?? show(value)).length >= 5 && "text-base tracking-tight",
          highlight && text === null && "text-primary"
        )}
        data-auto={highlight ? "" : undefined}
      />
      {highlight && (
        <span id={hintId} className="sr-only">
          {highlight}
        </span>
      )}
      {!disabled && (
        <button
          type="button"
          className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground transition-[color,scale] duration-150 active:scale-90 active:text-foreground sm:w-9"
          aria-label={`Öka ${label}`}
          onClick={() => {
            onChange((value ?? 0) + step)
            kickNum(0.6)
          }}
        >
          <Plus className="size-4" />
        </button>
      )}
    </div>
  )
}

/**
 * Den tysta passtimern (v81): startar när passet öppnas på passdagen och syns
 * inte under passet – ingen klocka, inga omritningar. Starttiden sparas på
 * enheten och längden visas i summeringen när passet avslutas.
 */
function SilentWorkoutTimer({ workoutId }: { workoutId: string }) {
  React.useEffect(() => {
    ensureWorkoutTimer(workoutId)
  }, [workoutId])
  return null
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

  // v68: en tunn stapel som töms i jämn takt (requestAnimationFrame, bara transform).
  const drain = React.useRef<HTMLSpanElement>(null)
  const { endsAt, total } = rest
  React.useEffect(() => {
    let frame = 0
    const draw = () => {
      const share = Math.max(0, Math.min(1, (endsAt - Date.now()) / (total * 1000)))
      if (drain.current) drain.current.style.transform = `scaleX(${share.toFixed(4)})`
      if (share > 0 && !prefersReducedMotion()) frame = requestAnimationFrame(draw)
    }
    draw()
    // Med "minska rörelse" ritas stapeln om fyra gånger i sekunden i stället.
    const t = prefersReducedMotion() ? window.setInterval(draw, 250) : 0
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(t)
    }
  }, [endsAt, total])

  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, "0")
  /** ±15 s. Under 15 s kvar avslutar "-15 s" vilan (0:00) – aldrig negativ tid. */
  const adjust = (deltaMs: number) => {
    const at = Date.now()
    onChange({ ...rest, endsAt: Math.max(at, Math.max(rest.endsAt, at) + deltaMs) })
    setNow(at)
  }

  return (
    <div className="rise-in fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg p-3 pb-[max(0.75rem,var(--safe-bottom))]">
      <div
        className={cn(
          "relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 shadow-lg backdrop-blur transition-colors duration-300",
          finished ? "border-brand bg-brand text-brand-foreground" : "bg-background/95"
        )}
        role="timer"
        aria-live={finished ? "assertive" : "off"}
      >
        <span ref={drain} aria-hidden data-testid="rest-drain" className="absolute inset-x-0 bottom-0 h-1 origin-left bg-primary/70" style={{ transform: "scaleX(1)" }} />
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
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  workout: ScheduledWorkout
  /** Sparar passet. Returnerar null om det inte gick (felet har då visats). */
  onFinish: (comment: string) => { commentSent: boolean; durationSec: number | null } | null
  /** Efter kvittot: vidare till startsidan. */
  onDone: () => void
}) {
  const [comment, setComment] = React.useState("")
  const [saved, setSaved] = React.useState<{ commentSent: boolean; durationSec: number | null; hour: number } | null>(null)
  const done = setsDone(workout)
  const total = setsTotal(workout)
  const quick = ["Kändes lätt 💪", "Lagom tungt", "Tungt idag", "Ont någonstans – vill prata"]

  // v51: efter sparandet visas en sammanfattning med en personlig kommentar.
  // Den stannar tills klienten trycker Klar (eller stänger rutan).

  const save = () => {
    const result = onFinish(comment.trim())
    if (!result) return
    navigator.vibrate?.([12, 60, 18])
    // Klockslaget styr kommentaren (morgon/kväll) – tas när passet sparas.
    setSaved({ ...result, hour: new Date().getHours() })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (saved ? onDone() : onOpenChange(o))}>
      <DialogContent showCloseButton={!saved} className={cn(saved && "sm:max-w-sm")}>
        {saved ? (
          <WorkoutSummaryView workout={workout} hour={saved.hour} commentSent={saved.commentSent} durationSec={saved.durationSec} onDone={onDone} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Avsluta passet?</DialogTitle>
              <DialogDescription>
                {done} av {total} set är avbockade.{done < total && " Set som inte bockats av räknas som ej gjorda."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {quick.map((q) => (
                  <button
                    key={q}
                    onClick={() => setComment(q)}
                    aria-pressed={comment === q}
                    className={cn("rounded-full border px-3 py-1 text-sm transition-[background-color,border-color,scale] duration-200 active:scale-95", comment === q ? "border-primary bg-primary/10" : "hover:bg-muted")}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kommentar till din PT (valfritt)" rows={3} maxLength={1000} />
            </div>
            <DialogFooter>
              <Button size="lg" className="w-full bg-brand text-brand-foreground hover:bg-brand/90 sm:w-auto" onClick={save}>
                <Check /> Spara pass
              </Button>
            </DialogFooter>
          </>
        )}
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

/**
 * "Lägg till övning" mitt i passet (v32): sök i övningsbanken (egna övningar
 * först) och lägg till med ett tryck. Set, reps och vila följer övningens
 * förval; dagens mål räknas ur historiken som för alla övningar.
 */
function AddExerciseDialog({ onAdd }: { onAdd: (entry: Omit<WorkoutExercise, "id">) => boolean }) {
  const [open, setOpen] = React.useState(false)
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
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" className="h-12 w-full border-dashed" onClick={() => setOpen(true)} data-testid="add-exercise">
        <Plus /> Lägg till övning
      </Button>
      <DialogContent className="min-w-0 grid-cols-[minmax(0,1fr)] max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[calc(1rem+var(--safe-bottom))] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till övning</DialogTitle>
          <DialogDescription>Kör extra eller byt ut något – PT:ns program ligger kvar.</DialogDescription>
        </DialogHeader>
        {/* v38: grupperad efter muskelgrupp, med snabbfilter och sökning. */}
        {open && <ExercisePicker listLabel="Övningar att lägga till" placeholder="Sök övning, t.ex. hip thrust" onPick={add} />}
      </DialogContent>
    </Dialog>
  )
}
