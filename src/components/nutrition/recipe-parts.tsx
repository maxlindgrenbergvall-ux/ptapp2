"use client"

import { ChefHat, Star } from "lucide-react"
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

/** Receptets bild (länk till källan) eller en neutral platshållare. */
export function RecipeImage({ recipe, className }: { recipe: Pick<Recipe, "imageUrl" | "name">; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  if (!recipe.imageUrl || failed) {
    return (
      <span className={cn("flex items-center justify-center bg-gradient-to-br from-primary/15 to-brand/20 text-primary", className)} aria-hidden>
        <ChefHat className="size-1/3 max-h-10 max-w-10" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- extern receptbild från källan (kopieras inte)
    <img
      src={recipe.imageUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("bg-muted object-cover", className)}
    />
  )
}
