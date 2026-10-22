"use client"

import { CalendarCheck, Check, ChevronRight, Dumbbell, Play, Search, Utensils } from "lucide-react"
import Link from "next/link"

import { SleepTracker, WaterTracker } from "@/components/client/trackers"
import { DailyNutrition } from "@/components/nutrition/daily-nutrition"
import { OwnWorkoutDialog } from "@/components/client/own-workout-dialog"
import { PersonAvatar } from "@/components/common"
import { RequirePlus } from "@/components/plus/require-plus"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { exerciseName, myTrainers, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, formatSlot, parseISODate, todayISO } from "@/lib/date"
import { setsDone, setsTotal } from "@/lib/training"
import { cn } from "@/lib/utils"
import { firstName } from "@/lib/names"
import { sessionBalance } from "@/lib/services/balance"

const WEEKDAYS = ["M", "T", "O", "T", "F", "L", "S"]

export default function TodayPage() {
  const { data, me } = useAppData()
  const today = todayISO()
  const client = data.clients.find((c) => c.id === me.id)!
  const trainers = myTrainers(data, client.id)
  const workouts = workoutsFor(data, client.id)
  const todays = workouts.filter((w) => w.date === today)
  const now = new Date().toISOString()
  // Nästa kommande pass i kalendern (bekräftat eller väntande).

  // Veckoremsa måndag–söndag med markering för pass.
  const monday = addDays(today, -((parseISODate(today).getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const w = workouts.filter((x) => x.date === date)
    return { date, hasWorkout: w.length > 0, done: w.length > 0 && w.every((x) => x.status === "completed") }
  })


  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatDay(today)}</p>
        <h1 className="text-2xl font-bold tracking-tight">Hej {firstName(client.name)}!</h1>
      </div>

      <ol className="grid grid-cols-7 gap-1" aria-label="Veckan">
        {week.map((d, i) => {
          const isToday = d.date === today
          return (
            <li
              key={d.date}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2 text-xs",
                isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
              aria-label={`${formatDay(d.date)}${d.hasWorkout ? (d.done ? ", pass genomfört" : ", pass planerat") : ""}`}
            >
              <span aria-hidden>{WEEKDAYS[i]}</span>
              <span aria-hidden className={cn("text-sm font-semibold tabular", !isToday && "text-foreground")}>
                {parseISODate(d.date).getDate()}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center rounded-full",
                  d.done ? "bg-brand text-brand-foreground" : d.hasWorkout ? "border border-current" : ""
                )}
              >
                {d.done && <Check className="size-2.5" strokeWidth={3} />}
              </span>
            </li>
          )
        })}
      </ol>

      {/* Dagens träning */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Dumbbell className="size-4" /> Dagens träning
        </h2>
        {todays.length === 0 && (
          <Card className="py-5">
            <CardContent className="px-5 text-sm text-muted-foreground">
              Vilodag. Återhämtning är också träning.
            </CardContent>
          </Card>
        )}
        {todays.map((w) => {
          const done = setsDone(w)
          const total = setsTotal(w)
          const names = w.exercises
            .map((e) => exerciseName(data, e.exerciseId, client.id))
            .filter(Boolean)
          return (
            <Card key={w.id} className={cn("gap-4 py-5", w.status !== "completed" && "border-foreground/20")}>
              <CardHeader className="px-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{w.name}</CardTitle>
                    <CardDescription>
                      {w.exercises.length} övningar · {total} set
                    </CardDescription>
                  </div>
                  {w.status === "completed" && (
                    <Badge className="bg-primary text-primary-foreground">
                      <Check /> Klart
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-5">
                <p className="line-clamp-2 text-sm text-muted-foreground">{names.join(" · ")}</p>
                {w.status === "in_progress" && (
                  <div className="space-y-1">
                    <Progress value={(done / total) * 100} className="h-1.5" aria-label="Avklarade set" />
                    <p className="text-xs text-muted-foreground tabular">
                      {done} av {total} set
                    </p>
                  </div>
                )}
                {w.status !== "completed" ? (
                  <Button
                    asChild
                    size="lg"
                    className="h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90"
                  >
                    <Link href={`/klient/pass/${w.id}`}>
                      <Play className="fill-current" />
                      {w.status === "in_progress" ? "Fortsätt passet" : "Starta passet"}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/klient/pass/${w.id}`}>Visa loggen</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
        <OwnWorkoutDialog />
      </section>

      {/* Dagens kost */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Utensils className="size-4" /> Dagens kost
        </h2>
        <DailyNutrition clientId={client.id} />
      </section>

      {/* Vanor */}
      <div className="grid gap-4">
        <WaterTracker date={today} />
        {/* Coavira Plus: sömntracking (vatten och dagens kost är gratis). */}
        <RequirePlus feature="sleep">
          <SleepTracker date={today} />
        </RequirePlus>
      </div>

      {/* PT:er – en klient kan ha flera samtidigt */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarCheck className="size-4" /> {trainers.length > 1 ? "Dina PT:er" : "Din PT"}
        </h2>
        {trainers.map((t) => {
          const next = data.events
            .filter((e) => e.clientId === client.id && e.trainerId === t.id && (e.status === "confirmed" || e.status === "pending") && e.end >= now)
            .sort((a, b) => a.start.localeCompare(b.start))[0]
          const balance = sessionBalance(data, t.id, client.id)
          return (
            <Link
              key={t.id}
              href={`/klient/hitta/${t.id}`}
              className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/60"
            >
              <PersonAvatar name={t.name} src={t.avatarUrl} className="size-10" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {next
                    ? `Nästa pass: ${formatSlot(next.start)}${next.status === "pending" ? (next.awaiting === "client" ? " · ny tid – ditt svar behövs" : " · väntar på bekräftelse") : " · bekräftat"}`
                    : t.offersTraining
                      ? "Ingen bokad session"
                      : "Kostcoaching"}
                  {balance.paid > 0 && ` · ${balance.remaining} pass kvar`}
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          )
        })}
        <Button asChild variant="outline" className="w-full">
          <Link href="/klient/hitta">
            <Search /> {trainers.length ? "Hitta fler PT:er" : "Hitta din PT"}
          </Link>
        </Button>
      </section>
    </div>
  )
}

