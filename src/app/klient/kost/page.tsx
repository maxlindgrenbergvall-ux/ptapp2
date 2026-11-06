import type { Metadata } from "next"

import { NutritionPage } from "@/components/nutrition/nutrition-page"

export const metadata: Metadata = { title: "Kost" }

export default function KostPage() {
  return <NutritionPage />
}
