import { Suspense } from "react"

import { PtConversation } from "@/components/chat/pt-conversation"

// Klient-id:t är okänt vid bygget. Suspense låter skalet förrenderas.
export default function PtConversationPage({ params }: { params: Promise<{ clientId: string }> }) {
  return (
    <Suspense>
      <Route params={params} />
    </Suspense>
  )
}

async function Route({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  return <PtConversation clientId={decodeURIComponent(clientId)} />
}
