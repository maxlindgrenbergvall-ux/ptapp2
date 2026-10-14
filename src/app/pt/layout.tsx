import type { Metadata } from "next"

import { PtShell } from "@/components/pt/pt-shell"
import { CallProvider } from "@/components/calls/call-provider"
import { AppDataProvider } from "@/lib/data/store"

export const metadata: Metadata = { title: "PT-panel" }

export default function PtLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppDataProvider role="trainer">
      <CallProvider>
        <PtShell>{children}</PtShell>
      </CallProvider>
    </AppDataProvider>
  )
}
