import { ChevronRight, Target } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { ClientProfileSettings } from "@/components/settings/client-profile"
import { DeleteAccountCard } from "@/components/settings/delete-account"
import { SettingsHeader } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Profilinställningar" }

export default function Page() {
  return (
    <div className="space-y-5">
      <div className="mx-auto max-w-2xl space-y-5">
        <SettingsHeader title="Profilinställningar" description="Dina uppgifter, intressen och mål – och dina PT:er." />
        {/* v30: målen (kalorimål, takt och prognos) har en egen vy. */}
        <Link
          href="/klient/profil/mal"
          className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-card transition-colors hover:bg-muted/60"
          data-testid="profile-goals-link"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Mål</span>
            <span className="block text-xs text-muted-foreground">Mål, vikt, kalorimål och hur snabbt du vill nå dit</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
      <ClientProfileSettings />
      <div className="mx-auto max-w-2xl">
        <DeleteAccountCard />
      </div>
    </div>
  )
}
