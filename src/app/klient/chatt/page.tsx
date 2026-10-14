"use client"

import { Search } from "lucide-react"
import Link from "next/link"

import { CallButtons } from "@/components/calls/call-buttons"
import { ChatThread } from "@/components/chat/chat-thread"
import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"

export default function ClientChatPage() {
  const { data, me } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)!
  const trainer = data.trainers.find((t) => t.id === client.trainerId)

  if (!trainer) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">Du har ingen PT ännu.</p>
        <Button asChild>
          <Link href="/klient/hitta">
            <Search /> Hitta din PT
          </Link>
        </Button>
      </div>
    )
  }

  return (
    // Fyller ytan mellan header (3.5rem) och bottenmeny (4rem).
    <div className="-mx-4 -mt-4 -mb-24 flex h-[calc(100svh-7.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{trainer.name}</div>
          <div className="text-xs text-muted-foreground">
            {client.status === "pending" ? "Väntar på att PT:n accepterar dig" : "Din PT · svarar oftast inom en dag"}
          </div>
        </div>
        <CallButtons threadId={client.id} peerId={trainer.id} peerName={trainer.name} disabled={client.status === "pending"} />
      </div>
      <ChatThread threadId={client.id} meId={client.id} className="flex-1" />
    </div>
  )
}
