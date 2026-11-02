"use client"

import { ChefHat, ChevronDown, Pencil, Plus, Save, Trash2, Utensils } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/common"
import { FoodSearch } from "@/components/nutrition/food-search"
import { MacroInline, MacroSplitBar, sumMacros } from "@/components/nutrition/macros"
import { ItemList } from "@/components/pt/nutrition-builder"
import { Button } from "@/components/ui/button"
import { confirmDialog } from "@/components/ui/confirm"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { itemFromFood } from "@/lib/nutrition/meal-items"
import { cn } from "@/lib/utils"
import type { MealItem, Recipe } from "@/types/domain"

const MAX_SERVINGS = 20

/** Makron per portion, avrundade (kcal och gram). */
export function perServing(recipe: Pick<Recipe, "items" | "servings">) {
  const total = sumMacros(recipe.items)
  const n = Math.max(1, recipe.servings ?? 1)
  const grams = recipe.items.reduce((s, i) => s + i.grams, 0)
  return {
    kcal: Math.round(total.kcal / n),
    protein: Math.round((total.protein / n) * 10) / 10,
    carbs: Math.round((total.carbs / n) * 10) / 10,
    fat: Math.round((total.fat / n) * 10) / 10,
    grams: Math.round(grams / n),
  }
}

/**
 * Recept-fliken: klientens egna recept med ingredienser och automatiskt
 * uträknade makron (kalorier, protein, kolhydrater, fett) – totalt och per
 * portion. En portion loggas i Dagens kost med ett tryck.
 * (Import av recept från webben kommer i en senare version.)
 */
export function RecipesView() {
  const { data, me } = useAppData()
  const recipes = data.recipes.filter((r) => r.trainerId === me.id).sort((a, b) => a.name.localeCompare(b.name, "sv"))
  const [editing, setEditing] = React.useState<Recipe | "new" | null>(null)

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recept</h1>
          <p className="text-sm text-muted-foreground">Dina favoriter med makron per portion.</p>
        </div>
        <Button onClick={() => setEditing("new")} data-testid="new-recipe">
          <Plus /> Nytt recept
        </Button>
      </div>

      {recipes.length === 0 ? (
        <EmptyState icon={ChefHat} title="Inga recept än" text="Skapa ett recept av livsmedel – kalorier och makron räknas ut automatiskt." />
      ) : (
        <ul className="space-y-3" aria-label="Mina recept">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} onEdit={() => setEditing(r)} />
          ))}
        </ul>
      )}

      <RecipeEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing && editing !== "new" ? editing : undefined}
      />
    </div>
  )
}

function RecipeCard({ recipe, onEdit }: { recipe: Recipe; onEdit: () => void }) {
  const { actions } = useAppData()
  const [open, setOpen] = React.useState(false)
  const portion = perServing(recipe)
  const servings = recipe.servings ?? 1
  const panelId = `recipe-${recipe.id}`

  return (
    <li className="rounded-2xl border border-border/70 bg-card shadow-card" data-testid="recipe-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ChefHat className="size-5" />
        </span>
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="block truncate font-semibold">{recipe.name}</span>
          <span className="block text-xs text-muted-foreground tabular">
            {portion.kcal} kcal per portion · {servings} {servings === 1 ? "portion" : "portioner"}
          </span>
          <MacroInline value={portion} />
          <MacroSplitBar value={portion} />
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 border-t border-border/60 px-4 pt-3 pb-4">
          <ul className="space-y-1 text-sm" aria-label="Ingredienser">
            {recipe.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{i.name}</span>
                <span className="shrink-0 text-muted-foreground tabular">
                  {i.unit && i.unit !== "g" ? `${i.qty ?? 1} ${i.unit}` : `${Math.round(i.grams)} g`} · {Math.round(i.kcal)} kcal
                </span>
              </li>
            ))}
          </ul>
          {recipe.notes && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-line">{recipe.notes}</p>}
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                actions.addFoodEntry(todayISO(), {
                  name: servings > 1 ? `${recipe.name} (1 portion)` : recipe.name,
                  kcal: portion.kcal,
                  protein: portion.protein,
                  carbs: portion.carbs,
                  fat: portion.fat,
                  grams: portion.grams,
                })
                toast.success(`${recipe.name} är loggat`, { description: `${portion.kcal} kcal i dagens kost.` })
              }}
            >
              <Utensils /> Logga en portion
            </Button>
            <Button variant="outline" size="icon" aria-label={`Ändra ${recipe.name}`} onClick={onEdit}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Ta bort ${recipe.name}`}
              onClick={async () => {
                if (!(await confirmDialog({ title: `Ta bort "${recipe.name}"?`, confirmLabel: "Ta bort", destructive: true }))) return
                actions.deleteRecipe(recipe.id)
                toast("Receptet är borttaget")
              }}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function RecipeEditor({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (open: boolean) => void; initial?: Recipe }) {
  const { actions } = useAppData()
  const [name, setName] = React.useState(initial?.name ?? "")
  const [notes, setNotes] = React.useState(initial?.notes ?? "")
  const [servings, setServings] = React.useState<number | undefined>(initial?.servings ?? 1)
  const [items, setItems] = React.useState<MealItem[]>(initial?.items ?? [])
  const total = sumMacros(items)
  const portion = perServing({ items, servings: servings || 1 })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return toast.error("Ge receptet ett namn")
    if (!items.length) return toast.error("Lägg till minst en ingrediens")
    if (!servings || servings < 1 || servings > MAX_SERVINGS) return toast.error(`Ange antal portioner (1–${MAX_SERVINGS})`)
    actions.saveRecipe({ id: initial?.id ?? actions.newId(), name: name.trim().slice(0, 80), notes: notes.trim().slice(0, 2000), items, servings })
    toast.success(`"${name.trim()}" är sparat`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form className="space-y-4" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{initial ? "Ändra recept" : "Nytt recept"}</DialogTitle>
            <DialogDescription>Lägg till ingredienser – kalorier och makron räknas ut automatiskt.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="recipe-name">Namn</Label>
              <Input id="recipe-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Kycklinggryta" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipe-servings">Portioner</Label>
              <NumberInput id="recipe-servings" required min={1} max={MAX_SERVINGS} value={servings} onValueChange={setServings} />
            </div>
          </div>
          <div className="rounded-xl border">
            <ItemList items={items} onChange={setItems} />
            <div className="p-3">
              <FoodSearch placeholder="Lägg till ingrediens…" onPick={(f) => setItems([...items, itemFromFood(f)])} />
            </div>
            <dl className="grid grid-cols-2 gap-2 border-t px-4 py-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Totalt</dt>
                <dd className="font-medium tabular">{Math.round(total.kcal)} kcal</dd>
                <dd>
                  <MacroInline value={total} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Per portion</dt>
                <dd className="font-medium tabular" data-testid="recipe-portion-kcal">
                  {portion.kcal} kcal
                </dd>
                <dd>
                  <MacroInline value={portion} />
                </dd>
              </div>
            </dl>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipe-notes">Gör så här (valfritt)</Label>
            <Textarea id="recipe-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit">
              <Save /> Spara recept
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
