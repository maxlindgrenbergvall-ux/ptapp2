"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { CallButtons } from "@/components/calls/call-buttons"
import { ChatThread } from "@/components/chat/chat-thread"
import { PageHeader, PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAppData } from "@/lib/data/store"
import { formatShort, toISODate } from "@/lib/date"
import { cn } from "@/lib/utils"

export default function PtMessagesPage() {
  const { data, me } = useAppData()
  const clients = data.clients.filter((c) => c.trainerId === me.id)

  const threads = clients
    .map((c) => {
      const msgs = data.messages.filter((m) => m.threadId === c.id)
      const last = msgs.reduce<(typeof msgs)[number] | undefined>((a, m) => (!a || m.sentAt > a.sentAt ? m : a), undefined)
      const unread = msgs.filter((m) => m.senderId !== me.id && !m.readAt).length
      return { client: c, last, unread }
    })
    .sort((a, b) => (b.last?.sentAt ?? "").localeCompare(a.last?.sentAt ?? ""))

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const active = clients.find((c) => c.id === activeId)

  return (
    <div className="space-y-6">
      <PageHeader title="Meddelanden" description="En tråd per klient. Feedback på pass hamnar också här." />
      <Card className="grid h-[calc(100svh-12rem)] min-h-[28rem] gap-0 overflow-hidden py-0 md:grid-cols-[280px_1fr]">
        <ul className={cn("overflow-y-auto border-r", active && "hidden md:block")}>
          {threads.map(({ client, last, unread }) => (
            <li key={client.id}>
              <button
                onClick={() => setActiveId(client.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60",
                  activeId === client.id && "bg-muted"
                )}
              >
                <PersonAvatar name={client.name} className="size-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{client.name}</span>
                    {last && <span className="shrink-0 text-xs text-muted-foreground">{formatShort(toISODate(new Date(last.sentAt)))}</span>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {last ? `${last.senderId === me.id ? "Du: " : ""}${last.body}` : "Ingen konversation än"}
                  </p>
                </div>
                {unread > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground tabular" aria-label={`${unread} olästa`}>
                    {unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {active ? (
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Tillbaka" onClick={() => setActiveId(null)}>
                <ArrowLeft />
              </Button>
              <PersonAvatar name={active.name} className="size-8" />
              <Link href={`/pt/klienter/${active.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {active.name}
              </Link>
              <CallButtons threadId={active.id} peerId={active.id} peerName={active.name} disabled={active.status === "pending"} />
            </div>
            <ChatThread key={active.id} threadId={active.id} meId={me.id} className="flex-1" />
          </div>
        ) : (
          <div className="hidden items-center justify-center text-sm text-muted-foreground md:flex">Välj en konversation</div>
        )}
      </Card>
    </div>
  )
}
