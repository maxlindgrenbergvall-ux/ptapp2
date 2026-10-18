"use client"

import { ArrowLeft, CalendarPlus, Check, Cookie, Droplet, MessageSquareReply, Moon, Pencil, Scale, Ticket, Trophy, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { sv } from "react-day-picker/locale"
import { toast } from "sonner"

import { StrengthChart, SessionsChart, WeightChart } from "@/components/charts/progress-charts"
import { CallButtons } from "@/components/calls/call-buttons"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { adherence, exerciseName, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, formatShort, parseISODate, toISODate, todayISO } from "@/lib/date"
import { hasNutritionAccess, sessionBalance } from "@/lib/services/balance"
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
  const balance = sessionBalance(data, me.id, client.id)
  const nutritionAccess = hasNutritionAccess(data, me.id, client.id)

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/pt">
          <ArrowLeft /> Alla klienter
        </Link>
      </Button>

      {/* Mobil: namn överst och knapparna i ett eget rutnät under, så att de aldrig överlappar. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <PersonAvatar name={client.name} className="size-14 shrink-0 text-lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight break-words">{client.name}</h1>
              <ClientStatusBadge status={client.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {client.goal ? `Mål: ${client.goal} · ` : ""}Klient sedan {formatShort(client.startDate)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end" data-testid="client-actions">
          {client.status === "pending" && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                actions.setClientStatus(client.id, "active")
                toast.success(`${client.name} är nu aktiv klient`)
              }}
            >
              <Check /> Acceptera klient
            </Button>
          )}
          {client.status === "active" && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => actions.setClientStatus(client.id, "paused")}>
              Pausa
            </Button>
          )}
          {client.status === "paused" && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => actions.setClientStatus(client.id, "active")}>
              Återaktivera
            </Button>
          )}
          <ScheduleWorkoutDialog clientId={client.id} className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Betalda pass kvar"
          icon={Ticket}
          value={balance.remaining}
          sub={balance.paid ? `${balance.used} av ${balance.paid} använda` : "Inga köpta pass"}
        />
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
          <HabitsSummary clientId={client.id} />
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
          <WorkoutHistory workouts={workouts} clientId={client.id} />
          <ExerciseNames clientId={client.id} workouts={workouts} />
        </TabsContent>

        <TabsContent value="kost" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle>{plan ? plan.name : "Inget kostschema"}</CardTitle>
              <CardDescription>
                {!nutritionAccess
                  ? "Klienten har inte köpt kostcoaching. Kostschemat låses upp när klienten köper en tjänst med kost."
                  : plan
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
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm text-muted-foreground">Chatt med {client.name}</span>
              <CallButtons threadId={client.id} peerId={client.id} peerName={client.name} disabled={client.status === "pending"} />
            </div>
            <ChatThread threadId={client.id} meId={me.id} className="min-h-0 flex-1" />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function WorkoutHistory({ workouts, clientId }: { workouts: ScheduledWorkout[]; clientId: string }) {
  const { data } = useAppData()
  const today = todayISO()
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date))
  const upcoming = sorted.filter((w) => w.date >= today && w.status !== "completed").reverse()
  const past = sorted.filter((w) => !(w.date >= today && w.status !== "completed")).slice(0, 15)
  const nameOf = (id: string) => exerciseName(data, id, clientId)

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
                        <span className="truncate">{nameOf(e.exerciseId)}</span>
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

function ScheduleWorkoutDialog({ clientId, className }: { clientId: string; className?: string }) {
  const { data, actions, me } = useAppData()
  const balance = sessionBalance(data, me.id, clientId)
  const templates = data.templates.filter((t) => t.trainerId === me.id)
  const [open, setOpen] = React.useState(false)
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? "")
  const [date, setDate] = React.useState<Date | undefined>(parseISODate(todayISO()))

  const submit = () => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl || !date) return
    const error = actions.scheduleWorkout(clientId, tpl, toISODate(date))
    if (error) return toast.error(error)
    setOpen(false)
    toast.success(`${tpl.name} schemalagt ${formatShort(toISODate(date))}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={className}>
          <CalendarPlus /> Schemalägg pass
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schemalägg pass</DialogTitle>
          <DialogDescription>Passet kopieras från mallen, så senare ändringar i mallen påverkar inte detta pass.</DialogDescription>
        </DialogHeader>
        <p
          className={balance.remaining > 0 ? "rounded-lg bg-muted px-3 py-2 text-sm" : "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"}
          data-testid="schedule-balance"
        >
          {balance.remaining > 0
            ? `${balance.remaining} av ${balance.paid} betalda pass kvar.`
            : `Inga betalda pass kvar (${balance.used} av ${balance.paid} använda). Klienten behöver köpa fler pass innan du kan schemalägga.`}
        </p>
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
          <Button onClick={submit} disabled={!templateId || !date || balance.remaining < 1}>
            Schemalägg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Vanor senaste 7 dagarna: vatten, sömn och extra mat utanför schemat. */
function HabitsSummary({ clientId }: { clientId: string }) {
  const { data } = useAppData()
  const today = todayISO()
  const from = addDays(today, -6)
  const inWeek = (d: string) => d >= from && d <= today
  const water = data.waterLogs.filter((w) => w.clientId === clientId && inWeek(w.date))
  const sleep = data.sleepLogs.filter((l) => l.clientId === clientId && inWeek(l.date))
  const extra = data.foodEntries.filter((e) => e.clientId === clientId && inWeek(e.date))
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const waterAvg = avg(water.map((w) => w.ml))
  const sleepAvg = avg(sleep.map((l) => l.hours))
  const scoreAvg = avg(sleep.flatMap((l) => (l.sleepScore !== undefined ? [l.sleepScore] : [])))
  const fmt = (n: number, d = 1) => n.toLocaleString("sv-SE", { maximumFractionDigits: d })

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
      <StatTile label="Vatten, snitt/dag" icon={Droplet} value={waterAvg === null ? "–" : `${fmt(waterAvg / 1000)} l`} sub={`${water.length} av 7 dagar loggade`} />
      <StatTile
        label="Sömn, snitt/natt"
        icon={Moon}
        value={sleepAvg === null ? "–" : `${fmt(sleepAvg)} h`}
        sub={scoreAvg === null ? `${sleep.length} nätter loggade` : `Sömnpoäng ${Math.round(scoreAvg)}`}
      />
      <StatTile
        label="Extra mat, 7 dagar"
        icon={Cookie}
        value={`${extra.reduce((s, e) => s + e.kcal, 0)} kcal`}
        sub={extra.length ? `${extra.length} registreringar utöver schemat` : "Inget utöver schemat"}
      />
    </div>
  )
}

/**
 * PT:n döper om övningar för just den här klienten. Namnet syns för klienten i
 * dagsvyn, träningsloggen och historiken; biblioteket och andra klienter påverkas inte.
 */
function ExerciseNames({ clientId, workouts }: { clientId: string; workouts: ScheduledWorkout[] }) {
  const { data, actions } = useAppData()
  const [q, setQ] = React.useState("")
  const ids = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))]
  const rows = ids
    .map((id) => ({
      id,
      library: data.exercises.find((e) => e.id === id)?.name ?? id,
      alias: data.exerciseAliases.find((a) => a.clientId === clientId && a.exerciseId === id)?.name,
    }))
    .filter((r) => !q.trim() || `${r.library} ${r.alias ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(Boolean(b.alias)) - Number(Boolean(a.alias)) || a.library.localeCompare(b.library, "sv"))

  if (ids.length === 0) return null
  return (
    <Card className="mt-6">
      <CardHeader className="gap-3">
        <div>
          <CardTitle>Övningsnamn för klienten</CardTitle>
          <CardDescription>Döp om en övning så att klienten ser ditt namn i sina pass och sin historik. Biblioteket ändras inte.</CardDescription>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök övning…" className="h-9 sm:w-64" aria-label="Sök övning" />
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">
          {rows.map((r) => (
            <AliasRow
              key={r.id}
              library={r.library}
              alias={r.alias}
              onSave={(name) => {
                actions.setExerciseAlias(clientId, r.id, name)
                toast.success(name ? `Klienten ser nu "${name}"` : `Återställt till "${r.library}"`)
              }}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function AliasRow({ library, alias, onSave }: { library: string; alias?: string; onSave: (name: string | null) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(alias ?? "")
  const save = () => {
    const v = value.trim()
    onSave(v && v !== library ? v : null)
    setEditing(false)
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2.5 text-sm">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} autoFocus aria-label={`Nytt namn för ${library}`} className="h-8" />
          <Button type="submit" size="sm">
            Spara
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Avbryt
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{alias ?? library}</div>
            {alias && <div className="truncate text-xs text-muted-foreground">Biblioteket: {library}</div>}
          </div>
          {alias && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onSave(null)}>
              Återställ
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setValue(alias ?? library)
              setEditing(true)
            }}
            aria-label={`Döp om ${alias ?? library}`}
          >
            <Pencil /> Döp om
          </Button>
        </>
      )}
    </li>
  )
}
