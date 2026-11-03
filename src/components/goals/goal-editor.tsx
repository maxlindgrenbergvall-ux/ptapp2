"use client"

import {
  Armchair,
  BicepsFlexed,
  Bike,
  Check,
  Flame,
  Footprints,
  HeartPulse,
  Info,
  Leaf,
  PersonStanding,
  Shuffle,
  Target,
  TrendingDown,
  TriangleAlert,
  Weight,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { GoalProjectionChart } from "@/components/goals/goal-chart"
import { MacroDot, MacroSplitBar } from "@/components/nutrition/macros"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { type DraftField, type GoalDraft, planInput } from "@/lib/goals/draft"
import {
  ACTIVITY_INFO,
  ACTIVITY_LEVELS,
  clampRate,
  formatRate,
  GOAL_DISCLAIMER,
  GOAL_INFO,
  GOAL_KEYS,
  goalOverview,
  LIMITS,
  planMode,
  RATE_RANGES,
  SEX_INFO,
} from "@/lib/goals/metabolism"
import { cn } from "@/lib/utils"
import type { ActivityLevel, GoalKey, Sex } from "@/types/domain"

const GOAL_ICON: Record<GoalKey, LucideIcon> = {
  weight_loss: TrendingDown,
  muscle_gain: BicepsFlexed,
  recomp: Shuffle,
  strength: Weight,
  endurance: HeartPulse,
  health: Leaf,
}
const ACTIVITY_ICON: Record<ActivityLevel, LucideIcon> = { sedentary: Armchair, light: Footprints, moderate: PersonStanding, very: Bike }

type Errors = Partial<Record<DraftField, string>>
const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null

// --------------------------------------------------------------- mål ---
/** Huvudmål: flera kan väljas samtidigt (t.ex. viktnedgång + muskelmassa). */
export function GoalPicker({ value, onChange, error }: { value: GoalKey[]; onChange: (goals: GoalKey[]) => void; error?: string }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Mål (välj ett eller flera)" data-testid="goal-picker">
        {GOAL_KEYS.map((g) => {
          const Icon = GOAL_ICON[g]
          const on = value.includes(g)
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== g) : GOAL_KEYS.filter((x) => x === g || value.includes(x)))}
              className={cn(
                "flex min-h-16 items-start gap-3 rounded-2xl border bg-card p-3 text-left transition-[border-color,background-color,transform] active:scale-[0.98]",
                on ? "border-primary bg-primary/8 ring-1 ring-primary" : "hover:bg-muted/60"
              )}
            >
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{GOAL_INFO[g].label}</span>
                <span className="block text-xs text-muted-foreground">{GOAL_INFO[g].hint}</span>
              </span>
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
      <FieldError id="goals-error" message={error} />
    </div>
  )
}

// ------------------------------------------------------------- mått ---
/** Vikt, längd, ålder och kön – underlaget för Mifflin-St Jeor. */
export function BodyFields({ draft, onChange, errors = {} }: { draft: GoalDraft; onChange: (patch: Partial<GoalDraft>) => void; errors?: Errors }) {
  const num = (id: keyof GoalDraft & DraftField, label: string, unit: string, limits: { min: number; max: number }, decimal = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`goal-${id}`}>{label}</Label>
      <div className="relative">
        <NumberInput
          id={`goal-${id}`}
          decimal={decimal}
          inputMode={decimal ? "decimal" : "numeric"}
          min={limits.min}
          max={limits.max}
          value={draft[id] as number | undefined}
          onValueChange={(v) => onChange({ [id]: v })}
          aria-invalid={errors[id] ? true : undefined}
          aria-describedby={errors[id] ? `goal-${id}-error` : undefined}
          className="h-12 pr-12 text-lg tabular"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{unit}</span>
      </div>
      <FieldError id={`goal-${id}-error`} message={errors[id]} />
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {num("weightKg", "Nuvarande vikt", "kg", LIMITS.weightKg, true)}
        {num("heightCm", "Längd", "cm", LIMITS.heightCm)}
        {num("age", "Ålder", "år", LIMITS.age)}
      </div>
      <div className="space-y-1.5">
        <Label id="goal-sex-label">Kön</Label>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-labelledby="goal-sex-label">
          {(Object.keys(SEX_INFO) as Sex[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={draft.sex === s}
              onClick={() => onChange({ sex: s })}
              className={cn("min-h-11 rounded-lg px-2 text-sm leading-tight transition-colors", draft.sex === s ? "bg-background font-semibold shadow-xs" : "text-muted-foreground")}
            >
              {s === "other" ? "Annat" : SEX_INFO[s].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Används bara i formeln för ämnesomsättningen. &quot;Annat&quot; räknar med ett medelvärde.</p>
        <FieldError id="goal-sex-error" message={errors.sex} />
      </div>
    </div>
  )
}

// --------------------------------------------------------- aktivitet ---
export function ActivityPicker({ value, onChange, error }: { value?: ActivityLevel; onChange: (a: ActivityLevel) => void; error?: string }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2" role="radiogroup" aria-label="Aktivitetsnivå" data-testid="activity-picker">
        {ACTIVITY_LEVELS.map((a) => {
          const Icon = ACTIVITY_ICON[a]
          const on = value === a
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(a)}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 text-left transition-colors active:scale-[0.99]",
                on ? "border-primary bg-primary/8 ring-1 ring-primary" : "hover:bg-muted/60"
              )}
            >
              <Icon className={cn("size-5 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{ACTIVITY_INFO[a].label}</span>
                <span className="block text-xs text-muted-foreground">{ACTIVITY_INFO[a].hint}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular">×{ACTIVITY_INFO[a].factor.toLocaleString("sv-SE")}</span>
            </button>
          )
        })}
      </div>
      <FieldError id="activity-error" message={error} />
    </div>
  )
}

