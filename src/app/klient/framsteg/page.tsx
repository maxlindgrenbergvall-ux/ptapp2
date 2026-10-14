"use client"

import { ChevronRight, Download, Flame, Plus, ShieldCheck, Trash2, Trophy } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { SessionsChart, StrengthChart, WeightChart } from "@/components/charts/progress-charts"
import { WearablesCard } from "@/components/client/trackers"
import { StatTile } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, formatShort, todayISO } from "@/lib/date"
import { exerciseHistory, oneRepMaxSeries, setsDone, workoutVolume } from "@/lib/training"
import type { ScheduledWorkout } from "@/types/domain"

export default function ProgressPage() {
  const { data, actions, me, mode, deleteAccount } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)!
  const workouts = workoutsFor(data, client.id)
  const completed = workouts.filter((w) => w.status === "completed").sort((a, b) => b.date.localeCompare(a.date))
  const [kg, setKg] = React.useState("")

  const squat = oneRepMaxSeries("e-squat", workouts)
  const streak = weekStreak(completed.map((w) => w.date))

  const exportData = () => {
    // Dataportabilitet (GDPR art. 20): all data om klienten i maskinläsbart format.
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: client,
      workouts,
      nutritionPlans: data.nutritionPlans.filter((p) => p.clientId === client.id),
      mealChecks: data.mealChecks.filter((m) => m.clientId === client.id),
      messages: data.messages.filter((m) => m.threadId === client.id),
      bookings: data.bookings.filter((b) => b.clientId === client.id),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `min-traningsdata-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Framsteg</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Knäböj 1RM"
          icon={Trophy}
          value={squat.length ? `${squat.at(-1)!.e1rm} kg` : "–"}
          sub={squat.length > 1 ? `+${(squat.at(-1)!.e1rm - squat[0].e1rm).toFixed(1)} kg sedan start` : "Uppskattat"}
        />
        <StatTile label="Veckor i rad" icon={Flame} value={streak} sub={`${completed.length} pass totalt`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Styrka</CardTitle>
          <CardDescription>Uppskattat 1RM per pass</CardDescription>
        </CardHeader>
        <CardContent>
          <StrengthChart workouts={workouts} />
        </CardContent>
      </Card>

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

      <WearablesCard />

      <Card className="bg-muted/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" /> Din data
          </CardTitle>
          <CardDescription>
            Din träning, vikt och kost delas bara med din PT. Du kan när som helst ladda ner allt eller be om att få det raderat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportData}>
              <Download /> Ladda ner min data (JSON)
            </Button>
            {mode === "supabase" && <DeleteAccountDialog onConfirm={deleteAccount} />}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DeleteAccountDialog({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const CONFIRM = "RADERA"
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setText(""))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 /> Radera mitt konto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Radera kontot permanent?</DialogTitle>
          <DialogDescription>
            All din data raderas direkt och kan inte återställas: pass, loggar, vikt, kost, meddelanden och bokningar.
            Ladda gärna ner din data först.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-delete">Skriv {CONFIRM} för att bekräfta</Label>
          <Input id="confirm-delete" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={text !== CONFIRM || pending}
            onClick={async () => {
              setPending(true)
              await onConfirm()
              setPending(false)
            }}
          >
            {pending ? "Raderar…" : "Radera allt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Övningar som loggats, med senaste toppset. Varje rad leder till övningens historik. */
function ExerciseList({ workouts }: { workouts: ScheduledWorkout[] }) {
  const { data } = useAppData()
  const ids = [...new Set(workouts.filter((w) => w.status === "completed").flatMap((w) => w.exercises.map((e) => e.exerciseId)))]
  const rows = ids
    .map((id) => ({ exercise: data.exercises.find((e) => e.id === id), sessions: exerciseHistory(id, workouts) }))
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
