"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts"

import { RevealOnView } from "@/components/motion"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { addDays, formatShort, parseISODate, todayISO } from "@/lib/date"
import { oneRepMaxSeries } from "@/lib/training"
import type { ScheduledWorkout, WeightEntry } from "@/types/domain"

/*
 * Diagramregler (dataviz-skillen): en y-axel, 2 px linjer, återhållsamt rutnät,
 * tooltip på hover/tap, legend när det finns ≥ 2 serier plus direktetiketter
 * vid linjeslut. Färger: --chart-1..3 (validerade för färgblindhet i båda lägena).
 * Varje graf har dessutom en tabellvy för skärmläsare och utskrift.
 */

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 12,
} as const

export function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const config = { kg: { label: "Vikt", color: "var(--chart-brand)" } } satisfies ChartConfig
  if (entries.length < 2) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Minst två vägningar behövs för en graf.</p>
  }
  const values = entries.map((e) => e.kg)
  const domain = [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)]
  return (
    <ChartFrame
      table={{ head: ["Datum", "Vikt (kg)"], rows: entries.map((e) => [formatShort(e.date), e.kg.toFixed(1)]) }}
      caption="Viktutveckling"
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart data={entries} margin={{ left: 0, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.5} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatShort} minTickGap={24} />
          <YAxis {...axisProps} domain={domain} width={36} />
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={<ChartTooltipContent labelFormatter={(v) => formatShort(String(v))} formatter={(v) => `${v} kg`} />}
          />
          <Line dataKey="kg" type="monotone" stroke="var(--color-kg)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartContainer>
    </ChartFrame>
  )
}

/** En serie över tid i varumärkesgrönt (t.ex. uppskattat 1RM för en övning). */
export function TrendChart({
  points,
  label,
  unit,
}: {
  points: { date: string; value: number }[]
  label: string
  unit: string
}) {
  const config = { value: { label, color: "var(--chart-brand)" } } satisfies ChartConfig
  if (points.length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Minst två tillfällen behövs för en kurva.</p>
  }
  const values = points.map((p) => p.value)
  const pad = Math.max(2, (Math.max(...values) - Math.min(...values)) * 0.15)
  return (
    <ChartFrame caption={label} table={{ head: ["Datum", `${label} (${unit})`], rows: points.map((p) => [formatShort(p.date), String(p.value)]) }}>
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <LineChart data={points} margin={{ left: 0, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.5} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatShort} minTickGap={24} />
          <YAxis {...axisProps} width={36} domain={[Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)]} />
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={<ChartTooltipContent labelFormatter={(v) => formatShort(String(v))} formatter={(v) => `${v} ${unit}`} />}
          />
          <Line dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartContainer>
    </ChartFrame>
  )
}

const LIFTS = [
  { key: "squat", exerciseId: "e-squat", label: "Knäböj", color: "var(--chart-1)" },
  { key: "bench", exerciseId: "e-bench", label: "Bänkpress", color: "var(--chart-2)" },
  { key: "deadlift", exerciseId: "e-deadlift", label: "Marklyft", color: "var(--chart-3)" },
] as const

