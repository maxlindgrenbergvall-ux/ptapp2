"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { ChatInbox, ConversationView } from "@/components/chat/inbox"
import { Button } from "@/components/ui/button"
import { trainerInbox } from "@/lib/chat/inbox"
import { useAppData } from "@/lib/data/store"

/**
 * PT:ns konversation med en klient. Mobil: ren chattvy i helskärm ovanpå
 * portalen. Dator: inkorgen till vänster, konversationen till höger.
 */
export function PtConversation({ clientId }: { clientId: string }) {
  const { data, me } = useAppData()
  const rows = trainerInbox(data, me.id)
  const thread = rows.find((r) => r.threadId === clientId)
  if (!thread) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">Konversationen finns inte.</p>
        <Button asChild variant="outline">
          <Link href="/pt/meddelanden">
            <ArrowLeft /> Till meddelandena
          </Link>
        </Button>
      </div>
    )
  }
  const client = data.clients.find((c) => c.id === clientId)
  return (
    <div className="fixed inset-0 z-30 flex bg-background lg:static lg:z-auto lg:grid lg:h-[calc(100svh-4.5rem)] lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-4 lg:bg-transparent">
      <ChatInbox rows={rows} activeKey={thread.key} className="hidden overflow-y-auto lg:block" />
      <ConversationView
        thread={thread}
        meId={me.id}
        backHref="/pt/meddelanden"
        peerHref={`/pt/klienter/${encodeURIComponent(clientId)}`}
        subtitle={client?.goal || "Klient"}
        className="h-dvh w-full lg:h-full lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/70 lg:shadow-card"
      />
    </div>
  )
}
