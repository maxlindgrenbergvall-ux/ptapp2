"use client"

import { ChevronRight, Dumbbell, TrendingDown, TrendingUp } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exerciseName } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatShort, todayISO } from "@/lib/date"
import { liftKpis, weeklySetsByMuscle } from "@/lib/training"
import { cn } from "@/lib/utils"
import type { Client, MuscleGroup, ScheduledWorkout } from "@/types/domain"

const kg = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })

/** Ungefärligt riktmärke för hypertrofi: 10–20 effektiva set per muskelgrupp och vecka. */
const TARGET_SETS = { low: 10, high: 20 }
const GROUP_LABEL: Record<MuscleGroup, string> = {
  ben: "Ben",
  bröst: "Bröst",
  rygg: "Rygg",
  axlar: "Axlar",
  armar: "Armar",
  bål: "Bål",
  helkropp: "Helkropp",
  kondition: "Kondition",
}

/**
 * Framstegens nyckeltal – gratis för alla (v24). Räknas fram ur loggade set,
 * inget behöver fyllas i:
 *  1. Lyften (v39: bara faktiska lyft): senaste tyngsta set (vikt × reps),
 *     bästa set senaste 4 veckorna och utvecklingen i vikt mot 4–8 veckor sedan.
 *  2. Veckovolym: effektiva set per muskelgrupp och vecka.
 */
export function ProgressKpis({ client, workouts }: { client: Client; workouts: ScheduledWorkout[] }) {
  return (
    <section className="space-y-3" aria-labelledby="kpi-title" data-testid="progress-kpis">
      <h2 id="kpi-title" className="font-semibold">
        Nyckeltal
      </h2>
      <LiftTable client={client} workouts={workouts} />
      <WeeklyVolume workouts={workouts} />
    </section>
  )
}

function LiftTable({ client, workouts }: { client: Client; workouts: ScheduledWorkout[] }) {
  const { data } = useAppData()
  const lifts = liftKpis(workouts, todayISO()).slice(0, 6)
  return (
    <Card data-testid="kpi-lifts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="size-4" /> Styrka
        </CardTitle>
        <CardDescription>Ditt tyngsta set i varje lyft – vikt och reps som du faktiskt gjort.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Logga set med vikt så visas dina lyft här.</p>
        ) : (
          <ul className="divide-y divide-border/60" aria-label="Tyngsta set per övning">
            {lifts.map((l) => (
              <li key={l.exerciseId}>
                <Link
                  href={`/klient/framsteg/ovning/${encodeURIComponent(l.exerciseId)}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{exerciseName(data, l.exerciseId, client.id)}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.sessions} pass · senast {formatShort(l.date)}: {kg(l.latest.kg)} × {l.latest.reps}
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular">
                    <div className="text-sm font-semibold" title="Tyngsta set senaste 4 veckorna">
                      {kg(l.best.kg)} kg × {l.best.reps}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                      {l.change !== null && l.change !== 0 && (
                        <span
                          className={cn("inline-flex items-center gap-0.5", l.change > 0 ? "text-success" : "text-destructive")}
                          aria-label={`${l.change > 0 ? "Ökning" : "Minskning"} ${kg(Math.abs(l.change))} kg mot för 4–8 veckor sedan`}
                        >
                          {l.change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                          {l.change > 0 ? "+" : "−"}
                          {kg(Math.abs(l.change))}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function WeeklyVolume({ workouts }: { workouts: ScheduledWorkout[] }) {
  const { data } = useAppData()
  const weeks = weeklySetsByMuscle(workouts, data.exercises, todayISO(), 5)
  const current = weeks.at(-1)!
  const previous = weeks.at(-2)
  // Snitt för de fyra 7-dagarsperioderna innan.
  const past = weeks.slice(0, -1)
  const groups = (Object.keys(GROUP_LABEL) as MuscleGroup[]).filter(
    (g) => g !== "kondition" && weeks.some((w) => (w.sets[g] ?? 0) > 0)
  )
  const max = Math.max(TARGET_SETS.high, ...groups.map((g) => current.sets[g] ?? 0))

  return (
    <Card data-testid="kpi-volume">
      <CardHeader>
        <CardTitle>Veckovolym per muskelgrupp</CardTitle>
        <CardDescription>
          Effektiva set de senaste 7 dagarna (genomförda arbetsset, utan uppvärmning). Riktmärke för muskeltillväxt: {TARGET_SETS.low}–{TARGET_SETS.high} set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga genomförda styrkeset de senaste veckorna.</p>
        ) : (
          <ul className="space-y-3">
            {groups.map((g) => {
              const n = current.sets[g] ?? 0
              const avg = past.length ? past.reduce((s, w) => s + (w.sets[g] ?? 0), 0) / past.length : 0
              return (
                <li key={g} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{GROUP_LABEL[g]}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      <span className="text-sm font-semibold text-foreground">{n}</span> set · snitt {avg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}/v
                    </span>
                  </div>
                  <div
                    className="relative h-2 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-label={`${GROUP_LABEL[g]}: ${n} set senaste 7 dagarna`}
                    aria-valuenow={n}
                    aria-valuemin={0}
                    aria-valuemax={max}
                  >
                    {/* Riktmärket 10–20 set som ett ljust band bakom stapeln. */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 bg-primary/15"
                      style={{ left: `${(TARGET_SETS.low / max) * 100}%`, width: `${((TARGET_SETS.high - TARGET_SETS.low) / max) * 100}%` }}
                    />
                    <span
                      aria-hidden
                      className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", n >= TARGET_SETS.low ? "bg-primary" : "bg-primary/60")}
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {previous && (
          <p className="text-xs text-muted-foreground tabular">
            Totalt {current.total} set senaste 7 dagarna · {previous.total} veckan innan
          </p>
        )}
      </CardContent>
    </Card>
  )
}
