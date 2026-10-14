"use client"

import { AlertTriangle, Apple, Plus, Save, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState, MacroBar, PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppData } from "@/lib/data/store"
import { FOODS, kcalFromMacros, scaleFood } from "@/lib/foods"
import { cn } from "@/lib/utils"
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

  const totals = plan.meals
    .flatMap((m) => m.items)
    .reduce((t, i) => ({ kcal: t.kcal + i.kcal, protein: t.protein + i.protein, carbs: t.carbs + i.carbs, fat: t.fat + i.fat }), {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    })
  const macroKcal = kcalFromMacros(plan.targets.protein, plan.targets.carbs, plan.targets.fat)
  const macroMismatch = Math.abs(macroKcal - plan.targets.kcal) > plan.targets.kcal * 0.05

  const setTarget = (key: keyof MacroTargets, value: number) =>
    setPlan({ ...plan, targets: { ...plan.targets, [key]: Math.max(0, value) } })
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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} className="max-w-sm font-semibold" aria-label="Schemats namn" />
                {!existing && <Badge variant="outline">Nytt</Badge>}
                {dirty && existing && <Badge variant="outline">Osparat</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="self-center text-xs text-muted-foreground">Utgå från:</span>
                {PRESETS.map((p) => (
                  <Button key={p.name} variant="outline" size="xs" onClick={() => setPlan({ ...plan, targets: p.targets })}>
                    {p.name} {p.targets.kcal}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["kcal", "Kalorier (kcal)"],
                  ["protein", "Protein (g)"],
                  ["carbs", "Kolhydrater (g)"],
                  ["fat", "Fett (g)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`t-${key}`} className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <Input id={`t-${key}`} type="number" inputMode="numeric" min={0} value={plan.targets[key]} onChange={(e) => setTarget(key, Number(e.target.value))} />
                </div>
              ))}
              {macroMismatch && (
                <p className="col-span-full flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="size-4 text-warning" />
                  Makrona motsvarar {macroKcal} kcal, vilket skiljer sig från kalorimålet.
                  <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setTarget("kcal", macroKcal)}>
                    Använd {macroKcal}
                  </Button>
                </p>
              )}
            </CardContent>
          </Card>

          {plan.meals.map((meal) => (
            <MealEditor
              key={meal.id}
              meal={meal}
              onChange={(patch) => updateMeal(meal.id, patch)}
              onRemove={() => setPlan({ ...plan, meals: plan.meals.filter((m) => m.id !== meal.id) })}
            />
          ))}
          <Button
            variant="outline"
            onClick={() => setPlan({ ...plan, meals: [...plan.meals, { id: actions.newId(), name: "Mellanmål", time: "15:00", items: [] }] })}
          >
            <Plus /> Lägg till måltid
          </Button>
        </div>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Dagssumma</CardTitle>
            <CardDescription>Planerade måltider jämfört med målen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MacroBar label="Kalorier" unit="kcal" value={totals.kcal} target={plan.targets.kcal} />
            <MacroBar label="Protein" unit="g" value={totals.protein} target={plan.targets.protein} />
            <MacroBar label="Kolhydrater" unit="g" value={totals.carbs} target={plan.targets.carbs} />
            <MacroBar label="Fett" unit="g" value={totals.fat} target={plan.targets.fat} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MealEditor({ meal, onChange, onRemove }: { meal: Meal; onChange: (patch: Partial<Meal>) => void; onRemove: () => void }) {
  const [food, setFood] = React.useState(FOODS[0].name)
  const [grams, setGrams] = React.useState(100)
  const kcal = meal.items.reduce((s, i) => s + i.kcal, 0)

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <Input type="time" value={meal.time} onChange={(e) => onChange({ time: e.target.value })} className="w-28" aria-label="Tid" />
          <Input value={meal.name} onChange={(e) => onChange({ name: e.target.value })} className="font-medium" aria-label="Måltidens namn" />
          <span className="shrink-0 text-sm text-muted-foreground tabular">{kcal} kcal</span>
          <Button variant="ghost" size="icon-sm" aria-label="Ta bort måltid" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {meal.items.length > 0 && (
          <table className="w-full text-sm tabular">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">Livsmedel</th>
                <th className="py-1 text-right font-normal">g</th>
                <th className="py-1 text-right font-normal">kcal</th>
                <th className="hidden py-1 text-right font-normal sm:table-cell">P</th>
                <th className="hidden py-1 text-right font-normal sm:table-cell">K</th>
                <th className="hidden py-1 text-right font-normal sm:table-cell">F</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {meal.items.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="py-1.5">{item.name}</td>
                  <td className="py-1.5 text-right">{item.grams}</td>
                  <td className="py-1.5 text-right">{item.kcal}</td>
                  <td className="hidden py-1.5 text-right sm:table-cell">{item.protein}</td>
                  <td className="hidden py-1.5 text-right sm:table-cell">{item.carbs}</td>
                  <td className="hidden py-1.5 text-right sm:table-cell">{item.fat}</td>
                  <td className="text-right">
                    <Button variant="ghost" size="icon-xs" aria-label={`Ta bort ${item.name}`} onClick={() => onChange({ items: meal.items.filter((_, i) => i !== idx) })}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          className={cn("flex flex-wrap items-center gap-2", meal.items.length > 0 && "border-t pt-3")}
          onSubmit={(e) => {
            e.preventDefault()
            const f = FOODS.find((x) => x.name === food)
            if (!f || grams <= 0) return
            onChange({ items: [...meal.items, scaleFood(f, grams)] })
          }}
        >
          <Select value={food} onValueChange={setFood}>
            <SelectTrigger className="min-w-48 flex-1" aria-label="Livsmedel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOODS.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min={1} inputMode="numeric" value={grams} onChange={(e) => setGrams(Number(e.target.value))} className="w-24" aria-label="Gram" />
          <Button type="submit" variant="secondary">
            <Plus /> Lägg till
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
