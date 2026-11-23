"use client"

import { Apple, Coffee, Plus, Salad, UtensilsCrossed, type LucideIcon } from "lucide-react"
import * as React from "react"

import { AnimatedNumber } from "@/components/motion"
import { useSpring } from "@/lib/spring"
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
 *
 * v67: staplarna glider med samma fjäder som vattenglaset, gramtalen räknar
 * mjukt och brickan gör en liten studs när något loggas till den.
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

  // Studsen: skalan följer en fjäder mot 1 och får en knuff vid varje ny post.
  const tileRef = React.useRef<HTMLElement>(null)
  const bounce = useSpring(1, (x) => {
    if (tileRef.current) tileRef.current.style.transform = x === 1 ? "" : `scale(${x.toFixed(4)})`
  })
  const bumps = track.bumps
  React.useEffect(() => {
    if (bumps > 0) bounce.kick(0.6)
  }, [bumps, bounce])

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
      ref={tileRef}
      className={cn(
        "glass-tile relative flex h-[10.25rem] flex-col justify-between overflow-hidden rounded-3xl p-3.5 transition-[box-shadow] duration-300 will-change-transform",
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
          <SpringSegment share={share(p) + share(c) + share(f)} className="bg-white/20" />
          <SpringSegment share={share(p) + share(c)} className="bg-white/45" />
          <SpringSegment share={share(p)} className="bg-[#84cc16]" />
        </div>
        <div className="flex gap-2.5 text-[11px] tabular">
          <span className="text-[#84cc16]">
            P <AnimatedNumber value={Math.round(t.protein)} /> g
          </span>
          <span className="text-white/60">
            K <AnimatedNumber value={Math.round(t.carbs)} /> g
          </span>
          <span className="text-white/40">
            F <AnimatedNumber value={Math.round(t.fat)} /> g
          </span>
        </div>
      </div>
    </section>
  )
}

/** Ett lager i makrostapeln: skalas från vänster med fjädern (bara transform). */
function SpringSegment({ share, className }: { share: number; className: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [initial] = React.useState(share)
  useSpring(share, (x) => {
    if (ref.current) ref.current.style.transform = `scaleX(${Math.max(0, x).toFixed(4)})`
  })
  return <span ref={ref} className={cn("absolute inset-0 origin-left rounded-full", className)} style={{ transform: `scaleX(${initial})` }} />
}
