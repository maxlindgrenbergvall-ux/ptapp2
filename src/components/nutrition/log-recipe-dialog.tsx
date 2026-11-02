"use client"

import { Utensils } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { MacroInline } from "@/components/nutrition/macros"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, todayISO } from "@/lib/date"
import { MEAL_LABEL, MEAL_TYPES, perServing, scaleMacros } from "@/lib/recipes/goals"
import { cn } from "@/lib/utils"
import type { MealType, Recipe } from "@/types/domain"

const PORTIONS = [0.5, 1, 1.5, 2, 3]
const MAX_PORTIONS = 20

/** Föreslagen måltid utifrån klockan. */
function mealNow(): MealType {
  const h = new Date().getHours()
  return h < 10 ? "breakfast" : h < 14 ? "lunch" : h >= 17 && h < 21 ? "dinner" : "snack"
}

const fmt = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 2 })

/**
 * "Logga i kostdagboken": välj datum, måltid och antal portioner. Makrona
 * räknas om för portionerna och sparas som en post i kostdagboken (food_entries,
 * med måltid och koppling till receptet).
 */
export function LogRecipeDialog({ recipe, open, onOpenChange }: { recipe: Recipe; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { actions } = useAppData()
  const router = useRouter()
  const today = todayISO()
  const [date, setDate] = React.useState(today)
  const [meal, setMeal] = React.useState<MealType>(mealNow)
  const [portions, setPortions] = React.useState<number | undefined>(1)
  const per = perServing(recipe)
  const valid = portions !== undefined && portions > 0 && portions <= MAX_PORTIONS
  const total = scaleMacros(per, valid ? portions : 0)
  // Inom en månad bakåt och en vecka framåt (t.ex. matlåda till imorgon).
  const minDate = addDays(today, -30)
  const maxDate = addDays(today, 7)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return toast.error(`Ange antal portioner (0,25–${MAX_PORTIONS})`)
    if (!date || date < minDate || date > maxDate) return toast.error("Välj ett datum inom en månad bakåt eller en vecka framåt")
    const name = `${recipe.name} (${fmt(portions)} ${portions === 1 ? "portion" : "portioner"})`.slice(0, 120)
    const grams = Math.round(per.grams * portions)
    actions.addFoodEntry(date, {
      name,
      ...total,
      ...(grams > 0 && grams <= 5000 ? { grams } : {}),
      meal,
      recipeId: recipe.id,
    })
    onOpenChange(false)
    toast.success(`${MEAL_LABEL[meal]}: ${recipe.name} är loggat`, {
      description: `${total.kcal} kcal ${date === today ? "idag" : formatDay(date).toLowerCase()}.`,
      action: { label: "Visa kostdagboken", onClick: () => router.push(`/klient?datum=${date}#dagens-kost`) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="log-recipe-dialog">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Logga i kostdagboken</DialogTitle>
            <DialogDescription className="line-clamp-2">{recipe.name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="log-date">Datum</Label>
            <Input id="log-date" type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Måltid</legend>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Måltid">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={meal === m}
                  onClick={() => setMeal(m)}
                  className={cn(
                    "h-11 rounded-xl border text-sm transition-colors",
                    meal === m ? "border-primary bg-primary font-medium text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {MEAL_LABEL[m]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Antal portioner</legend>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Antal portioner">
              {PORTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={portions === p}
                  onClick={() => setPortions(p)}
                  className={cn(
                    "h-11 flex-1 rounded-xl border text-sm tabular transition-colors",
                    portions === p ? "border-primary bg-primary font-medium text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {fmt(p)}
                </button>
              ))}
              <NumberInput
                decimal
                min={0.25}
                max={MAX_PORTIONS}
                value={portions}
                onValueChange={setPortions}
                required
                aria-label="Annat antal portioner"
                className="h-11 w-16 text-center tabular"
              />
            </div>
          </fieldset>

          <div className="rounded-xl bg-muted/60 px-4 py-3" aria-live="polite">
            <p className="text-2xl font-bold tracking-tight tabular" data-testid="log-kcal">
              {total.kcal} <span className="text-sm font-medium text-muted-foreground">kcal</span>
            </p>
            <MacroInline value={total} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!valid} data-testid="confirm-log">
              <Utensils /> Logga {MEAL_LABEL[meal].toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
