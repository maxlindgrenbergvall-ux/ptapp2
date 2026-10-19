"use client"

import { AlertTriangle, Apple, BookOpen, Lock, Plus, Save, Trash2, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState, PageHeader } from "@/components/common"
import { FoodSearch } from "@/components/nutrition/food-search"
import {
  KcalMeter,
  MacroDot,
  MacroInline,
  MACROS,
  MacroSplitBar,
  MacroTargetRow,
  sumMacros,
  type MacroKey,
} from "@/components/nutrition/macros"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { kcalFromMacros } from "@/lib/foods"
import { amountOf, itemFromFood, setAmount, switchUnit } from "@/lib/nutrition/meal-items"
import { hasNutritionAccess } from "@/lib/services/balance"
import { cn } from "@/lib/utils"
import { MEAL_UNIT_LABEL, type MacroTargets, type Meal, type MealItem, type MealUnit, type NutritionPlan, type Recipe } from "@/types/domain"

const PRESETS: { name: string; targets: MacroTargets }[] = [
  { name: "Viktnedgång", targets: { kcal: 1800, protein: 140, carbs: 170, fat: 60 } },
  { name: "Underhåll", targets: { kcal: 2200, protein: 130, carbs: 250, fat: 75 } },
  { name: "Uppbyggnad", targets: { kcal: 2800, protein: 160, carbs: 340, fat: 90 } },
]

function emptyPlan(clientId: string, trainerId: string, newId: () => string): NutritionPlan {
  return {
    id: newId(),
    trainerId,
    clientId,
    name: "Nytt kostschema",
    targets: PRESETS[1].targets,
    meals: [
      { id: newId(), name: "Frukost", time: "07:30", items: [] },
      { id: newId(), name: "Lunch", time: "12:00", items: [] },
      { id: newId(), name: "Middag", time: "18:30", items: [] },
    ],
  }
}

