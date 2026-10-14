"use client"

import { Download, Flame, Plus, ShieldCheck, Trash2, Trophy } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { SessionsChart, StrengthChart, WeightChart } from "@/components/charts/progress-charts"
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
import { addDays, formatDay, todayISO } from "@/lib/date"
import { oneRepMaxSeries, setsDone, workoutVolume } from "@/lib/training"

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

      <section className="space-y-2">
        <h2 className="font-semibold">Historik</h2>
        <ul className="divide-y rounded-xl border">
          {completed.slice(0, 10).map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{w.name}</div>
                <div className="text-xs text-muted-foreground">{formatDay(w.date)}</div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground tabular">
                {setsDone(w)} set
                <br />
                {Math.round(workoutVolume(w)).toLocaleString("sv-SE")} kg
              </div>
            </li>
          ))}
        </ul>
      </section>

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
