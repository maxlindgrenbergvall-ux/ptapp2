"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AddCustomExerciseButton } from "@/components/exercises/custom-exercise-dialog"
import { SaveAsTemplateDialog } from "@/components/workouts/save-template-dialog"
import { TemplatePicker } from "@/components/workouts/template-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { workoutExerciseFor } from "@/lib/exercises/custom"
import { ExercisePicker } from "@/components/exercises/exercise-picker"
import { SortableList } from "@/components/workouts/sortable-list"
import { type ExerciseDraft, finalizeExercises, MAX_SETS, resizeSetReps } from "@/lib/exercises/draft"
import { copyExercises, myTemplates } from "@/lib/templates"
import { cn } from "@/lib/utils"
import type { WorkoutTemplate } from "@/types/domain"

/**
 * Klientens eget pass: välj övningar och logga dem i samma passvy som PT:ns
 * pass. Passet syns för klientens PT:er som underlag men räknas aldrig som
 * ett betalt pass. Passet kan sparas som mall och mallar läses in med ett tryck.
 */
export function OwnWorkoutDialog({ className }: { className?: string }) {
  const { data, actions, me } = useAppData()
  const router = useRouter()
  const templates = myTemplates(data, me.id)
  const [templateId, setTemplateId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [date, setDate] = React.useState(todayISO())
  const [q, setQ] = React.useState("")
  const [items, setItems] = React.useState<ExerciseDraft[]>([])


  const update = (idx: number, patch: Partial<ExerciseDraft>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const reset = () => {
    setName("")
    setDate(todayISO())
    setQ("")
    setItems([])
    setTemplateId(null)
  }

  const loadTemplate = (tpl: WorkoutTemplate) => {
    setTemplateId(tpl.id)
    setName(tpl.name)
    setItems(copyExercises(tpl.exercises, () => crypto.randomUUID()))
  }

  /** Utkastet som färdiga övningar (för "Spara som mall"), eller null med ett felmeddelande. */
  const finalized = () => {
    const result = finalizeExercises(items, (id) => data.exercises.find((x) => x.id === id)?.name ?? "övningen")
    if ("error" in result) {
      toast.error(result.error)
      return null
    }
    return result.exercises
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!items.length) return toast.error("Lägg till minst en övning")
    // Fälten får vara tomma medan man skriver – kontrolleras först här.
    const exercises = finalized()
    if (!exercises) return
    const id = actions.createOwnWorkout(name, date, exercises)
    setOpen(false)
    reset()
    toast.success("Passet är skapat", { description: "Logga seten – dina PT:er ser passet som underlag." })
    router.push(`/klient/pass/${id}`)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), !o && reset())}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn("w-full", className)}>
          <Plus /> Logga eget pass
        </Button>
      </DialogTrigger>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Eget pass</DialogTitle>
            <DialogDescription>Träna på egen hand och följ din utveckling. Dina PT:er ser passet som underlag.</DialogDescription>
          </DialogHeader>
          <TemplatePicker templates={templates} activeId={templateId} onPick={loadTemplate} />
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="own-name">Namn</Label>
              <Input id="own-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Gympass ben" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="own-date">Datum</Label>
              <Input id="own-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36" />
            </div>
          </div>

          {items.length > 0 && (
            // v38: dra i handtaget (eller pil upp/ned på handtaget) för att ändra ordningen.
            <SortableList
              items={items}
              className="space-y-2"
              aria-label="Övningar i passet"
              itemLabel={(it) => data.exercises.find((x) => x.id === it.exerciseId)?.name ?? "Övningen"}
              onReorder={(ids) => setItems((prev) => ids.map((id) => prev.find((x) => x.id === id)!))}
              renderItem={(it, { handle, index: idx }) => (
                <div className="space-y-2 rounded-xl border bg-background p-3">
                  <div className="flex items-center gap-2">
                    {handle}
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{data.exercises.find((x) => x.id === it.exerciseId)?.name}</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Ta bort övningen" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Set
                      <NumberInput required min={1} max={MAX_SETS} value={it.sets} onValueChange={(v) => update(idx, { sets: v, setReps: resizeSetReps(it.setReps, v) })} aria-label="Set" />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Reps
                      <Input value={it.reps} maxLength={12} aria-invalid={!it.reps.trim() || undefined} onChange={(e) => update(idx, { reps: e.target.value })} aria-label="Reps" />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Kg
                      <NumberInput decimal min={0} max={1000} value={it.targetKg} onValueChange={(v) => update(idx, { targetKg: v })} aria-label="Kg" />
                    </label>
                  </div>
                </div>
              )}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="own-search">Lägg till övning</Label>
            {/* v38: grupperad efter muskelgrupp, med snabbfilter och sökning. */}
            <ExercisePicker
              searchId="own-search"
              searchLabel="Sök övning till det egna passet"
              listLabel="Övningar att välja"
              onQueryChange={setQ}
              excludeIds={items.map((i) => i.exerciseId)}
              onPick={(e) => setItems((prev) => [...prev, workoutExerciseFor(e, crypto.randomUUID())])}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2">
              <span className="text-xs text-muted-foreground">Saknas övningen i biblioteket?</span>
              <AddCustomExerciseButton
                initialName={q}
                onCreated={(e) => {
                  setItems((prev) => [...prev, workoutExerciseFor(e, crypto.randomUUID())])
                  setQ("")
                }}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <SaveAsTemplateDialog
              defaultName={name.trim() || "Mitt pass"}
              getExercises={finalized}
              disabled={!items.length}
              onSaved={(t) => setTemplateId(t.id)}
            />
            <Button type="submit" disabled={!items.length}>
              Starta passet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
