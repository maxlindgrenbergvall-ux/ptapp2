"use client"

import { Check, ChevronLeft, ChevronRight, Flame, Lock, Search, Sparkles, Star } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { ExtraFood } from "@/components/client/trackers"
import { PersonAvatar } from "@/components/common"
import { KcalMeter, MacroInline, MACROS, MacroTargetRow, sumMacros } from "@/components/nutrition/macros"
import { ServiceMenu } from "@/components/services/service-menu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { daySummary } from "@/lib/activity/summary"
import { myTrainers, nutritionPlansFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, todayISO } from "@/lib/date"
import { formatSek } from "@/lib/money"
import { firstName } from "@/lib/names"
import { hasNutritionAccess } from "@/lib/services/balance"
import { nutritionRecommendations } from "@/lib/services/recommend"
import { cn } from "@/lib/utils"
import { MEAL_UNIT_LABEL, type ID, type NutritionPlan, type Trainer } from "@/types/domain"

/**
 * "Dagens kost" – samma vy och samma data för klienten och klientens PT:er:
 * kalorier och makron mot målet, schemats måltider (avbockade eller inte) och
 * extra mat utanför schemat. Klienten bockar av och loggar; PT:n ser exakt
 * samma struktur (skrivskyddat) och kan bläddra mellan dagarna.
 */
