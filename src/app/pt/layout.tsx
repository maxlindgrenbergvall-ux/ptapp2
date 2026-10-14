import type { Metadata } from "next"

import { PtShell } from "@/components/pt/pt-shell"
import { AppDataProvider } from "@/lib/data/store"

export const metadata: Metadata = { title: "PT-panel" }

export default function PtLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppDataProvider role="trainer">
      <PtShell>{children}</PtShell>
    </AppDataProvider>
  )
}
