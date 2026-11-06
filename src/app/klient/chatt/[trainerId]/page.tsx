import { Suspense } from "react"

import { ClientConversation } from "@/components/chat/client-conversation"

// PT-id:t är okänt vid bygget. Suspense låter skalet förrenderas.
export default function ClientConversationPage({ params }: { params: Promise<{ trainerId: string }> }) {
  return (
    <Suspense>
      <Route params={params} />
    </Suspense>
  )
}

async function Route({ params }: { params: Promise<{ trainerId: string }> }) {
  const { trainerId } = await params
  return <ClientConversation trainerId={decodeURIComponent(trainerId)} />
}
