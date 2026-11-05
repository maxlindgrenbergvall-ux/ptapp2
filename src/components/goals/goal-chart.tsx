"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { ChartFrame } from "@/components/charts/progress-charts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { ChartSeries, ProjectionPoint, SeriesKey } from "@/lib/goals/metabolism"

/** Färger: vikt i varumärkets grön, fett orange, muskler blå (validerade för färgblindhet, ljust och mörkt läge). */
const COLOR: Record<SeriesKey, string> = {
  weightDelta: "var(--chart-brand)",
  fatDelta: "var(--chart-2)",
  leanDelta: "var(--chart-1)",
}

const kg = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`

/**
 * Framtidsgrafen: förväntad förändring (kg) vecka för vecka. En linje för ett
 * mål (vikt eller muskelmassa) – två linjer i samma diagram när fett- och
 * muskelmål kombineras (t.ex. viktnedgång + muskelmassa eller rekomp).
 * Alla linjer är förändring från start, så de delar en y-axel.
 */
export function GoalProjectionChart({
  points,
  series,
  reachedWeek,
  actual,
  adaptive,
  nowWeek,
  size = "md",
  className,
}: {
  points: ProjectionPoint[]
  series: ChartSeries[]
  reachedWeek?: number | null
  /** Faktiska vägningar (förändring i kg från start) per vecka – ritas ovanpå planen (Framsteg). */
  actual?: { week: number; delta: number }[]
  /** v34: uppdaterad prognos (uppmätt förbränning och träningsfrekvens) – streckad, från senaste vägningen. */
  adaptive?: ProjectionPoint[]
  /** Markerar "Nu" på x-axeln. */
  nowWeek?: number
  /** "lg" (v40): den stora grafen i Framsteg. */
  size?: "md" | "lg"
  className?: string
}) {
  const hasAdaptive = !!adaptive?.length
  const config = {
    ...Object.fromEntries(series.map((s) => [s.key, { label: hasAdaptive ? `${s.label} (plan)` : s.label, color: COLOR[s.key] }])),
    ...(hasAdaptive ? Object.fromEntries(series.map((s) => [`adaptive_${s.key}`, { label: `${s.label} (uppdaterad)`, color: COLOR[s.key] }])) : {}),
    ...(actual?.length ? { actualDelta: { label: "Faktisk vikt", color: "var(--chart-3)" } } : {}),
  } satisfies ChartConfig
  type Row = ProjectionPoint & { actualDelta?: number } & Partial<Record<`adaptive_${SeriesKey}`, number>>
  const rows: Row[] = points.map((p) => {
    const a = actual?.find((x) => x.week === p.week)
    const ad = adaptive?.find((x) => x.week === p.week)
    return {
      ...p,
      ...(a ? { actualDelta: a.delta } : {}),
      ...(ad ? Object.fromEntries(series.map((s) => [`adaptive_${s.key}`, ad[s.key]])) : {}),
    }
  })
  const values = [
    ...points.flatMap((p) => series.map((s) => p[s.key])),
    ...(actual ?? []).map((a) => a.delta),
    ...(adaptive ?? []).filter((p) => p.week <= (points.at(-1)?.week ?? 0)).flatMap((p) => series.map((s) => p[s.key])),
  ]
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const pad = Math.max(0.3, (hi - lo) * 0.08)
  const domain = [Math.floor(lo - pad), Math.ceil(hi + pad)]
  const last = points.at(-1)

  return (
    <div className={className} data-testid="goal-chart" data-series={series.map((s) => s.key).join(",")} data-adaptive={hasAdaptive ? "1" : undefined}>
      <ChartFrame
        caption={`Förväntad utveckling i ${points.length - 1} veckor: ${series.map((s) => `${s.label.toLowerCase()} ${kg(last?.[s.key] ?? 0)}`).join(", ")}`}
        table={{
          head: [
            "Vecka",
            ...series.map((s) => `${s.label}${hasAdaptive ? ", plan" : ""} (kg)`),
            ...(hasAdaptive ? series.map((s) => `${s.label}, uppdaterad (kg)`) : []),
            "Vikt (kg)",
            ...(actual?.length ? ["Faktisk (kg)"] : []),
          ],
          rows: rows.map((p) => [
            String(p.week),
            ...series.map((s) => kg(p[s.key])),
            ...(hasAdaptive ? series.map((s) => (p[`adaptive_${s.key}`] === undefined ? "–" : kg(p[`adaptive_${s.key}`]!))) : []),
            p.weightKg.toFixed(1),
            ...(actual?.length ? [p.actualDelta === undefined ? "–" : kg(p.actualDelta)] : []),
          ]),
        }}
      >
        <ChartContainer config={config} className={size === "lg" ? "aspect-auto h-72 w-full sm:h-96" : "aspect-auto h-56 w-full sm:h-64"}>
          <LineChart data={rows} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} tickFormatter={(w) => (w === 0 ? "Start" : `v${w}`)} minTickGap={20} />
            <YAxis tickLine={false} axisLine={false} tickMargin={6} fontSize={12} width={40} domain={domain} allowDecimals={false} tickCount={5} tickFormatter={(v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0")} />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
            {nowWeek ? <ReferenceLine x={nowWeek} stroke="var(--muted-foreground)" strokeOpacity={0.6} label={{ value: "Nu", position: "insideTopLeft", fontSize: 11, fill: "var(--muted-foreground)" }} /> : null}
            {reachedWeek ? <ReferenceLine x={reachedWeek} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Målvikt", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }} /> : null}
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as ProjectionPoint | undefined
                    return p ? `${p.week === 0 ? "Start" : `Vecka ${p.week}`} · ${p.weightKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg` : ""
                  }}
                  formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-3">
                      <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? name}</span>
                      <span className="font-medium tabular">{kg(Number(value))}</span>
                    </span>
                  )}
                />
              }
            />
            {series.length + (actual?.length ? 1 : 0) + (hasAdaptive ? series.length : 0) > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="monotone"
                stroke={`var(--color-${s.key})`}
                strokeWidth={2.5}
                strokeOpacity={hasAdaptive ? 0.4 : 1}
                dot={false}
                activeDot={{ r: 5 }}
                animationDuration={250}
              />
            ))}
            {hasAdaptive &&
              series.map((s) => (
                <Line
                  key={`adaptive_${s.key}`}
                  dataKey={`adaptive_${s.key}`}
                  type="monotone"
                  stroke={`var(--color-adaptive_${s.key})`}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                  activeDot={{ r: 5 }}
                  animationDuration={250}
                />
              ))}
            {actual?.length ? (
              <Line dataKey="actualDelta" type="monotone" stroke="var(--color-actualDelta)" strokeWidth={2} dot={{ r: 3 }} connectNulls animationDuration={250} />
            ) : null}
          </LineChart>
        </ChartContainer>
      </ChartFrame>
    </div>
  )
}
