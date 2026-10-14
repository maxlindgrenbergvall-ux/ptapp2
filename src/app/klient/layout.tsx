import type { Metadata } from "next"

import { ClientShell } from "@/components/client/client-shell"
import { CallProvider } from "@/components/calls/call-provider"
import { AppDataProvider } from "@/lib/data/store"

export const metadata: Metadata = { title: "Min träning" }

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppDataProvider role="client">
      <CallProvider>
        <ClientShell>{children}</ClientShell>
      </CallProvider>
    </AppDataProvider>
  )
}
