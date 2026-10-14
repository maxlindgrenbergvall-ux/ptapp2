"use client"

import { AlertTriangle, Apple, Plus, Save, Trash2, X } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppData } from "@/lib/data/store"
import { kcalFromMacros, scaleFood } from "@/lib/foods"
import type { MacroTargets, Meal, NutritionPlan } from "@/types/domain"

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
  const existing = data.nutritionPlans.find((p) => p.clientId === clientId)
  const [plan, setPlan] = React.useState<NutritionPlan>(() => existing ?? emptyPlan(clientId, me.id, actions.newId))
  const dirty = JSON.stringify(plan) !== JSON.stringify(existing)

  const switchClient = (id: string) => {
    if (dirty && !window.confirm("Du har osparade ändringar. Byta klient ändå?")) return
    setClientId(id)
    setPlan(data.nutritionPlans.find((p) => p.clientId === id) ?? emptyPlan(id, me.id, actions.newId))
  }

  const totals = sumMacros(plan.meals.flatMap((m) => m.items))
  const macroKcal = kcalFromMacros(plan.targets.protein, plan.targets.carbs, plan.targets.fat)
  const macroMismatch = plan.targets.kcal > 0 && Math.abs(macroKcal - plan.targets.kcal) > plan.targets.kcal * 0.05

  const setTarget = (key: keyof MacroTargets, value: number) =>
    setPlan({ ...plan, targets: { ...plan.targets, [key]: Math.max(0, Math.round(value) || 0) } })
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!dirty}
              onClick={() => {
                actions.saveNutritionPlan(plan)
                toast.success("Kostschemat är sparat och syns för klienten")
              }}
            >
              <Save /> Spara
            </Button>
          </>
        }
      />

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
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full min-w-0 bg-transparent text-lg font-semibold tabular outline-none"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

function MealEditor({ meal, onChange, onRemove }: { meal: Meal; onChange: (patch: Partial<Meal>) => void; onRemove: () => void }) {
  const totals = sumMacros(meal.items)

  const setGrams = (idx: number, grams: number) => {
    const g = Math.max(0, Math.round(grams) || 0)
    onChange({
      items: meal.items.map((item, i) => {
        if (i !== idx || item.grams <= 0) return i === idx ? { ...item, grams: g } : item
        const f = g / item.grams
        return { ...item, grams: g, kcal: Math.round(item.kcal * f), protein: Math.round(item.protein * f), carbs: Math.round(item.carbs * f), fat: Math.round(item.fat * f) }
      }),
    })
  }

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

      {meal.items.length > 0 && (
        <ul className="mt-2 divide-y divide-border/60 border-t border-border/60">
          {meal.items.map((item, idx) => (
            <li key={idx} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="hidden sm:inline">
                <MacroInline value={item} />
              </span>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={item.grams}
                  onChange={(e) => setGrams(idx, Number(e.target.value))}
                  className="w-14 rounded-md bg-muted px-1.5 py-1 text-right text-sm text-foreground tabular outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label={`Gram ${item.name}`}
                />
                g
              </label>
              <span className="w-14 shrink-0 text-right text-muted-foreground tabular">{item.kcal} kcal</span>
              <button
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Ta bort ${item.name}`}
                onClick={() => onChange({ items: meal.items.filter((_, i) => i !== idx) })}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="p-3">
        <FoodSearch placeholder="Lägg till livsmedel (100 g, ändra efteråt)…" onPick={(f) => onChange({ items: [...meal.items, scaleFood(f, 100)] })} />
      </div>
    </li>
  )
}