export function NutritionBuilder() {
  const { data, actions, me } = useAppData()
  const clients = data.clients.filter((c) => c.trainerId === me.id && c.status !== "pending")
  const [clientId, setClientId] = React.useState(clients[0]?.id ?? "")
  // PT:ns eget schema för klienten (klienten kan ha scheman från flera PT:er).
  const mine = (id: string) => data.nutritionPlans.find((p) => p.clientId === id && p.trainerId === me.id)
  const existing = mine(clientId)
  // Gäller en annan PT:s schema just nu? Då blir PT:ns schema ett förslag som klienten kan välja.
  const otherActive = data.nutritionPlans.find((p) => p.clientId === clientId && p.trainerId !== me.id && p.active !== false)
  const [plan, setPlan] = React.useState<NutritionPlan>(() => existing ?? emptyPlan(clientId, me.id, actions.newId))
  const comparable = (p?: NutritionPlan) => (p ? JSON.stringify({ ...p, active: undefined }) : "")
  const dirty = comparable(plan) !== comparable(existing)

  const switchClient = (id: string) => {
    if (dirty && !window.confirm("Du har osparade ändringar. Byta klient ändå?")) return
    setClientId(id)
    setPlan(mine(id) ?? emptyPlan(id, me.id, actions.newId))
  }

  const unlocked = clientId ? hasNutritionAccess(data, me.id, clientId) : false
  const totals = sumMacros(plan.meals.flatMap((m) => m.items))
  const macroKcal = kcalFromMacros(plan.targets.protein, plan.targets.carbs, plan.targets.fat)
  const macroMismatch = plan.targets.kcal > 0 && Math.abs(macroKcal - plan.targets.kcal) > plan.targets.kcal * 0.05

  const setTarget = (key: keyof MacroTargets, value: number) =>
    setPlan({ ...plan, targets: { ...plan.targets, [key]: Math.max(0, Math.round(value) || 0) } })
  const recipes = data.recipes.filter((r) => r.trainerId === me.id)
  const updateMeal = (id: string, patch: Partial<Meal>) =>
    setPlan({ ...plan, meals: plan.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)) })

  if (clients.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kostscheman" />
        <EmptyState icon={Apple} title="Inga aktiva klienter än" text="När du accepterat en klient kan du lägga upp ett kostschema här." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kostscheman"
        description="Sätt makromål och bygg måltider. Klienten ser schemat i sin dagsvy."
        actions={
          <>
            <Select value={clientId} onValueChange={switchClient}>
              <SelectTrigger className="w-48" aria-label="Klient">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {!hasNutritionAccess(data, me.id, c.id) && " (ingen kost köpt)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!dirty || !unlocked}
              onClick={() => {
                const res = actions.saveNutritionPlan(plan)
                if ("error" in res) return toast.error(res.error)
                if (res.proposal) {
                  toast.success("Sparat som förslag", {
                    description: "Klienten följer just nu ett schema från en annan PT och väljer själv vilket som ska gälla.",
                  })
                } else toast.success("Kostschemat är sparat och syns för klienten")
              }}
            >
              <Save /> Spara
            </Button>
          </>
        }
      />

      {unlocked && (otherActive || existing?.active === false) && (
        <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm" data-testid="builder-other-active">
          <Apple className="mt-0.5 size-4 shrink-0" />
          <span>
            {otherActive
              ? `Klienten följer just nu "${otherActive.name}" (${otherActive.targets.kcal} kcal) från en annan PT. `
              : "Ditt schema är inte aktivt just nu. "}
            En klient kan bara ha ett aktivt kostschema – ditt schema sparas som ett förslag som klienten kan välja.
          </span>
        </p>
      )}

      {!unlocked && (
        <p className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-sm" data-testid="builder-lock">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            {clients.find((c) => c.id === clientId)?.name ?? "Klienten"} har inte köpt kostcoaching. Du kan förbereda ett schema, men det kan
            sparas och visas för klienten först när klienten köpt en tjänst med kost.
          </span>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-8">
          {/* Mål */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={plan.name}
                onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                className="h-9 max-w-xs border-transparent bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:border-input focus-visible:px-3"
                aria-label="Schemats namn"
              />
              {(!existing || dirty) && (
                <Badge variant="outline" className="font-normal">
                  {existing ? "Osparat" : "Nytt"}
                </Badge>
              )}
              <div className="ml-auto flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <Button key={p.name} variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setPlan({ ...plan, targets: p.targets })}>
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TargetInput label="Kalorier" unit="kcal" value={plan.targets.kcal} onChange={(v) => setTarget("kcal", v)} />
              {MACROS.map((m) => (
                <TargetInput
                  key={m.key}
                  label={m.label}
                  unit="g"
                  macro={m.key}
                  value={plan.targets[m.key]}
                  onChange={(v) => setTarget(m.key, v)}
                />
              ))}
            </div>
            {macroMismatch && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <AlertTriangle className="size-4 text-warning" />
                Makrona motsvarar {macroKcal} kcal.
                <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setTarget("kcal", macroKcal)}>
                  Använd {macroKcal} kcal
                </button>
              </p>
            )}
          </section>

          {/* Måltider */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Måltider</h2>
            <ol className="space-y-3">
              {[...plan.meals]
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((meal) => (
                  <MealEditor
                    key={meal.id}
                    meal={meal}
                    recipes={recipes}
                    onChange={(patch) => updateMeal(meal.id, patch)}
                    onRemove={() => setPlan({ ...plan, meals: plan.meals.filter((m) => m.id !== meal.id) })}
                  />
                ))}
            </ol>
            <Button
              variant="ghost"
              className="w-full border border-dashed text-muted-foreground"
              onClick={() => setPlan({ ...plan, meals: [...plan.meals, { id: actions.newId(), name: "Mellanmål", time: "15:00", items: [] }] })}
            >
              <Plus /> Lägg till måltid
            </Button>
          </section>
        </div>

        {/* Dagssumma */}
        <aside className="h-fit space-y-5 rounded-2xl bg-muted/50 p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-medium text-muted-foreground">Dagssumma</h2>
          <KcalMeter value={totals.kcal} target={plan.targets.kcal} />
          <MacroSplitBar value={totals} />
          <div className="space-y-4">
            {MACROS.map((m) => (
              <MacroTargetRow key={m.key} macro={m.key} value={totals[m.key]} target={plan.targets[m.key]} />
            ))}
          </div>
          <RecipeLibrary recipes={recipes} />
        </aside>
      </div>
    </div>
  )
}

function TargetInput({
  label,
  unit,
  value,
  macro,
  onChange,
}: {
  label: string
  unit: string
  value: number
  macro?: MacroKey
  onChange: (v: number) => void
}) {
  const id = React.useId()
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {macro && <MacroDot macro={macro} />}
        {label}
      </label>
      <div className="flex items-baseline gap-1">
        <NumberInput
          id={id}
          min={0}
          max={10000}
          value={value}
          onValueChange={(v) => onChange(v ?? 0)}
          className="h-auto w-full min-w-0 rounded-none border-0 bg-transparent px-0 py-0 text-lg font-semibold tabular shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

function MealEditor({
  meal,
  recipes,
  onChange,
  onRemove,
}: {
  meal: Meal
  recipes: Recipe[]
  onChange: (patch: Partial<Meal>) => void
  onRemove: () => void
}) {
  const totals = sumMacros(meal.items)
  const [saving, setSaving] = React.useState(false)

  return (
    <li className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 px-4 pt-3">
        <input
          type="time"
          value={meal.time}
          onChange={(e) => onChange({ time: e.target.value })}
          aria-label="Tid"
          className="rounded-md bg-transparent text-sm text-muted-foreground tabular outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <input
          value={meal.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Måltidens namn"
          className="min-w-0 flex-1 rounded-md bg-transparent font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <span className="shrink-0 text-sm font-medium tabular">{totals.kcal} kcal</span>
        <Button variant="ghost" size="icon-sm" aria-label={`Ta bort ${meal.name}`} onClick={onRemove} className="text-muted-foreground">
          <Trash2 />
        </Button>
      </div>
      <div className="px-4 pt-1">
        <MacroInline value={totals} />
      </div>

      <ItemList items={meal.items} onChange={(items) => onChange({ items })} />

      <div className="flex flex-col gap-2 p-3 sm:flex-row">
        <FoodSearch
          className="min-w-0 flex-1"
          placeholder="Lägg till livsmedel…"
          onPick={(f) => onChange({ items: [...meal.items, itemFromFood(f)] })}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {recipes.length > 0 && (
            <Select
              value=""
              onValueChange={(id) => {
                const r = recipes.find((x) => x.id === id)
                if (!r) return
                onChange({ items: [...meal.items, ...r.items.map((i) => ({ ...i }))] })
                toast.success(`${r.name} tillagt i ${meal.name.toLowerCase()}`)
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label={`Lägg till recept i ${meal.name}`}>
                <BookOpen /> <SelectValue placeholder="Recept" />
              </SelectTrigger>
              <SelectContent>
                {recipes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {meal.items.length > 0 && (
            <Button variant="outline" className={cn(recipes.length === 0 && "col-span-2")} onClick={() => setSaving(true)}>
              <Save /> Spara som recept
            </Button>
          )}
        </div>
      </div>
      <RecipeDialog
        open={saving}
        onOpenChange={setSaving}
        initial={{ name: meal.name, notes: "", items: meal.items }}
      />
    </li>
  )
}

/** Livsmedelsrader med mängd i gram eller styck. Makrona räknas om från värdena per 100 g. */
function ItemList({ items, onChange }: { items: MealItem[]; onChange: (items: MealItem[]) => void }) {
  if (!items.length) return null
  const update = (idx: number, fn: (item: MealItem) => MealItem) => onChange(items.map((item, i) => (i === idx ? fn(item) : item)))
  return (
    <ul className="mt-2 divide-y divide-border/60 border-t border-border/60">
      {items.map((item, idx) => {
        const unit = item.unit ?? "g"
        return (
          <li key={idx} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm sm:flex">
            <span className="min-w-0 truncate sm:flex-1">
              {item.name}
              <span className="block sm:hidden">
                <MacroInline value={item} />
              </span>
            </span>
            <span className="hidden sm:inline">
              <MacroInline value={item} />
            </span>
            <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
              <NumberInput
                decimal={unit !== "g"}
                min={0}
                max={unit === "g" ? 5000 : 50}
                value={amountOf(item)}
                onValueChange={(v) => update(idx, (it) => setAmount(it, v ?? 0))}
                className="h-8 w-16 bg-muted px-1.5 text-right text-sm tabular"
                aria-label={`Mängd ${item.name}`}
              />
              <UnitToggle value={unit} name={item.name} onChange={(u) => update(idx, (it) => switchUnit(it, u))} />
              <span className="w-12 text-xs text-muted-foreground tabular" aria-label="Uppskattad vikt">
                {unit !== "g" ? `≈${item.grams} g` : ""}
              </span>
              <span className="w-16 text-right text-muted-foreground tabular">{item.kcal} kcal</span>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Ta bort ${item.name}`}
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Enhet för en rad: gram, styck eller köksmått (dl, msk, tsk). Köksmått räknas
 * om till gram med livsmedlets densitet. (ml finns inte – drycker anges i dl.)
 */
function UnitToggle({ value, name, onChange }: { value: MealUnit; name: string; onChange: (u: MealUnit) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MealUnit)}>
      <SelectTrigger size="sm" className="h-8 w-[4.25rem] px-2 text-xs" aria-label={`Enhet för ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["g", "st", "dl", "msk", "tsk"] as const).map((u) => (
          <SelectItem key={u} value={u} className="text-sm">
            {MEAL_UNIT_LABEL[u]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** PT:ns sparade recept: skapa, ändra och ta bort. Läggs in i klientens måltider via "Recept". */
function RecipeLibrary({ recipes }: { recipes: Recipe[] }) {
  const { actions } = useAppData()
  const [editing, setEditing] = React.useState<Recipe | "new" | null>(null)
  return (
    <section className="space-y-2 border-t pt-4" aria-labelledby="recipes-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="recipes-title" className="text-sm font-medium text-muted-foreground">
          Mina recept
        </h2>
        <Button size="xs" variant="ghost" onClick={() => setEditing("new")}>
          <Plus /> Nytt recept
        </Button>
      </div>
      {recipes.length === 0 && <p className="text-xs text-muted-foreground">Spara en måltid som recept eller skapa ett nytt.</p>}
      <ul className="space-y-1">
        {recipes.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => setEditing(r)}>
              {r.name}
            </button>
            <span className="shrink-0 text-xs text-muted-foreground tabular">{sumMacros(r.items).kcal} kcal</span>
            <button
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={`Ta bort recept ${r.name}`}
              onClick={() => {
                if (!window.confirm(`Ta bort receptet "${r.name}"?`)) return
                actions.deleteRecipe(r.id)
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <RecipeDialog
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing && editing !== "new" ? editing : { name: "", notes: "", items: [] }}
      />
    </section>
  )
}

function RecipeDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: { id?: string; name: string; notes: string; items: MealItem[] }
}) {
  const { actions } = useAppData()
  const [name, setName] = React.useState(initial.name)
  const [notes, setNotes] = React.useState(initial.notes)
  const [items, setItems] = React.useState<MealItem[]>(initial.items)
  // Öppnas på nytt (t.ex. från en annan måltid) → börja från måltidens innehåll.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(initial.name)
      setNotes(initial.notes)
      setItems(initial.items)
    }
  }
  const totals = sumMacros(items)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length < 2) return toast.error("Ge receptet ett namn")
            if (!items.length) return toast.error("Lägg till minst ett livsmedel")
            actions.saveRecipe({ id: initial.id ?? actions.newId(), name: name.trim().slice(0, 80), notes: notes.trim().slice(0, 1000), items })
            toast.success(`Receptet "${name.trim()}" är sparat`)
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial.id ? "Ändra recept" : "Spara recept"}</DialogTitle>
            <DialogDescription>
              Receptet sparas i ditt bibliotek. Lägg in det i en klients måltid med &quot;Recept&quot; i kostschemat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="recipe-name">Namn</Label>
            <Input id="recipe-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Proteinfrukost" />
          </div>
          <div className="rounded-xl border">
            <ItemList items={items} onChange={setItems} />
            <div className="p-3">
              <FoodSearch placeholder="Lägg till livsmedel…" onPick={(f) => setItems([...items, itemFromFood(f)])} />
            </div>
            <div className="border-t px-4 py-2 text-sm">
              <span className="font-medium tabular">{totals.kcal} kcal</span> <MacroInline value={totals} className="ml-2" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipe-notes">Instruktioner (valfritt)</Label>
            <Textarea id="recipe-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
