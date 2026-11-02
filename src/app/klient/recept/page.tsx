import type { Metadata } from "next"

import { RecipesView } from "@/components/nutrition/recipes"

export const metadata: Metadata = { title: "Recept" }

export default function RecipesPage() {
  return <RecipesView />
}
