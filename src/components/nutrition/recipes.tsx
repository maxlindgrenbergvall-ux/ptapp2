"use client"

import { ChefHat, Clock, Globe, Plus, Save, Search, Star } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/common"
import { FoodSearch } from "@/components/nutrition/food-search"
import { MacroInline } from "@/components/nutrition/macros"
import { FavoriteButton, GoalBadges, RecipeImage } from "@/components/nutrition/recipe-parts"
import { RecipeImportDialog } from "@/components/nutrition/recipe-import"
import { ItemList } from "@/components/pt/nutrition-builder"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { itemFromFood } from "@/lib/nutrition/meal-items"
import { GOAL_INFO, perServing, RECIPE_GOALS, suggestGoals, sumItems } from "@/lib/recipes/goals"
import { cn } from "@/lib/utils"
import type { MealItem, Recipe, RecipeGoal } from "@/types/domain"

const MAX_SERVINGS = 20
type Filter = "all" | "favorites" | RecipeGoal

/**
 * Recept-fliken (v25): klientens recept – egna och hämtade från webben – med
 * makron per portion, träningsmålskategorier, favoriter och sök. Ett tryck på
 * ett recept öppnar detaljvyn (/klient/recept/[id]).
 */
export function RecipesView() {
  const { data, me } = useAppData()
  const [filter, setFilter] = React.useState<Filter>("all")
  const [q, setQ] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const favorites = new Set(data.favoriteRecipes)
  const mine = data.recipes.filter((r) => r.trainerId === me.id)
  const query = q.trim().toLowerCase()
  const recipes = mine
    .filter((r) => (filter === "all" ? true : filter === "favorites" ? favorites.has(r.id) : r.goalTypes?.includes(filter)))
    .filter((r) => !query || r.name.toLowerCase().includes(query) || r.items.some((i) => i.name.toLowerCase().includes(query)))
    .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || a.name.localeCompare(b.name, "sv"))
  const count = (f: Filter) => (f === "all" ? mine.length : f === "favorites" ? mine.filter((r) => favorites.has(r.id)).length : mine.filter((r) => r.goalTypes?.includes(f)).length)

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recept</h1>
          <p className="text-sm text-muted-foreground">Makron per portion – sorterade efter dina träningsmål.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setImporting(true)} data-testid="import-recipe">
            <Globe /> Hämta från webben
          </Button>
          <Button onClick={() => setCreating(true)} data-testid="new-recipe">
            <Plus /> Nytt recept
          </Button>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök recept eller ingrediens" className="pl-9" aria-label="Sök recept" />
          </div>
          {/* Snabbfilter: favoriter och träningsmål. Rullar i sidled på mobil. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Filtrera recept">
            {(["all", "favorites", ...RECIPE_GOALS] as Filter[]).map((f) => {
              const active = filter === f
              return (
                <button
                  key={f}
                  role="radio"
                  aria-checked={active}
                  data-testid={`filter-${f}`}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card hover:bg-muted"
                  )}
                >
                  {f === "favorites" && <Star className={cn("size-3.5", active ? "fill-current" : "fill-warning text-warning")} />}
                  {f === "all" ? "Alla" : f === "favorites" ? "Mina favoriter" : GOAL_INFO[f].label}
                  <span className={cn("text-xs tabular", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count(f)}</span>
                </button>
              )
            })}
          </div>
          {filter !== "all" && filter !== "favorites" && <p className="text-xs text-muted-foreground">{GOAL_INFO[filter].hint}.</p>}
        </div>
      )}

      {mine.length === 0 ? (
        <EmptyState icon={ChefHat} title="Inga recept än" text="Hämta ett recept från webben eller skapa ett eget – makron räknas ut automatiskt." />
      ) : recipes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter === "favorites" ? "Inga favoriter än – tryck på stjärnan på ett recept." : "Inga recept matchar."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Mina recept">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </ul>
      )}

      <RecipeImportDialog open={importing} onOpenChange={setImporting} />
      <RecipeEditor key={creating ? "new" : "closed"} open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const portion = perServing(recipe)
  return (
    <li className="relative" data-testid="recipe-card">
      <Link
        href={`/klient/recept/${recipe.id}`}
        className="flex gap-3 rounded-2xl border border-border/70 bg-card p-2.5 pr-12 shadow-card transition-colors hover:bg-muted/40 active:scale-[0.99]"
      >
        <RecipeImage recipe={recipe} className="size-22 shrink-0 rounded-xl" />
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5">
          <span className="line-clamp-2 leading-snug font-semibold">{recipe.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular">
            <span className="font-medium text-foreground">{portion.kcal} kcal</span>
            per portion
            {recipe.totalMinutes ? (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="size-3" /> {recipe.totalMinutes} min
              </span>
            ) : null}
          </span>
          <MacroInline value={portion} />
          {recipe.goalTypes?.length ? <GoalBadges goals={recipe.goalTypes} className="mt-0.5" /> : null}
        </span>
      </Link>
      <FavoriteButton recipe={recipe} className="absolute top-1.5 right-1.5" />
    </li>
  )
}

/**
 * Skapa eller ändra ett recept: namn, portioner, ingredienser (makron räknas
 * automatiskt), tid, kategorier och steg. Importerade recept behåller källan
 * och – om källan angav dem – källans makron (omräknade om portionerna ändras).
 */
export function RecipeEditor({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (open: boolean) => void; initial?: Recipe }) {
  const { actions } = useAppData()
  const [name, setName] = React.useState(initial?.name ?? "")
  const [notes, setNotes] = React.useState(initial?.notes ?? "")
  const [servings, setServings] = React.useState<number | undefined>(initial?.servings ?? 1)
  const [minutes, setMinutes] = React.useState<number | undefined>(initial?.totalMinutes)
  const [items, setItems] = React.useState<MealItem[]>(initial?.items ?? [])
  const [steps, setSteps] = React.useState((initial?.steps ?? []).join("\n"))
  const [goals, setGoals] = React.useState<RecipeGoal[] | null>(initial?.goalTypes ?? null)
  const siteNutrition = initial?.macrosSource === "site" ? initial.nutrition : undefined
  // Källans makron gäller källans portioner: ändras antalet räknas de om.
  const nutrition =
    siteNutrition && servings && initial?.servings && servings !== initial.servings
      ? (() => {
          const f = initial.servings / servings
          return { kcal: siteNutrition.kcal * f, protein: siteNutrition.protein * f, carbs: siteNutrition.carbs * f, fat: siteNutrition.fat * f }
        })()
      : siteNutrition
  const portion = perServing({ items, servings: servings || 1, nutrition })
  const total = nutrition ? { kcal: nutrition.kcal * (servings || 1), protein: nutrition.protein * (servings || 1), carbs: nutrition.carbs * (servings || 1), fat: nutrition.fat * (servings || 1) } : sumItems(items)
  // Utan egna val föreslås kategorierna utifrån makrona.
  const chosen = goals ?? suggestGoals(portion, minutes)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return toast.error("Ge receptet ett namn")
    if (!items.length) return toast.error("Lägg till minst en ingrediens")
    if (!servings || servings < 1 || servings > MAX_SERVINGS) return toast.error(`Ange antal portioner (1–${MAX_SERVINGS})`)
    if (minutes !== undefined && (minutes < 0 || minutes > 1440)) return toast.error("Tiden ska vara 0–1440 minuter")
    const roundedNutrition = nutrition && {
      kcal: Math.round(nutrition.kcal),
      protein: Math.round(nutrition.protein * 10) / 10,
      carbs: Math.round(nutrition.carbs * 10) / 10,
      fat: Math.round(nutrition.fat * 10) / 10,
    }
    actions.saveRecipe({
      ...(initial ?? {}),
      id: initial?.id ?? actions.newId(),
      name: name.trim().slice(0, 120),
      notes: notes.trim().slice(0, 2000),
      items,
      servings,
      totalMinutes: minutes,
      goalTypes: chosen,
      steps: steps.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 60),
      nutrition: roundedNutrition,
      macrosSource: initial?.macrosSource ?? "manual",
    })
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
          <div className="space-y-1.5">
            <Label htmlFor="recipe-name">Namn</Label>
            <Input id="recipe-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Kycklinggryta" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="recipe-servings">Portioner</Label>
              <NumberInput id="recipe-servings" required min={1} max={MAX_SERVINGS} value={servings} onValueChange={setServings} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipe-minutes">Tid (min)</Label>
              <NumberInput id="recipe-minutes" min={0} max={1440} value={minutes} onValueChange={setMinutes} placeholder="Valfritt" />
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
                <dt className="text-xs text-muted-foreground">Per portion{siteNutrition ? " (från källan)" : ""}</dt>
                <dd className="font-medium tabular" data-testid="recipe-portion-kcal">
                  {portion.kcal} kcal
                </dd>
                <dd>
                  <MacroInline value={portion} />
                </dd>
              </div>
            </dl>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Kategorier</legend>
            <div className="flex flex-wrap gap-1.5">
              {RECIPE_GOALS.map((g) => {
                const on = chosen.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    title={GOAL_INFO[g].hint}
                    onClick={() => setGoals(on ? chosen.filter((x) => x !== g) : [...chosen, g])}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {GOAL_INFO[g].label}
                  </button>
                )
              })}
            </div>
            {goals === null && <p className="text-xs text-muted-foreground">Förslag utifrån makrona – tryck för att ändra.</p>}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="recipe-steps">Gör så här (ett steg per rad)</Label>
            <Textarea id="recipe-steps" rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"Koka riset.\nStek kycklingen."} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipe-notes">Anteckningar (valfritt)</Label>
            <Textarea id="recipe-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
