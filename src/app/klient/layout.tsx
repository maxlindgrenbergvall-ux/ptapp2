import type { Metadata } from "next"

import { ClientShell } from "@/components/client/client-shell"
import { AppDataProvider } from "@/lib/data/store"

export const metadata: Metadata = { title: "Min träning" }

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppDataProvider role="client">
      <ClientShell>{children}</ClientShell>
    </AppDataProvider>
  )
}
