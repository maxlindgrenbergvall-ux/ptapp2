"use client"

import { ArrowLeft, CalendarPlus, Check, LayoutTemplate, Plus, RefreshCw, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { formatDay, todayISO } from "@/lib/date"
import { buildSchedule, cloneSplit, customSplit, type Split, type SplitDay, type SplitExercise, SPLITS, WEEKDAY_SHORT } from "@/lib/splits"
import { buildTemplate } from "@/lib/templates"
import { cn } from "@/lib/utils"
import { SortableList } from "@/components/workouts/sortable-list"
import { ExercisePickerDialog } from "@/components/exercises/exercise-picker"
import type { Exercise } from "@/types/domain"

/** I editorn har varje övning ett id (för drag-and-drop); det tas bort när schemat skapas. */
type EditExercise = SplitExercise & { id: string }
type EditSplit = Omit<Split, "days"> & { days: (Omit<SplitDay, "exercises"> & { exercises: EditExercise[] })[] }
const stripId = (e: EditExercise): SplitExercise => {
  const copy: Partial<EditExercise> = { ...e }
  delete copy.id
  return copy as SplitExercise
}
const toPlain = (s: EditSplit): Split => ({ ...s, days: s.days.map((d) => ({ ...d, exercises: d.exercises.map(stripId) })) })

/**
 * Träningssplits (v32): välj en färdig split (PPL, Upper/Lower, 4-split, Bro
 * split, Full Body) eller bygg en egen, anpassa dagarna och skapa sedan
 *   - klient: planerade pass i kalendern på valda veckodagar i N veckor
 *     (och dagarna som mallar),
 *   - PT: en mall per dag att tilldela klienter.
 */
export function SplitBuilder({ mode, onDone }: { mode: "client" | "trainer"; onDone?: () => void }) {
  const { data, actions, me } = useAppData()
  const [split, setSplit] = React.useState<EditSplit | null>(null)
  const [weekdays, setWeekdays] = React.useState<number[]>([])
  const [start, setStart] = React.useState(todayISO())
  const [weeks, setWeeks] = React.useState<number | undefined>(4)
  const [asTemplates, setAsTemplates] = React.useState(mode === "trainer")
  const [customDays, setCustomDays] = React.useState<number | undefined>(3)
  const nameOf = (id: string) => data.exercises.find((e) => e.id === id)?.name ?? id

  const choose = (s: Split) => {
    const copy = cloneSplit(s)
    setSplit({ ...copy, days: copy.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, id: actions.newId() })) })) })
    setWeekdays(copy.weekdays)
  }

  if (!split) {
    return (
      <div className="space-y-3" data-testid="split-library">
        <ul className="grid gap-2 sm:grid-cols-2">
          {SPLITS.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => choose(s)}
                className="flex h-full w-full flex-col gap-1.5 rounded-2xl border bg-card p-4 text-left shadow-card transition-colors hover:bg-muted/60 active:scale-[0.99]"
                data-testid={`split-${s.key}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {s.days.length} dagar
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{s.description}</span>
                <span className="mt-auto flex flex-wrap gap-1 pt-1">
                  {s.days.slice(0, 6).map((d) => (
                    <span key={d.name} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {d.name}
                    </span>
                  ))}
                </span>
                <span className="text-[11px] text-muted-foreground">{s.level}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">Egen split</p>
            <p className="text-xs text-muted-foreground">Bygg från grunden – välj antal dagar och fyll i övningar.</p>
          </div>
          <NumberInput min={1} max={7} value={customDays} onValueChange={setCustomDays} aria-label="Antal dagar" className="h-10 w-16 tabular" />
          <Button variant="outline" onClick={() => choose(customSplit(customDays ?? 3))} data-testid="split-custom">
            <Plus /> Skapa
          </Button>
        </div>
      </div>
    )
  }

  const plain = toPlain(split)
  const sessions = buildSchedule(plain, weekdays, start, weeks ?? 0)
  const emptyDays = split.days.filter((d) => d.exercises.length === 0).length
  const updateDay = (i: number, patch: Partial<EditSplit["days"][number]>) =>
    setSplit({ ...split, days: split.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) })

  const submit = () => {
    if (emptyDays === split.days.length) return toast.error("Lägg till övningar först")
    const withIds = (list: SplitExercise[]) => list.map((e) => ({ ...e, id: actions.newId() }))
    if (asTemplates || mode === "trainer") {
      for (const d of plain.days.filter((x) => x.exercises.length)) {
        actions.saveTemplate(buildTemplate({ ownerId: me.id, name: `${split.short}: ${d.name}`, description: d.focus, exercises: withIds(d.exercises), newId: actions.newId }))
      }
    }
    if (mode === "client") {
      if (!sessions.length) return toast.error("Välj minst en veckodag och antal veckor")
      for (const s of sessions) actions.createOwnWorkout(s.name, s.date, withIds(s.exercises))
      toast.success(`Schemat är skapat: ${sessions.length} pass`, { description: `${split.name} ${formatDay(sessions[0].date).toLowerCase()} – ${formatDay(sessions.at(-1)!.date).toLowerCase()}. Du hittar dem i kalendern.` })
    } else {
      toast.success(`${split.days.length - emptyDays} mallar skapade`, { description: "Tilldela dem till klienter i passbyggaren." })
    }
    onDone?.()
  }

  return (
    <div className="space-y-5" data-testid="split-editor">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Tillbaka till splits" onClick={() => setSplit(null)}>
          <ArrowLeft />
        </Button>
        <Input value={split.name} onChange={(e) => setSplit({ ...split, name: e.target.value.slice(0, 60) })} className="h-11 text-base font-semibold" aria-label="Schemats namn" />
      </div>

      <ol className="space-y-3">
        {split.days.map((d, i) => (
          <li key={i} className="space-y-2 rounded-2xl border bg-card p-3 shadow-card" data-testid="split-day">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
              <Input value={d.name} onChange={(e) => updateDay(i, { name: e.target.value.slice(0, 40) })} className="h-9 font-medium" aria-label={`Namn på dag ${i + 1}`} />
            </div>
            {/* v34: dra i handtaget för att ändra ordningen; set, reps och startvikt redigeras direkt. */}
            {d.exercises.length ? (
              <SortableList
                items={d.exercises}
                as="ul"
                className="space-y-1.5"
                aria-label={`Övningar dag ${i + 1}`}
                itemLabel={(e) => nameOf(e.exerciseId)}
                onReorder={(ids) => updateDay(i, { exercises: ids.map((id) => d.exercises.find((e) => e.id === id)!) })}
                renderItem={(e, { handle }) => (
                  <SplitExerciseRow
                    exercise={e}
                    name={nameOf(e.exerciseId)}
                    handle={handle}
                    onChange={(patch) => updateDay(i, { exercises: d.exercises.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) })}
                    onReplace={(next) => {
                      updateDay(i, { exercises: d.exercises.map((x) => (x.id === e.id ? replaceSplitExercise(x, next) : x)) })
                      toast.success(`Bytt till ${next.name}`)
                    }}
                    onRemove={() => updateDay(i, { exercises: d.exercises.filter((x) => x.id !== e.id) })}
                  />
                )}
              />
            ) : (
              <p className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">Inga övningar än.</p>
            )}
            <ExercisePickerDialog
              title={`Lägg till i ${d.name}`}
              listLabel="Övningar att lägga till"
              onPick={(e) => updateDay(i, { exercises: [...d.exercises, { ...splitExerciseFor(e), id: actions.newId() }] })}
              trigger={
                <Button variant="outline" size="sm" className="w-full border-dashed" data-testid="split-add-exercise">
                  <Plus /> Lägg till övning
                </Button>
              }
            />
          </li>
        ))}
      </ol>

      {mode === "client" && (
        <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-card">
          <div className="space-y-1.5">
            <Label id="split-weekdays">Träningsdagar</Label>
            <div className="grid grid-cols-7 gap-1" role="group" aria-labelledby="split-weekdays">
              {WEEKDAY_SHORT.map((label, d) => {
                const on = weekdays.includes(d)
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort())}
                    className={cn("min-h-11 rounded-lg border text-xs font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60")}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="split-start">Startdatum</Label>
              <Input id="split-start" type="date" value={start} min={todayISO()} onChange={(e) => setStart(e.target.value || todayISO())} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-weeks">Antal veckor</Label>
              <NumberInput id="split-weeks" min={1} max={12} value={weeks} onValueChange={setWeeks} className="h-11 tabular" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={asTemplates} onCheckedChange={(v) => setAsTemplates(v === true)} />
            <LayoutTemplate className="size-4 text-muted-foreground" /> Spara dagarna som mallar också
          </label>
          <p className="text-sm" data-testid="split-summary">
            {sessions.length ? (
              <>
                <b>{sessions.length} pass</b> – {sessions.slice(0, 3).map((s) => `${formatDay(s.date)}: ${s.name.split(": ")[1]}`).join(" · ")}
                {sessions.length > 3 ? " …" : ""}
              </>
            ) : (
              <span className="text-muted-foreground">Välj dagar och antal veckor.</span>
            )}
          </p>
        </div>
      )}

      <Button size="lg" className="h-12 w-full" onClick={submit} data-testid="split-create">
        {mode === "client" ? (
          <>
            <CalendarPlus /> Skapa schemat
          </>
        ) : (
          <>
            <Check /> Skapa {split.days.length - emptyDays} mallar
          </>
        )}
      </Button>
    </div>
  )
}

/**
 * En övning i en split-dag (v34): handtag för drag-and-drop, set, reps (intervall
 * som "6–8" eller fast antal) och valfri startvikt. Repintervallet styr
 * progressionen; startvikten blir PT:ns/klientens mål första gången.
 */
function SplitExerciseRow({
  exercise,
  name,
  handle,
  onChange,
  onRemove,
  onReplace,
}: {
  exercise: EditExercise
  name: string
  handle: React.ReactNode
  onChange: (patch: Partial<SplitExercise>) => void
  onRemove: () => void
  onReplace: (e: Exercise) => void
}) {
  return (
    <div className="rounded-xl border bg-background px-2 py-1.5" data-testid="split-exercise">
      <div className="flex items-center gap-1">
        {handle}
        {/* v38: tryck på namnet för att byta övning – set och reps ligger kvar. */}
        <ExercisePickerDialog
          title="Byt övning"
          description={`Ersätt ${name}. Set och reps ligger kvar.`}
          currentId={exercise.exerciseId}
          listLabel="Övningar att byta till"
          onPick={(e) => onReplace(e)}
          trigger={
            <button type="button" className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-sm font-medium hover:text-primary" aria-label={`Byt ${name}`} data-testid="replace-exercise">
              <span className="truncate">{name}</span>
              <RefreshCw className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <Button variant="ghost" size="icon-sm" aria-label={`Ta bort ${name}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 pl-10">
        <label className="space-y-0.5">
          <span className="block text-[11px] text-muted-foreground">Set</span>
          <NumberInput
            min={1}
            max={20}
            value={exercise.sets}
            onValueChange={(v) => onChange({ sets: Math.min(20, Math.max(1, v ?? 1)), setReps: undefined })}
            aria-label={`Set för ${name}`}
            className="h-9 tabular"
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[11px] text-muted-foreground">Reps</span>
          <Input
            value={exercise.reps}
            onChange={(e) => onChange({ reps: e.target.value.slice(0, 20) })}
            aria-label={`Reps för ${name}`}
            placeholder="8–12"
            className="h-9 tabular"
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[11px] text-muted-foreground">Startvikt</span>
          <NumberInput
            min={0}
            max={500}
            decimal
            inputMode="decimal"
            value={exercise.targetKg}
            onValueChange={(v) => onChange({ targetKg: v || undefined })}
            aria-label={`Startvikt (kg) för ${name}`}
            placeholder="kg"
            className="h-9 tabular"
          />
        </label>
      </div>
    </div>
  )
}

/** Standardvärden när en övning läggs i en split: tunga baslyft 6–8 reps, annars 8–12, kondition 500 m. */
export function splitExerciseFor(e: Exercise): SplitExercise {
  const compound = ["ben", "rygg", "bröst"].includes(e.muscleGroup) && /stång|trap/i.test(e.equipment ?? "")
  return { exerciseId: e.id, sets: 3, reps: e.muscleGroup === "kondition" ? "500 m" : compound ? "6–8" : "8–12", restSec: compound ? 150 : 90 }
}

/**
 * Byt övning i en split (v38): set, reps, vila och anteckningar ligger kvar.
 * Startvikten nollas (den gällde den gamla övningen). Byte till/från kondition
 * får kondition-standarden (distans i stället för reps).
 */
export function replaceSplitExercise<T extends SplitExercise>(current: T, next: Exercise): T {
  const wasCardio = /\d\s*(m|km|min|s)\b/i.test(current.reps)
  const isCardio = next.muscleGroup === "kondition"
  const defaults = splitExerciseFor(next)
  return { ...current, exerciseId: next.id, targetKg: undefined, ...(wasCardio !== isCardio ? { reps: defaults.reps, restSec: defaults.restSec } : {}) }
}
