import type { Metadata } from "next"

import { GoalIntro } from "@/components/goals/goal-intro"

export const metadata: Metadata = { title: "Kom igång" }

export default function Page() {
  return <GoalIntro />
}
