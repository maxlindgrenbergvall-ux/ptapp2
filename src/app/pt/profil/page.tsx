import type { Metadata } from "next"

import { TrainerProfileEditor } from "@/components/pt/trainer-profile-editor"

export const metadata: Metadata = { title: "Min profil" }

export default function TrainerProfilePage() {
  return <TrainerProfileEditor />
}
