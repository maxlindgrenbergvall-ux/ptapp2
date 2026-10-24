"use client"

import { Plus, Search, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AddCustomExerciseButton, CustomBadge } from "@/components/exercises/custom-exercise-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { workoutExerciseFor } from "@/lib/exercises/custom"
import { cn } from "@/lib/utils"
import type { WorkoutExercise } from "@/types/domain"

/**
 * Klientens eget pass: välj övningar och logga dem i samma passvy som PT:ns
 * pass. Passet syns för klientens PT:er som underlag men räknas aldrig som
 * ett betalt pass.
 */
export function OwnWorkoutDialog({ className }: { className?: string }) {
  const { data, actions } = useAppData()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [date, setDate] = React.useState(todayISO())
  const [q, setQ] = React.useState("")
  const [items, setItems] = React.useState<WorkoutExercise[]>([])

  const query = q.trim().toLowerCase()
  // Egna övningar först, sedan övningsbanken.
  const matches = data.exercises
    .filter((e) => !items.some((i) => i.exerciseId === e.id))
    .filter((e) => !query || e.name.toLowerCase().includes(query) || e.muscleGroup.includes(query))
    .sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)))
    .slice(0, 6)

  const update = (idx: number, patch: Partial<WorkoutExercise>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const reset = () => {
    setName("")
    setDate(todayISO())
    setQ("")
    setItems([])
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!items.length) return toast.error("Lägg till minst en övning")
    const id = actions.createOwnWorkout(name, date, items)
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
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Eget pass</DialogTitle>
            <DialogDescription>Träna på egen hand och följ din utveckling. Dina PT:er ser passet som underlag.</DialogDescription>
          </DialogHeader>
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
            <ol className="space-y-2" aria-label="Övningar i passet">
              {items.map((it, idx) => (
                <li key={it.id} className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{data.exercises.find((x) => x.id === it.exerciseId)?.name}</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Ta bort övningen" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Set
                      <NumberInput min={1} max={20} value={it.sets} onValueChange={(v) => v !== undefined && update(idx, { sets: Math.min(20, Math.max(1, v)) })} aria-label="Set" />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Reps
                      <Input value={it.reps} maxLength={12} onChange={(e) => update(idx, { reps: e.target.value })} aria-label="Reps" />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Kg
                      <NumberInput decimal min={0} max={1000} value={it.targetKg} onValueChange={(v) => update(idx, { targetKg: v })} aria-label="Kg" />
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="space-y-2">
            <Label htmlFor="own-search">Lägg till övning</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="own-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök övning, t.ex. knäböj" className="pl-8" />
            </div>
            <ul className="divide-y rounded-xl border" aria-label="Övningar att välja">
              {matches.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                    onClick={() => {
                      setItems([...items, workoutExerciseFor(e, crypto.randomUUID())])
                      setQ("")
                    }}
                  >
                    <span className="truncate">{e.name}</span>
                    {e.custom && <CustomBadge className="ml-auto" />}
                    <Plus className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-3 py-3 text-center text-sm text-muted-foreground">Ingen övning hittades.</li>}
            </ul>
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!items.length}>
              Starta passet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
