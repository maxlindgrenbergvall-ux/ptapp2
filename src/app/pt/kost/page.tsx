import type { Metadata } from "next"

import { NutritionBuilder } from "@/components/pt/nutrition-builder"

export const metadata: Metadata = { title: "Kostscheman" }

export default function NutritionPage() {
  return <NutritionBuilder />
}