export function StrengthChart({ workouts }: { workouts: ScheduledWorkout[] }) {
  const config = Object.fromEntries(LIFTS.map((l) => [l.key, { label: l.label, color: l.color }])) satisfies ChartConfig

  const data = React.useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    for (const lift of LIFTS) {
      for (const p of oneRepMaxSeries(lift.exerciseId, workouts)) {
        const row = byDate.get(p.date) ?? { date: p.date }
        row[lift.key] = p.e1rm
        byDate.set(p.date, row)
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [workouts])

  if (data.length < 2) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Inga loggade baslyft ännu.</p>
  }

  const all = data.flatMap((d) => LIFTS.map((l) => d[l.key]).filter((v): v is number => typeof v === "number"))
  const yDomain = [Math.floor((Math.min(...all) - 5) / 10) * 10, Math.ceil((Math.max(...all) + 5) / 10) * 10]

  // Direktetikett på sista punkten för varje lyft (identitet utan att lita på färg).
  const lastIndex = (key: string) => data.findLastIndex((d) => d[key] !== undefined)

  return (
    <ChartFrame
      caption="Uppskattat 1RM (kg)"
      table={{
        head: ["Datum", ...LIFTS.map((l) => l.label)],
        rows: data.map((d) => [formatShort(String(d.date)), ...LIFTS.map((l) => (d[l.key] ?? "–").toString())]),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={data} margin={{ left: 0, right: 96, top: 8 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.5} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatShort} minTickGap={24} />
          <YAxis {...axisProps} width={36} domain={yDomain} />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(v) => formatShort(String(v))} formatter={(v, name) => (
              <span className="flex w-full justify-between gap-4">
                <span className="text-muted-foreground">{config[name as keyof typeof config]?.label}</span>
                <span className="font-medium tabular">{v} kg</span>
              </span>
            )} />}
          />
          <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
          {LIFTS.map((lift) => (
            <Line
              key={lift.key}
              dataKey={lift.key}
              type="monotone"
              stroke={`var(--color-${lift.key})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
              connectNulls
            >
              <LabelList
                dataKey={lift.key}
                content={({ index, x, y, value }) =>
                  index === lastIndex(lift.key) ? (
                    <text x={Number(x) + 6} y={Number(y)} dy={4} fontSize={11} className="fill-foreground tabular">
                      {lift.label} {value}
                    </text>
                  ) : null
                }
              />
            </Line>
          ))}
        </LineChart>
      </ChartContainer>
    </ChartFrame>
  )
}

/** Genomförda pass per vecka, senaste `weeks` veckorna (måndag–söndag). */
export function SessionsChart({ workouts, weeks = 12 }: { workouts: ScheduledWorkout[]; weeks?: number }) {
  const config = { done: { label: "Genomförda pass", color: "var(--chart-brand)" } } satisfies ChartConfig
  const data = React.useMemo(() => {
    const today = todayISO()
    const dow = (parseISODate(today).getDay() + 6) % 7 // måndag = 0
    const thisMonday = addDays(today, -dow)
    return Array.from({ length: weeks }, (_, i) => {
      const start = addDays(thisMonday, -7 * (weeks - 1 - i))
      const end = addDays(start, 6)
      const done = workouts.filter((w) => w.status === "completed" && w.date >= start && w.date <= end).length
      return { week: `v. ${isoWeek(start)}`, start, done }
    })
  }, [workouts, weeks])

  return (
    <ChartFrame
      caption="Genomförda pass per vecka"
      table={{ head: ["Vecka", "Pass"], rows: data.map((d) => [d.week, String(d.done)]) }}
    >
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <BarChart data={data} margin={{ left: 0, right: 0, top: 16 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} strokeOpacity={0.5} />
          <XAxis dataKey="week" {...axisProps} minTickGap={8} />
          <YAxis {...axisProps} allowDecimals={false} width={24} />
          <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideIndicator />} />
          <Bar dataKey="done" fill="var(--color-done)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  )
}

function isoWeek(date: string) {
  const d = parseISODate(date)
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}

/** Graf + valbar tabellvy (tillgänglighet: identitet och värden finns även som text). */
function ChartFrame({
  caption,
  table,
  children,
}: {
  caption: string
  table: { head: string[]; rows: string[][] }
  children: React.ReactNode
}) {
  const [showTable, setShowTable] = React.useState(false)
  return (
    <figure className="space-y-2">
      {showTable ? (
        <div className="max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-sm tabular">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-muted">
              <tr>{table.head.map((h) => <th key={h} className="px-3 py-1.5 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="px-3 py-1.5">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Diagrammet ritas (och animeras) först när det syns – även långt ner på mobilen.
        <div role="img" aria-label={caption}>
          <RevealOnView minHeight={192}>{children}</RevealOnView>
        </div>
      )}
      <figcaption className="text-right">
        <button type="button" onClick={() => setShowTable((s) => !s)} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          {showTable ? "Visa graf" : "Visa som tabell"}
        </button>
      </figcaption>
    </figure>
  )
}

