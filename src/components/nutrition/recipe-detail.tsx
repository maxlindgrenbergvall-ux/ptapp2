"use client"

import { ArrowLeft, ChefHat, Clock, ExternalLink, Minus, Pencil, Plus, Trash2, Utensils, Users } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/common"
import { LogRecipeDialog } from "@/components/nutrition/log-recipe-dialog"
import { MacroDot } from "@/components/nutrition/macros"
import { FavoriteButton, GoalBadges, RecipeImage } from "@/components/nutrition/recipe-parts"
import { RecipeEditor } from "@/components/nutrition/recipes"
import { Button } from "@/components/ui/button"
import { confirmDialog } from "@/components/ui/confirm"
import { useAppData } from "@/lib/data/store"
import { formatAmount, perServing } from "@/lib/recipes/goals"
import { cn } from "@/lib/utils"

/**
 * Receptets detaljvy (/klient/recept/[id]): stor bild, tid, makron per portion,
 * ingredienser i metriska mått som skalas med antalet portioner, numrerade steg
 * och "Logga i kostdagboken".
 */
export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const { data, me, actions } = useAppData()
  const router = useRouter()
  const recipe = data.recipes.find((r) => r.id === recipeId && r.trainerId === me.id)
  const [servings, setServings] = React.useState<number | null>(null)
  const [logging, setLogging] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  if (!recipe) {
    return (
      <div className="space-y-4 py-8">
        <EmptyState icon={ChefHat} title="Receptet hittades inte" text="Det kan ha tagits bort." />
        <Button asChild variant="outline" className="w-full">
          <Link href="/klient/recept">Till recepten</Link>
        </Button>
      </div>
    )
  }

  const base = recipe.servings ?? 1
  const shown = servings ?? base
  const factor = shown / base
  const portion = perServing(recipe)
  const steps = recipe.steps ?? []
  const badges = [
    { key: "kcal", label: "kcal", value: portion.kcal, macro: null },
    { key: "protein", label: "Protein", value: portion.protein, macro: "protein" as const },
    { key: "carbs", label: "Kolhydrater", value: portion.carbs, macro: "carbs" as const },
    { key: "fat", label: "Fett", value: portion.fat, macro: "fat" as const },
  ]

  return (
    <article className="-mx-4 -mt-4 pb-4" data-testid="recipe-detail">
      {/* Bild i full bredd med tillbaka och stjärna ovanpå. */}
      <div className="relative">
        <RecipeImage recipe={recipe} className="aspect-[4/3] w-full sm:aspect-[16/9]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/30 to-transparent" />
        <button
          type="button"
          aria-label="Tillbaka till recepten"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/klient/recept"))}
          className="absolute top-3 left-3 flex size-11 items-center justify-center rounded-full bg-background/80 shadow-sm backdrop-blur active:scale-95"
        >
          <ArrowLeft className="size-5" />
        </button>
        <FavoriteButton recipe={recipe} onImage className="absolute top-3 right-3" />
      </div>

      <div className="space-y-6 px-4 pt-4">
        <header className="space-y-2">
          <h1 className="text-2xl leading-tight font-bold tracking-tight">{recipe.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {recipe.totalMinutes ? (
              <span className="inline-flex items-center gap-1" data-testid="recipe-time">
                <Clock className="size-4" /> {recipe.totalMinutes} min
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Users className="size-4" /> {base} {base === 1 ? "portion" : "portioner"}
            </span>
            {recipe.sourceUrl && (
              <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                <ExternalLink className="size-3.5" /> {recipe.sourceName ?? "Källa"}
              </a>
            )}
          </div>
          {recipe.goalTypes?.length ? <GoalBadges goals={recipe.goalTypes} /> : null}
        </header>

        {/* Makron per portion. */}
        <section aria-labelledby="macros-title" className="space-y-2">
          <h2 id="macros-title" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Per portion{recipe.macrosSource === "estimated" ? " · uppskattat" : recipe.macrosSource === "site" ? " · från källan" : ""}
          </h2>
          <ul className="grid grid-cols-4 gap-2" data-testid="macro-badges">
            {badges.map((b) => (
              <li key={b.key} className={cn("rounded-2xl border border-border/70 bg-card px-2 py-2.5 text-center shadow-card", b.macro === null && "bg-primary/10")}>
                <span className="block text-lg leading-tight font-bold tabular">
                  {Math.round(b.value)}
                  {b.macro && <span className="text-xs font-medium"> g</span>}
                </span>
                <span className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
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

        {/* Ingredienser: metriska mått som skalas med valt antal portioner. */}
        <section aria-labelledby="ingredients-title" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="ingredients-title" className="text-lg font-semibold">
              Ingredienser
            </h2>
            <div className="flex items-center rounded-full border bg-card" role="group" aria-label="Antal portioner">
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40"
                aria-label="Färre portioner"
                disabled={shown <= 1}
                onClick={() => setServings(Math.max(1, shown - 1))}
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-20 text-center text-sm tabular" aria-live="polite" data-testid="servings-shown">
                {shown} {shown === 1 ? "portion" : "portioner"}
              </span>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40"
                aria-label="Fler portioner"
                disabled={shown >= 40}
                onClick={() => setServings(Math.min(40, shown + 1))}
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
                  <span className="min-w-0">{i.name}</span>
                  <span className="shrink-0 font-medium tabular">{amount ?? <span className="font-normal text-muted-foreground">efter smak</span>}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {steps.length > 0 && (
          <section aria-labelledby="steps-title" className="space-y-3">
            <h2 id="steps-title" className="text-lg font-semibold">
              Gör så här
            </h2>
            <ol className="space-y-3" data-testid="step-list">
              {steps.map((s, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular">{idx + 1}</span>
                  <p className="pt-0.5 leading-relaxed">{s}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {recipe.notes && <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm whitespace-pre-line">{recipe.notes}</p>}

        <div className="grid grid-cols-2 gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Ändra
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (!(await confirmDialog({ title: `Ta bort "${recipe.name}"?`, confirmLabel: "Ta bort", destructive: true }))) return
              actions.deleteRecipe(recipe.id)
              toast("Receptet är borttaget")
              router.push("/klient/recept")
            }}
          >
            <Trash2 /> Ta bort
          </Button>
        </div>
      </div>

      <LogRecipeDialog key={logging ? "open" : "closed"} recipe={recipe} open={logging} onOpenChange={setLogging} />
      <RecipeEditor key={editing ? "edit" : "closed"} open={editing} onOpenChange={setEditing} initial={recipe} />
    </article>
  )
}
