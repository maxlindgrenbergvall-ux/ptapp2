"use client"

import { Clock, Minus, Pencil, Plus, Trash2, Users, Utensils } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { LogRecipeDialog } from "@/components/nutrition/log-recipe-dialog"
import { MacroDot } from "@/components/nutrition/macros"
import { FavoriteButton, GoalBadges, RecipeImage } from "@/components/nutrition/recipe-parts"
import { Button } from "@/components/ui/button"
import { confirmDialog } from "@/components/ui/confirm"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useAppData } from "@/lib/data/store"
import { formatAmount, perServing } from "@/lib/recipes/goals"
import { cn } from "@/lib/utils"
import type { Recipe } from "@/types/domain"

/**
 * Receptet i en pop-up (bottenpanel på mobilen, centrerad på större skärmar):
 * stor bild, makron per portion som badges, ingredienser i gram/dl som skalas
 * med antalet portioner, numrerade steg, favoritstjärna och "Logga i
 * kostdagboken". Egna recept kan ändras och tas bort; bibliotekets kan inte.
 */
export function RecipeSheet({
  recipe,
  open,
  onOpenChange,
  onEdit,
}: {
  recipe: Recipe | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (recipe: Recipe) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Rullar inuti panelen (inte sidan bakom): overscroll-contain + touch-pan-y för iOS-webbvyn i Capacitor.
        className="mx-auto max-h-[92svh] w-full max-w-full gap-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-3xl p-0 touch-pan-y [-webkit-overflow-scrolling:touch] sm:max-w-lg"
        data-testid="recipe-sheet"
      >
        {recipe && <RecipeSheetBody key={recipe.id} recipe={recipe} onClose={() => onOpenChange(false)} onEdit={onEdit} />}
      </SheetContent>
    </Sheet>
  )
}

function RecipeSheetBody({ recipe, onClose, onEdit }: { recipe: Recipe; onClose: () => void; onEdit?: (recipe: Recipe) => void }) {
  const { actions } = useAppData()
  const base = recipe.servings ?? 1
  const [servings, setServings] = React.useState(base)
  const [logging, setLogging] = React.useState(false)
  const factor = servings / base
  const portion = perServing(recipe)
  const steps = recipe.steps ?? []
  const badges = [
    { key: "kcal", label: "kcal", value: portion.kcal, macro: null },
    { key: "protein", label: "Protein", value: portion.protein, macro: "protein" as const },
    { key: "carbs", label: "Kolh.", value: portion.carbs, macro: "carbs" as const },
    { key: "fat", label: "Fett", value: portion.fat, macro: "fat" as const },
  ]

  return (
    <article data-testid="recipe-detail">
      <div className="relative">
        <RecipeImage recipe={recipe} className="aspect-video w-full" />
        {/* Handtag för att dra ned panelen. */}
        <span aria-hidden className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-background/70" />
        <FavoriteButton recipe={recipe} onImage className="absolute top-3 left-3" />
      </div>

      <div className="space-y-6 px-4 pt-4 pb-6">
        <header className="space-y-2">
          <SheetTitle className="text-xl leading-tight font-bold tracking-tight break-words sm:text-2xl">{recipe.name}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {recipe.totalMinutes ? (
                <span className="inline-flex items-center gap-1" data-testid="recipe-time">
                  <Clock className="size-4" /> {recipe.totalMinutes} min
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Users className="size-4" /> {base} {base === 1 ? "portion" : "portioner"}
              </span>
              <span>{recipe.library ? "Coaviras recept" : "Ditt recept"}</span>
            </div>
          </SheetDescription>
          {recipe.goalTypes?.length ? <GoalBadges goals={recipe.goalTypes} /> : null}
        </header>

        <section aria-labelledby="macros-title" className="space-y-2">
          <h3 id="macros-title" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Per portion
          </h3>
          <ul className="grid grid-cols-4 gap-2" data-testid="macro-badges">
            {badges.map((b) => (
              <li key={b.key} className={cn("min-w-0 rounded-2xl border border-border/70 bg-card px-1.5 py-2 text-center shadow-card", b.macro === null && "bg-primary/10")}>
                <span className="block text-lg leading-tight font-bold tabular">
                  {Math.round(b.value)}
                  {b.macro && <span className="text-xs font-medium"> g</span>}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center justify-center gap-1 truncate text-[11px] text-muted-foreground">
                  {b.macro && <MacroDot macro={b.macro} />}
                  {b.label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Button size="lg" className="h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90" onClick={() => setLogging(true)} data-testid="log-recipe">
          <Utensils /> Logga i kostdagboken
        </Button>

        <section aria-labelledby="ingredients-title" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="ingredients-title" className="text-lg font-semibold">
              Ingredienser
            </h3>
            <div className="flex items-center rounded-full border bg-card" role="group" aria-label="Antal portioner">
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40"
                aria-label="Färre portioner"
                disabled={servings <= 1}
                onClick={() => setServings(Math.max(1, servings - 1))}
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-20 text-center text-sm tabular" aria-live="polite" data-testid="servings-shown">
                {servings} {servings === 1 ? "portion" : "portioner"}
              </span>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40"
                aria-label="Fler portioner"
                disabled={servings >= 40}
                onClick={() => setServings(Math.min(40, servings + 1))}
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card shadow-card" data-testid="ingredient-list">
            {recipe.items.map((i, idx) => {
              const amount = formatAmount(i, factor)
              return (
                <li key={idx} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 break-words">{i.name}</span>
                  <span className="shrink-0 font-medium tabular">{amount ?? <span className="font-normal text-muted-foreground">efter smak</span>}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {steps.length > 0 && (
          <section aria-labelledby="steps-title" className="space-y-3">
            <h3 id="steps-title" className="text-lg font-semibold">
              Gör så här
            </h3>
            <ol className="space-y-3" data-testid="step-list">
              {steps.map((s, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular">{idx + 1}</span>
                  <p className="min-w-0 pt-0.5 leading-relaxed break-words">{s}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {recipe.notes && <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm whitespace-pre-line">{recipe.notes}</p>}

        {!recipe.library && (
          <div className="grid grid-cols-2 gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onEdit?.(recipe)}>
              <Pencil /> Ändra
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!(await confirmDialog({ title: `Ta bort "${recipe.name}"?`, confirmLabel: "Ta bort", destructive: true }))) return
                actions.deleteRecipe(recipe.id)
                toast("Receptet är borttaget")
                onClose()
              }}
            >
              <Trash2 /> Ta bort
            </Button>
          </div>
        )}
      </div>

      <LogRecipeDialog key={logging ? "open" : "closed"} recipe={recipe} open={logging} onOpenChange={setLogging} onLogged={onClose} />
    </article>
  )
}
