import { Suspense } from "react"

import { ExerciseHistoryView } from "@/components/client/exercise-history"

// Egna övningar skapas löpande, så id:t är okänt vid bygget.
export default function ExerciseHistoryPage({ params }: { params: Promise<{ exerciseId: string }> }) {
  return (
    <Suspense>
      <Route params={params} />
    </Suspense>
  )
}

async function Route({ params }: { params: Promise<{ exerciseId: string }> }) {
  const { exerciseId } = await params
  return <ExerciseHistoryView exerciseId={decodeURIComponent(exerciseId)} />
}
