"use client"

import { ChevronRight, Target } from "lucide-react"
import Link from "next/link"

import { GOAL_ICON } from "@/components/goals/goal-editor"
import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { goalCards } from "@/lib/goals/overview"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

/**
 * Framsteg (v35): "Dina mål" – ett kort per aktivt mål (Viktnedgång, Body
 * recomposition, Bodybuilding …) med målets eget mått och förlopp. Ersätter
 * de gamla intresse-mätpunkterna. Utan mål: en genväg till Mål.
 */
export function GoalOverview({ clientId }: { clientId: ID }) {
  const { data } = useAppData()
  const goal = data.goalProfiles.find((g) => g.clientId === clientId)
  const client = data.clients.find((c) => c.id === clientId)

  if (!goal || !goal.goals.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4" data-testid="goal-overview-empty">
        <Target className="size-5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Välj dina mål så visar vi hur det går för vart och ett.</p>
        <Button asChild size="sm" variant="outline">
          <Link href={goal ? "/klient/profil/mal" : "/klient/intro"}>Välj mål</Link>
        </Button>
      </div>
    )
  }

  const cards = goalCards({
    goal,
    weightLog: client?.weightLog ?? [],
    workouts: data.workouts,
    activities: data.activities,
    activityDays: data.activityDays,
    today: todayISO(),
  })

  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="goal-overview" aria-label="Dina mål">
        {cards.map((c) => {
          const Icon = GOAL_ICON[c.key]
          return (
            <li key={c.key} className="space-y-2 rounded-2xl border bg-card p-4 shadow-card" data-goal={c.key}>
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                {c.label}
              </p>
              <p
                className={cn(
                  "text-2xl font-bold tracking-tight tabular",
                  c.trend === "good" && "text-success",
                  c.trend === "bad" && "text-warning"
                )}
                data-testid="goal-card-value"
              >
                {c.value}
              </p>
              {c.progress !== undefined && (
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${c.label}: förlopp`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(c.progress * 100)}
                >
                  <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(c.progress * 100)}%` }} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </li>
          )
        })}
      </ul>
      <Link href="/klient/profil/mal" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
        Ändra mål <ChevronRight className="size-4" />
      </Link>
    </div>
  )
}
