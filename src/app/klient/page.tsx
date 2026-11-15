"use client"

import { CalendarCheck, CalendarRange, ChevronRight, Dumbbell, Moon, Search, Target, Utensils } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { SleepTracker, WaterTracker } from "@/components/client/trackers"
import { NutritionShortcut } from "@/components/nutrition/daily-nutrition"
import { ActivityCard } from "@/components/activity/activity-card"
import { OwnWorkoutDialog } from "@/components/client/own-workout-dialog"
import { NextWorkoutCard } from "@/components/workouts/next-workout"
import { DayPlan, WeekStrip, WorkoutDayCard } from "@/components/client/day-planner"
import { EmptyState, PersonAvatar } from "@/components/common"
import { RequirePlus } from "@/components/plus/require-plus"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { myTrainers, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatDay, formatSlot, todayISO } from "@/lib/date"
import { greeting } from "@/lib/greeting"
import { firstName } from "@/lib/names"
import { useDayPart } from "@/hooks/use-day-part"
import { sessionBalance } from "@/lib/services/balance"

export default function TodayPage() {
  const { data, me } = useAppData()
  const part = useDayPart()
  const today = todayISO()
  const client = data.clients.find((c) => c.id === me.id)!
  const trainers = myTrainers(data, client.id)
  const workouts = workoutsFor(data, client.id)
  const todays = workouts.filter((w) => w.date === today)
  const now = new Date().toISOString()
  // Nästa kommande pass i kalendern (bekräftat eller väntande).

  // v51: vald dag i veckoremsan (idag från början). Andra dagar visar planering för den dagen.
  const [selected, setSelected] = React.useState(today)
  const foodDates = new Set(data.foodEntries.filter((e) => e.clientId === client.id).map((e) => e.date))

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatDay(today)}</p>
        {/* v35: hälsningen följer klockan – God morgon / Hej! / God kväll. */}
        <h1 className="text-2xl font-bold tracking-tight" data-testid="home-greeting" data-daypart={part}>
          {greeting(part, firstName(client.name))}
        </h1>
      </div>

      {/* v30: intro-flödet inte gjort (eller överhoppat) – en vänlig påminnelse, ingen spärr. */}
      {!data.goalProfiles.some((g) => g.clientId === client.id) && (
        <Link
          href="/klient/intro"
          className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
          data-testid="goal-intro-banner"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Target className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Sätt upp dina mål</span>
            <span className="block text-sm text-muted-foreground">Få ett personligt kalorimål och se din utveckling vecka för vecka.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* v51: varje dag är klickbar – planera pass och kost i förväg. */}
      <WeekStrip today={today} selected={selected} onSelect={setSelected} workouts={workouts} foodDates={foodDates} />

      {selected !== today ? (
        <>
          <DayPlan date={selected} today={today} clientId={client.id} />
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setSelected(today)} data-testid="back-to-today">
            Tillbaka till idag
          </Button>
        </>
      ) : (
      <div key="today" className="rise-in space-y-5 sm:space-y-6" data-testid="today-view">
      {/* v43: Nästa pass i det aktiva schemat – en tydlig knapp som startar passet direkt. */}
      <NextWorkoutCard />

      {/* Dagens träning */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Dumbbell className="size-4" /> Dagens träning
        </h2>
        {todays.length === 0 && (
          <Card className="py-2">
            <CardContent className="px-2">
              <EmptyState compact icon={Moon} title="Inget pass planerat idag" text="Vilodag. Återhämtning är också träning – och är du sugen ändå kan du köra ett eget pass här nedanför." data-testid="rest-day" />
            </CardContent>
          </Card>
        )}
        {todays.map((w) => (
          <WorkoutDayCard key={w.id} workout={w} clientId={client.id} />
        ))}
        {/* v37: två genvägar sida vid sida i stället för två hela rader. */}
        <div className="grid grid-cols-2 gap-2">
          <OwnWorkoutDialog />
          {/* v32: träningssplits och schema. */}
          <Button asChild variant="outline" className="w-full" data-testid="open-schedule">
            <Link href="/klient/schema" aria-label="Träningsschema och splits">
              <CalendarRange /> Schema och splits
            </Link>
          </Button>
        </div>
      </section>

      {/* v32: kalorimätaren – Strava, Apple Hälsa och Health Connect. */}
      <ActivityCard clientId={client.id} />

      {/* v42: kostdagboken är en egen sida (Kost i bottenmenyn) – här bara dagens kalorier och en genväg. */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Utensils className="size-4" /> Dagens kost
        </h2>
        <NutritionShortcut clientId={client.id} />
      </section>

      {/* Vanor */}
      <div className="grid gap-3 sm:gap-4">
        <WaterTracker date={today} />
        {/* Coavira Plus: sömntracking – en diskret rad, ingen stor betalvägg på startsidan. */}
        <RequirePlus feature="sleep" variant="inline" title="Sömntracking">
          <SleepTracker date={today} />
        </RequirePlus>
      </div>

      </div>
      )}

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

