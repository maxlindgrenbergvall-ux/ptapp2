import { Suspense } from "react"

import { RecipeDetail } from "@/components/nutrition/recipe-detail"

// Recepten skapas av användaren, så id:t är okänt vid bygget. Suspense låter skalet förrenderas.
export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <RecipeRoute params={params} />
    </Suspense>
  )
}

async function RecipeRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RecipeDetail recipeId={id} />
}
