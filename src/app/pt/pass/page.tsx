import type { Metadata } from "next"

import { PtWorkoutBuilder } from "@/components/pt/pt-workout-builder"

export const metadata: Metadata = { title: "Passbyggare" }

/** v59: samma passbyggare som klienten – plus tilldelning till klient eller PT-mall. */
export default function WorkoutBuilderPage() {
  return <PtWorkoutBuilder />
}
