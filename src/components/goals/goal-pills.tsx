import { GOAL_ICON } from "@/components/goals/goal-editor"
import { GOAL_INFO, GOAL_KEYS } from "@/lib/goals/metabolism"
import { cn } from "@/lib/utils"
import type { GoalKey } from "@/types/domain"

/** De valda målen som piller (v32) – i profilen och hos PT:n. Ordning som i målväljaren. */
export function GoalPills({ goals, className, size = "md" }: { goals: GoalKey[]; className?: string; size?: "sm" | "md" }) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Valda mål" data-testid="goal-pills">
      {GOAL_KEYS.filter((g) => goals.includes(g)).map((g) => {
        const Icon = GOAL_ICON[g]
        return (
          <li
            key={g}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 font-medium text-primary",
              size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm"
            )}
          >
            <Icon className={size === "sm" ? "size-3" : "size-4"} />
            {GOAL_INFO[g].label}
          </li>
        )
      })}
    </ul>
  )
}
