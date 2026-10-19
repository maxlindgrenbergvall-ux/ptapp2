"use client"

import { CalendarCheck, Check, ChevronRight, Dumbbell, Lock, Play, Search, Utensils } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { ExtraFood, SleepTracker, WaterTracker } from "@/components/client/trackers"
import { ServiceMenu } from "@/components/services/service-menu"
import { PersonAvatar } from "@/components/common"
import { KcalMeter, MACROS, MacroTargetRow, sumMacros } from "@/components/nutrition/macros"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { exerciseName, myTrainers, nutritionPlansFor, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, formatSlot, parseISODate, todayISO } from "@/lib/date"
import { setsDone, setsTotal } from "@/lib/training"
import { cn } from "@/lib/utils"
import { firstName } from "@/lib/names"
import { hasNutritionAccess, sessionBalance } from "@/lib/services/balance"
import type { NutritionPlan, Trainer } from "@/types/domain"

const WEEKDAYS = ["M", "T", "O", "T", "F", "L", "S"]

export default function TodayPage() {
  const { data, actions, me } = useAppData()
  const today = todayISO()
  const client = data.clients.find((c) => c.id === me.id)!
  const trainers = myTrainers(data, client.id)
  const workouts = workoutsFor(data, client.id)
  const todays = workouts.filter((w) => w.date === today)
  // Kostråd kräver köpt kostcoaching hos någon av klientens PT:er (databasen döljer annars planerna).
  // Med flera PT:er gäller högst ETT kostschema åt gången – klienten väljer vilket.
  const nutritionTrainers = trainers.filter((t) => hasNutritionAccess(data, t.id, client.id))
  const nutritionUnlocked = nutritionTrainers.length > 0
  const { current, all: allPlans } = nutritionPlansFor(data, client.id)
  const plans = allPlans.filter((p) => nutritionTrainers.some((t) => t.id === p.trainerId))
  const plan = nutritionUnlocked && current && plans.includes(current) ? current : undefined
  const checked = new Set(
    data.mealChecks.filter((m) => m.clientId === client.id && m.date === today).map((m) => m.mealId)
  )
  const now = new Date().toISOString()
  // Nästa kommande pass i kalendern (bekräftat eller väntande).

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
            {(plans.length > 1 || (plans.length === 1 && !plan)) && <PlanChooser plans={plans} current={plan?.id ?? null} />}
            {!nutritionUnlocked ? (
              <NutritionLock trainers={trainers} />
            ) : targets ? (
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
                {plans.length ? "Välj vilket kostschema som ska gälla ovan." : "Din PT har inte lagt upp något kostschema än."} Du kan ändå logga det du äter nedan
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

/** Kostråden är låsta tills klienten köpt kostcoaching (egen kostloggning fungerar ändå). */
function NutritionLock({ trainers }: { trainers: Trainer[] }) {
  // Bara PT:er som faktiskt erbjuder kost kan sälja kostcoaching.
  const sellers = trainers.filter((t) => t.offersNutrition)
  return (
    <div className="space-y-3 rounded-xl border border-dashed p-4" data-testid="nutrition-lock">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">Kostråd ingår inte i ditt paket</p>
          <p className="text-sm text-muted-foreground">
            {sellers.length
              ? `Lägg till kostcoaching hos ${sellers.map((t) => firstName(t.name)).join(" eller ")} för att få ett personligt kostschema, recept och uppföljning.`
              : trainers.length
                ? "Dina PT:er erbjuder inte kostrådgivning. Hitta en PT eller dietist som gör det."
                : "Välj en PT som erbjuder kostcoaching för att få ett personligt kostschema."}
          </p>
        </div>
      </div>
      {sellers.map((t) => (
        <ServiceMenu key={t.id} trainer={t} only={(s) => s.includesNutrition} className="sm:grid-cols-1" />
      ))}
      {!sellers.length && (
        <Button asChild variant="outline" className="w-full">
          <Link href="/klient/hitta?inriktning=kost">
            <Search /> Hitta kostcoaching
          </Link>
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Du kan alltid logga det du äter själv nedan.</p>
    </div>
  )
}

/** Har klienten scheman från flera PT:er väljer hon/han vilket som gäller – bara ett åt gången. */
function PlanChooser({ plans, current }: { plans: NutritionPlan[]; current: string | null }) {
  const { data, actions } = useAppData()
  const name = (p: NutritionPlan) => data.trainers.find((t) => t.id === p.trainerId)?.name ?? "PT"
  return (
    <div className="space-y-1.5 rounded-xl bg-muted/60 p-3" data-testid="plan-chooser">
      <label htmlFor="active-plan" className="text-xs text-muted-foreground">
        Kostschema som gäller (bara ett åt gången)
      </label>
      <Select
        value={current ?? ""}
        onValueChange={(id) => {
          actions.chooseNutritionPlan(id)
          const p = plans.find((x) => x.id === id)
          if (p) toast.success(`${p.name} gäller nu`, { description: `Från ${name(p)}. Dina andra scheman är pausade.` })
        }}
      >
        <SelectTrigger id="active-plan" className="w-full bg-background">
          <SelectValue placeholder="Välj kostschema" />
        </SelectTrigger>
        <SelectContent>
          {plans.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} · {name(p)} · {p.targets.kcal} kcal
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
