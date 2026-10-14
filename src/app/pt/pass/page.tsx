import type { Metadata } from "next"

import { WorkoutBuilder } from "@/components/pt/workout-builder"

export const metadata: Metadata = { title: "Passbyggare" }

export default function WorkoutBuilderPage() {
  return <WorkoutBuilder />
}
