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
  className,
}: {
  points: ProjectionPoint[]
  series: ChartSeries[]
  reachedWeek?: number | null
  className?: string
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: COLOR[s.key] }])) satisfies ChartConfig
  const values = points.flatMap((p) => series.map((s) => p[s.key]))
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const pad = Math.max(0.3, (hi - lo) * 0.08)
  const domain = [Math.floor(lo - pad), Math.ceil(hi + pad)]
  const last = points.at(-1)

  return (
    <div className={className} data-testid="goal-chart" data-series={series.map((s) => s.key).join(",")}>
      <ChartFrame
        caption={`Förväntad utveckling i ${points.length - 1} veckor: ${series.map((s) => `${s.label.toLowerCase()} ${kg(last?.[s.key] ?? 0)}`).join(", ")}`}
        table={{
          head: ["Vecka", ...series.map((s) => `${s.label} (kg)`), "Vikt (kg)"],
          rows: points.map((p) => [String(p.week), ...series.map((s) => kg(p[s.key])), p.weightKg.toFixed(1)]),
        }}
      >
        <ChartContainer config={config} className="aspect-auto h-56 w-full sm:h-64">
          <LineChart data={points} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} tickFormatter={(w) => (w === 0 ? "Start" : `v${w}`)} minTickGap={20} />
            <YAxis tickLine={false} axisLine={false} tickMargin={6} fontSize={12} width={40} domain={domain} allowDecimals={false} tickCount={5} tickFormatter={(v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0")} />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
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
                      <span className="text-muted-foreground">{config[name as SeriesKey]?.label ?? name}</span>
                      <span className="font-medium tabular">{kg(Number(value))}</span>
                    </span>
                  )}
                />
              }
            />
            {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="monotone"
                stroke={`var(--color-${s.key})`}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
                animationDuration={250}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </ChartFrame>
    </div>
  )
}
