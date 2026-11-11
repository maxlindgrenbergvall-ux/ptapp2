"use client"

import { MessageCircle, UserPlus } from "lucide-react"
import Link from "next/link"

import { ChatInbox } from "@/components/chat/inbox"
import { EmptyState, PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { trainerInbox } from "@/lib/chat/inbox"
import { useAppData } from "@/lib/data/store"

/** PT:ns inkorg (v42): en konversation per klient – olästa överst, ett tryck öppnar chatten. */
export default function PtMessagesPage() {
  const { data, me } = useAppData()
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Meddelanden" description="En tråd per klient. Feedback på pass hamnar också här." />
      <ChatInbox rows={trainerInbox(data, me.id)} 
        empty={
          <EmptyState
            icon={MessageCircle}
            title="Du har inga klienter än."
            text="Bjud in en klient, så får ni en egen tråd för meddelanden och feedback på pass."
            action={
              <Button asChild>
                <Link href="/pt/inbjudningar">
                  <UserPlus /> Bjud in en klient
                </Link>
              </Button>
            }
          />
        }
      />
    </div>
  )
}
