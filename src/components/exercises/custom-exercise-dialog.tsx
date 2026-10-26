"use client"

/**
 * "Lägg till egen övning": för klienter och PT:er när en övning saknas i
 * övningsbanken. Övningen sparas i custom_exercises (kopplad till användaren)
 * och läggs direkt i passet via `onCreated`, med sina förslag på set, reps
 * och startvikt.
 */
import { PencilLine } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"
import type { Exercise, MuscleGroup, WeightUnit } from "@/types/domain"

export const MUSCLE_GROUPS: MuscleGroup[] = ["ben", "bröst", "rygg", "axlar", "armar", "bål", "helkropp", "kondition"]

export function AddCustomExerciseButton({
  initialName = "",
  onCreated,
  className,
  variant = "outline",
  size = "sm",
}: {
  /** T.ex. det klienten sökte på. */
  initialName?: string
  onCreated: (exercise: Exercise) => void
  className?: string
  variant?: "outline" | "ghost" | "secondary"
  size?: "sm" | "default"
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <PencilLine /> Lägg till egen övning
      </Button>
      <CustomExerciseDialog open={open} onOpenChange={setOpen} initialName={initialName} onCreated={onCreated} />
    </>
  )
}

export function CustomExerciseDialog({
  open,
  onOpenChange,
  initialName = "",
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onCreated: (exercise: Exercise) => void
}) {
  const { actions } = useAppData()
  const [name, setName] = React.useState(initialName)
  const [weight, setWeight] = React.useState<number | undefined>(undefined)
  const [unit, setUnit] = React.useState<WeightUnit>("kg")
  const [sets, setSets] = React.useState<number | undefined>(3)
  const [reps, setReps] = React.useState("10")
  const [group, setGroup] = React.useState<MuscleGroup>("helkropp")
  const [error, setError] = React.useState<string | null>(null)

  // Ny öppning: börja om med det användaren sökte på som namn.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(initialName.trim())
      setWeight(undefined)
      setUnit("kg")
      setSets(3)
      setReps("10")
      setGroup("helkropp")
      setError(null)
    }
  }

  const submit = (e: React.FormEvent) => {
    // Dialogen kan ligga i ett annat formulär (t.ex. Eget pass) – skicka inte det.
    e.preventDefault()
    e.stopPropagation()
    const res = actions.addCustomExercise({ name, defaultWeight: weight, weightUnit: unit, defaultSets: sets ?? 3, defaultReps: reps, muscleGroup: group })
    if (res.error || !res.exercise) return setError(res.error ?? "Övningen kunde inte sparas.")
    toast.success(`${res.exercise.name} är tillagd`, { description: "Den finns nu bland dina övningar och i passet." })
    onCreated(res.exercise)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="custom-exercise-dialog">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Lägg till egen övning</DialogTitle>
            <DialogDescription>Saknas övningen i biblioteket? Lägg till den – den sparas på ditt konto och läggs direkt i passet.</DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cx-name">Övningsnamn</Label>
            <Input id="cx-name" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} placeholder="T.ex. Landmine press" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cx-weight">Startvikt / standardvikt</Label>
            <div className="flex gap-2">
              <NumberInput
                id="cx-weight"
                decimal
                min={0}
                max={1000}
                value={weight}
                onValueChange={setWeight}
                placeholder="Valfritt"
                className="flex-1"
              />
              <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label="Viktenhet">
                {(["kg", "lbs"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={unit === u}
                    onClick={() => setUnit(u)}
                    className={cn("rounded px-3 text-sm font-medium transition-colors", unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Lämna tomt för kroppsviktsövningar. Pass loggas i kg (lbs räknas om).</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cx-sets">Set</Label>
              <NumberInput id="cx-sets" min={1} max={20} value={sets} onValueChange={setSets} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cx-reps">Reps</Label>
              <Input id="cx-reps" value={reps} maxLength={12} onChange={(e) => setReps(e.target.value)} placeholder="T.ex. 8–10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Muskelgrupp</Label>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Muskelgrupp">
              {MUSCLE_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={group === g}
                  onClick={() => setGroup(g)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
                    group === g ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Spara och lägg i passet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Märket "Egen" på egna övningar i listorna. */
export function CustomBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("h-5 shrink-0 px-1.5 text-[10px] font-medium", className)}>
      Egen
    </Badge>
  )
}
