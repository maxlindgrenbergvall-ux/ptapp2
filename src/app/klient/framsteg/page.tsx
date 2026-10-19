"use client"

import { ChevronRight, Flame, Plus, ShieldCheck, Trophy } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { SessionsChart, StrengthChart, WeightChart } from "@/components/charts/progress-charts"
import { MetricsGrid } from "@/components/progress/metrics"
import { StatTile } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { exerciseName, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, formatShort, todayISO } from "@/lib/date"
import { exerciseHistory, oneRepMaxSeries, setsDone, workoutVolume } from "@/lib/training"
import type { ScheduledWorkout } from "@/types/domain"

export default function ProgressPage() {
  const { data, actions, me } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)!
  const workouts = workoutsFor(data, client.id)
  const completed = workouts.filter((w) => w.status === "completed").sort((a, b) => b.date.localeCompare(a.date))
  const [kg, setKg] = React.useState("")

  const squat = oneRepMaxSeries("e-squat", workouts)
  // Styrkediagrammet visas för styrkeintressen (eller när inga intressen är valda och det finns lyft).
  const strengthInterests = ["styrkelyft", "bodybuilding", "kalisthenics"]
  const showStrength = client.interests?.length ? client.interests.some((k) => strengthInterests.includes(k)) : squat.length > 0
  const streak = weekStreak(completed.map((w) => w.date))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Framsteg</h1>

      {/* Mätpunkterna styrs av intressena: Cykling → tid på milen och watt, Styrkelyft → 1RM osv. */}
      <section className="space-y-3" aria-labelledby="goals-title">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="goals-title" className="font-semibold">
            Dina mål
          </h2>
          <Link href="/klient/profil" className="text-sm text-primary underline-offset-4 hover:underline">
            Ändra intressen
          </Link>
        </div>
        {client.focus && <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">“{client.focus}”</p>}
        <MetricsGrid clientId={client.id} interests={client.interests} editable />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Genomförda pass" icon={Trophy} value={completed.length} sub={`${completed.filter((w) => w.byClient).length} egna pass`} />
        <StatTile label="Veckor i rad" icon={Flame} value={streak} sub="med minst ett pass" />
      </div>

      {showStrength && (
      <Card>
        <CardHeader>
          <CardTitle>Styrka</CardTitle>
          <CardDescription>Uppskattat 1RM per pass</CardDescription>
        </CardHeader>
        <CardContent>
          <StrengthChart workouts={workouts} />
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vikt</CardTitle>
          <CardDescription>Väg dig gärna samma tid och dag varje vecka.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <WeightChart entries={client.weightLog} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const value = Number(kg.replace(",", "."))
              if (!Number.isFinite(value) || value < 25 || value > 350) {
                toast.error("Ange en vikt mellan 25 och 350 kg")
                return
              }
              actions.addWeight(client.id, { date: todayISO(), kg: Math.round(value * 10) / 10 })
              setKg("")
              toast.success("Vikten är sparad")
            }}
          >
            <Input inputMode="decimal" placeholder="Dagens vikt (kg)" value={kg} onChange={(e) => setKg(e.target.value)} aria-label="Dagens vikt i kg" />
            <Button type="submit" variant="secondary">
              <Plus /> Logga
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Träningsfrekvens</CardTitle>
          <CardDescription>Genomförda pass per vecka</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsChart workouts={workouts} />
        </CardContent>
      </Card>

      <ExerciseList workouts={workouts} />

      <section className="space-y-2">
        <h2 className="font-semibold">Senaste passen</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {completed.slice(0, 10).map((w) => (
            <li key={w.id}>
              <Link href={`/klient/pass/${w.id}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-muted/60">
                <div className="min-w-0">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground">{formatDay(w.date)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground tabular">
                    {setsDone(w)} set
                    <br />
                    {Math.round(workoutVolume(w)).toLocaleString("sv-SE")} kg
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/klient/sekretess"
        className="flex items-center gap-3 rounded-xl border p-4 text-sm transition-colors hover:bg-muted/60"
      >
        <ShieldCheck className="size-4 text-muted-foreground" />
        <span className="flex-1">Min data och sekretess</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </div>
  )
}

/** Övningar som loggats, med senaste toppset. Varje rad leder till övningens historik. */
function ExerciseList({ workouts }: { workouts: ScheduledWorkout[] }) {
  const { data, me } = useAppData()
  const ids = [...new Set(workouts.filter((w) => w.status === "completed").flatMap((w) => w.exercises.map((e) => e.exerciseId)))]
  const rows = ids
    .map((id) => ({
      exercise: data.exercises.find((e) => e.id === id) && { id, name: exerciseName(data, id, me.id) },
      sessions: exerciseHistory(id, workouts),
    }))
    .filter((r) => r.exercise && r.sessions.length > 0)
    .sort((a, b) => b.sessions[0].date.localeCompare(a.sessions[0].date) || a.exercise!.name.localeCompare(b.exercise!.name))
  if (rows.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Övningar</h2>
      <p className="text-xs text-muted-foreground">Tryck på en övning för att se vad du lyft varje gång.</p>
      <ul className="divide-y rounded-xl border bg-card">
        {rows.map(({ exercise, sessions }) => {
          const last = sessions[0]
          return (
            <li key={exercise!.id}>
              <Link
                href={`/klient/framsteg/ovning/${encodeURIComponent(exercise!.id)}`}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{exercise!.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {sessions.length} gånger · senast {formatShort(last.date)}
                  </div>
                </div>
                {last.topSet && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular">
                    {last.topSet.kg > 0 ? `${last.topSet.kg.toLocaleString("sv-SE")} kg × ${last.topSet.reps}` : `${last.topSet.reps} reps`}
                  </span>
                )}
                {sessions.some((s) => s.isPR && s === last) && <Trophy className="size-4 text-primary" aria-label="Personbästa senast" />}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Antal veckor i följd (bakåt från denna/förra veckan) med minst ett genomfört pass. */
function weekStreak(dates: string[]) {
  const today = todayISO()
  const set = new Set(dates)
  const hasWorkoutInWeek = (offsetWeeks: number) =>
    Array.from({ length: 7 }, (_, d) => addDays(today, -7 * offsetWeeks - d)).some((d) => set.has(d))
  let streak = 0
  while (hasWorkoutInWeek(streak)) streak++
  return streak
}
