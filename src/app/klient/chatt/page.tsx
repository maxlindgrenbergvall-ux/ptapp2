"use client"

import { Search } from "lucide-react"
import Link from "next/link"

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
        <PersonAvatar name={trainer.name} className="size-9" />
        <div>
          <div className="font-medium">{trainer.name}</div>
          <div className="text-xs text-muted-foreground">Din PT · svarar oftast inom en dag</div>
        </div>
      </div>
      <ChatThread threadId={client.id} meId={client.id} className="flex-1" />
    </div>
  )
}
