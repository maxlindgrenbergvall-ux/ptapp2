"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { ConversationView } from "@/components/chat/inbox"
import { Button } from "@/components/ui/button"
import { clientInbox } from "@/lib/chat/inbox"
import { useAppData } from "@/lib/data/store"

/** Klientens konversation med en PT – helskärm på mobilen (inget sidhuvud eller bottenmeny). */
export function ClientConversation({ trainerId }: { trainerId: string }) {
  const { data, me } = useAppData()
  const thread = clientInbox(data, me.id).find((r) => r.trainerId === trainerId)
  const trainer = data.trainers.find((t) => t.id === trainerId)
  if (!thread) {
    return (
      <div className="space-y-4 px-4 py-12 text-center">
        <p className="text-muted-foreground">Konversationen finns inte.</p>
        <Button asChild variant="outline">
          <Link href="/klient/chatt">
            <ArrowLeft /> Till meddelandena
          </Link>
        </Button>
      </div>
    )
  }
  const subtitle = trainer?.offersTraining ? (trainer.offersNutrition ? "Träning och kost" : "Träning") : "Kostcoaching"
  return <ConversationView thread={thread} meId={me.id} backHref="/klient/chatt" subtitle={subtitle} className="h-dvh" />
}
