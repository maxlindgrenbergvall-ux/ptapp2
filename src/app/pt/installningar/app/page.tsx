import type { Metadata } from "next"

import { AppSettings } from "@/components/settings/app-settings"

export const metadata: Metadata = { title: "Appinställningar" }

/** v58: Profil → Inställningar → Appinställningar (språk och träningsintressen). */
export default function Page() {
  return <AppSettings base="/pt" />
}