export function DailyNutrition({ clientId, viewer = "client" }: { clientId: ID; viewer?: "client" | "trainer" }) {
  const { data, actions } = useAppData()
  const trainerView = viewer === "trainer"
  // Djuplänk från "Logga i kostdagboken": /klient?datum=YYYY-MM-DD#dagens-kost.
  // (Vyn visas först när appens data har laddats i webbläsaren, så window finns.)
  const [date, setDate] = React.useState(() => (trainerView ? todayISO() : linkedDate() ?? todayISO()))
  const trainers = myTrainers(data, clientId)
  React.useEffect(() => {
    if (trainerView) return
    // Vid klientnavigering (router.push från toasten) är adressen uppdaterad först här.
    const linked = linkedDate()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synkar med adressfältet (externt system)
    if (linked) setDate(linked)
    if (window.location.hash === "#dagens-kost") document.getElementById("dagens-kost")?.scrollIntoView({ block: "start" })
  }, [trainerView])
  // Klienten kan bläddra en vecka framåt (t.ex. loggad matlåda), PT:n bara till idag.
  const maxDate = trainerView ? todayISO() : addDays(todayISO(), 7)

  // Kostråd kräver köpt kostcoaching hos någon av klientens PT:er (databasen döljer annars planerna).
  // Med flera PT:er gäller högst ETT kostschema åt gången – klienten väljer vilket.
  const nutritionTrainers = trainerView ? [] : trainers.filter((t) => hasNutritionAccess(data, t.id, clientId))
  const { current, all } = nutritionPlansFor(data, clientId)
  const plans = trainerView ? [] : all.filter((p) => nutritionTrainers.some((t) => t.id === p.trainerId))
  // PT:n ser schemat som gäller, oavsett vilken PT som gjort det (RLS: bara det aktiva).
  const plan = trainerView
    ? data.nutritionPlans.find((p) => p.clientId === clientId && p.active !== false)
    : nutritionTrainers.length && current && plans.includes(current)
      ? current
      : undefined
  const locked = !trainerView && nutritionTrainers.length === 0

  const checked = new Set(data.mealChecks.filter((m) => m.clientId === clientId && m.date === date).map((m) => m.mealId))
  // Måltiden som just bockades av "poppar" (inte de som redan var avbockade när sidan laddades).
  const [pop, setPop] = React.useState<{ id: string; n: number }>({ id: "", n: 0 })
  const extras = data.foodEntries.filter((e) => e.clientId === clientId && e.date === date)
  const eaten = sumMacros([...(plan?.meals ?? []).filter((m) => checked.has(m.id)).flatMap((m) => m.items), ...extras])
  const targets = plan?.targets
  // v30: utan kostschema från en PT gäller klientens eget, beräknade dagsmål (intro-flödet / Profil → Mål).
  const ownTargets = !targets ? data.goalProfiles.find((g) => g.clientId === clientId)?.targets : undefined
  const ownGoal = ownTargets && (
    <div className="space-y-4" data-testid="own-nutrition-goal">
      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{trainerView ? "Klientens beräknade dagsmål (från målen)" : "Ditt beräknade dagsmål"}</span>
        {!trainerView && (
          <Link href="/klient/profil/mal" className="font-medium text-primary underline-offset-4 hover:underline">
            Ändra mål
          </Link>
        )}
      </p>
      <KcalMeter value={eaten.kcal} target={ownTargets.kcal} />
      <div className="space-y-3">
        {MACROS.map((m) => (
          <MacroTargetRow key={m.key} macro={m.key} value={eaten[m.key]} target={ownTargets[m.key]} />
        ))}
      </div>
    </div>
  )
  const planOwner = plan ? data.trainers.find((t) => t.id === plan.trainerId)?.name : undefined
  // v32: förbränd aktiv energi samma dag (Strava, Apple Hälsa, Health Connect).
  const burned = daySummary(data.activities, data.activityDays, clientId, date)

  return (
    <div className="space-y-5 rounded-2xl border border-border/70 bg-card shadow-card p-5" data-testid="daily-nutrition">
      <div className="-mx-1 -mt-1 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Föregående dag" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft />
        </Button>
        <p className="text-sm font-medium" data-testid="nutrition-date">
          {date === todayISO() ? "Idag" : formatDay(date)}
        </p>
        <Button variant="ghost" size="icon-sm" aria-label="Nästa dag" disabled={date >= maxDate} onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight />
        </Button>
      </div>
      {!trainerView && (plans.length > 1 || (plans.length === 1 && !plan)) && <PlanChooser plans={plans} current={plan?.id ?? null} />}
      {locked ? (
        // Ingen kostcoaching: ren och snabb loggning mot det egna dagsmålet – ingen betalvägg i vägen.
        (ownGoal ?? <DaySummary kcal={eaten.kcal} macros={eaten} />)
      ) : targets ? (
        <>
          {trainerView && planOwner && (
            <p className="text-xs text-muted-foreground">
              {plan!.name} · från {planOwner}
            </p>
          )}
          <KcalMeter value={eaten.kcal} target={targets.kcal} />
          <div className="space-y-3">
            {MACROS.map((m) => (
              <MacroTargetRow key={m.key} macro={m.key} value={eaten[m.key]} target={targets[m.key]} />
            ))}
          </div>
        </>
      ) : ownGoal ? (
        ownGoal
      ) : (
        <p className="text-sm text-muted-foreground">
          {trainerView
            ? "Klienten har inget aktivt kostschema."
            : plans.length
              ? "Välj vilket kostschema som ska gälla ovan."
              : "Din PT har inte lagt upp något kostschema än."}{" "}
          {!trainerView && "Du kan ändå logga det du äter nedan"}
          {eaten.kcal > 0 && ` (${Math.round(eaten.kcal)} kcal ${date === todayISO() ? "idag" : "den dagen"})`}
          {!trainerView && "."}
        </p>
      )}
      {(burned.activeKcal > 0 || eaten.kcal > 0) && (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-2 text-center" data-testid="energy-balance">
          <div>
            <p className="text-sm font-semibold tabular">{Math.round(eaten.kcal).toLocaleString("sv-SE")}</p>
            <p className="text-[11px] text-muted-foreground">ätit (kcal)</p>
          </div>
          <div>
            <p className="flex items-center justify-center gap-1 text-sm font-semibold text-orange-600 tabular dark:text-orange-400" data-testid="energy-burned">
              <Flame className="size-3.5" />
              {burned.activeKcal.toLocaleString("sv-SE")}
            </p>
            <p className="text-[11px] text-muted-foreground">förbränt · {burned.activeMinutes} min</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular">{Math.round(eaten.kcal - burned.activeKcal).toLocaleString("sv-SE")}</p>
            <p className="text-[11px] text-muted-foreground">netto (kcal)</p>
          </div>
        </div>
      )}
      {plan && (
        <ul className="divide-y" aria-label="Måltider">
          {plan.meals.map((m) => {
            const isChecked = checked.has(m.id)
            const kcal = m.items.reduce((s, i) => s + i.kcal, 0)
            const row = (
              <>
                <span
                  key={pop.id === m.id ? `pop-${pop.n}` : "still"}
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
                    isChecked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    isChecked && pop.id === m.id && "animate-pop"
                  )}
                >
                  {isChecked && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-medium", isChecked && "text-muted-foreground line-through")}>{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.items.map((i) => (i.unit && i.unit !== "g" ? `${i.qty ?? 1} ${MEAL_UNIT_LABEL[i.unit]} ${i.name.toLowerCase()}` : i.name)).join(", ")}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground tabular">
                  {m.time}
                  <br />
                  {kcal} kcal
                </span>
              </>
            )
            return (
              <li key={m.id}>
                {trainerView ? (
                  <div className="flex w-full items-center gap-3 py-3" aria-label={`${m.name}${isChecked ? " – äten" : ""}`}>
                    {row}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (!isChecked) setPop((p) => ({ id: m.id, n: p.n + 1 }))
                      actions.toggleMeal(clientId, date, m.id)
                    }}
                    aria-pressed={isChecked}
                    className="flex w-full items-center gap-3 rounded-lg py-3 text-left transition-transform active:scale-[0.99]"
                  >
                    {row}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {trainerView ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Övrigt / extra</h3>
          {extras.length ? (
            <ul className="divide-y rounded-xl bg-muted/50">
              {extras.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="truncate">{e.name}</span>
                    <MacroInline value={e} />
                  </div>
                  <span className="shrink-0 tabular">{e.kcal} kcal</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Inget utöver schemat.</p>
          )}
        </div>
      ) : (
        <ExtraFood date={date} />
      )}
      {locked && <CoachingHint clientId={clientId} trainers={trainers} />}
    </div>
  )
}

/** Dagens intag utan kostschema: kalorier och makron, inga mål att jämföra mot. */
function DaySummary({ kcal, macros }: { kcal: number; macros: { protein: number; carbs: number; fat: number; kcal: number } }) {
  return (
    <div className="flex items-end justify-between gap-3" data-testid="day-summary">
      <div>
        <p className="text-xs text-muted-foreground">Idag</p>
        <p className="text-2xl font-bold tracking-tight tabular">
          {Math.round(kcal)} <span className="text-sm font-medium text-muted-foreground">kcal</span>
        </p>
      </div>
      <MacroInline value={macros} className="justify-end" />
    </div>
  )
}

/**
 * Diskret länk till kostcoaching (i stället för en stor betalvägg). Ett tryck
 * öppnar rekommendationerna: i första hand klientens egen PT.
 */
function CoachingHint({ clientId, trainers }: { clientId: ID; trainers: Trainer[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 border-t border-border/60 pt-3 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        data-testid="nutrition-coaching-hint"
      >
        <Sparkles className="size-3.5 shrink-0" />
        <span className="flex-1">Vill du ha ett personligt kostschema från en PT?</span>
        <ChevronRight className="size-3.5 shrink-0" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kostcoaching</DialogTitle>
            <DialogDescription>Ett personligt kostschema med mål, måltider och uppföljning från en PT.</DialogDescription>
          </DialogHeader>
          <NutritionLock clientId={clientId} trainers={trainers} />
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Kostråden är låsta tills klienten köpt kostcoaching. I första hand
 * rekommenderas klientens nuvarande PT (om hen erbjuder kost), annars en
 * annan PT som säljer kostcoaching.
 */
function NutritionLock({ clientId, trainers }: { clientId: ID; trainers: Trainer[] }) {
  const { data } = useAppData()
  const { mine, others } = nutritionRecommendations(data, clientId)
  const suggested = mine[0] ? undefined : others[0]
  return (
    <div className="space-y-3 rounded-xl border border-dashed p-4" data-testid="nutrition-lock">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">Kostråd ingår inte i ditt paket än</p>
          <p className="text-sm text-muted-foreground">
            {mine.length
              ? `Lägg till kostcoaching hos ${mine.map((m) => firstName(m.trainer.name)).join(" eller ")} för att få ett personligt kostschema, recept och uppföljning.`
              : trainers.length
                ? "Dina PT:er erbjuder inte kostcoaching. Här är en PT som gör det."
                : "Välj en PT som erbjuder kostcoaching för att få ett personligt kostschema."}
          </p>
        </div>
      </div>
      {mine.map(({ trainer }) => (
        <div key={trainer.id} className="space-y-2" data-testid="nutrition-recommended">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> Rekommenderas – din PT {firstName(trainer.name)}
          </p>
          <ServiceMenu trainer={trainer} only={(s) => s.includesNutrition} className="sm:grid-cols-1" />
        </div>
      ))}
      {suggested && (
        <Link
          href={`/klient/hitta/${suggested.trainer.id}`}
          className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card shadow-card p-3 transition-colors hover:bg-muted/60"
          data-testid="nutrition-recommended"
        >
          <PersonAvatar name={suggested.trainer.name} src={suggested.trainer.avatarUrl} className="size-10" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" /> Rekommenderad för kostcoaching
            </span>
            <span className="block truncate font-medium">{suggested.trainer.name}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3 fill-current text-warning" /> {suggested.trainer.rating.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} · {suggested.service.title} · {formatSek(suggested.service.priceSek)}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
      <Button asChild variant="outline" className="w-full">
        <Link href="/klient/hitta?inriktning=kost">
          <Search /> Se andra PT:s som erbjuder kostschema
        </Link>
      </Button>
      <p className="text-xs text-muted-foreground">Matloggningen är alltid gratis – du kan logga det du äter själv.</p>
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

/** Datum ur ?datum= (en månad bakåt till en vecka framåt), annars undefined. */
function linkedDate(): string | undefined {
  if (typeof window === "undefined") return undefined
  const d = new URLSearchParams(window.location.search).get("datum")
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= addDays(todayISO(), -30) && d <= addDays(todayISO(), 7) ? d : undefined
}
