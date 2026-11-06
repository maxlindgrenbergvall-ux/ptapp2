"use client"

import { ChatInbox } from "@/components/chat/inbox"
import { PageHeader } from "@/components/common"
import { trainerInbox } from "@/lib/chat/inbox"
import { useAppData } from "@/lib/data/store"

/** PT:ns inkorg (v42): en konversation per klient – olästa överst, ett tryck öppnar chatten. */
export default function PtMessagesPage() {
  const { data, me } = useAppData()
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Meddelanden" description="En tråd per klient. Feedback på pass hamnar också här." />
      <ChatInbox rows={trainerInbox(data, me.id)} empty={<p className="py-12 text-center text-sm text-muted-foreground">Du har inga klienter än.</p>} />
    </div>
  )
}
