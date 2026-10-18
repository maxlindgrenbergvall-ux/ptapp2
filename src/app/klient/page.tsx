"use client"

import { CalendarCheck, Check, ChevronRight, Dumbbell, Play, Search, Utensils } from "lucide-react"
import Link from "next/link"

import { ExtraFood, SleepTracker, WaterTracker } from "@/components/client/trackers"
import { PersonAvatar } from "@/components/common"
import { KcalMeter, MACROS, MacroTargetRow, sumMacros } from "@/components/nutrition/macros"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { exerciseName, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, formatSlot, parseISODate, todayISO } from "@/lib/date"
import { setsDone, setsTotal } from "@/lib/training"
import { cn } from "@/lib/utils"
import { firstName } from "@/lib/names"

const WEEKDAYS = ["M", "T", "O", "T", "F", "L", "S"]

export default function TodayPage() {
  const { data, actions, me } = useAppData()
  const today = todayISO()
  const client = data.clients.find((c) => c.id === me.id)!
  const trainer = data.trainers.find((t) => t.id === client.trainerId)
  const workouts = workoutsFor(data, client.id)
  const todays = workouts.filter((w) => w.date === today)
  const plan = data.nutritionPlans.find((p) => p.clientId === client.id)
  const checked = new Set(
    data.mealChecks.filter((m) => m.clientId === client.id && m.date === today).map((m) => m.mealId)
  )
  const now = new Date().toISOString()
  // Nästa kommande pass i kalendern (bekräftat eller väntande).
  const booking = data.events
    .filter((e) => e.clientId === client.id && (e.status === "confirmed" || e.status === "pending") && e.end >= now)
    .sort((a, b) => a.start.localeCompare(b.start))[0]

  // Veckoremsa måndag–söndag med markering för pass.
  const monday = addDays(today, -((parseISODate(today).getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const w = workouts.filter((x) => x.date === date)
    return { date, hasWorkout: w.length > 0, done: w.length > 0 && w.every((x) => x.status === "completed") }
  })

  // Ätet idag = avbockade måltider + extra mat utanför schemat.
  const extras = data.foodEntries.filter((e) => e.clientId === client.id && e.date === today)
  const eaten = sumMacros([...(plan?.meals ?? []).filter((m) => checked.has(m.id)).flatMap((m) => m.items), ...extras])
  const targets = plan?.targets

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
      </section>

      {/* Dagens kost */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Utensils className="size-4" /> Dagens kost
        </h2>
        <Card className="gap-4 py-5">
          <CardContent className="space-y-5 px-5">
            {targets ? (
              <>
                <KcalMeter value={eaten.kcal} target={targets.kcal} />
                <div className="space-y-3">
                  {MACROS.map((m) => (
                    <MacroTargetRow key={m.key} macro={m.key} value={eaten[m.key]} target={targets[m.key]} />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Din PT har inte lagt upp något kostschema än. Du kan ändå logga det du äter nedan
                {eaten.kcal > 0 && ` (${Math.round(eaten.kcal)} kcal idag)`}.
              </p>
            )}
            {plan && (
              <ul className="divide-y">
                {plan.meals.map((m) => {
                  const isChecked = checked.has(m.id)
                  const kcal = m.items.reduce((s, i) => s + i.kcal, 0)
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => actions.toggleMeal(client.id, today, m.id)}
                        aria-pressed={isChecked}
                        className="flex w-full items-center gap-3 py-3 text-left"
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            isChecked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                          )}
                        >
                          {isChecked && <Check className="size-4" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block font-medium", isChecked && "text-muted-foreground line-through")}>{m.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{m.items.map((i) => i.name).join(", ")}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-muted-foreground tabular">
                          {m.time}
                          <br />
                          {kcal} kcal
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <ExtraFood date={today} />
          </CardContent>
        </Card>
      </section>

      {/* Vanor */}
      <div className="grid gap-4">
        <WaterTracker date={today} />
        <SleepTracker date={today} />
      </div>

      {/* PT */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarCheck className="size-4" /> Din PT
        </h2>
        {trainer ? (
          <Link
            href={`/klient/hitta/${trainer.id}`}
            className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/60"
          >
            <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-10" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{trainer.name}</div>
              <div className="text-xs text-muted-foreground">
                {booking
                  ? `Nästa pass: ${formatSlot(booking.start)}${booking.status === "pending" ? (booking.awaiting === "client" ? " · ny tid – ditt svar behövs" : " · väntar på bekräftelse") : " · bekräftat"}`
                  : "Ingen bokad session"}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link href="/klient/hitta">
              <Search /> Hitta din PT
            </Link>
          </Button>
        )}
      </section>
    </div>
  )
}
