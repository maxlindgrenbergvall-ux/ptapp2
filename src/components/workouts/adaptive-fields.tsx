"use client"

/**
 * Adaptiva fält (v58): bara de fält som hör till övningens träningsform.
 *
 *   Styrka        Set × Reps × Vikt (kg)
 *   Löpning       Intervaller × Distans (km) × Tempo (min/km) × Vila (s)
 *   Kondition     Varv × Distans (m) × Reps / kal   (Hyrox-stationer, ergometrar)
 *
 * Alla sifferfält kan tömmas helt ("") – inget hoppar tillbaka till 1.
 */
import * as React from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useT } from "@/lib/i18n/provider"
import { formatTime, parseTime, type PlanCategory, PLAN_CATEGORIES } from "@/lib/training-modes"
import { MAX_REST_SEC, MAX_SETS } from "@/lib/exercises/draft"
import { cn } from "@/lib/utils"
import type { TrackingType, WorkoutExercise } from "@/types/domain"

/** Tid/tempo som "m:ss". Tomt fält = undefined. Formateras när fältet lämnas. */
export function TimeInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & { value: number | undefined; onValueChange: (sec: number | undefined) => void }) {
  const [draft, setDraft] = React.useState(() => formatTime(value))
  const [last, setLast] = React.useState(value)
  if (value !== last) {
    setLast(value)
    if (parseTime(draft) !== value) setDraft(formatTime(value))
  }
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? "m:ss"}
      value={draft}
      className={cn("tabular", className)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d:.,]/g, "").slice(0, 8)
        setDraft(next)
        onValueChange(parseTime(next))
      }}
      onBlur={() => {
        const sec = parseTime(draft)
        setDraft(sec === undefined ? "" : formatTime(sec))
      }}
    />
  )
}

/** Kompakt horisontell filterrad: Alla · Styrka · Löpning · Hyrox. Fast höjd. */
export function CategoryPills({
  value,
  onChange,
  favoured,
  className,
  testId = "category-pills",
}: {
  value: PlanCategory | "all"
  onChange: (v: PlanCategory | "all") => void
  /** Kategorier som intressena lyfter fram – får en liten prick. */
  favoured?: Set<PlanCategory>
  className?: string
  testId?: string
}) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t("plans.title")} className={cn("-mx-4 flex h-9 snap-x gap-1.5 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} data-testid={testId}>
      {(["all", ...PLAN_CATEGORIES] as const).map((c) => {
        const on = value === c
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            data-category={c}
            onClick={() => onChange(c)}
            className={cn(
              "flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-200",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card hover:bg-muted"
            )}
          >
            {t(`filter.${c}`)}
            {c !== "all" && favoured?.has(c) && <span aria-label={t("filter.forYou")} className={cn("size-1.5 rounded-full", on ? "bg-primary-foreground" : "bg-primary")} />}
          </button>
        )
      })}
    </div>
  )
}

type Item = Omit<WorkoutExercise, "id" | "sets" | "restSec"> & { sets?: number; restSec?: number }

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label className="text-[11px] font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/**
 * Fälten för löpning och kondition (styrka ritas av varje byggare som förut).
 * `inBlock`: antalet varv styrs av blocket – fältet visas inte här.
 */
export function AdaptiveFields({ type, item, onUpdate, name, inBlock = false }: { type: Exclude<TrackingType, "strength">; item: Item; onUpdate: (patch: Partial<Item>) => void; name: string; inBlock?: boolean }) {
  const t = useT()
  const km = item.distanceM === undefined ? undefined : item.distanceM / 1000
  if (type === "running") {
    return (
      <div className={cn("grid gap-2", inBlock ? "grid-cols-3" : "grid-cols-4")} data-tracking="running">
        {!inBlock && (
          <Field label={t("fields.intervals")}>
            <NumberInput required min={1} max={MAX_SETS} value={item.sets} onValueChange={(v) => onUpdate({ sets: v })} aria-label={`${t("fields.intervals")} – ${name}`} />
          </Field>
        )}
        <Field label={t("fields.distanceKm")}>
          <NumberInput decimal min={0} max={100} value={km} onValueChange={(v) => onUpdate({ distanceM: v === undefined ? undefined : Math.round(v * 1000) })} aria-label={`${t("fields.distanceKm")} – ${name}`} />
        </Field>
        <Field label={t("fields.pace")}>
          <TimeInput value={item.paceSecPerKm} onValueChange={(v) => onUpdate({ paceSecPerKm: v })} placeholder="5:00" aria-label={`${t("fields.pace")} – ${name}`} />
        </Field>
        <Field label={t("fields.restSec")}>
          <NumberInput required min={0} max={MAX_REST_SEC} value={item.restSec} onValueChange={(v) => onUpdate({ restSec: v })} aria-label={`${t("fields.restSec")} – ${name}`} />
        </Field>
      </div>
    )
  }
  return (
    <div className={cn("grid gap-2", inBlock ? "grid-cols-2" : "grid-cols-3")} data-tracking="conditioning">
      {!inBlock && (
        <Field label={t("fields.rounds")}>
          <NumberInput required min={1} max={MAX_SETS} value={item.sets} onValueChange={(v) => onUpdate({ sets: v })} aria-label={`${t("fields.rounds")} – ${name}`} />
        </Field>
      )}
      <Field label={t("fields.distanceM")}>
        <NumberInput min={0} max={100000} value={item.distanceM} onValueChange={(v) => onUpdate({ distanceM: v })} aria-label={`${t("fields.distanceM")} – ${name}`} />
      </Field>
      <Field label={t("fields.repsOrCal")}>
        <Input value={item.reps} onChange={(e) => onUpdate({ reps: e.target.value })} placeholder="100" aria-label={`${t("fields.repsOrCal")} – ${name}`} />
      </Field>
    </div>
  )
}
