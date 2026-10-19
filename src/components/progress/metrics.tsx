"use client"

import { Plus, Sparkles, TrendingDown, TrendingUp, Trophy } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { formatShort, todayISO } from "@/lib/date"
import { bestOf, formatMetric, INTERESTS, interestByKey, metricSeries, metricsFor, parseTime, type InterestDef, type MetricDef } from "@/lib/interests"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

/** Klientens intressen som chips (syns också för klientens PT:er). */
export function InterestChips({ interests, className }: { interests?: string[]; className?: string }) {
  if (!interests?.length) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Intressen">
      {interests.map((k) => {
        const i = interestByKey(k)
        return i ? (
          <li key={k}>
            <Badge variant="secondary" className="gap-1 font-normal">
              <span aria-hidden>{i.emoji}</span> {i.label}
            </Badge>
          </li>
        ) : null
      })}
    </ul>
  )
}

/**
 * Mätpunkterna för klientens intressen. Väljer klienten t.ex. Cykling visas
 * "Bästa tid på milen" och "Snitt-watt"; Styrkelyft visar uppskattat 1RM ur
 * passloggen. `editable` = klienten själv (kan logga nya värden).
 */
export function MetricsGrid({ clientId, interests, editable }: { clientId: ID; interests?: string[]; editable?: boolean }) {
  const metrics = metricsFor(interests)
  const [logging, setLogging] = React.useState<MetricDef | null>(null)

  if (!metrics.length) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-primary" /> Välj dina intressen
        </p>
        <p className="text-muted-foreground">
          {editable
            ? "Berätta vad du tränar för, så visar vi rätt mätpunkter här – t.ex. bästa tid på milen för cykling eller 1RM för styrkelyft."
            : "Klienten har inte valt några intressen än."}
        </p>
        {editable && (
          <Button asChild size="sm" variant="outline">
            <Link href="/klient/profil">Välj intressen</Link>
          </Button>
        )}
      </div>
    )
  }

  // Grupperat per intresse, i den ordning klienten valt dem.
  const groups = metrics.reduce<{ interest: InterestDef; metrics: MetricDef[] }[]>((acc, { interest, metric }) => {
    const g = acc.find((x) => x.interest.key === interest.key)
    if (g) g.metrics.push(metric)
    else acc.push({ interest, metrics: [metric] })
    return acc
  }, [])

  return (
    <div className="space-y-4" data-testid="metrics-grid">
      {groups.map(({ interest, metrics }) => (
        <section key={interest.key} className="space-y-2" aria-label={interest.label}>
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <span aria-hidden>{interest.emoji}</span> {interest.label}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {metrics.map((m) => (
              <MetricCard key={m.key} clientId={clientId} metric={m} onLog={editable && !m.auto ? () => setLogging(m) : undefined} />
            ))}
          </div>
        </section>
      ))}
      <LogMetricDialog metric={logging} onClose={() => setLogging(null)} />
    </div>
  )
}

function MetricCard({ clientId, metric, onLog }: { clientId: ID; metric: MetricDef; onLog?: () => void }) {
  const { data } = useAppData()
  const series = metricSeries(data, clientId, metric)
  const latest = series.at(-1)
  const first = series[0]
  const best = bestOf(series, metric.lowerIsBetter)
  const delta = latest && first && series.length > 1 ? latest.value - first.value : 0
  const improving = metric.lowerIsBetter ? delta < 0 : delta > 0
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3" data-testid={`metric-${metric.key}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{metric.label}</p>
        {onLog && (
          <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 size-7" aria-label={`Logga ${metric.label}`} onClick={onLog}>
            <Plus />
          </Button>
        )}
      </div>
      {latest ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular">{formatMetric(metric, latest.value)}</span>
            {delta !== 0 && (
              <span className={cn("inline-flex items-center gap-0.5 text-xs", improving ? "text-success" : "text-muted-foreground")}>
                {delta < 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
                {metric.format === "time" ? formatMetric(metric, Math.abs(delta)) : formatMetric(metric, Math.abs(Math.round(delta * 10) / 10))}
              </span>
            )}
          </div>
          <Sparkline values={series.map((p) => p.value)} invert={metric.lowerIsBetter} />
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Trophy className="size-3" /> Bästa {best !== undefined ? formatMetric(metric, best) : "–"} · {formatShort(latest.date)}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{metric.auto ? "Fylls i när du loggar pass och vikt." : "Inget loggat än."}</p>
      )}
    </div>
  )
}

/** Liten trendlinje. Uppåt = bättre (inverteras för tider). */
function Sparkline({ values, invert }: { values: number[]; invert?: boolean }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100
      const n = (v - min) / span
      const y = 22 - (invert ? 1 - n : n) * 20
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full text-primary" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogMetricDialog({ metric, onClose }: { metric: MetricDef | null; onClose: () => void }) {
  const { actions } = useAppData()
  const [text, setText] = React.useState("")
  const [num, setNum] = React.useState<number | undefined>()
  const [date, setDate] = React.useState(todayISO())
  const [current, setCurrent] = React.useState<MetricDef | null>(null)
  if (metric !== current) {
    setCurrent(metric)
    setText("")
    setNum(undefined)
    setDate(todayISO())
  }
  if (!metric) return <Dialog open={false} />

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = metric.format === "time" ? parseTime(text) : num
    if (value === undefined || value < 0) return toast.error(metric.format === "time" ? "Skriv tiden som m:ss eller h:mm:ss" : "Ange ett värde")
    actions.addProgressEntry(metric.key, value, date)
    toast.success(`${metric.label}: ${formatMetric(metric, value)} sparat`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{metric.label}</DialogTitle>
            <DialogDescription>Syns för dig och dina PT:er.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="metric-value">{metric.format === "time" ? "Tid" : `Värde${metric.unit ? ` (${metric.unit})` : ""}`}</Label>
              {metric.format === "time" ? (
                <Input
                  id="metric-value"
                  inputMode="numeric"
                  placeholder={metric.hint ?? "m:ss"}
                  value={text}
                  onChange={(e) => setText(e.target.value.replace(/[^\d:.,]/g, ""))}
                  autoFocus
                />
              ) : (
                <NumberInput id="metric-value" decimal value={num} onValueChange={setNum} autoFocus />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="metric-date">Datum</Label>
              <Input id="metric-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit">Spara</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Intresseväljare (välkomststeget och profilen). */
export function InterestPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div role="group" aria-label="Intressen" className="flex flex-wrap gap-2">
      {INTERESTS.map((i) => {
        const on = value.includes(i.key)
        return (
          <button
            key={i.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((k) => k !== i.key) : [...value, i.key])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            <span aria-hidden>{i.emoji}</span> {i.label}
          </button>
        )
      })}
    </div>
  )
}
