"use client"

import { AlertCircle, ArrowRightLeft, Clock, Globe, Loader2, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { MacroInline } from "@/components/nutrition/macros"
import { RecipeImage } from "@/components/nutrition/recipe-parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { formatAmount, GOAL_INFO, RECIPE_GOALS } from "@/lib/recipes/goals"
import type { ImportedRecipe } from "@/lib/recipes/import"
import { cn } from "@/lib/utils"
import type { RecipeGoal } from "@/types/domain"

/**
 * Hämta ett recept från en webbadress. Servern läser receptet (JSON-LD eller
 * HTML), räknar om amerikanska mått till metriska och ser till att makron per
 * portion finns. Här förhandsgranskas det – portioner och kategorier kan
 * ändras – innan det sparas i receptsamlingen.
 */
export function RecipeImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { actions } = useAppData()
  const router = useRouter()
  const [url, setUrl] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [recipe, setRecipe] = React.useState<ImportedRecipe | null>(null)
  const [servings, setServings] = React.useState<number | undefined>()
  const [goals, setGoals] = React.useState<RecipeGoal[]>([])

  const reset = () => {
    setUrl("")
    setError(null)
    setRecipe(null)
    setPending(false)
  }

  const fetchRecipe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isWebUrl(url.trim())) return setError("Klistra in hela adressen, t.ex. https://www.ica.se/recept/…")
    setPending(true)
    setError(null)
    try {
      const res = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      const body = (await res.json().catch(() => ({}))) as { recipe?: ImportedRecipe; error?: string }
      if (!res.ok || !body.recipe) {
        setError(body.error ?? (res.status === 429 ? "För många hämtningar – vänta en stund och försök igen." : "Receptet kunde inte hämtas."))
        return
      }
      setRecipe(body.recipe)
      setServings(body.recipe.servings)
      setGoals(body.recipe.goalTypes)
    } catch {
      setError("Ingen uppkoppling. Kontrollera nätet och försök igen.")
    } finally {
      setPending(false)
    }
  }

  const save = () => {
    if (!recipe) return
    if (!servings || servings < 1 || servings > 20) return toast.error("Ange antal portioner (1–20)")
    // Källans makron gäller per portion av källans antal – räkna om om antalet ändrats.
    const f = recipe.servings / servings
    const nutrition =
      recipe.macrosSource === "site"
        ? {
            kcal: Math.round(recipe.nutrition.kcal * f),
            protein: Math.round(recipe.nutrition.protein * f * 10) / 10,
            carbs: Math.round(recipe.nutrition.carbs * f * 10) / 10,
            fat: Math.round(recipe.nutrition.fat * f * 10) / 10,
          }
        : undefined // uppskattade makron räknas ur ingredienserna (samma värden)
    const id = actions.newId()
    actions.saveRecipe({
      id,
      name: recipe.name,
      notes: "",
      items: recipe.items,
      servings,
      goalTypes: goals,
      imageUrl: recipe.imageUrl,
      sourceUrl: recipe.sourceUrl,
      sourceName: recipe.sourceName,
      steps: recipe.steps,
      totalMinutes: recipe.totalMinutes,
      nutrition,
      macrosSource: recipe.macrosSource,
    })
    toast.success(`"${recipe.name}" är sparat`, { description: recipe.convertedUnits ? `${recipe.convertedUnits} amerikanska mått omräknade till metriska.` : undefined })
    onOpenChange(false)
    reset()
    router.push(`/klient/recept/${id}`)
  }

  const portion = recipe && servings ? scaleTo(recipe, servings) : null

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), !o && reset())}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" data-testid="recipe-import-dialog">
        <DialogHeader>
          <DialogTitle>Hämta recept från webben</DialogTitle>
          <DialogDescription>
            Klistra in adressen till ett recept. Mått räknas om till gram och dl, och makron per portion följer med – recept utan näringsvärden hämtas inte.
          </DialogDescription>
        </DialogHeader>

        {!recipe ? (
          <form onSubmit={fetchRecipe} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="recipe-url">Webbadress</Label>
              <Input
                id="recipe-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "recipe-url-error" : undefined}
              />
            </div>
            {error && (
              <p id="recipe-url-error" role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="import-error">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending || !url.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Globe />} {pending ? "Hämtar receptet…" : "Hämta recept"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4" data-testid="import-preview">
            <div className="flex gap-3">
              <RecipeImage recipe={recipe} className="size-20 shrink-0 rounded-xl" />
              <div className="min-w-0 space-y-1">
                <p className="line-clamp-2 font-semibold">{recipe.name}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {recipe.sourceName}
                  {recipe.totalMinutes ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="size-3" /> {recipe.totalMinutes} min
                    </span>
                  ) : null}
                </p>
                {portion && (
                  <>
                    <p className="text-sm font-medium tabular" data-testid="import-kcal">
                      {portion.kcal} kcal per portion
                    </p>
                    <MacroInline value={portion} />
                  </>
                )}
                <p className="text-xs text-muted-foreground">{recipe.macrosSource === "site" ? "Näringsvärden från källan" : "Näringsvärden uppskattade ur ingredienserna"}</p>
              </div>
            </div>

            <div className="grid grid-cols-[6rem_1fr] items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="import-servings">Portioner</Label>
                <NumberInput id="import-servings" required min={1} max={20} value={servings} onValueChange={setServings} />
              </div>
              {recipe.servingsAssumed && <p className="pb-2 text-xs text-warning">Sidan angav inte antal portioner – kontrollera.</p>}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Kategorier</legend>
              <div className="flex flex-wrap gap-1.5">
                {RECIPE_GOALS.map((g) => {
                  const on = goals.includes(g)
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      title={GOAL_INFO[g].hint}
                      onClick={() => setGoals(on ? goals.filter((x) => x !== g) : [...goals, g])}
                      className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                    >
                      {GOAL_INFO[g].label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <details className="rounded-xl border px-3 py-2 text-sm" open>
              <summary className="cursor-pointer font-medium">
                {recipe.items.length} ingredienser{recipe.convertedUnits ? ` · ${recipe.convertedUnits} omräknade till metriskt` : ""}
              </summary>
              <ul className="mt-2 space-y-1" data-testid="import-ingredients">
                {recipe.items.map((i, idx) => {
                  const amount = formatAmount(i)
                  // Visa originalraden när ett amerikanskt mått räknats om ("1 cup flour" → 125 g).
                  const converted = Boolean(amount && i.original && US_UNIT.test(i.original))
                  return (
                    <li key={idx} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        {i.name}
                        {converted && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                            <ArrowRightLeft className="size-3" /> {i.original}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular">{amount ?? "efter smak"}</span>
                    </li>
                  )
                })}
              </ul>
            </details>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                Annan adress
              </Button>
              <Button type="button" onClick={save} data-testid="save-import">
                <Save /> Spara recept
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Snabb kontroll i webbläsaren – servern gör den riktiga (inkl. skydd mot interna adresser). */
function isWebUrl(s: string) {
  try {
    return /^https?:$/.test(new URL(s).protocol)
  } catch {
    return false
  }
}

const US_UNIT = /\b(cups?|oz|ounces?|lbs?|pounds?|tbsps?|tablespoons?|tsps?|teaspoons?|fl\.? ?oz|pints?|quarts?|gallons?|sticks?)\b/i

/** Makron per portion med valt antal portioner. */
function scaleTo(recipe: ImportedRecipe, servings: number) {
  const f = recipe.servings / servings
  const n = recipe.nutrition
  return { kcal: Math.round(n.kcal * f), protein: Math.round(n.protein * f * 10) / 10, carbs: Math.round(n.carbs * f * 10) / 10, fat: Math.round(n.fat * f * 10) / 10 }
}