// ------------------------------------------------------------ reglage ---
/**
 * Aggressivitetsreglaget. Intervallet beror på målen: nedgång −0,25 … −1,0
 * kg/vecka, ökning +0,1 … +0,5, rekomp 0 … −0,5. Värdet skickas uppåt vid
 * varje rörelse, så kalorimålet och grafen räknas om i realtid.
 */
export function RateSlider({ goals, value, onChange }: { goals: GoalKey[]; value?: number; onChange: (rate: number) => void }) {
  const mode = planMode(goals)
  const range = RATE_RANGES[mode]
  if (mode === "maintain") return null
  const rate = clampRate(mode, value)
  // Reglaget går från lugn (vänster) till intensiv (höger) oavsett riktning.
  const intensity = Math.abs(rate)
  const lo = Math.min(Math.abs(range.min), Math.abs(range.max))
  const hi = Math.max(Math.abs(range.min), Math.abs(range.max))
  const sign = mode === "bulk" ? 1 : -1
  const pct = hi === lo ? 0 : ((intensity - lo) / (hi - lo)) * 100
  return (
    <div className="space-y-3" data-testid="rate-slider">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor="goal-rate">{mode === "bulk" ? "Takt för viktökning" : mode === "recomp" ? "Underskott (fettfokus)" : "Hur snabbt vill du gå ned?"}</Label>
        <span className="text-base font-semibold tabular" aria-live="polite" data-testid="rate-value">
          {formatRate(rate)}
        </span>
      </div>
      <input
        id="goal-rate"
        type="range"
        min={lo}
        max={hi}
        step={range.step}
        value={intensity}
        onChange={(e) => onChange(Math.round(sign * Number(e.target.value) * 100) / 100)}
        aria-valuetext={formatRate(rate)}
        className="h-11 w-full cursor-pointer touch-pan-y appearance-none bg-transparent accent-primary [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--primary)_var(--fill),var(--muted)_var(--fill))] [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-md"
        style={{ "--fill": `${pct}%` } as React.CSSProperties}
      />
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Snabbval för takt">
        {range.presets.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={Math.abs(rate - p.value) < 0.001}
            onClick={() => onChange(p.value)}
            className={cn(
              "min-h-11 rounded-xl border px-1.5 py-1 text-center text-xs leading-tight transition-colors",
              Math.abs(rate - p.value) < 0.001 ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            <span className="block">{p.label}</span>
            <span className="block tabular">{formatRate(p.value).replace("/vecka", "/v")}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------- resultat ---
const fmt = (n: number) => Math.round(n).toLocaleString("sv-SE")
const kgText = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`

/**
 * Din plan: kalorimål och makron, reglaget, målvikt och framtidsgrafen.
 * Räknas om vid varje ändring (rent i webbläsaren, inga anrop).
 */
export function GoalResults({ draft, onChange, errors = {} }: { draft: GoalDraft; onChange: (patch: Partial<GoalDraft>) => void; errors?: Errors }) {
  const input = planInput(draft)
  // Billigt (en veckosimulering) – räknas om vid varje rörelse i reglaget.
  const overview = input ? goalOverview(input) : null
  if (!input || !overview) return <p className="text-sm text-muted-foreground">Fyll i dina mått för att se din plan.</p>
  const { plan, points, series, reachedWeek } = overview
  const mode = plan.mode
  const last = points.at(-1)!
  const t = plan.targets
  const adjust = plan.dailyAdjustKcal
  const summary =
    series.length > 1
      ? `Om ${last.week} veckor: fett ${kgText(last.fatDelta)}, muskler ${kgText(last.leanDelta)} (vikt ${kgText(last.weightDelta)})`
      : series[0].key === "leanDelta"
        ? `Om ${last.week} veckor: ca ${kgText(last.leanDelta)} muskelmassa (vikt ${kgText(last.weightDelta)})`
        : `Om ${last.week} veckor: ${kgText(last.weightDelta)} (${last.weightKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg)`

  return (
    <div className="space-y-5" data-testid="goal-results">
      {/* Kalorimål */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Flame className="size-3.5 text-primary" /> Ditt dagliga kalorimål
        </p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular" data-testid="goal-kcal">
          {fmt(t.kcal)} <span className="text-base font-medium text-muted-foreground">kcal</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          BMR {fmt(plan.bmr)} kcal × aktivitet = TDEE {fmt(plan.tdee)} kcal
          {adjust !== 0 && <> · {adjust < 0 ? "underskott" : "överskott"} {fmt(Math.abs(adjust))} kcal/dag</>}
        </p>
        <MacroSplitBar value={t} className="mt-3" />
        <ul className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="goal-macros">
          {(
            [
              ["protein", "Protein", t.protein],
              ["carbs", "Kolhydrater", t.carbs],
              ["fat", "Fett", t.fat],
            ] as const
          ).map(([key, label, g]) => (
            <li key={key} className="rounded-xl bg-background/80 px-1 py-2">
              <span className="block text-lg font-semibold tabular">
                {g}
                <span className="text-xs font-normal"> g</span>
              </span>
              <span className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                <MacroDot macro={key} /> {label}
              </span>
            </li>
          ))}
        </ul>
        {draft.goals.includes("endurance") && (
          <p className="mt-3 flex gap-1.5 text-xs text-muted-foreground">
            <HeartPulse className="mt-0.5 size-3.5 shrink-0 text-primary" />
            Uthållighet: {plan.carbsPerKg.toLocaleString("sv-SE")} g kolhydrater per kg kroppsvikt för fyllda glykogendepåer. Ät mer kolhydrater de dagar du tränar länge.
          </p>
        )}
      </div>

      {/* Reglaget och målvikt */}
      {mode !== "maintain" && (
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <RateSlider goals={input.goals} value={draft.weeklyChangeKg} onChange={(weeklyChangeKg) => onChange({ weeklyChangeKg })} />
          <div className="space-y-1.5">
            <Label htmlFor="goal-target">
              <Target className="size-4 text-muted-foreground" /> Målvikt (valfritt)
            </Label>
            <div className="relative max-w-40">
              <NumberInput
                id="goal-target"
                decimal
                inputMode="decimal"
                min={LIMITS.weightKg.min}
                max={LIMITS.weightKg.max}
                value={draft.targetWeightKg}
                onValueChange={(v) => onChange({ targetWeightKg: v })}
                aria-invalid={errors.targetWeightKg ? true : undefined}
                className="h-11 pr-10 tabular"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">kg</span>
            </div>
            <FieldError id="goal-target-error" message={errors.targetWeightKg} />
            {reachedWeek ? (
              <p className="text-xs text-muted-foreground" data-testid="goal-reached">
                Med den här takten når du målvikten om ungefär <b className="text-foreground">{reachedWeek} veckor</b>.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Framtidsgrafen */}
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">{series.length > 1 ? "Fett och muskler vecka för vecka" : series[0].key === "leanDelta" ? "Muskelmassa vecka för vecka" : "Vikt vecka för vecka"}</h3>
          <span className="text-xs text-muted-foreground">Förändring från idag</span>
        </div>
        <GoalProjectionChart points={points} series={series} reachedWeek={reachedWeek} />
        <p className="text-sm font-medium" data-testid="goal-summary">
          {summary}
        </p>
        {mode === "maintain" && <p className="text-xs text-muted-foreground">Energi i balans: vikten hålls stabil medan du blir starkare, piggare och uthålligare.</p>}
        {mode === "recomp" && (
          <p className="text-xs text-muted-foreground">Body recomposition: vikten ändras lite medan kroppssammansättningen förändras – mät gärna midjan och följ styrkan, inte bara vågen.</p>
        )}
      </div>

      {plan.warnings.length > 0 && (
        <ul className="space-y-2" data-testid="goal-warnings">
          {plan.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Friskrivningen (heads-up) – längst ned i intro-flödet och under Profil → Mål. */
export function GoalDisclaimer({ className }: { className?: string }) {
  return (
    <aside className={cn("flex gap-2.5 rounded-2xl border border-border/70 bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground", className)} data-testid="goal-disclaimer">
      <Info className="mt-0.5 size-4 shrink-0 text-foreground/60" aria-hidden />
      <p>
        <span className="sr-only">Heads up: </span>
        {GOAL_DISCLAIMER}
      </p>
    </aside>
  )
}
