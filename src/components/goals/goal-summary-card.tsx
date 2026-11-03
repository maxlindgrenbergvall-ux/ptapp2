"use client"

import { Target } from "lucide-react"

import { GoalProgressChart } from "@/components/goals/goal-progress-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAppData } from "@/lib/data/store"
import { ACTIVITY_INFO, ageFromBirthYear, formatRate, GOAL_INFO, goalOverview, SEX_INFO } from "@/lib/goals/metabolism"
import type { ID } from "@/types/domain"

/**
 * PT:ns vy av klientens mål från intro-flödet (skrivskyddad): mål, mått,
 * takt, kalorimål och samma prognos som klienten ser.
 */
export function GoalSummaryCard({ clientId, className }: { clientId: ID; className?: string }) {
  const { data } = useAppData()
  const g = data.goalProfiles.find((x) => x.clientId === clientId)
  if (!g) return null
  const age = ageFromBirthYear(g.birthYear)
  const { plan } = goalOverview({
    sex: g.sex,
    age,
    heightCm: g.heightCm,
    weightKg: g.currentWeightKg,
    activity: g.activity,
    goals: g.goals,
    weeklyChangeKg: g.weeklyChangeKg,
    targetWeightKg: g.targetWeightKg,
  })
  const t = g.targets
  return (
    <Card className={className} data-testid="client-goal-summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4" /> Klientens mål
        </CardTitle>
        <CardDescription>
          {SEX_INFO[g.sex].label}, {age} år, {g.heightCm.toLocaleString("sv-SE")} cm · {ACTIVITY_INFO[g.activity].label.toLowerCase()} · start{" "}
          {g.startWeightKg.toLocaleString("sv-SE")} kg → nu {g.currentWeightKg.toLocaleString("sv-SE")} kg
          {g.targetWeightKg ? ` → mål ${g.targetWeightKg.toLocaleString("sv-SE")} kg` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {g.goals.map((k) => (
            <Badge key={k} variant="secondary">
              {GOAL_INFO[k].label}
            </Badge>
          ))}
          {plan.mode !== "maintain" && <Badge variant="outline">{formatRate(g.weeklyChangeKg)}</Badge>}
        </div>
        <p className="text-sm">
          <b className="tabular">{t.kcal.toLocaleString("sv-SE")} kcal</b> per dag · protein {t.protein} g · kolhydrater {t.carbs} g · fett {t.fat} g
          <span className="block text-xs text-muted-foreground">
            BMR {plan.bmr.toLocaleString("sv-SE")} kcal, TDEE {plan.tdee.toLocaleString("sv-SE")} kcal (Mifflin-St Jeor). Ett kostschema från dig ersätter dagsmålet i klientens kostdagbok.
          </span>
        </p>
        {/* v34: samma dynamiska kurva som klienten ser (uppmätt förbränning och träningsfrekvens). */}
        <GoalProgressChart clientId={clientId} readOnly />
      </CardContent>
    </Card>
  )
}
