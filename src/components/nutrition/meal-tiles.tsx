"use client"

import { Apple, Coffee, Plus, Salad, UtensilsCrossed, type LucideIcon } from "lucide-react"
import * as React from "react"

import { AnimatedNumber } from "@/components/motion"
import { MEAL_LABEL, MEAL_TYPES } from "@/lib/recipes/goals"
import { cn } from "@/lib/utils"
import type { FoodEntry, MealType } from "@/types/domain"

const ICON: Record<MealType, LucideIcon> = { breakfast: Coffee, lunch: Salad, dinner: UtensilsCrossed, snack: Apple }

type Totals = { kcal: number; protein: number; carbs: number; fat: number; count: number }

function totals(entries: FoodEntry[]): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, count: entries.length }
  for (const e of entries) {
    t.kcal += e.kcal
    t.protein += e.protein ?? 0
    t.carbs += e.carbs ?? 0
    t.fat += e.fat ?? 0
  }
  return t
}

/**
 * Måltidsbrickor (v56): Frukost, Lunch, Middag och Mellanmål visas alltid –
 * även tomma – med fast höjd, så att sidan inte hoppar när första maten loggas.
 * Varje bricka visar kcal och en segmenterad makrostapel (protein i lime,
 * kolhydrater och fett i dämpade toner). Allt animeras med transform/opacity:
 * staplarna skalas i x-led och ikonen får en ring när något läggs till.
 */
export function MealTiles({ entries, selected, onQuickAdd }: { entries: FoodEntry[]; selected: MealType; onQuickAdd: (meal: MealType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="meal-tiles">
      {MEAL_TYPES.map((m) => (
        <MealTile key={m} meal={m} totals={totals(entries.filter((e) => e.meal === m))} selected={selected === m} onQuickAdd={() => onQuickAdd(m)} />
      ))}
    </div>
  )
}

function MealTile({ meal, totals: t, selected, onQuickAdd }: { meal: MealType; totals: Totals; selected: boolean; onQuickAdd: () => void }) {
  const Icon = ICON[meal]
  // Räknar upp när en post läggs till medan sidan är öppen (inte vid sidladdning).
  const [track, setTrack] = React.useState({ n: t.count, bumps: 0 })
  if (track.n !== t.count) setTrack({ n: t.count, bumps: t.count > track.n ? track.bumps + 1 : track.bumps })

  // Makrostaplarnas andel av kalorierna (protein/kolhydrater 4 kcal/g, fett 9 kcal/g).
  const p = t.protein * 4
  const c = t.carbs * 4
  const f = t.fat * 9
  const sum = p + c + f
  const share = (x: number) => (sum > 0 ? x / sum : 0)
  const label = MEAL_LABEL[meal]
  const kcal = Math.round(t.kcal)

  return (
    <section
      className={cn(
        "glass-tile relative flex h-[10.25rem] flex-col justify-between overflow-hidden rounded-3xl p-3.5 transition-[box-shadow] duration-300",
        selected && "shadow-[inset_0_0_0_1px_rgb(132_204_22/0.45)]"
      )}
      aria-label={`${label}: ${kcal} kcal`}
      data-testid="meal-tile"
      data-meal={meal}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[#84cc16]">
            <Icon className="size-4" aria-hidden />
            {track.bumps > 0 && <span key={track.bumps} aria-hidden className="ring-burst" />}
          </span>
          <span className="block truncate text-[13px] font-medium text-white/80">{label}</span>
        </div>
        <button
          type="button"
          onClick={onQuickAdd}
          aria-label={`Logga till ${label.toLowerCase()}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#84cc16] text-[#131916] shadow-[0_6px_16px_-6px_rgb(132_204_22/0.7)] transition-transform duration-150 hover:scale-105 active:scale-90"
          data-testid="meal-tile-add"
        >
          <Plus className="size-4" strokeWidth={2.6} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-1">
          <span key={track.bumps} className={cn("text-2xl font-semibold tracking-tight tabular", track.bumps > 0 && "settle-in", kcal === 0 && "text-white/35")} data-testid="meal-tile-kcal">
            <AnimatedNumber value={kcal} />
          </span>
          <span className="text-xs text-white/45">kcal</span>
          <span className="ml-auto text-[11px] text-white/40 tabular">{t.count === 0 ? "Tomt" : `${t.count} st`}</span>
        </div>
        {/* Segmenterad stapel: tre lager som skalas från vänster (bara transform). */}
        <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
          {[
            { w: share(p) + share(c) + share(f), cls: "bg-white/20" },
            { w: share(p) + share(c), cls: "bg-white/45" },
            { w: share(p), cls: "bg-[#84cc16]" },
          ].map((s, i) => (
            <span
              key={i}
              className={cn("absolute inset-0 origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none", s.cls)}
              style={{ transform: `scaleX(${s.w})` }}
            />
          ))}
        </div>
        <div className="flex gap-2.5 text-[11px] tabular">
          <span className="text-[#84cc16]">P {Math.round(t.protein)} g</span>
          <span className="text-white/60">K {Math.round(t.carbs)} g</span>
          <span className="text-white/40">F {Math.round(t.fat)} g</span>
        </div>
      </div>
    </section>
  )
}
