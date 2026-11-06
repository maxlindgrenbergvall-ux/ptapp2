"use client"

import { Search } from "lucide-react"
import Link from "next/link"

import { ChatInbox } from "@/components/chat/inbox"
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
          <div className="space-y-4 py-12 text-center">
            <p className="text-muted-foreground">Du har ingen PT ännu.</p>
            <Button asChild>
              <Link href="/klient/hitta">
                <Search /> Hitta din PT
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
