"use client"

import { ChefHat, Drumstick, Dumbbell, Salad, Star, Timer, Zap } from "lucide-react"
import * as React from "react"

import { useAppData } from "@/lib/data/store"
import { GOAL_INFO, RECIPE_GOALS } from "@/lib/recipes/goals"
import { cn } from "@/lib/utils"
import type { Recipe, RecipeGoal } from "@/types/domain"

/** Stjärnan: favoritmarkera med ett tryck (optimistiskt – sparas i bakgrunden). */
export function FavoriteButton({ recipe, className, onImage }: { recipe: Recipe; className?: string; onImage?: boolean }) {
  const { data, actions } = useAppData()
  const active = data.favoriteRecipes.includes(recipe.id)
  const [pop, setPop] = React.useState(0)
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Ta bort ${recipe.name} från favoriter` : `Lägg till ${recipe.name} i favoriter`}
      data-testid="favorite-button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!active) setPop((n) => n + 1)
        actions.toggleFavoriteRecipe(recipe.id)
        navigator.vibrate?.(10)
      }}
      className={cn(
        "flex size-11 items-center justify-center rounded-full transition-colors active:scale-90",
        onImage ? "bg-background/80 shadow-sm backdrop-blur" : "hover:bg-muted",
        className
      )}
    >
      <Star
        key={pop}
        className={cn("size-5 transition-colors", active ? "fill-warning text-warning" : "text-muted-foreground", pop > 0 && active && "animate-pop")}
      />
    </button>
  )
}

export function GoalBadges({ goals, className }: { goals: RecipeGoal[]; className?: string }) {
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {RECIPE_GOALS.filter((g) => goals.includes(g)).map((g) => (
        <span key={g} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {GOAL_INFO[g].label}
        </span>
      ))}
    </span>
  )
}

const FALLBACK: Record<RecipeGoal | "none", { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  high_protein: { icon: Drumstick, tone: "from-orange-100 to-rose-100 text-orange-700/70 dark:from-orange-950/60 dark:to-rose-950/60 dark:text-orange-300/70" },
  weight_loss: { icon: Salad, tone: "from-emerald-100 to-lime-100 text-emerald-700/70 dark:from-emerald-950/60 dark:to-lime-950/60 dark:text-emerald-300/70" },
  pre_workout: { icon: Zap, tone: "from-amber-100 to-yellow-100 text-amber-700/70 dark:from-amber-950/60 dark:to-yellow-950/60 dark:text-amber-300/70" },
  post_workout: { icon: Dumbbell, tone: "from-sky-100 to-indigo-100 text-sky-700/70 dark:from-sky-950/60 dark:to-indigo-950/60 dark:text-sky-300/70" },
  quick_easy: { icon: Timer, tone: "from-violet-100 to-fuchsia-100 text-violet-700/70 dark:from-violet-950/60 dark:to-fuchsia-950/60 dark:text-violet-300/70" },
  none: { icon: ChefHat, tone: "from-muted to-muted/60 text-muted-foreground" },
}

/**
 * Receptets foto i ett fast format (formatet sätts med className, t.ex.
 * aspect-square eller aspect-video). Bilden fyller ytan med object-cover och
 * dras aldrig ut. Saknas fotot – eller går det inte att ladda – visas en
 * minimalistisk gradient med en ikon för receptets träningsmål.
 */
export function RecipeImage({ recipe, className }: { recipe: Pick<Recipe, "imageUrl" | "name" | "goalTypes">; className?: string }) {
  const [state, setState] = React.useState<"loading" | "ok" | "failed">("loading")
  const fallback = FALLBACK[recipe.goalTypes?.[0] ?? "none"]
  const Icon = fallback.icon
  return (
    <span className={cn("relative block overflow-hidden bg-gradient-to-br", fallback.tone, className)} data-testid="recipe-image">
      {(!recipe.imageUrl || state !== "ok") && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <Icon className="size-[30%] max-h-12 max-w-12 min-h-5 min-w-5" />
        </span>
      )}
      {recipe.imageUrl && state !== "failed" && (
        // eslint-disable-next-line @next/next/no-img-element -- foto från Supabase Storage (publik bucket)
        <img
          src={recipe.imageUrl}
          alt={recipe.name}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("ok")}
          onError={() => setState("failed")}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", state === "ok" ? "opacity-100" : "opacity-0")}
        />
      )}
    </span>
  )
}
