"use client"

import { ChefHat, Clock, Droplet, Drumstick, Flame, Plus, Save, Search, Star, Trash2, UserRound, Wheat } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { FoodSearch } from "@/components/nutrition/food-search"
import { MacroInline } from "@/components/nutrition/macros"
import { FavoriteButton, RecipeImage } from "@/components/nutrition/recipe-parts"
import { RecipeSheet } from "@/components/nutrition/recipe-sheet"
import { ItemList } from "@/components/pt/nutrition-builder"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { densityOf, itemFromFood, pieceWeight, VOLUME_ML } from "@/lib/nutrition/meal-items"
import { GOAL_INFO, perServing, RECIPE_GOALS, suggestGoals, sumItems } from "@/lib/recipes/goals"
import { useRecipeLibrary } from "@/lib/recipes/library"
import { cn } from "@/lib/utils"
import { MEAL_UNIT_LABEL, type MacroTotals, type MealItem, type MealUnit, type Recipe, type RecipeGoal } from "@/types/domain"

const MAX_SERVINGS = 20
type Tab = "all" | RecipeGoal
type Source = "all" | "favorites" | "mine"

/**
 * Receptbiblioteket (v26): Coaviras färdiga träningsrecept – med makron, bild,
 * tid, metriska mått och steg – plus användarens egna recept. Flikar per
 * träningsmål, snabbfilter för favoriter och egna recept. Ett tryck på ett
 * recept öppnar det i en pop-up.
 */
