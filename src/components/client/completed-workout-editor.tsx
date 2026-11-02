"use client"

import { ArrowDown, ArrowUp, Check, Plus, Search, Trash2, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CLOSE_BUTTON } from "@/components/ui/close-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { exerciseName } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { workoutExerciseFor } from "@/lib/exercises/custom"
import { MAX_SETS, moveItem, repsLabel, targetRepsFor } from "@/lib/exercises/draft"
import { matchesExercise } from "@/lib/exercises/search"
import { findLog } from "@/lib/training"
import { cn } from "@/lib/utils"
import { usesWeights } from "@/lib/workout-rules"
import type { ScheduledWorkout, SetLog, WorkoutExercise } from "@/types/domain"

/** Ett set under redigering. undefined = tomt fält (valideras när passet sparas). */
interface SetDraft {
  kg?: number
  reps?: number
  done: boolean
}

interface ExerciseDraft {
  exercise: WorkoutExercise
  sets: SetDraft[]
}

/**
 * Redigera ett genomfört pass i efterhand (edit_completed_workout): vikter,
 * reps, vilka set som gjordes, ordningen och kommentaren. I egna pass går det
 * också att byta namn, lägga till och ta bort övningar och set. PT:ns program
 * (övningar och antal set) är låst – där rättar klienten bara vad som gjordes.
 */
