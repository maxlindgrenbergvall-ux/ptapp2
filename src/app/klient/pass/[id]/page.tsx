import { Suspense } from "react"

import { WorkoutLogger } from "@/components/client/workout-logger"

// Pass skapas löpande, så id:t är okänt vid bygget. Suspense låter skalet förrenderas.
export default function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <WorkoutLoggerRoute params={params} />
    </Suspense>
  )
}

async function WorkoutLoggerRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WorkoutLogger workoutId={id} />
}
