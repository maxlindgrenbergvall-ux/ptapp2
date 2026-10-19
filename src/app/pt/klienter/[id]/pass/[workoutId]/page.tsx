import { Suspense } from "react"

import { WorkoutLogger } from "@/components/client/workout-logger"

/**
 * PT:ns kontroll av ett pass: samma passvy som klienten loggar i, där PT:n
 * rättar vikter/reps/set och klarmarkerar passet.
 */
export default function TrainerWorkoutPage({ params }: { params: Promise<{ id: string; workoutId: string }> }) {
  return (
    <Suspense>
      <TrainerWorkoutRoute params={params} />
    </Suspense>
  )
}

async function TrainerWorkoutRoute({ params }: { params: Promise<{ id: string; workoutId: string }> }) {
  const { id, workoutId } = await params
  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8">
      <div className="mx-auto max-w-lg md:border-x">
        <WorkoutLogger workoutId={workoutId} mode="trainer" backHref={`/pt/klienter/${id}`} />
      </div>
    </div>
  )
}
