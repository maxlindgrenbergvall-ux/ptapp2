"use client"

import { MessageCircle, Search } from "lucide-react"
import Link from "next/link"

import { ChatInbox } from "@/components/chat/inbox"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
import { clientInbox } from "@/lib/chat/inbox"
import { useAppData } from "@/lib/data/store"

/** Klientens inkorg (v42): en konversation per PT – olästa överst, ett tryck öppnar chatten. */
export default function ClientInboxPage() {
  const { data, me } = useAppData()
  const rows = clientInbox(data, me.id)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Meddelanden</h1>
      <ChatInbox
        rows={rows}
        empty={
          <EmptyState
            icon={MessageCircle}
            title="Du har ingen PT ännu."
            text="När du har en PT hamnar era meddelanden, teknikvideor och samtal här."
            action={
              <Button asChild>
                <Link href="/klient/hitta">
                  <Search /> Hitta din PT
                </Link>
              </Button>
            }
          />
        }
      />
    </div>
  )
}
