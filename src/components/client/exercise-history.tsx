"use client"

import { ArrowLeft, ChevronRight, Dumbbell, Trophy } from "lucide-react"
import Link from "next/link"

import { TrendChart } from "@/components/charts/progress-charts"
import { EmptyState, StatTile } from "@/components/common"
import { RequirePlus, usePlus } from "@/components/plus/require-plus"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { exerciseName, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatDay, formatShort, todayISO } from "@/lib/date"
import { historyCutoff } from "@/lib/plus"
import { exerciseHistory } from "@/lib/training"

const kgFmt = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 2 })

/** Historik för en övning: varje tillfälle med vikter, reps och set. */
export function ExerciseHistoryView({ exerciseId }: { exerciseId: string }) {
  const { data, me } = useAppData()
  const name = exerciseName(data, exerciseId, me.id)
  const sessions = exerciseHistory(exerciseId, workoutsFor(data, me.id))
  const best = sessions.reduce<(typeof sessions)[number] | null>((a, s) => (!a || s.e1rm > a.e1rm ? s : a), null)
  const usesWeight = sessions.some((s) => s.sets.some((l) => l.kg > 0))
  // Gratis: tillfällen de senaste 30 dagarna. Äldre kräver Coavira Plus.
  const { isPlus } = usePlus()
  const cutoff = historyCutoff(todayISO())
  const recent = sessions.filter((s) => s.date >= cutoff)
  const older = sessions.filter((s) => s.date < cutoff)

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/klient/framsteg">
          <ArrowLeft /> Framsteg
        </Link>
      </Button>
      <div>
        <p className="text-sm text-muted-foreground">Historik</p>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon={Dumbbell} title="Inga loggade set än" text="När du kört övningen i ett pass syns varje tillfälle här." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {usesWeight && best?.topSet ? (
              <StatTile
                label="Personbästa"
                icon={Trophy}
                value={`${kgFmt(best.topSet.kg)} kg × ${best.topSet.reps}`}
                sub={`≈ ${kgFmt(best.e1rm)} kg 1RM · ${formatShort(best.date)}`}
              />
            ) : (
              <StatTile label="Bästa set" icon={Trophy} value={best?.topSet ? `${best.topSet.reps} reps` : "–"} />
            )}
            <StatTile label="Tillfällen" value={sessions.length} sub={`Senast ${formatShort(sessions[0].date)}`} />
          </div>

          {/* Coavira Plus: djupgående graf (1RM-utveckling). */}
          {usesWeight && (
            <RequirePlus feature="charts" title="1RM-utveckling">
              <section className="space-y-2 rounded-2xl border bg-card p-4">
                <h2 className="text-sm font-medium">Uppskattat 1RM</h2>
                <TrendChart label="Uppskattat 1RM" unit="kg" points={[...sessions].reverse().map((s) => ({ date: s.date, value: s.e1rm }))} />
              </section>
            </RequirePlus>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Alla tillfällen</h2>
            <SessionList sessions={isPlus ? sessions : recent} usesWeight={usesWeight} />
            {/* Coavira Plus: historik äldre än 30 dagar. */}
            {!isPlus && older.length > 0 && (
              <RequirePlus feature="history" title={`${older.length} äldre tillfällen`}>
                <SessionList sessions={older.slice(0, 2)} usesWeight={usesWeight} />
              </RequirePlus>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** Tillfällen med set, volym och uppskattat 1RM. */
function SessionList({ sessions, usesWeight }: { sessions: ReturnType<typeof exerciseHistory>; usesWeight: boolean }) {
  return (
    <ol className="space-y-2">
      {sessions.map((s) => (
        <li key={s.workoutId}>
          <Link href={`/klient/pass/${s.workoutId}`} className="block rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{formatDay(s.date)}</div>
                <div className="text-xs text-muted-foreground">{s.workoutName}</div>
              </div>
              <div className="flex items-center gap-2">
                {s.isPR && (
                  <Badge className="bg-primary text-primary-foreground">
                    <Trophy /> PB
                  </Badge>
                )}
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </div>
            <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Set">
              {s.sets.map((l) => (
                <li key={l.setIndex} className="rounded-lg bg-muted px-2 py-1 text-sm tabular">
                  <span className="mr-1 text-xs text-muted-foreground">{l.setIndex + 1}.</span>
                  {l.kg > 0 ? `${kgFmt(l.kg)} × ${l.reps}` : `${l.reps} reps`}
                </li>
              ))}
            </ol>
            {usesWeight && (
              <p className="mt-2 text-xs text-muted-foreground tabular">
                Volym {Math.round(s.volume).toLocaleString("sv-SE")} kg · ≈ {kgFmt(s.e1rm)} kg 1RM
              </p>
            )}
          </Link>
        </li>
      ))}
    </ol>
  )
}