export function RecipesView() {
  const { data, me } = useAppData()
  const library = useRecipeLibrary()
  const [tab, setTab] = React.useState<Tab>("all")
  const [source, setSource] = React.useState<Source>("all")
  const [q, setQ] = React.useState("")
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<Recipe | "new" | null>(null)
  const favorites = new Set(data.favoriteRecipes)
  const mine = data.recipes.filter((r) => r.trainerId === me.id)
  const all = [...mine, ...(library ?? [])]
  const query = q.trim().toLowerCase()
  const bySource = (r: Recipe) => (source === "favorites" ? favorites.has(r.id) : source === "mine" ? !r.library : true)
  const recipes = all
    .filter(bySource)
    .filter((r) => tab === "all" || r.goalTypes?.includes(tab))
    .filter((r) => !query || r.name.toLowerCase().includes(query) || r.items.some((i) => i.name.toLowerCase().includes(query)))
    .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || Number(!b.library) - Number(!a.library) || a.name.localeCompare(b.name, "sv"))
  const tabCount = (t: Tab) => all.filter(bySource).filter((r) => t === "all" || r.goalTypes?.includes(t)).length
  const open = all.find((r) => r.id === openId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Recept</h1>
          <p className="text-sm text-muted-foreground">Träningsanpassade recept med färdiga makron.</p>
        </div>
        <Button onClick={() => setEditing("new")} data-testid="new-recipe" className="shrink-0">
          <Plus /> Skapa eget
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök recept eller ingrediens" className="pl-9" aria-label="Sök recept" />
      </div>

      {/* Filterraden ligger kvar överst när listan rullar – byt kategori direkt. */}
      <div className="sticky top-[calc(3.5rem+var(--safe-top))] z-10 -mx-4 space-y-2 border-b border-border/50 bg-background/90 px-4 py-2 backdrop-blur-xl" data-testid="recipe-filters">
        {/* Flikar per träningsmål. Rullar i sidled på mobilen. */}
        <div className="-mx-4 flex snap-x gap-1.5 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Träningsmål">
          {(["all", ...RECIPE_GOALS] as Tab[]).map((t) => {
            const active = tab === t
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                data-testid={`tab-${t}`}
                onClick={() => setTab(t)}
                className={cn(
                  "flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card hover:bg-muted"
                )}
              >
                {t === "all" ? "Alla" : GOAL_INFO[t].label}
                <span className={cn("text-xs tabular", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{tabCount(t)}</span>
              </button>
            )
          })}
        </div>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label="Visa">
          {(
            [
              ["all", "Alla recept", null],
              ["favorites", "Mina favoriter", Star],
              ["mine", "Mina egna", UserRound],
            ] as const
          ).map(([s, label, Icon]) => (
            <button
              key={s}
              role="radio"
              aria-checked={source === s}
              data-testid={`filter-${s}`}
              onClick={() => setSource(s)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                source === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon && <Icon className={cn("size-3.5", s === "favorites" && source !== s && "fill-warning text-warning")} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab !== "all" && <p className="-mt-2 text-xs text-muted-foreground">{GOAL_INFO[tab].hint}.</p>}

      {library === null ? (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Laddar recept">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </ul>
      ) : recipes.length === 0 ? (
        <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
          <ChefHat className="mx-auto size-8" />
          <p>{source === "favorites" ? "Inga favoriter här än – tryck på stjärnan på ett recept." : source === "mine" ? "Du har inga egna recept här än." : "Inga recept matchar."}</p>
          {source === "mine" && (
            <Button variant="outline" onClick={() => setEditing("new")}>
              <Plus /> Skapa ditt första recept
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Recept">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </ul>
      )}

      <RecipeSheet
        recipe={open}
        open={open !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        onEdit={(r) => {
          setOpenId(null)
          setEditing(r)
        }}
      />
      <RecipeEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing && editing !== "new" ? editing : undefined}
        onSaved={(id) => setOpenId(id)}
      />
    </div>
  )
}

/**
 * Kompakt receptrad: kvadratisk miniatyr till vänster, titel (högst två rader,
 * aldrig överlappad) och små piller för tid och makron. 5–6 recept får plats
 * på en mobilskärm.
 */
function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const portion = perServing(recipe)
  return (
    <li className="relative min-w-0" data-testid="recipe-card">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full max-w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-2xl border border-border/70 bg-card p-2 text-left shadow-card transition-[background-color,transform] hover:bg-muted/40 active:scale-[0.99]"
      >
        <RecipeImage recipe={recipe} size="thumb" className="aspect-square size-14 shrink-0 rounded-xl min-[360px]:size-16" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Plats för stjärnan bredvid titeln – pillren under får hela bredden. */}
          <span className="line-clamp-2 pr-8 text-[15px] leading-snug font-semibold break-words">{recipe.name}</span>
          <MacroPills recipe={recipe} portion={portion} />
        </span>
      </button>
      <FavoriteButton recipe={recipe} className="absolute top-0.5 right-0.5 size-10" />
    </li>
  )
}

/** Tid och makron per portion som små piller med ikon. */
function MacroPills({ recipe, portion }: { recipe: Recipe; portion: MacroTotals }) {
  const pills = [
    { key: "kcal", icon: Flame, text: `${portion.kcal} kcal`, tone: "text-orange-600 dark:text-orange-400", label: `${portion.kcal} kalorier per portion` },
    { key: "protein", icon: Drumstick, text: `${Math.round(portion.protein)}`, tone: "text-macro-protein", label: `${Math.round(portion.protein)} gram protein` },
    { key: "carbs", icon: Wheat, text: `${Math.round(portion.carbs)}`, tone: "text-macro-carbs", label: `${Math.round(portion.carbs)} gram kolhydrater` },
    { key: "fat", icon: Droplet, text: `${Math.round(portion.fat)}`, tone: "text-macro-fat", label: `${Math.round(portion.fat)} gram fett` },
    ...(recipe.totalMinutes ? [{ key: "time", icon: Clock, text: `${recipe.totalMinutes} min`, tone: "text-muted-foreground", label: `${recipe.totalMinutes} minuter` }] : []),
  ]
  return (
    <span className="flex min-w-0 flex-wrap gap-x-1 gap-y-1" data-testid="macro-pills">
      {pills.map(({ key, icon: Icon, text, tone, label }) => (
        <span key={key} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted/70 px-1.5 py-[3px] text-[11px] leading-none font-medium tabular" aria-label={label}>
          <Icon className={cn("size-3", tone)} aria-hidden />
          <span aria-hidden>{text}</span>
        </span>
      ))}
      {!recipe.library && <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] leading-none font-medium text-primary">Eget</span>}
    </span>
  )
}

// ------------------------------------------------- skapa eget recept ---

const UNITS: MealUnit[] = ["g", "dl", "ml", "msk", "tsk", "krm", "st"]
const r1 = (n: number) => Math.round(n * 10) / 10

/** Fri ingrediensrad (utan näringsvärden) i metriska mått. */
function freeItem(name: string, amount: number, unit: MealUnit): MealItem {
  const base = { name: name.trim(), kcal: 0, protein: 0, carbs: 0, fat: 0 }
  if (unit === "g") return { ...base, unit, grams: Math.round(amount) }
  if (unit === "st") {
    const pieceG = pieceWeight(name)
    return { ...base, unit, qty: amount, ...(pieceG ? { pieceG, grams: Math.round(amount * pieceG) } : { grams: 0 }) }
  }
  const gPerMl = densityOf(name)
  return { ...base, unit, qty: amount, gPerMl, grams: Math.round(amount * VOLUME_ML[unit] * gPerMl) }
}

/**
 * Skapa (eller ändra) ett eget recept från scratch: namn, kategorier,
 * portioner, tid, ingredienser i gram/dl, steg – och makron per portion, antingen
 * egna värden eller uträknade ur ingredienser från livsmedelsbasen.
 */
export function RecipeEditor({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Recipe
  onSaved?: (id: string) => void
}) {
  const { actions } = useAppData()
  const [name, setName] = React.useState(initial?.name ?? "")
  const [servings, setServings] = React.useState<number | undefined>(initial?.servings ?? 2)
  const [minutes, setMinutes] = React.useState<number | undefined>(initial?.totalMinutes)
  const [items, setItems] = React.useState<MealItem[]>(initial?.items ?? [])
  const [steps, setSteps] = React.useState((initial?.steps ?? []).join("\n"))
  const [notes, setNotes] = React.useState(initial?.notes ?? "")
  const [goals, setGoals] = React.useState<RecipeGoal[]>(initial?.goalTypes ?? [])
  // Egna makron (per portion) eller uträknade ur ingredienserna.
  const [ownMacros, setOwnMacros] = React.useState(Boolean(initial?.nutrition) || !initial)
  const [macros, setMacros] = React.useState<Partial<MacroTotals>>(initial?.nutrition ?? {})
  // Fri ingrediensrad.
  const [ingName, setIngName] = React.useState("")
  const [ingAmount, setIngAmount] = React.useState<number | undefined>()
  const [ingUnit, setIngUnit] = React.useState<MealUnit>("g")

  const computed = (() => {
    const t = sumItems(items)
    const n = servings || 1
    return { kcal: Math.round(t.kcal / n), protein: r1(t.protein / n), carbs: r1(t.carbs / n), fat: r1(t.fat / n) }
  })()
  const portion: MacroTotals = ownMacros
    ? { kcal: macros.kcal ?? 0, protein: macros.protein ?? 0, carbs: macros.carbs ?? 0, fat: macros.fat ?? 0 }
    : computed
  const suggested = suggestGoals(portion, minutes)

  const addIngredient = () => {
    if (ingName.trim().length < 2) return toast.error("Skriv ingrediensens namn")
    if (!ingAmount || ingAmount <= 0) return toast.error("Ange en mängd")
    setItems([...items, freeItem(ingName, ingAmount, ingUnit)])
    setIngName("")
    setIngAmount(undefined)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return toast.error("Ge receptet ett namn")
    if (goals.length === 0) return toast.error("Välj minst en kategori")
    if (!servings || servings < 1 || servings > MAX_SERVINGS) return toast.error(`Ange antal portioner (1–${MAX_SERVINGS})`)
    if (!items.length) return toast.error("Lägg till minst en ingrediens")
    if (ownMacros && (["kcal", "protein", "carbs", "fat"] as const).some((k) => macros[k] === undefined)) {
      return toast.error("Fyll i kalorier, protein, kolhydrater och fett per portion")
    }
    if (!ownMacros && computed.kcal <= 0) return toast.error("Ange egna makron, eller lägg till ingredienser från livsmedelsbasen")
    const id = initial?.id ?? actions.newId()
    actions.saveRecipe({
      ...(initial ?? {}),
      id,
      name: name.trim().slice(0, 120),
      notes: notes.trim().slice(0, 2000),
      items,
      servings,
      totalMinutes: minutes,
      goalTypes: goals,
      steps: steps.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 60),
      nutrition: ownMacros ? { kcal: Math.round(portion.kcal), protein: r1(portion.protein), carbs: r1(portion.carbs), fat: r1(portion.fat) } : undefined,
      macrosSource: "manual",
    })
    toast.success(`"${name.trim()}" är sparat`)
    onOpenChange(false)
    onSaved?.(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" data-testid="recipe-editor">
        <form className="space-y-5" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{initial ? "Ändra recept" : "Skapa eget recept"}</DialogTitle>
            <DialogDescription>Namn, kategori, makron, ingredienser i gram/dl och steg.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="recipe-name">Namn</Label>
            <Input id="recipe-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Mammas kycklinggryta" />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Kategori</legend>
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
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : suggested.includes(g) ? "border-primary/40 bg-primary/5" : "hover:bg-muted"
                    )}
                  >
                    {GOAL_INFO[g].label}
                  </button>
                )
              })}
            </div>
            {suggested.some((g) => !goals.includes(g)) && (
              <button type="button" className="text-xs text-primary underline-offset-4 hover:underline" onClick={() => setGoals([...new Set([...goals, ...suggested])])}>
                Lägg till förslag utifrån makrona: {suggested.filter((g) => !goals.includes(g)).map((g) => GOAL_INFO[g].label).join(", ")}
              </button>
            )}
          </fieldset>

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

          {/* Makron per portion */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Makron per portion</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Makron">
              {([true, false] as const).map((own) => (
                <button
                  key={String(own)}
                  type="button"
                  role="radio"
                  aria-checked={ownMacros === own}
                  onClick={() => setOwnMacros(own)}
                  className={cn("h-9 rounded-lg text-xs font-medium transition-colors", ownMacros === own ? "bg-background shadow-sm" : "text-muted-foreground")}
                >
                  {own ? "Ange egna värden" : "Räkna ur ingredienserna"}
                </button>
              ))}
            </div>
            {ownMacros ? (
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ["kcal", "kcal"],
                    ["protein", "Protein (g)"],
                    ["carbs", "Kolh. (g)"],
                    ["fat", "Fett (g)"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="space-y-1">
                    <span className="block text-[11px] text-muted-foreground">{label}</span>
                    <NumberInput
                      decimal={k !== "kcal"}
                      required
                      min={0}
                      max={k === "kcal" ? 5000 : 500}
                      value={macros[k]}
                      onValueChange={(v) => setMacros((m) => ({ ...m, [k]: v }))}
                      aria-label={`${label} per portion`}
                      data-testid={`macro-${k}`}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm tabular" data-testid="recipe-portion-kcal">
                {computed.kcal} kcal per portion · <MacroInline value={computed} />
                <span className="mt-1 block text-xs text-muted-foreground">Bara ingredienser från livsmedelsbasen räknas.</span>
              </p>
            )}
          </fieldset>

          {/* Ingredienser */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Ingredienser</legend>
            <div className="rounded-xl border">
              <ItemList items={items} onChange={setItems} />
              <div className="space-y-2 p-3">
                <div className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] gap-2">
                  <Input value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="Ingrediens" aria-label="Ingrediens" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIngredient())} />
                  <NumberInput decimal min={0} max={5000} value={ingAmount} onValueChange={setIngAmount} placeholder="Mängd" aria-label="Mängd" />
                  <Select value={ingUnit} onValueChange={(u) => setIngUnit(u as MealUnit)}>
                    <SelectTrigger aria-label="Enhet" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {MEAL_UNIT_LABEL[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" aria-label="Lägg till ingrediens" onClick={addIngredient}>
                    <Plus />
                  </Button>
                </div>
                <FoodSearch placeholder="…eller hämta från livsmedelsbasen (med näringsvärden)" onPick={(f) => setItems([...items, itemFromFood(f)])} />
              </div>
            </div>
            {items.length > 0 && (
              <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={() => setItems([])}>
                <Trash2 className="size-3" /> Rensa ingredienserna
              </button>
            )}
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
            <Button type="submit" data-testid="save-recipe">
              <Save /> Spara recept
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
