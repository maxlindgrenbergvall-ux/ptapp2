"use client"

import { Search } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { CallButtons } from "@/components/calls/call-buttons"
import { ChatThread, useUnreadCount } from "@/components/chat/chat-thread"
import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { callThread } from "@/lib/calls/thread"
import { myTrainers } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { firstName } from "@/lib/names"
import { cn } from "@/lib/utils"
import type { Trainer } from "@/types/domain"

/** Klientens chatt: en tråd per PT. Med flera PT:er väljs tråden i flikraden överst. */
export default function ClientChatPage() {
  const { data, me } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)!
  const trainers = myTrainers(data, me.id)
  const [chosen, setChosen] = React.useState<string | null>(null)
  const trainer = trainers.find((t) => t.id === chosen) ?? trainers[0]

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

  const pending = client.trainerId === trainer.id && client.status === "pending"
  return (
    // Fyller ytan mellan sidhuvud (3.5rem + statusfält) och bottenmeny (4rem + hemindikator) – bara chatten scrollar.
    <div className="-mx-4 -mt-4 -mb-[calc(6rem+var(--safe-bottom))] flex h-[calc(100svh-7.5rem-var(--safe-top)-var(--safe-bottom))] flex-col">
      {trainers.length > 1 && (
        <div role="tablist" aria-label="Välj PT" className="flex gap-2 overflow-x-auto border-b px-4 py-2">
          {trainers.map((t) => (
            <TrainerTab key={t.id} trainer={t} active={t.id === trainer.id} onClick={() => setChosen(t.id)} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{trainer.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", pending ? "bg-warning" : "bg-success")} aria-hidden />
            {pending ? "Väntar på att PT:n accepterar dig" : trainer.offersTraining ? (trainer.offersNutrition ? "Träning och kost" : "Träning") : "Kostcoaching"}
          </div>
        </div>
        <CallButtons threadId={callThread(me.id, trainer.id)} peerId={trainer.id} peerName={trainer.name} disabled={pending} />
      </div>
      <ChatThread
        key={trainer.id}
        threadId={client.id}
        trainerId={trainer.id}
        meId={client.id}
        peer={pending ? undefined : { id: trainer.id, name: trainer.name }}
        className="flex-1"
      />
    </div>
  )
}

function TrainerTab({ trainer, active, onClick }: { trainer: Trainer; active: boolean; onClick: () => void }) {
  const { me } = useAppData()
  const unread = useUnreadCount(me.id, [me.id], trainer.id)
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
        active ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
      )}
    >
      <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-6 text-[10px]" />
      {firstName(trainer.name)}
      {unread > 0 && (
        <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-foreground tabular" aria-label={`${unread} olästa`}>
          {unread}
        </span>
      )}
    </button>
  )
}