export function CompletedWorkoutEditor({ workout, onClose }: { workout: ScheduledWorkout; onClose: () => void }) {
  const { data, actions } = useAppData()
  const own = Boolean(workout.byClient)
  const [name, setName] = React.useState(workout.name)
  const [comment, setComment] = React.useState(workout.clientComment ?? "")
  const [items, setItems] = React.useState<ExerciseDraft[]>(() =>
    workout.exercises.map((exercise) => ({
      exercise,
      sets: Array.from({ length: exercise.sets }, (_, i) => {
        const log = findLog(workout.logs, exercise.id, i)
        return log ? { kg: log.kg, reps: log.reps, done: log.done } : { done: false }
      }),
    }))
  )
  const [showErrors, setShowErrors] = React.useState(false)
  const nameOf = (exerciseId: string) => exerciseName(data, exerciseId, workout.clientId)
  const weighted = (it: ExerciseDraft) =>
    usesWeights(data.exercises.find((e) => e.id === it.exercise.exerciseId)) || it.sets.some((s) => (s.kg ?? 0) > 0)

  // Stäng med Escape och lås scrollningen bakom.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const updateItem = (index: number, patch: (it: ExerciseDraft) => ExerciseDraft) =>
    setItems((list) => list.map((it, i) => (i === index ? patch(it) : it)))
  const updateSet = (index: number, setIndex: number, patch: Partial<SetDraft>) =>
    updateItem(index, (it) => ({ ...it, sets: it.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) }))

  const save = () => {
    if (own && !name.trim()) return toast.error("Passet behöver ett namn")
    if (items.length === 0) return toast.error("Passet behöver minst en övning")
    // Valideringen sker först här: genomförda set måste ha reps (och vikt för viktövningar).
    for (const it of items) {
      const missing = it.sets.findIndex((s) => s.done && (s.reps === undefined || (weighted(it) && s.kg === undefined)))
      if (missing >= 0) {
        setShowErrors(true)
        return toast.error(`Fyll i ${it.sets[missing].reps === undefined ? "reps" : "vikt"} för ${nameOf(it.exercise.exerciseId)}, set ${missing + 1}`)
      }
    }
    const exercises: WorkoutExercise[] = items.map((it) => (own ? { ...it.exercise, sets: Math.max(1, it.sets.length) } : it.exercise))
    const logs: SetLog[] = items.flatMap((it) =>
      it.sets.flatMap((s, setIndex) =>
        s.done ? [{ workoutExerciseId: it.exercise.id, setIndex, kg: s.kg ?? 0, reps: s.reps ?? 0, done: true }] : []
      )
    )
    const error = actions.editCompletedWorkout(workout.id, { exercises, logs, comment, name: own ? name : undefined })
    if (error) return toast.error(error)
    toast.success("Passet är uppdaterat")
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-workout-title"
      className="fixed inset-0 z-50 flex flex-col bg-background"
      data-testid="workout-editor"
    >
      <header className="flex items-center gap-2 border-b px-3 pt-[var(--safe-top)]">
        <div className="flex h-14 w-full items-center gap-2">
          <button className={CLOSE_BUTTON} aria-label="Avbryt" onClick={onClose}>
            <X />
          </button>
          <h2 id="edit-workout-title" className="min-w-0 flex-1 truncate font-semibold">
            Redigera pass
          </h2>
          <Button onClick={save}>
            <Check /> Spara
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[calc(2rem+var(--safe-bottom))]">
        {own ? (
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Passets namn</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Rätta vad du faktiskt gjorde: vikter, reps och vilka set som blev av. Övningarna i programmet bestäms av din PT.
          </p>
        )}

        <ol className="space-y-3">
          {items.map((it, index) => {
            const label = nameOf(it.exercise.exerciseId)
            const needsKg = weighted(it)
            return (
              <li key={it.exercise.id} className="space-y-3 rounded-2xl border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      Mål {it.exercise.sets} × {repsLabel(it.exercise)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Flytta upp ${label}`} disabled={index === 0} onClick={() => setItems(moveItem(items, index, -1))}>
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Flytta ned ${label}`}
                    disabled={index === items.length - 1}
                    onClick={() => setItems(moveItem(items, index, 1))}
                  >
                    <ArrowDown />
                  </Button>
                  {own && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Ta bort ${label}`} onClick={() => setItems(items.filter((_, i) => i !== index))}>
                      <Trash2 />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem_2rem] items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Set</span>
                  <span>{needsKg ? "Kg" : "Kg (valfritt)"}</span>
                  <span>Reps</span>
                  <span className="text-center">Gjort</span>
                  <span />
                </div>
                <ol className="space-y-2">
                  {it.sets.map((s, setIndex) => {
                    const kgMissing = showErrors && s.done && needsKg && s.kg === undefined
                    const repsMissing = showErrors && s.done && s.reps === undefined
                    return (
                      <li key={setIndex} className="grid grid-cols-[2rem_1fr_1fr_2.75rem_2rem] items-center gap-2">
                        <span className="text-center text-sm font-semibold tabular">{setIndex + 1}</span>
                        <NumberInput
                          decimal
                          min={0}
                          max={1000}
                          value={s.kg}
                          onValueChange={(kg) => updateSet(index, setIndex, { kg })}
                          aria-label={`Vikt set ${setIndex + 1}, ${label}`}
                          aria-invalid={kgMissing || undefined}
                          className="h-11 text-center tabular"
                        />
                        <NumberInput
                          min={0}
                          max={1000}
                          value={s.reps}
                          placeholder={targetRepsFor(it.exercise, setIndex)}
                          onValueChange={(reps) => updateSet(index, setIndex, { reps })}
                          aria-label={`Reps set ${setIndex + 1}, ${label}`}
                          aria-invalid={repsMissing || undefined}
                          className="h-11 text-center tabular"
                        />
                        <button
                          type="button"
                          aria-pressed={s.done}
                          aria-label={s.done ? `Set ${setIndex + 1} gjort – tryck för att ångra` : `Markera set ${setIndex + 1} som gjort`}
                          onClick={() => updateSet(index, setIndex, { done: !s.done })}
                          className={cn(
                            "flex size-11 items-center justify-center rounded-xl border-2 transition-colors",
                            s.done ? "border-brand bg-brand text-brand-foreground" : "border-muted-foreground/30 text-muted-foreground"
                          )}
                        >
                          <Check className="size-5" strokeWidth={3} />
                        </button>
                        {own && it.sets.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ta bort set ${setIndex + 1}`}
                            onClick={() => updateItem(index, (x) => ({ ...x, sets: x.sets.filter((_, j) => j !== setIndex) }))}
                          >
                            <X />
                          </Button>
                        ) : (
                          <span />
                        )}
                      </li>
                    )
                  })}
                </ol>
                {own && it.sets.length < MAX_SETS && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => updateItem(index, (x) => ({ ...x, sets: [...x.sets, { kg: x.sets.at(-1)?.kg, reps: undefined, done: true }] }))}
                  >
                    <Plus /> Lägg till set
                  </Button>
                )}
              </li>
            )
          })}
        </ol>

        {own && <AddExercise exclude={items.map((i) => i.exercise.exerciseId)} onAdd={(exercise) => setItems([...items, exercise])} />}

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Kommentar / anteckningar</span>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} placeholder="Hur kändes passet?" />
        </label>
      </div>
    </div>
  )
}

/** Sök och lägg till en övning (egna pass). */
function AddExercise({ exclude, onAdd }: { exclude: string[]; onAdd: (d: ExerciseDraft) => void }) {
  const { data, actions } = useAppData()
  const [q, setQ] = React.useState("")
  const matches = q.trim()
    ? data.exercises.filter((e) => !exclude.includes(e.id) && matchesExercise(e, q)).slice(0, 6)
    : []
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lägg till övning (t.ex. Bench Press eller bänkpress)" className="pl-9" aria-label="Sök övning att lägga till" />
      </div>
      {matches.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  const exercise = workoutExerciseFor(e, actions.newId())
                  onAdd({ exercise, sets: Array.from({ length: exercise.sets }, () => ({ done: true })) })
                  setQ("")
                }}
              >
                <Plus className="size-4 text-muted-foreground" />
                <span className="flex-1">{e.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{e.muscleGroup}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
