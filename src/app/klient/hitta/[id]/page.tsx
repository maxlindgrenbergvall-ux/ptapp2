import { TrainerProfile } from "@/components/client/trainer-profile"

export function generateStaticParams() {
  return ["t1", "t2", "t3", "t4", "t5", "t6", "t7"].map((id) => ({ id }))
}

export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TrainerProfile trainerId={id} />
}
