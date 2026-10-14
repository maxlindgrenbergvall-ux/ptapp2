"use client"

import { ArrowLeft, CalendarPlus, Check, MessageSquareReply, Scale, Trophy, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { sv } from "react-day-picker/locale"
import { toast } from "sonner"

import { StrengthChart, SessionsChart, WeightChart } from "@/components/charts/progress-charts"
import { ChatThread } from "@/components/chat/chat-thread"
import { ClientStatusBadge, EmptyState, PersonAvatar, StatTile } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { adherence, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatDay, formatShort, parseISODate, toISODate, todayISO } from "@/lib/date"
import { oneRepMaxSeries, setsDone, setsTotal, workoutVolume } from "@/lib/training"
import type { ScheduledWorkout } from "@/types/domain"

export function ClientDetail({ clientId }: { clientId: string }) {
  const { data, actions, me } = useAppData()
  const client = data.clients.find((c) => c.id === clientId && c.trainerId === me.id)

  if (!client) {
    return (
      <EmptyState icon={X} title="Klienten hittades inte" text="Den finns inte eller är inte kopplad till dig." />
    )
  }

  const workouts = workoutsFor(data, client.id)
  const today = todayISO()
  const weights = client.weightLog
  const weightNow = weights.at(-1)
  const weightChange = weights.length > 1 ? weights.at(-1)!.kg - weights[0].kg : null
  const squat = oneRepMaxSeries("e-squat", workouts)
  const completed = workouts.filter((w) => w.status === "completed").length
  const adh = adherence(workouts, 28, today)
  const plan = data.nutritionPlans.find((p) => p.clientId === client.id)

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/pt">
          <ArrowLeft /> Alla klienter
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-4">
        <PersonAvatar name={client.name} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <ClientStatusBadge status={client.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Mål: {client.goal} · Klient sedan {formatShort(client.startDate)}
          </p>
        </div>
        <div className="flex gap-2">
          {client.status === "pending" && (
            <Button
              onClick={() => {
                actions.setClientStatus(client.id, "active")
                toast.success(`${client.name} är nu aktiv klient`)
              }}
            >
              <Check /> Acceptera klient
            </Button>
          )}
          {client.status === "active" && (
            <Button variant="outline" onClick={() => actions.setClientStatus(client.id, "paused")}>
              Pausa
            </Button>
          )}
          {client.status === "paused" && (
            <Button variant="outline" onClick={() => actions.setClientStatus(client.id, "active")}>
              Återaktivera
            </Button>
          )}
          <ScheduleWorkoutDialog clientId={client.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Vikt"
          icon={Scale}
          value={weightNow ? `${weightNow.kg.toFixed(1)} kg` : "–"}
          sub={weightChange === null ? "Inga vägningar" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg sedan start`}
        />
        <StatTile
          label="Knäböj, uppsk. 1RM"
          icon={Trophy}
          value={squat.length ? `${squat.at(-1)!.e1rm} kg` : "–"}
          sub={squat.length > 1 ? `+${(squat.at(-1)!.e1rm - squat[0].e1rm).toFixed(1)} kg sedan start` : undefined}
        />
        <StatTile label="Genomförda pass" value={completed} />
        <StatTile label="Följsamhet, 4 v" value={adh === null ? "–" : `${adh} %`} />
      </div>

      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="pass">Pass</TabsTrigger>
          <TabsTrigger value="kost">Kost</TabsTrigger>
          <TabsTrigger value="chatt">Chatt</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="grid gap-6 pt-2 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Vikt</CardTitle>
              <CardDescription>Veckovisa vägningar (kg)</CardDescription>
            </CardHeader>
            <CardContent>
              <WeightChart entries={weights} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Genomförda pass</CardTitle>
              <CardDescription>Per vecka, senaste 12 veckorna</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionsChart workouts={workouts} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Styrkeutveckling</CardTitle>
              <CardDescription>Uppskattat 1RM (Epley) från bästa setet per pass</CardDescription>
            </CardHeader>
            <CardContent>
              <StrengthChart workouts={workouts} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pass" className="pt-2">
          <WorkoutHistory workouts={workouts} />
        </TabsContent>

        <TabsContent value="kost" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle>{plan ? plan.name : "Inget kostschema"}</CardTitle>
              <CardDescription>
                {plan
                  ? `${plan.targets.kcal} kcal · P ${plan.targets.protein} g · K ${plan.targets.carbs} g · F ${plan.targets.fat} g`
                  : "Skapa ett kostschema i kostbyggaren."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan?.meals.map((m) => (
                <div key={m.id} className="flex items-baseline justify-between gap-4 border-b pb-2 text-sm last:border-0">
                  <span>
                    <span className="mr-2 text-muted-foreground tabular">{m.time}</span>
                    {m.name}
                  </span>
                  <span className="text-muted-foreground tabular">
                    {m.items.reduce((s, i) => s + i.kcal, 0)} kcal
                  </span>
                </div>
              ))}
              <Button asChild variant="outline" size="sm">
                <Link href="/pt/kost">Öppna kostbyggaren</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chatt" className="pt-2">
          <Card className="h-[32rem] gap-0 overflow-hidden py-0">
            <ChatThread threadId={client.id} meId={me.id} className="h-full" />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function WorkoutHistory({ workouts }: { workouts: ScheduledWorkout[] }) {
  const { data } = useAppData()
  const today = todayISO()
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date))
  const upcoming = sorted.filter((w) => w.date >= today && w.status !== "completed").reverse()
  const past = sorted.filter((w) => !(w.date >= today && w.status !== "completed")).slice(0, 15)
  const exerciseName = (id: string) => data.exercises.find((e) => e.id === id)?.name ?? id

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Historik</h2>
        {past.length === 0 && <EmptyState icon={CalendarPlus} title="Inga pass loggade än" />}
        {past.map((w) => (
          <Card key={w.id} className="gap-3 py-4">
            <CardHeader className="px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{w.name}</CardTitle>
                  <CardDescription>{formatDay(w.date)}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <WorkoutStatusBadge workout={w} />
                  {w.status === "completed" && <FeedbackDialog workout={w} />}
                </div>
              </div>
            </CardHeader>
            {w.status === "completed" && (
              <CardContent className="space-y-2 px-4 text-sm">
                <div className="text-muted-foreground tabular">
                  {setsDone(w)}/{setsTotal(w)} set · {Math.round(workoutVolume(w)).toLocaleString("sv-SE")} kg volym
                </div>
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {w.exercises.map((e) => {
                    const sets = w.logs.filter((l) => l.workoutExerciseId === e.id && l.done)
                    return (
                      <li key={e.id} className="flex justify-between gap-2">
                        <span className="truncate">{exerciseName(e.exerciseId)}</span>
                        <span className="shrink-0 text-muted-foreground tabular">
                          {sets.length ? sets.map((s) => (s.kg ? `${s.kg}×${s.reps}` : s.reps)).join(", ") : "–"}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {w.clientComment && (
                  <blockquote className="rounded-md bg-muted px-3 py-2 text-sm">&quot;{w.clientComment}&quot;</blockquote>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Kommande</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Inget schemalagt.</p>}
        {upcoming.map((w) => (
          <div key={w.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span className="font-medium">{w.name}</span>
            <span className="text-muted-foreground">{formatShort(w.date)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkoutStatusBadge({ workout }: { workout: ScheduledWorkout }) {
  switch (workout.status) {
    case "completed":
      return <Badge variant="secondary"><Check /> Genomfört</Badge>
    case "skipped":
      return <Badge variant="outline"><X /> Missat</Badge>
    case "in_progress":
      return <Badge variant="outline">Pågår</Badge>
    default:
      return <Badge variant="outline">Planerat</Badge>
  }
}

function FeedbackDialog({ workout }: { workout: ScheduledWorkout }) {
  const { actions } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <MessageSquareReply /> Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feedback på {workout.name}</DialogTitle>
          <DialogDescription>Skickas i chatten och kopplas till passet {formatShort(workout.date)}.</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Snyggt jobbat! Nästa gång…" />
        <DialogFooter>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              actions.sendMessage(workout.clientId, text, workout.id)
              setText("")
              setOpen(false)
              toast.success("Feedback skickad")
            }}
          >
            Skicka
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScheduleWorkoutDialog({ clientId }: { clientId: string }) {
  const { data, actions, me } = useAppData()
  const templates = data.templates.filter((t) => t.trainerId === me.id)
  const [open, setOpen] = React.useState(false)
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? "")
  const [date, setDate] = React.useState<Date | undefined>(parseISODate(todayISO()))

  const submit = () => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl || !date) return
    actions.scheduleWorkout(clientId, tpl, toISODate(date))
    setOpen(false)
    toast.success(`${tpl.name} schemalagt ${formatShort(toISODate(date))}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarPlus /> Schemalägg pass
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schemalägg pass</DialogTitle>
          <DialogDescription>Passet kopieras från mallen, så senare ändringar i mallen påverkar inte detta pass.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Passmall</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Välj mall" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-center rounded-md border">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              locale={sv}
              disabled={{ before: parseISODate(todayISO()) }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!templateId || !date}>
            Schemalägg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
