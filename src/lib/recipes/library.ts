"use client"

/**
 * Coaviras färdiga receptbibliotek (v26). Recepten ligger i Supabase
 * (library_recipes, seedade av v26-migrationen); i demoläget – och om tabellen
 * inte finns än – används samma recept ur den inbyggda library.json.
 * Inga externa anrop: allt kommer från databasen eller appen själv.
 */
import * as React from "react"

import { useAppData } from "@/lib/data/store"
import { getSupabase } from "@/lib/supabase/client"
import type { MacroTotals, MealItem, Recipe, RecipeGoal } from "@/types/domain"

interface LibraryRow {
  id: string
  slug: string
  name: string
  servings: number
  total_minutes: number
  goal_types: RecipeGoal[]
  image_url: string | null
  items: MealItem[]
  steps: string[]
  nutrition: MacroTotals
}

interface LibraryJson {
  id: string
  name: string
  servings: number
  totalMinutes: number
  goalTypes: RecipeGoal[]
  imageUrl: string | null
  items: MealItem[]
  steps: string[]
  nutrition: MacroTotals
}

export const LIBRARY_OWNER = "coavira"

const fromJson = (r: LibraryJson): Recipe => ({
  id: r.id,
  trainerId: LIBRARY_OWNER,
  name: r.name,
  notes: "",
  items: r.items,
  servings: r.servings,
  totalMinutes: r.totalMinutes,
  goalTypes: r.goalTypes,
  // Riktigt foto (Supabase Storage) eller ingen bild – då visas reservbilden.
  imageUrl: r.imageUrl ?? undefined,
  steps: r.steps,
  nutrition: r.nutrition,
  library: true,
})

const fromRow = (r: LibraryRow): Recipe =>
  fromJson({ ...r, totalMinutes: r.total_minutes, goalTypes: r.goal_types, imageUrl: r.image_url && /^https:\/\//.test(r.image_url) ? r.image_url : null })

async function bundled(): Promise<Recipe[]> {
  const mod = await import("@/lib/recipes/library.json")
  return (mod.default as LibraryJson[]).map(fromJson)
}

let cache: { mode: string; promise: Promise<Recipe[]> } | null = null

export function loadLibrary(mode: "demo" | "supabase"): Promise<Recipe[]> {
  if (cache?.mode === mode) return cache.promise
  const promise =
    mode === "demo"
      ? bundled()
      : (async () => {
          const { data, error } = await getSupabase().from("library_recipes").select("*").order("name")
          // Före v26-migrationen (eller offline): de inbyggda recepten.
          if (error || !data?.length) return bundled()
          return (data as LibraryRow[]).map(fromRow)
        })()
  cache = { mode, promise }
  promise.catch(() => (cache = null))
  return promise
}

/** Biblioteket (null medan det laddas). */
export function useRecipeLibrary(): Recipe[] | null {
  const { mode } = useAppData()
  const [recipes, setRecipes] = React.useState<Recipe[] | null>(null)
  React.useEffect(() => {
    let alive = true
    loadLibrary(mode)
      .then((r) => alive && setRecipes(r))
      .catch(() => alive && setRecipes([]))
    return () => {
      alive = false
    }
  }, [mode])
  return recipes
}
